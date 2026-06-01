// ─────────────────────────────────────────────────────────────────────────────
// Maze Race — procedural maze, navigate to the exit first
//
// Host generates a maze using recursive backtracker, broadcasts it.
// Each player navigates independently (WASD/arrows, cell-by-cell).
// First to reach the exit wins.
// ─────────────────────────────────────────────────────────────────────────────
import { Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'

export const MR_EVENTS = {
  INIT:   'maze-race:init',
  MOVE:   'maze-race:move',
  STATE:  'maze-race:state',
  WINNER: 'maze-race:winner',
} as const

const COLS = 19
const ROWS = 15
const CELL_PX = 32
const LOGIC_W = COLS * CELL_PX + 2
const LOGIC_H = ROWS * CELL_PX + 70

// Wall bitmask per cell: N=1 S=2 E=4 W=8
const N = 1, S = 2, E = 4, W = 8
const OPPOSITE: Record<number, number> = { [N]: S, [S]: N, [E]: W, [W]: E }
const DX: Record<number, number> = { [N]: 0, [S]: 0, [E]: 1, [W]: -1 }
const DY: Record<number, number> = { [N]: -1, [S]: 1, [E]: 0, [W]: 0 }

const PLAYER_COLORS = [0x00f5ff, 0xff2d78, 0xffd60a, 0x30d158, 0xbf5af2, 0xff9f0a]

function generateMaze(cols: number, rows: number): number[][] {
  // cells[r][c] = bitmask of OPEN walls (N/S/E/W means passage exists)
  const cells: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0))
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false))

  function carve(r: number, c: number) {
    visited[r]![c] = true
    const dirs = [N, S, E, W].sort(() => Math.random() - 0.5)
    for (const d of dirs) {
      const nr = r + DY[d]!; const nc = c + DX[d]!
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue
      if (visited[nr]![nc]) continue
      cells[r]![c]! |= d
      cells[nr]![nc]! |= OPPOSITE[d]!
      carve(nr, nc)
    }
  }
  carve(0, 0)
  return cells
}

interface PlayerPos { id: string; name: string; col: number; row: number; colorIdx: number; finished: boolean }

export class MazeRaceGame implements GameInstance {
  private ctx: GameContext
  private app: Application

  private stage!: Graphics
  private mazeGfx!: Graphics
  private playerGfx: Map<string, Graphics> = new Map()
  private hudText!: Text

  private maze: number[][] = []
  private players: Map<string, PlayerPos> = new Map()
  private localPos = { col: 0, row: 0 }
  private gameOver = false

