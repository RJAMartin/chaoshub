// Connect Four — Classic 7x6 grid, first to connect 4 wins
import { Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'

export const CF_EVENTS = {
  INIT: 'connect-four:init',
  DROP: 'connect-four:drop',
  STATE: 'connect-four:state',
  WINNER: 'connect-four:winner',
} as const

const LOGIC_W = 560, LOGIC_H = 560
const COLS = 7, ROWS = 6, CELL = 68, BOARD_X = (LOGIC_W - COLS * CELL) / 2, BOARD_Y = 90

type Cell = 0 | 1 | 2
type Board = Cell[][]

function emptyBoard(): Board { return Array.from({ length: ROWS }, () => Array(COLS).fill(0) as Cell[]) }

function checkWin(board: Board, p: 1 | 2): boolean {
  const W = COLS, H = ROWS
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const v = board[r]![c]!
    if (v !== p) continue
    if (c + 3 < W && board[r]![c+1] === p && board[r]![c+2] === p && board[r]![c+3] === p) return true
    if (r + 3 < H && board[r+1]![c] === p && board[r+2]![c] === p && board[r+3]![c] === p) return true
    if (r + 3 < H && c + 3 < W && board[r+1]![c+1] === p && board[r+2]![c+2] === p && board[r+3]![c+3] === p) return true
    if (r + 3 < H && c - 3 >= 0 && board[r+1]![c-1] === p && board[r+2]![c-2] === p && board[r+3]![c-3] === p) return true
  }
  return false
}

export class ConnectFourGame implements GameInstance {
  private ctx: GameContext; private app: Application
  private stage!: Graphics
  private boardGfx!: Graphics
  private statusText!: Text
  private scoreText!: Text

  private board: Board = emptyBoard()
  private currentPlayer: 1 | 2 = 1
  private p1Id = ''; private p2Id = ''
  private p1Name = ''; private p2Name = ''
  private gameOver = false
  private hoverCol = -1

