// ─────────────────────────────────────────────────────────────────────────────
// Territory Grab — Paint the grid your colour
//
// Shared grid of cells. Click cells to claim them. You can only click cells
// adjacent to ones you already own. Game ends when grid is full.
// Most cells wins.
// ─────────────────────────────────────────────────────────────────────────────
import { Container, Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'
import { createGameUI } from '@/core/services/game-ui/game-ui'

export const TG_EVENTS = {
  CLAIM: 'territory-grab:claim',
  STATE: 'territory-grab:state',
  FINAL: 'territory-grab:final',
} as const

const COLS = 20
const ROWS = 14
const PLAYER_COLORS = [0x00f5ff, 0xff2d78, 0xffd60a, 0x30d158, 0xbf5af2, 0xff9f0a]
const TICK_MS = 100

export class TerritoryGrabGame implements GameInstance {
  private ctx: GameContext
  private app: Application
  private ui = createGameUI()

  private stage!: Container
  private gridGfx!: Graphics
  private hud!: Text
  private endText!: Text

  private grid: (string | null)[][] = [] // playerId or null
  private cellSize = 0
  private offsetX = 0
  private offsetY = 0
  private playerColorMap = new Map<string, number>()
  private gameOver = false
  private tickTimer: ReturnType<typeof setInterval> | null = null

  private readonly onClaim = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { playerId, col, row } = msg.payload as { playerId: string; col: number; row: number }
    this.hostApplyClaim(playerId, col, row)
  }

  private readonly onState = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { grid, done } = msg.payload as { grid: (string|null)[][]; done: boolean }
    this.grid = grid
    this.renderGrid()
    this.updateHUD()
    if (done) this.hostShowFinal(false)
  }

  private readonly onFinal = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { sorted } = msg.payload as { sorted: {id:string;name:string;score:number}[] }
    this.showFinal(sorted)
  }

  constructor(context: GameContext) {
    this.ctx = context
    this.app = context.pixiApp as Application
  }

  async init(): Promise<void> {
    const { width: W, height: H } = this.app.screen
    this.cellSize = Math.min(Math.floor((W * 0.92) / COLS), Math.floor(((H - 60) * 0.92) / ROWS))
    this.offsetX = Math.floor((W - this.cellSize * COLS) / 2)
    this.offsetY = Math.floor(((H - 50) - this.cellSize * ROWS) / 2) + 10

    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null))

    const players = this.ctx.players.getPlayers()
    players.forEach((p, i) => this.playerColorMap.set(p.id, PLAYER_COLORS[i % PLAYER_COLORS.length]!))

    // Place starting cells in corners / spread positions
    if (this.ctx.network.isHost()) {
      const starts = [[0, 0], [COLS-1, ROWS-1], [COLS-1, 0], [0, ROWS-1],
                      [Math.floor(COLS/2), 0], [Math.floor(COLS/2), ROWS-1]]
      players.forEach((p, i) => {
        const [sc, sr] = starts[i % starts.length]!
        this.grid[sr!]![sc!] = p.id
      })
    }

    this.buildScene()
    this.ctx.network.on(TG_EVENTS.CLAIM, this.onClaim as never)
    this.ctx.network.on(TG_EVENTS.STATE, this.onState as never)
    this.ctx.network.on(TG_EVENTS.FINAL, this.onFinal as never)

    await this.ui.showInstructions(this.ctx, {
      title: '🗺️ Territory Grab',
      subtitle: 'Claim the most cells to win',
      lines: [
        '🖱️ Click cells adjacent to your own to claim them',
        '🎨 Each player has a unique colour',
        '🏁 Game ends when the grid is completely filled',
        '🏆 Player with the most cells wins',
      ],
      controls: 'Click adjacent cells to expand your territory',
      accentColor: 0x30d158,
    })
    await this.ui.countdown(this.ctx)
    this.ui.clear()
    this.renderGrid()

    if (this.ctx.network.isHost()) {
      this.ctx.network.broadcast(TG_EVENTS.STATE, { grid: this.grid, done: false })
      this.tickTimer = setInterval(() => this.checkFull(), 500)
    }
  }

  update(_dt: number): void {}

  destroy(): void {
    if (this.tickTimer) clearInterval(this.tickTimer)
    this.app.canvas.removeEventListener('click', this.handleClick)
    this.ctx.network.off(TG_EVENTS.CLAIM, this.onClaim as never)
    this.ctx.network.off(TG_EVENTS.STATE, this.onState as never)
    this.ctx.network.off(TG_EVENTS.FINAL, this.onFinal as never)
    this.ui.destroy()
    this.app.stage.removeChildren()
  }

  private readonly handleClick = (e: MouseEvent): void => {
    if (this.gameOver) return
    const rect = this.app.canvas.getBoundingClientRect()
    const scaleX = this.app.canvas.width / rect.width
    const scaleY = this.app.canvas.height / rect.height
    const cx = Math.floor(((e.clientX - rect.left) * scaleX - this.offsetX) / this.cellSize)
    const cy = Math.floor(((e.clientY - rect.top)  * scaleY - this.offsetY) / this.cellSize)
    if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS) return

    const localId = this.ctx.players.getLocalPlayer().id
    if (this.ctx.network.isHost()) {
      this.hostApplyClaim(localId, cx, cy)
    } else {
      this.ctx.network.send(TG_EVENTS.CLAIM, { playerId: localId, col: cx, row: cy })
    }
  }

  private isAdjacent(playerId: string, col: number, row: number): boolean {
    const dirs = [[0,1],[0,-1],[1,0],[-1,0]]
    for (const [dc, dr] of dirs) {
      const nc = col + dc!, nr = row + dr!
      if (nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS && this.grid[nr]![nc] === playerId) return true
    }
    return false
  }

  private hostApplyClaim(playerId: string, col: number, row: number): void {
    if (this.grid[row]?.[col] !== null) return
    if (!this.isAdjacent(playerId, col, row)) return
    this.grid[row]![col] = playerId
    const full = this.grid.every(row => row.every(c => c !== null))
    this.ctx.network.broadcast(TG_EVENTS.STATE, { grid: this.grid, done: full })
    this.renderGrid()
    this.updateHUD()
    if (full) this.hostShowFinal(true)
  }

  private checkFull(): void {
    if (this.gameOver) return
    if (this.grid.every(row => row.every(c => c !== null))) {
      this.hostShowFinal(true)
    }
  }

  private hostShowFinal(broadcast: boolean): void {
    if (this.gameOver) return
    this.gameOver = true
    if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null }
    const players = this.ctx.players.getPlayers()
    const counts = new Map<string, number>()
    for (const row of this.grid) for (const c of row) if (c) counts.set(c, (counts.get(c) ?? 0) + 1)
    const sorted = players.map(p => ({ id: p.id, name: p.name, score: counts.get(p.id) ?? 0 })).sort((a, b) => b.score - a.score)
    if (broadcast) this.ctx.network.broadcast(TG_EVENTS.FINAL, { sorted })
    this.showFinal(sorted)
  }

  private showFinal(sorted: {id:string;name:string;score:number}[]): void {
    this.gameOver = true
    const winner = sorted[0]!
    const scoreStr = sorted.map((s, i) => `${['🥇','🥈','🥉'][i] ?? `${i+1}.`} ${s.name}: ${s.score} cells`).join('  ')
    this.ui.showWinScreen(this.ctx, winner.id, winner.name, scoreStr, PLAYER_COLORS[0]!)
    if (this.ctx.network.isHost()) {
      this.ctx.stats.record('play')
      const localId = this.ctx.players.getLocalPlayer().id
      if (winner.id === localId) this.ctx.stats.record('win'); else this.ctx.stats.record('loss')
      this.ctx.events.emit('platform:game:ended', {
        gameId: this.ctx.gameId, winnerId: winner.id, durationMs: 0,
        results: sorted.map((s, i) => ({ playerId: s.id, playerName: s.name, rank: i + 1, score: s.score })),
      })
    }
  }

  private renderGrid(): void {
    const cs = this.cellSize
    this.gridGfx.clear()
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const owner = this.grid[r]![c]
        const x = this.offsetX + c * cs
        const y = this.offsetY + r * cs
        const color = owner ? (this.playerColorMap.get(owner) ?? 0x222240) : 0x12122a
        this.gridGfx.rect(x + 1, y + 1, cs - 2, cs - 2).fill({ color, alpha: owner ? 0.9 : 1 })
      }
    }
    // Grid lines
    for (let c = 0; c <= COLS; c++) {
      this.gridGfx.moveTo(this.offsetX + c * cs, this.offsetY).lineTo(this.offsetX + c * cs, this.offsetY + ROWS * cs)
    }
    for (let r = 0; r <= ROWS; r++) {
      this.gridGfx.moveTo(this.offsetX, this.offsetY + r * cs).lineTo(this.offsetX + COLS * cs, this.offsetY + r * cs)
    }
    this.gridGfx.stroke({ width: 1, color: 0x1a1a3a })

    // Highlight local player's cells border
    const localId = this.ctx.players.getLocalPlayer().id
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.grid[r]![c] === localId && this.isAdjacent('__nobody__', c, r)) {
          // adjacent to empty = claimable by nobody, but highlight own
        }
      }
    }
  }

  private updateHUD(): void {
    const counts = new Map<string, number>()
    for (const row of this.grid) for (const c of row) if (c) counts.set(c, (counts.get(c) ?? 0) + 1)
    const players = this.ctx.players.getPlayers()
    this.hud.text = players.map(p => `${p.name}: ${counts.get(p.id) ?? 0}`).join('   ')
  }

  private buildScene(): void {
    const { width: W, height: H } = this.app.screen
    this.stage = new Container()
    this.app.stage.addChild(this.stage)

    const bg = new Graphics()
    bg.rect(0, 0, W, H).fill(0x08080f)
    this.stage.addChild(bg)

    this.gridGfx = new Graphics()
    this.stage.addChild(this.gridGfx)

    this.hud = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#4040a0', align: 'center' }),
    })
    this.hud.anchor.set(0.5, 1)
    this.hud.position.set(W / 2, H - 8)
    this.stage.addChild(this.hud)

    this.endText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 20, fill: '#ffffff' }) })
    this.stage.addChild(this.endText)

    this.app.canvas.addEventListener('click', this.handleClick)
  }
}