  private readonly onInit = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { maze, players } = msg.payload as { maze: number[][]; players: PlayerPos[] }
    this.maze = maze
    for (const p of players) { this.players.set(p.id, p) }
    const local = this.players.get(this.ctx.players.getLocalPlayer().id)
    if (local) this.localPos = { col: local.col, row: local.row }
    this.drawMaze()
    this.renderPlayers()
  }

  private readonly onMove = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { playerId, col, row } = msg.payload as { playerId: string; col: number; row: number }
    const p = this.players.get(playerId)
    if (!p || p.finished) return
    p.col = col; p.row = row
    if (col === COLS - 1 && row === ROWS - 1) {
      p.finished = true
      this.ctx.network.broadcast(MR_EVENTS.WINNER, { winnerId: p.id, winnerName: p.name })
      this.ctx.network.broadcast(MR_EVENTS.STATE, { players: [...this.players.values()] })
      this.showWinner(p.id, p.name)
      return
    }
    this.ctx.network.broadcast(MR_EVENTS.STATE, { players: [...this.players.values()] })
    this.renderPlayers()
  }

  private readonly onState = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { players } = msg.payload as { players: PlayerPos[] }
    for (const p of players) this.players.set(p.id, p)
    this.renderPlayers()
  }

  private readonly onWinner = (msg: NetworkMessage) => {
    const { winnerId, winnerName } = msg.payload as { winnerId: string; winnerName: string }
    this.showWinner(winnerId, winnerName)
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (this.gameOver) return
    let dir: number | null = null
    if (e.code === 'ArrowUp'    || e.code === 'KeyW') dir = N
    if (e.code === 'ArrowDown'  || e.code === 'KeyS') dir = S
    if (e.code === 'ArrowRight' || e.code === 'KeyD') dir = E
    if (e.code === 'ArrowLeft'  || e.code === 'KeyA') dir = W
    if (dir !== null) { e.preventDefault(); this.tryMove(dir) }
  }

  constructor(context: GameContext) { this.ctx = context; this.app = context.pixiApp as Application }

  async init(): Promise<void> {
    this.buildScene()
    this.ctx.network.on(MR_EVENTS.INIT,   this.onInit as never)
    this.ctx.network.on(MR_EVENTS.MOVE,   this.onMove as never)
    this.ctx.network.on(MR_EVENTS.STATE,  this.onState as never)
    this.ctx.network.on(MR_EVENTS.WINNER, this.onWinner as never)
    window.addEventListener('keydown', this.onKeyDown)

    if (this.ctx.network.isHost()) {
      this.maze = generateMaze(COLS, ROWS)
      const ps = this.ctx.players.getPlayers()
      ps.forEach((p, i) => {
        this.players.set(p.id, { id: p.id, name: p.name, col: 0, row: 0, colorIdx: i % PLAYER_COLORS.length, finished: false })
      })
      this.localPos = { col: 0, row: 0 }
      setTimeout(() => {
        this.ctx.network.broadcast(MR_EVENTS.INIT, { maze: this.maze, players: [...this.players.values()] })
        this.drawMaze(); this.renderPlayers()
      }, 500)
    }
  }

  update(_dt: number): void {}

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown)
    this.ctx.network.off(MR_EVENTS.INIT,   this.onInit as never)
    this.ctx.network.off(MR_EVENTS.MOVE,   this.onMove as never)
    this.ctx.network.off(MR_EVENTS.STATE,  this.onState as never)
    this.ctx.network.off(MR_EVENTS.WINNER, this.onWinner as never)
    this.app.stage.removeChildren()
  }

  private tryMove(dir: number): void {
    const cell = this.maze[this.localPos.row]?.[this.localPos.col] ?? 0
    if (!(cell & dir)) return  // wall blocks
    const newCol = this.localPos.col + DX[dir]!
    const newRow = this.localPos.row + DY[dir]!
    if (newCol < 0 || newCol >= COLS || newRow < 0 || newRow >= ROWS) return
    this.localPos = { col: newCol, row: newRow }
    const localId = this.ctx.players.getLocalPlayer().id
    // Update local player visually immediately
    const p = this.players.get(localId)
    if (p) { p.col = newCol; p.row = newRow }
    this.renderPlayers()
    if (this.ctx.network.isHost()) {
      // Trigger move handler directly
      const payload = { playerId: localId, col: newCol, row: newRow }
      this.onMove({ payload, senderId: localId } as unknown as NetworkMessage)
    } else {
      this.ctx.network.send(MR_EVENTS.MOVE, { playerId: localId, col: newCol, row: newRow })
      if (newCol === COLS - 1 && newRow === ROWS - 1) {
        // Trigger winner display locally
        const p = this.players.get(localId)!
        this.showWinner(localId, p.name)
      }
    }
  }

  private buildScene(): void {
    this.stage = new Graphics()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    this.app.stage.addChild(this.stage)
    this.scaleStage()

    const title = new Text({ text: 'MAZE RACE', style: new TextStyle({ fontFamily: 'monospace', fontSize: 24, fontWeight: '900', fill: '#00f5ff', letterSpacing: 5 }) })
    title.anchor.set(0.5, 0); title.position.set(LOGIC_W / 2, 10); this.stage.addChild(title)

    const controls = new Text({ text: 'WASD / arrows to navigate', style: new TextStyle({ fontFamily: 'monospace', fontSize: 12, fill: '#30304a' }) })
    controls.anchor.set(0.5, 0); controls.position.set(LOGIC_W / 2, 38); this.stage.addChild(controls)

    this.hudText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 12, fill: '#c0c0e0' }) })
    this.hudText.anchor.set(0.5, 1); this.hudText.position.set(LOGIC_W / 2, LOGIC_H - 6); this.stage.addChild(this.hudText)

    this.mazeGfx = new Graphics()
    this.mazeGfx.position.set(1, 57)
    this.stage.addChild(this.mazeGfx)
  }

  private drawMaze(): void {
    if (!this.maze.length) return
    this.mazeGfx.clear()
    const C = CELL_PX

    // Background
    this.mazeGfx.rect(0, 0, COLS * C, ROWS * C).fill(0x111120)

    // Exit marker
    this.mazeGfx.roundRect((COLS - 1) * C + 4, (ROWS - 1) * C + 4, C - 8, C - 8, 4).fill(0xffd60a44)

    // Walls
    this.mazeGfx.moveTo(0, 0)
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = this.maze[r]![c]!
        const x = c * C; const y = r * C
        if (!(cell & N)) { this.mazeGfx.moveTo(x, y).lineTo(x + C, y) }
        if (!(cell & S)) { this.mazeGfx.moveTo(x, y + C).lineTo(x + C, y + C) }
        if (!(cell & W)) { this.mazeGfx.moveTo(x, y).lineTo(x, y + C) }
        if (!(cell & E)) { this.mazeGfx.moveTo(x + C, y).lineTo(x + C, y + C) }
      }
    }
    this.mazeGfx.stroke({ width: 2, color: 0x4a4a8a })

    // Outer border
    this.mazeGfx.rect(0, 0, COLS * C, ROWS * C).stroke({ width: 3, color: 0x6a6ab0 })

    // Exit label
    const exitText = new Text({ text: '★', style: new TextStyle({ fontFamily: 'monospace', fontSize: 18, fill: '#ffd60a' }) })
    exitText.anchor.set(0.5); exitText.position.set((COLS - 0.5) * C, (ROWS - 0.5) * C)
    this.mazeGfx.addChild(exitText)
  }

  private renderPlayers(): void {
    for (const p of this.players.values()) {
      if (!this.playerGfx.has(p.id)) {
        const g = new Graphics(); this.mazeGfx.addChild(g); this.playerGfx.set(p.id, g)
      }
      const g = this.playerGfx.get(p.id)!
      const color = PLAYER_COLORS[p.colorIdx] ?? 0xffffff
      const cx = p.col * CELL_PX + CELL_PX / 2
      const cy = p.row * CELL_PX + CELL_PX / 2
      g.clear()
      g.circle(cx, cy, CELL_PX * 0.34).fill(color)
    }
    const localId = this.ctx.players.getLocalPlayer().id
    const parts = [...this.players.values()].map(p => {
      const dist = (COLS - 1 - p.col) + (ROWS - 1 - p.row)
      return `${p.id === localId ? '▶' : '·'} ${p.name}: ${p.finished ? '🏁' : dist + ' steps'}`
    })
    this.hudText.text = parts.join('   ')
  }

  private showWinner(winnerId: string, winnerName: string): void {
    this.gameOver = true
    const localId = this.ctx.players.getLocalPlayer().id
    const isWinner = winnerId === localId
    // Overlay on top of maze
    const overlay = new Graphics()
    overlay.rect(0, 0, LOGIC_W, LOGIC_H).fill({ color: 0x000000, alpha: 0.7 })
    this.stage.addChild(overlay)
    const t = new Text({ text: isWinner ? '🏆 YOU WIN!' : `${winnerName} wins!`, style: new TextStyle({ fontFamily: 'monospace', fontSize: 36, fontWeight: '900', fill: isWinner ? '#ffd60a' : '#00f5ff' }) })
    t.anchor.set(0.5); t.position.set(LOGIC_W / 2, LOGIC_H / 2)
    this.stage.addChild(t)
    if (this.ctx.network.isHost()) {
      this.ctx.stats.record('play'); if (isWinner) this.ctx.stats.record('win'); else this.ctx.stats.record('loss')
      this.ctx.events.emit('platform:game:ended', { gameId: this.ctx.gameId, winnerId, durationMs: 0, results: [] })
    }
  }

  private scaleStage(): void {
    const { width: cw, height: ch } = this.app.screen
    const scale = Math.min(cw / LOGIC_W, ch / LOGIC_H) * 0.97
    this.stage.scale.set(scale); this.stage.position.set((cw - LOGIC_W * scale) / 2, (ch - LOGIC_H * scale) / 2)
  }
}