  private readonly onDrop = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { col, playerId } = msg.payload as { col: number; playerId: string }
    const expectedId = this.currentPlayer === 1 ? this.p1Id : this.p2Id
    if (playerId !== expectedId) return
    this.applyDrop(col)
  }

  private readonly onState = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { board, currentPlayer } = msg.payload as { board: Board; currentPlayer: 1 | 2 }
    this.board = board; this.currentPlayer = currentPlayer
    this.renderBoard()
    this.updateStatus()
  }

  private readonly onWinner = (msg: NetworkMessage) => {
    const { winnerId, winnerName, draw } = msg.payload as { winnerId: string | null; winnerName: string | null; draw: boolean }
    this.showWinner(winnerId, winnerName, draw)
  }

  private readonly onInitMsg = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { p1Id, p2Id, p1Name, p2Name } = msg.payload as { p1Id: string; p2Id: string; p1Name: string; p2Name: string }
    this.p1Id = p1Id; this.p2Id = p2Id; this.p1Name = p1Name; this.p2Name = p2Name
    this.updateStatus()
  }

  constructor(context: GameContext) { this.ctx = context; this.app = context.pixiApp as Application }

  async init(): Promise<void> {
    const players = this.ctx.players.getPlayers()
    this.p1Id = players[0]?.id ?? ''; this.p1Name = players[0]?.name ?? 'P1'
    this.p2Id = players[1]?.id ?? players[0]?.id ?? ''; this.p2Name = players[1]?.name ?? 'P2'
    this.buildScene()
    this.ctx.network.on(CF_EVENTS.INIT, this.onInitMsg as never)
    this.ctx.network.on(CF_EVENTS.DROP, this.onDrop as never)
    this.ctx.network.on(CF_EVENTS.STATE, this.onState as never)
    this.ctx.network.on(CF_EVENTS.WINNER, this.onWinner as never)
    if (this.ctx.network.isHost()) {
      this.ctx.network.broadcast(CF_EVENTS.INIT, { p1Id: this.p1Id, p2Id: this.p2Id, p1Name: this.p1Name, p2Name: this.p2Name })
    }
    this.updateStatus()
  }

  update(_dt: number): void {}

  destroy(): void {
    this.ctx.network.off(CF_EVENTS.INIT, this.onInitMsg as never)
    this.ctx.network.off(CF_EVENTS.DROP, this.onDrop as never)
    this.ctx.network.off(CF_EVENTS.STATE, this.onState as never)
    this.ctx.network.off(CF_EVENTS.WINNER, this.onWinner as never)
    this.app.stage.removeChildren()
  }

  private handleColClick(col: number): void {
    if (this.gameOver) return
    const localId = this.ctx.players.getLocalPlayer().id
    const myTurn = (this.currentPlayer === 1 && localId === this.p1Id) || (this.currentPlayer === 2 && localId === this.p2Id)
    if (!myTurn) return
    if (this.ctx.network.isHost()) { this.applyDrop(col) }
    else { this.ctx.network.send(CF_EVENTS.DROP, { col, playerId: localId }) }
  }

  private applyDrop(col: number): void {
    // Find lowest empty row
    let row = -1
    for (let r = ROWS - 1; r >= 0; r--) { if (this.board[r]![col] === 0) { row = r; break } }
    if (row === -1) return
    this.board[row]![col] = this.currentPlayer
    const won = checkWin(this.board, this.currentPlayer)
    const draw = !won && this.board[0]!.every(c => c !== 0)
    this.ctx.network.broadcast(CF_EVENTS.STATE, { board: this.board, currentPlayer: this.currentPlayer === 1 ? 2 : 1 })
    this.renderBoard(); this.updateStatus()
    if (won || draw) {
      const winnerId = won ? (this.currentPlayer === 1 ? this.p1Id : this.p2Id) : null
      const winnerName = won ? (this.currentPlayer === 1 ? this.p1Name : this.p2Name) : null
      this.ctx.network.broadcast(CF_EVENTS.WINNER, { winnerId, winnerName, draw })
      this.showWinner(winnerId, winnerName, draw)
    } else {
      this.currentPlayer = this.currentPlayer === 1 ? 2 : 1
    }
  }

  private buildScene(): void {
    this.stage = new Graphics()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    this.app.stage.addChild(this.stage); this.scaleStage()

    const title = new Text({ text: 'CONNECT FOUR', style: new TextStyle({ fontFamily: 'monospace', fontSize: 22, fontWeight: '900', fill: '#00f5ff', letterSpacing: 4 }) })
    title.anchor.set(0.5, 0); title.position.set(LOGIC_W / 2, 12); this.stage.addChild(title)

    this.statusText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 15, fill: '#ffd60a' }) })
    this.statusText.anchor.set(0.5, 0); this.statusText.position.set(LOGIC_W / 2, 48); this.stage.addChild(this.statusText)

    this.scoreText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#606080' }) })
    this.scoreText.anchor.set(0.5, 0); this.scoreText.position.set(LOGIC_W / 2, 540); this.stage.addChild(this.scoreText)

    // Board background
    this.stage.roundRect(BOARD_X - 8, BOARD_Y - 8, COLS * CELL + 16, ROWS * CELL + 16, 8).fill(0x1a2a4a)

    // Column click zones
    for (let c = 0; c < COLS; c++) {
      const zone = new Graphics()
      zone.rect(0, 0, CELL, ROWS * CELL).fill({ color: 0xffffff, alpha: 0.001 })
      zone.position.set(BOARD_X + c * CELL, BOARD_Y)
      zone.eventMode = 'static'; zone.cursor = 'pointer'
      zone.on('pointerdown', () => this.handleColClick(c))
      zone.on('pointerover', () => { this.hoverCol = c; this.renderBoard() })
      zone.on('pointerout', () => { this.hoverCol = -1; this.renderBoard() })
      this.stage.addChild(zone)
    }

    this.boardGfx = new Graphics(); this.stage.addChild(this.boardGfx)
    this.renderBoard()
  }

  private renderBoard(): void {
    const g = this.boardGfx; g.clear()
    const localId = this.ctx.players.getLocalPlayer().id
    const myTurn = !this.gameOver && ((this.currentPlayer === 1 && localId === this.p1Id) || (this.currentPlayer === 2 && localId === this.p2Id))
    const hoverColor = this.currentPlayer === 1 ? 0x00f5ff : 0xff2d78
    if (myTurn && this.hoverCol >= 0) {
      g.rect(BOARD_X + this.hoverCol * CELL, BOARD_Y - CELL, CELL, CELL).fill({ color: hoverColor, alpha: 0.3 })
      g.circle(BOARD_X + this.hoverCol * CELL + CELL / 2, BOARD_Y - CELL / 2, CELL / 2 - 6).fill({ color: hoverColor, alpha: 0.6 })
    }
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const val = this.board[r]![c]!
      const cx = BOARD_X + c * CELL + CELL / 2, cy = BOARD_Y + r * CELL + CELL / 2
      g.circle(cx, cy, CELL / 2 - 5).fill(val === 0 ? 0x0a0a1a : val === 1 ? 0x00f5ff : 0xff2d78)
      if (val !== 0) g.circle(cx, cy, CELL / 2 - 5).stroke({ width: 2, color: val === 1 ? 0x80ffff : 0xff80a0 })
    }
  }

  private updateStatus(): void {
    const localId = this.ctx.players.getLocalPlayer().id
    const myTurn = (this.currentPlayer === 1 && localId === this.p1Id) || (this.currentPlayer === 2 && localId === this.p2Id)
    const turnName = this.currentPlayer === 1 ? this.p1Name : this.p2Name
    this.statusText.text = myTurn ? `Your turn!` : `${turnName}'s turn`
    ;(this.statusText.style as TextStyle).fill = myTurn ? '#30d158' : '#ffd60a'
    const p1Col = '#00f5ff'; const p2Col = '#ff2d78'
    this.scoreText.text = `${this.p1Name} = ${p1Col.replace('#', '')} cyan   ${this.p2Name} = pink`
    // Use text, not colors in text
    this.scoreText.text = `${this.p1Name} (cyan) vs ${this.p2Name} (pink)`
  }

  private showWinner(winnerId: string | null, winnerName: string | null, draw: boolean): void {
    this.gameOver = true
    const localId = this.ctx.players.getLocalPlayer().id
    const won = !draw && winnerId === localId
    this.statusText.text = draw ? "It's a draw!" : won ? '🏆 You win!' : `${winnerName} wins!`
    ;(this.statusText.style as TextStyle).fill = draw ? '#ffd60a' : won ? '#30d158' : '#ff2d78'
    if (this.ctx.network.isHost()) {
      this.ctx.stats.record('play')
      if (won) this.ctx.stats.record('win'); else if (!draw) this.ctx.stats.record('loss')
      const players = this.ctx.players.getPlayers()
      this.ctx.events.emit('platform:game:ended', { gameId: this.ctx.gameId, winnerId: winnerId ?? undefined, durationMs: 0, results: players.map((p, i) => ({ playerId: p.id, playerName: p.name, rank: winnerId === p.id ? 1 : 2, score: 0 })) })
    }
  }

  private scaleStage(): void {
    const { width: cw, height: ch } = this.app.screen
    const scale = Math.min(cw / LOGIC_W, ch / LOGIC_H) * 0.97
    this.stage.scale.set(scale); this.stage.position.set((cw - LOGIC_W * scale) / 2, (ch - LOGIC_H * scale) / 2)
  }
}
