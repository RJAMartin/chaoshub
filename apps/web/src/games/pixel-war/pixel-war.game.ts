// ─────────────────────────────────────────────────────────────────────────────
// Pixel War — Real-time territory painting game
//
// Architecture:
//   Each player paints pixels on a shared 80×50 grid.
//   Host maintains authoritative grid state and timer.
//   Clients send batched paint events; host validates + broadcasts diffs.
//   Player with most pixels when timer hits 0 wins.
//
// Network events:
//   pixel-war:paint      client→host   { pixels: {x,y}[] }
//   pixel-war:diff       host→all      { pixels: {x,y,owner:string}[] }
//   pixel-war:full-sync  host→client   { grid: string[] (flat, playerId|'') }
//   pixel-war:tick       host→all      { secondsLeft: number }
//   pixel-war:game-over  host→all      { scores: Record<string,number>, winnerId: string }
// ─────────────────────────────────────────────────────────────────────────────
import { Graphics, Text, TextStyle, Container, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'

export const PW_EVENTS = {
  PAINT: 'pixel-war:paint',
  DIFF: 'pixel-war:diff',
  FULL_SYNC: 'pixel-war:full-sync',
  TICK: 'pixel-war:tick',
  GAME_OVER: 'pixel-war:game-over',
} as const

// Grid dimensions
const COLS = 80
const ROWS = 50
const CELL = 8 // px per cell in logical space
const LOGIC_W = COLS * CELL  // 640
const LOGIC_H = ROWS * CELL  // 400
const GAME_DURATION_S = 60

// Player colors — deterministic per-slot (up to 8 players)
const PLAYER_COLORS: number[] = [
  0x00f5ff, // cyan
  0xff2d78, // pink
  0xbf5af2, // purple
  0xffd60a, // yellow
  0x30d158, // green
  0xff6b35, // orange
  0x4d96ff, // blue
  0xff375f, // red
]

interface PaintPixel { x: number; y: number }
interface DiffPixel extends PaintPixel { owner: string }

export class PixelWarGame implements GameInstance {
  private ctx: GameContext
  private app: Application
  private stage!: Container

  // Grid state: flat array [row * COLS + col] = playerId | ''
  private grid: string[] = new Array(COLS * ROWS).fill('')

  // Dirty pixels needing redraw
  private dirtyPixels = new Set<number>()
  private fullRedraw = true

  // Pixi
  private gridGfx!: Graphics
  private overlayGfx!: Graphics
  private timerText!: Text
  private statusText!: Text
  private legendContainer!: Container

  // Player color lookup: playerId → hex color
  private colorMap = new Map<string, number>()

  // Input tracking
  private isPainting = false
  private lastPaintedCell = -1
  private pendingPaint: PaintPixel[] = []
  private paintFlushInterval?: ReturnType<typeof setInterval>

  // Host state
  private secondsLeft = GAME_DURATION_S
  private tickInterval?: ReturnType<typeof setInterval>
  private gameOver = false

  // Network callbacks
  private readonly onPaint = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { pixels } = msg.payload as { pixels: PaintPixel[] }
    const ownerId = msg.from ?? ''
    if (!ownerId) return
    const diff: DiffPixel[] = []
    for (const { x, y } of pixels) {
      if (x < 0 || x >= COLS || y < 0 || y >= ROWS) continue
      const idx = y * COLS + x
      this.grid[idx] = ownerId
      diff.push({ x, y, owner: ownerId })
      this.dirtyPixels.add(idx)
    }
    if (diff.length) {
      this.ctx.network.broadcast(PW_EVENTS.DIFF, { pixels: diff })
    }
  }

  private readonly onDiff = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { pixels } = msg.payload as { pixels: DiffPixel[] }
    for (const { x, y, owner } of pixels) {
      const idx = y * COLS + x
      this.grid[idx] = owner
      this.dirtyPixels.add(idx)
    }
  }

  private readonly onFullSync = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { grid } = msg.payload as { grid: string[] }
    this.grid = grid
    this.fullRedraw = true
  }

  private readonly onTick = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { secondsLeft } = msg.payload as { secondsLeft: number }
    this.secondsLeft = secondsLeft
    this.updateTimerDisplay()
  }

  private readonly onGameOver = (msg: NetworkMessage) => {
    const { scores, winnerId } = msg.payload as { scores: Record<string, number>; winnerId: string }
    this.gameOver = true
    this.showGameOver(scores, winnerId)
    if (!this.ctx.network.isHost()) {
      // Clients still record stats
      const localId = this.ctx.players.getLocalPlayer().id
      this.ctx.stats.record('play')
      this.ctx.stats.record(localId === winnerId ? 'win' : 'loss')
    }
  }

  constructor(context: GameContext) {
    this.ctx = context
    this.app = context.pixiApp as Application
  }

  async init(): Promise<void> {
    this.buildColorMap()
    this.buildScene()
    this.registerNetworkListeners()
    this.registerInputListeners()

    if (this.ctx.network.isHost()) {
      // Give clients time to init, then send full sync + start timer
      setTimeout(() => {
        this.sendFullSync()
        this.startTimer()
      }, 600)
    }
  }

  // ── Color map ─────────────────────────────────────────────────────────────

  private buildColorMap(): void {
    const players = this.ctx.players.getPlayers()
    players.forEach((p, i) => {
      this.colorMap.set(p.id, PLAYER_COLORS[i % PLAYER_COLORS.length] ?? 0x444466)
    })
  }

  private colorFor(playerId: string): number {
    return this.colorMap.get(playerId) ?? 0x444466
  }

  // ── Scene ──────────────────────────────────────────────────────────────────

  private buildScene(): void {
    this.stage = new Container()
    this.app.stage.addChild(this.stage)

    // Background
    const bg = new Graphics()
    bg.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x111122)
    this.stage.addChild(bg)

    // Grid graphics
    this.gridGfx = new Graphics()
    this.stage.addChild(this.gridGfx)

    // Grid lines overlay (subtle)
    this.overlayGfx = new Graphics()
    this.drawGridLines()
    this.stage.addChild(this.overlayGfx)

    // Timer
    this.timerText = new Text({
      text: `${GAME_DURATION_S}s`,
      style: new TextStyle({
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 20,
        fontWeight: '700',
        fill: '#ffd60a',
      }),
    })
    this.timerText.anchor.set(0.5, 0)
    this.timerText.position.set(LOGIC_W / 2, 4)
    this.stage.addChild(this.timerText)

    // Status text (shown at game end)
    this.statusText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: '"Space Grotesk", sans-serif',
        fontSize: 28,
        fontWeight: '800',
        fill: '#ffffff',
        align: 'center',
        dropShadow: { blur: 8, distance: 0, color: '#000000', alpha: 0.8 },
      }),
    })
    this.statusText.anchor.set(0.5)
    this.statusText.position.set(LOGIC_W / 2, LOGIC_H / 2)
    this.stage.addChild(this.statusText)

    // Legend (player colors)
    this.legendContainer = new Container()
    this.stage.addChild(this.legendContainer)
    this.buildLegend()

    // Scale to fit canvas
    this.scaleStage()

    // Initial blank grid draw
    this.redrawFullGrid()
  }

  private drawGridLines(): void {
    this.overlayGfx.clear()
    // Draw grid lines every 10 cells for a subtle guide
    for (let x = 0; x <= COLS; x += 10) {
      this.overlayGfx.moveTo(x * CELL, 0)
      this.overlayGfx.lineTo(x * CELL, LOGIC_H)
      this.overlayGfx.stroke({ width: 0.5, color: 0x222244, alpha: 0.5 })
    }
    for (let y = 0; y <= ROWS; y += 10) {
      this.overlayGfx.moveTo(0, y * CELL)
      this.overlayGfx.lineTo(LOGIC_W, y * CELL)
      this.overlayGfx.stroke({ width: 0.5, color: 0x222244, alpha: 0.5 })
    }
  }

  private buildLegend(): void {
    this.legendContainer.removeChildren()
    const players = this.ctx.players.getPlayers()
    const startX = 4
    const startY = LOGIC_H - 20
    players.forEach((p, i) => {
      const color = this.colorFor(p.id)
      const swatch = new Graphics()
      swatch.rect(0, 0, 10, 10).fill(color)
      swatch.position.set(startX + i * 90, startY)
      this.legendContainer.addChild(swatch)

      const label = new Text({
        text: p.name.slice(0, 9),
        style: new TextStyle({
          fontFamily: '"Space Grotesk", sans-serif',
          fontSize: 9,
          fill: '#c0c0e0',
        }),
      })
      label.position.set(startX + i * 90 + 13, startY)
      this.legendContainer.addChild(label)
    })
  }

  private scaleStage(): void {
    const cw = this.app.screen.width
    const ch = this.app.screen.height
    const scale = Math.min(cw / LOGIC_W, ch / LOGIC_H) * 0.98
    this.stage.scale.set(scale)
    this.stage.position.set(
      (cw - LOGIC_W * scale) / 2,
      (ch - LOGIC_H * scale) / 2,
    )
  }

  // ── Grid rendering ─────────────────────────────────────────────────────────

  private redrawFullGrid(): void {
    this.gridGfx.clear()
    for (let i = 0; i < this.grid.length; i++) {
      const owner = this.grid[i]
      if (!owner) continue
      const x = (i % COLS) * CELL
      const y = Math.floor(i / COLS) * CELL
      this.gridGfx.rect(x, y, CELL, CELL).fill(this.colorFor(owner))
    }
    this.dirtyPixels.clear()
    this.fullRedraw = false
  }

  private applyDirtyPixels(): void {
    for (const idx of this.dirtyPixels) {
      const owner = this.grid[idx]
      const x = (idx % COLS) * CELL
      const y = Math.floor(idx / COLS) * CELL
      if (owner) {
        this.gridGfx.rect(x, y, CELL, CELL).fill(this.colorFor(owner))
      } else {
        // Erase — draw background color
        this.gridGfx.rect(x, y, CELL, CELL).fill(0x111122)
      }
    }
    this.dirtyPixels.clear()
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  private registerInputListeners(): void {
    const canvas = this.app.canvas
    canvas.addEventListener('pointerdown', this.handlePointerDown)
    canvas.addEventListener('pointermove', this.handlePointerMove)
    canvas.addEventListener('pointerup', this.handlePointerUp)
    canvas.addEventListener('pointerleave', this.handlePointerUp)

    // Flush paint buffer every 50ms
    this.paintFlushInterval = setInterval(() => this.flushPaint(), 50)
  }

  private canvasToCell(e: PointerEvent): { x: number; y: number } | null {
    const canvas = this.app.canvas
    const rect = canvas.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top

    // Account for stage scale + position
    const stageX = this.stage.position.x
    const stageY = this.stage.position.y
    const scale = this.stage.scale.x

    const lx = (cx / rect.width * this.app.screen.width - stageX) / scale
    const ly = (cy / rect.height * this.app.screen.height - stageY) / scale

    const col = Math.floor(lx / CELL)
    const row = Math.floor(ly / CELL)
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null
    return { x: col, y: row }
  }

  private paintCell(x: number, y: number): void {
    if (this.gameOver) return
    const idx = y * COLS + x
    if (idx === this.lastPaintedCell) return
    this.lastPaintedCell = idx

    const localId = this.ctx.players.getLocalPlayer().id
    // Optimistic local update
    this.grid[idx] = localId
    this.dirtyPixels.add(idx)

    this.pendingPaint.push({ x, y })
  }

  private readonly handlePointerDown = (e: PointerEvent): void => {
    this.isPainting = true
    this.lastPaintedCell = -1
    const cell = this.canvasToCell(e)
    if (cell) this.paintCell(cell.x, cell.y)
  }

  private readonly handlePointerMove = (e: PointerEvent): void => {
    if (!this.isPainting) return
    const cell = this.canvasToCell(e)
    if (cell) this.paintCell(cell.x, cell.y)
  }

  private readonly handlePointerUp = (): void => {
    this.isPainting = false
    this.lastPaintedCell = -1
    this.flushPaint()
  }

  private flushPaint(): void {
    if (!this.pendingPaint.length) return
    const pixels = this.pendingPaint.splice(0)

    if (this.ctx.network.isHost()) {
      // Apply directly + broadcast diff
      const localId = this.ctx.players.getLocalPlayer().id
      const diff: DiffPixel[] = pixels.map(p => ({ ...p, owner: localId }))
      // Grid already updated optimistically; broadcast
      this.ctx.network.broadcast(PW_EVENTS.DIFF, { pixels: diff })
    } else {
      this.ctx.network.send(PW_EVENTS.PAINT, { pixels })
    }
  }

  // ── Network ────────────────────────────────────────────────────────────────

  private registerNetworkListeners(): void {
    this.ctx.network.on(PW_EVENTS.PAINT, this.onPaint as never)
    this.ctx.network.on(PW_EVENTS.DIFF, this.onDiff as never)
    this.ctx.network.on(PW_EVENTS.FULL_SYNC, this.onFullSync as never)
    this.ctx.network.on(PW_EVENTS.TICK, this.onTick as never)
    this.ctx.network.on(PW_EVENTS.GAME_OVER, this.onGameOver as never)
  }

  private sendFullSync(): void {
    this.ctx.network.broadcast(PW_EVENTS.FULL_SYNC, { grid: [...this.grid] })
  }

  // ── Timer (host only) ─────────────────────────────────────────────────────

  private startTimer(): void {
    this.secondsLeft = GAME_DURATION_S
    this.updateTimerDisplay()

    this.tickInterval = setInterval(() => {
      this.secondsLeft--
      this.updateTimerDisplay()
      this.ctx.network.broadcast(PW_EVENTS.TICK, { secondsLeft: this.secondsLeft })

      if (this.secondsLeft <= 0) {
        clearInterval(this.tickInterval)
        this.endGame()
      }
    }, 1000)
  }

  private updateTimerDisplay(): void {
    const s = this.secondsLeft
    this.timerText.text = `${s}s`
    // Color shifts as time runs out
    if (s <= 10) {
      ;(this.timerText.style as TextStyle).fill = '#ff2d78'
    } else if (s <= 20) {
      ;(this.timerText.style as TextStyle).fill = '#ff9f0a'
    } else {
      ;(this.timerText.style as TextStyle).fill = '#ffd60a'
    }
  }

  private endGame(): void {
    if (!this.ctx.network.isHost()) return
    const scores = this.calculateScores()
    const sortedPlayers = Object.entries(scores).sort((a, b) => b[1] - a[1])
    const winnerId = sortedPlayers[0]?.[0] ?? ''

    this.ctx.network.broadcast(PW_EVENTS.GAME_OVER, { scores, winnerId })
    this.showGameOver(scores, winnerId)

    // Stats + platform event
    const localId = this.ctx.players.getLocalPlayer().id
    this.ctx.stats.record('play')
    this.ctx.stats.record(localId === winnerId ? 'win' : 'loss')

    setTimeout(() => {
      this.ctx.events.emit('platform:game:ended', {
        gameId: this.ctx.gameId,
        winnerId,
        durationMs: GAME_DURATION_S * 1000,
        results: sortedPlayers.map(([playerId], i) => {
          const player = this.ctx.players.getPlayers().find(p => p.id === playerId)
          return {
            playerId,
            playerName: player?.name ?? playerId,
            score: scores[playerId],
            rank: i + 1,
          }
        }),
      })
    }, 4000)
  }

  private calculateScores(): Record<string, number> {
    const scores: Record<string, number> = {}
    for (const owner of this.grid) {
      if (!owner) continue
      scores[owner] = (scores[owner] ?? 0) + 1
    }
    return scores
  }

  // ── Game over UI ──────────────────────────────────────────────────────────

  private showGameOver(scores: Record<string, number>, winnerId: string): void {
    this.gameOver = true
    this.isPainting = false

    const localId = this.ctx.players.getLocalPlayer().id
    const iWon = localId === winnerId
    const winner = this.ctx.players.getPlayers().find(p => p.id === winnerId)

    const myPixels = scores[localId] ?? 0
    const totalPixels = COLS * ROWS

    this.statusText.text = [
      iWon ? '🏆 YOU WIN!' : `🏅 ${winner?.name ?? 'Someone'} wins!`,
      `Your pixels: ${myPixels} / ${totalPixels}`,
      '',
      ...Object.entries(scores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([pid, count], i) => {
          const p = this.ctx.players.getPlayers().find(pl => pl.id === pid)
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
          return `${medal} ${p?.name ?? pid}: ${count}px`
        }),
    ].join('\n')

    ;(this.statusText.style as TextStyle).fill = iWon ? '#30d158' : '#c0c0e0'
    ;(this.statusText.style as TextStyle).fontSize = 18
    ;(this.statusText.style as TextStyle).lineHeight = 26
  }

  // ── GameInstance lifecycle ─────────────────────────────────────────────────

  update(_deltaTime: number): void {
    if (this.fullRedraw) {
      this.redrawFullGrid()
    } else if (this.dirtyPixels.size > 0) {
      this.applyDirtyPixels()
    }
  }

  destroy(): void {
    // Remove input listeners
    const canvas = this.app.canvas
    canvas.removeEventListener('pointerdown', this.handlePointerDown)
    canvas.removeEventListener('pointermove', this.handlePointerMove)
    canvas.removeEventListener('pointerup', this.handlePointerUp)
    canvas.removeEventListener('pointerleave', this.handlePointerUp)

    // Clear intervals
    if (this.paintFlushInterval) clearInterval(this.paintFlushInterval)
    if (this.tickInterval) clearInterval(this.tickInterval)

    // Remove network listeners
    this.ctx.network.off(PW_EVENTS.PAINT, this.onPaint as never)
    this.ctx.network.off(PW_EVENTS.DIFF, this.onDiff as never)
    this.ctx.network.off(PW_EVENTS.FULL_SYNC, this.onFullSync as never)
    this.ctx.network.off(PW_EVENTS.TICK, this.onTick as never)
    this.ctx.network.off(PW_EVENTS.GAME_OVER, this.onGameOver as never)

    // Clear stage — do NOT destroy the Pixi app
    this.app.stage.removeChildren()
  }
}
