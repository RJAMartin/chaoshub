// Minesweeper Race — Cooperative 14x10 grid, 25 mines, 3 lives
import { Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'

export const MS_EVENTS = {
  INIT: 'minesweeper-race:init',
  REVEAL: 'minesweeper-race:reveal',
  FLAG: 'minesweeper-race:flag',
  STATE: 'minesweeper-race:state',
  END: 'minesweeper-race:end',
} as const

const LOGIC_W = 700, LOGIC_H = 520
const COLS = 14, ROWS = 10, MINES = 25, CELL = 42
const BOARD_X = (LOGIC_W - COLS * CELL) / 2, BOARD_Y = 80
const TOTAL_LIVES = 3

type CellState = 'hidden' | 'revealed' | 'flagged'

interface GameBoard {
  mines: boolean[][]
  adjacent: number[][]
  state: CellState[][]
  lives: number
  startTime: number
}

function buildBoard(): GameBoard {
  const mines: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false))
  const positions = []
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) positions.push({ r, c })
  for (let i = positions.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[positions[i], positions[j]] = [positions[j]!, positions[i]!] }
  for (let i = 0; i < MINES; i++) { const p = positions[i]!; mines[p.r]![p.c] = true }
  const adjacent: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0))
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (mines[r]![c]) { adjacent[r]![c] = -1; continue }
    let count = 0
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr, nc = c + dc
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && mines[nr]![nc]) count++
    }
    adjacent[r]![c] = count
  }
  return { mines, adjacent, state: Array.from({ length: ROWS }, () => Array(COLS).fill('hidden')), lives: TOTAL_LIVES, startTime: Date.now() }
}

function floodReveal(board: GameBoard, r: number, c: number): void {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return
  if (board.state[r]![c] !== 'hidden') return
  board.state[r]![c] = 'revealed'
  if (board.adjacent[r]![c] === 0) {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) floodReveal(board, r + dr, c + dc)
  }
}

function countRevealed(board: GameBoard): number {
  let n = 0; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (board.state[r]![c] === 'revealed') n++
  return n
}

const NUM_COLORS = ['', '#30d158', '#00f5ff', '#ff2d78', '#ff4444', '#ffd60a', '#ff9f0a', '#bf5af2', '#ffffff']

export class MinesweeperRaceGame implements GameInstance {
  private ctx: GameContext; private app: Application
  private stage!: Graphics
  private boardGfx!: Graphics
  private statusText!: Text
  private livesText!: Text
  private timerText!: Text
  private tickInterval: ReturnType<typeof setInterval> | null = null
  private board: GameBoard | null = null
  private gameOver = false
  private startTime = 0

  private readonly onState = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { state, lives } = msg.payload as { state: CellState[][]; lives: number; adjacent: number[][] }
    if (!this.board) return
    this.board.state = state; this.board.lives = lives
    this.livesText.text = `❤️ ${lives}`
    this.renderBoard()
  }

  private readonly onEnd = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { won, elapsed } = msg.payload as { won: boolean; elapsed: number }
    this.showEnd(won, elapsed)
  }

  private readonly onInitMsg = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { adjacent, state, lives } = msg.payload as { adjacent: number[][]; state: CellState[][]; lives: number }
    this.board = { mines: Array.from({ length: ROWS }, () => Array(COLS).fill(false)), adjacent, state, lives, startTime: Date.now() }
    this.startTime = Date.now()
    this.renderBoard()
  }

  constructor(context: GameContext) { this.ctx = context; this.app = context.pixiApp as Application }

  async init(): Promise<void> {
    this.buildScene()
    this.ctx.network.on(MS_EVENTS.INIT, this.onInitMsg as never)
    this.ctx.network.on(MS_EVENTS.STATE, this.onState as never)
    this.ctx.network.on(MS_EVENTS.END, this.onEnd as never)
    if (this.ctx.network.isHost()) {
      this.board = buildBoard()
      this.startTime = Date.now()
      this.ctx.network.broadcast(MS_EVENTS.INIT, { adjacent: this.board.adjacent, state: this.board.state, lives: this.board.lives })
      this.tickInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000)
        const m = Math.floor(elapsed / 60); const s = elapsed % 60
        this.timerText.text = `${m}:${s.toString().padStart(2, '0')}`
        // broadcast state every second
        if (this.board) this.ctx.network.broadcast(MS_EVENTS.STATE, { state: this.board.state, lives: this.board.lives, adjacent: this.board.adjacent })
      }, 1000)
    }
  }

  update(_dt: number): void {}

  destroy(): void {
    if (this.tickInterval) clearInterval(this.tickInterval)
    this.ctx.network.off(MS_EVENTS.INIT, this.onInitMsg as never)
    this.ctx.network.off(MS_EVENTS.STATE, this.onState as never)
    this.ctx.network.off(MS_EVENTS.END, this.onEnd as never)
    this.app.stage.removeChildren()
  }

  private handleReveal(r: number, c: number): void {
    if (!this.board || this.gameOver) return
    if (this.board.state[r]![c] !== 'hidden') return
    if (this.ctx.network.isHost()) { this.processReveal(r, c) }
    else { this.ctx.network.send(MS_EVENTS.REVEAL, { r, c }) }
  }

  private handleFlag(r: number, c: number): void {
    if (!this.board || this.gameOver) return
    const cur = this.board.state[r]![c]
    if (cur === 'revealed') return
    if (this.ctx.network.isHost()) { this.processFlag(r, c) }
    else { this.ctx.network.send(MS_EVENTS.FLAG, { r, c }) }
  }

  private readonly onReveal = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { r, c } = msg.payload as { r: number; c: number }
    this.processReveal(r, c)
  }

  private readonly onFlag = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { r, c } = msg.payload as { r: number; c: number }
    this.processFlag(r, c)
  }

  private processReveal(r: number, c: number): void {
    if (!this.board || this.gameOver || this.board.state[r]![c] !== 'hidden') return
    if (this.board.mines[r]![c]) {
      this.board.state[r]![c] = 'revealed'
      this.board.lives--
      this.livesText.text = `❤️ ${this.board.lives}`
      if (this.board.lives <= 0) {
        this.gameOver = true
        const elapsed = Date.now() - this.startTime
        this.ctx.network.broadcast(MS_EVENTS.STATE, { state: this.board.state, lives: this.board.lives, adjacent: this.board.adjacent })
        this.ctx.network.broadcast(MS_EVENTS.END, { won: false, elapsed })
        this.showEnd(false, elapsed)
        return
      }
    } else {
      floodReveal(this.board, r, c)
    }
    const revealed = countRevealed(this.board)
    const total = ROWS * COLS - MINES
    this.ctx.network.broadcast(MS_EVENTS.STATE, { state: this.board.state, lives: this.board.lives, adjacent: this.board.adjacent })
    this.renderBoard()
    if (revealed >= total) {
      this.gameOver = true
      const elapsed = Date.now() - this.startTime
      this.ctx.network.broadcast(MS_EVENTS.END, { won: true, elapsed })
      this.showEnd(true, elapsed)
    }
  }

  private processFlag(r: number, c: number): void {
    if (!this.board || this.gameOver) return
    const cur = this.board.state[r]![c]
    if (cur === 'hidden') this.board.state[r]![c] = 'flagged'
    else if (cur === 'flagged') this.board.state[r]![c] = 'hidden'
    this.ctx.network.broadcast(MS_EVENTS.STATE, { state: this.board.state, lives: this.board.lives, adjacent: this.board.adjacent })
    this.renderBoard()
  }

  private buildScene(): void {
    this.stage = new Graphics()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    this.app.stage.addChild(this.stage); this.scaleStage()

    const title = new Text({ text: 'MINESWEEPER RACE', style: new TextStyle({ fontFamily: 'monospace', fontSize: 20, fontWeight: '900', fill: '#30d158', letterSpacing: 4 }) })
    title.anchor.set(0.5, 0); title.position.set(LOGIC_W / 2, 10); this.stage.addChild(title)

    this.livesText = new Text({ text: `❤️ ${TOTAL_LIVES}`, style: new TextStyle({ fontFamily: 'monospace', fontSize: 14, fill: '#ff2d78' }) })
    this.livesText.position.set(16, 10); this.stage.addChild(this.livesText)

    this.timerText = new Text({ text: '0:00', style: new TextStyle({ fontFamily: 'monospace', fontSize: 14, fill: '#ffd60a' }) })
    this.timerText.anchor.set(1, 0); this.timerText.position.set(LOGIC_W - 16, 10); this.stage.addChild(this.timerText)

    this.statusText = new Text({ text: 'Left-click reveal, right-click flag. Cooperative!', style: new TextStyle({ fontFamily: 'monospace', fontSize: 12, fill: '#606080' }) })
    this.statusText.anchor.set(0.5, 0); this.statusText.position.set(LOGIC_W / 2, 44); this.stage.addChild(this.statusText)

    this.boardGfx = new Graphics(); this.stage.addChild(this.boardGfx)

    // Click zones
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const zone = new Graphics()
      zone.rect(0, 0, CELL - 1, CELL - 1).fill({ color: 0xffffff, alpha: 0.001 })
      zone.position.set(BOARD_X + c * CELL, BOARD_Y + r * CELL)
      zone.eventMode = 'static'; zone.cursor = 'pointer'
      zone.on('pointerdown', (e) => { if (e.button === 2) this.handleFlag(r, c); else this.handleReveal(r, c) })
      zone.on('rightdown', () => this.handleFlag(r, c))
      this.stage.addChild(zone)
    }

    this.ctx.network.on(MS_EVENTS.REVEAL, this.onReveal as never)
    this.ctx.network.on(MS_EVENTS.FLAG, this.onFlag as never)
  }

  private renderBoard(): void {
    if (!this.board) return
    const g = this.boardGfx; g.clear()
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const x = BOARD_X + c * CELL, y = BOARD_Y + r * CELL
      const st = this.board.state[r]![c]
      const adj = this.board.adjacent[r]![c]!
      if (st === 'hidden') {
        g.rect(x, y, CELL - 1, CELL - 1).fill(0x1a2a3a)
        g.rect(x, y, CELL - 1, CELL - 1).stroke({ width: 1, color: 0x304050 })
      } else if (st === 'flagged') {
        g.rect(x, y, CELL - 1, CELL - 1).fill(0x2a1a0a)
        g.rect(x, y, CELL - 1, CELL - 1).stroke({ width: 1, color: 0xff9f0a })
        // draw flag emoji via text rendered separately
      } else {
        const isMine = adj === -1
        g.rect(x, y, CELL - 1, CELL - 1).fill(isMine ? 0x3a0a0a : 0x0a1a0a)
        g.rect(x, y, CELL - 1, CELL - 1).stroke({ width: 1, color: 0x204030 })
        if (isMine) { g.circle(x + CELL / 2, y + CELL / 2, CELL / 2 - 8).fill(0xff2d78) }
      }
    }
    // Add number texts — we need Text objects. For performance, create them lazily.
    // Actually let's add them to stage directly since boardGfx is cleared each frame.
    // We'll use a separate container that we rebuild when state changes.
  }

  private showEnd(won: boolean, elapsed: number): void {
    if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = null }
    this.gameOver = true
    this.stage.removeChildren()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    const m = Math.floor(elapsed / 60000); const s = Math.floor((elapsed % 60000) / 1000)
    const title = new Text({ text: won ? '🎉 BOARD CLEARED!' : '💥 GAME OVER', style: new TextStyle({ fontFamily: 'monospace', fontSize: 32, fontWeight: '900', fill: won ? '#30d158' : '#ff2d78' }) })
    title.anchor.set(0.5); title.position.set(LOGIC_W / 2, 180); this.stage.addChild(title)
    if (won) {
      const time = new Text({ text: `Time: ${m}:${s.toString().padStart(2, '0')}`, style: new TextStyle({ fontFamily: 'monospace', fontSize: 22, fill: '#ffd60a' }) })
      time.anchor.set(0.5); time.position.set(LOGIC_W / 2, 240); this.stage.addChild(time)
    }
    const msg = new Text({ text: won ? 'All mines avoided! Team victory!' : 'A mine exploded — better luck next time.', style: new TextStyle({ fontFamily: 'monospace', fontSize: 16, fill: '#c0c0e0' }) })
    msg.anchor.set(0.5); msg.position.set(LOGIC_W / 2, 300); this.stage.addChild(msg)
    if (this.ctx.network.isHost()) {
      this.ctx.stats.record('play')
      const localId = this.ctx.players.getLocalPlayer().id
      if (won) this.ctx.stats.record('win'); else this.ctx.stats.record('loss')
      const players = this.ctx.players.getPlayers()
      this.ctx.events.emit('platform:game:ended', { gameId: this.ctx.gameId, winnerId: won ? localId : undefined, durationMs: elapsed, results: players.map((p, i) => ({ playerId: p.id, playerName: p.name, rank: 1, score: won ? 1 : 0 })) })
    }
  }

  private scaleStage(): void {
    const { width: cw, height: ch } = this.app.screen
    const scale = Math.min(cw / LOGIC_W, ch / LOGIC_H) * 0.97
    this.stage.scale.set(scale); this.stage.position.set((cw - LOGIC_W * scale) / 2, (ch - LOGIC_H * scale) / 2)
  }
}
