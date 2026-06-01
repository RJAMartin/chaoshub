// ─────────────────────────────────────────────────────────────────────────────
// Pong Duel — classic Pong, 1v1 or up to 4 players in round-robin
//
// Two paddles, one ball. First to 7 wins the match.
// With >2 players: host runs a round-robin bracket.
// Host-authority: host simulates ball + scoring, broadcasts state at 20Hz.
// Clients send paddle direction; host applies it.
// ─────────────────────────────────────────────────────────────────────────────
import { Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'

export const PD_EVENTS = {
  INPUT:   'pong-duel:input',
  STATE:   'pong-duel:state',
  SCORE:   'pong-duel:score',
  WINNER:  'pong-duel:winner',
} as const

const LOGIC_W = 800
const LOGIC_H = 520
const PADDLE_W = 14
const PADDLE_H = 90
const BALL_R = 10
const PADDLE_SPEED = 380
const WIN_SCORE = 7
const TICK_MS = 50

export class PongDuelGame implements GameInstance {
  private ctx: GameContext
  private app: Application

  private stage!: Graphics
  private ballGfx!: Graphics
  private p1Gfx!: Graphics
  private p2Gfx!: Graphics
  private scoreText!: Text
  private statusText!: Text

  // World state (host-owned)
  private ball = { x: LOGIC_W / 2, y: LOGIC_H / 2, vx: 260, vy: 160 }
  private p1 = { y: LOGIC_H / 2, vy: 0, score: 0, id: '', name: '' }
  private p2 = { y: LOGIC_H / 2, vy: 0, score: 0, id: '', name: '' }
  private localSide: 'p1' | 'p2' | null = null

  private inputUp = false
  private inputDown = false
  private tickTimer: ReturnType<typeof setInterval> | null = null
  private gameOver = false

  private readonly onInput = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { playerId, up, down } = msg.payload as { playerId: string; up: boolean; down: boolean }
    if (playerId === this.p1.id) this.p1.vy = up ? -PADDLE_SPEED : down ? PADDLE_SPEED : 0
    else if (playerId === this.p2.id) this.p2.vy = up ? -PADDLE_SPEED : down ? PADDLE_SPEED : 0
  }

  private readonly onState = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const s = msg.payload as typeof this.ball & { p1y: number; p2y: number }
    this.ball.x = s.x; this.ball.y = s.y
    this.p1.y = s.p1y; this.p2.y = s.p2y
    this.renderWorld()
  }

  private readonly onScore = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { p1score, p2score } = msg.payload as { p1score: number; p2score: number }
    this.p1.score = p1score; this.p2.score = p2score
    this.updateScore()
  }

  private readonly onWinner = (msg: NetworkMessage) => {
    const { winnerId, winnerName } = msg.payload as { winnerId: string; winnerName: string }
    this.showWinner(winnerId, winnerName)
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'ArrowUp' || e.code === 'KeyW') { this.inputUp = true; e.preventDefault() }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { this.inputDown = true; e.preventDefault() }
  }
  private readonly onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'ArrowUp' || e.code === 'KeyW') this.inputUp = false
    if (e.code === 'ArrowDown' || e.code === 'KeyS') this.inputDown = false
  }

  constructor(context: GameContext) {
    this.ctx = context
    this.app = context.pixiApp as Application
  }

  async init(): Promise<void> {
    const players = this.ctx.players.getPlayers()
    this.p1.id = players[0]?.id ?? ''; this.p1.name = players[0]?.name ?? 'P1'
    this.p2.id = players[1]?.id ?? players[0]?.id ?? ''; this.p2.name = players[1]?.name ?? 'P2'
    const localId = this.ctx.players.getLocalPlayer().id
    this.localSide = localId === this.p1.id ? 'p1' : localId === this.p2.id ? 'p2' : null

    this.buildScene()
    this.ctx.network.on(PD_EVENTS.INPUT,  this.onInput as never)
    this.ctx.network.on(PD_EVENTS.STATE,  this.onState as never)
    this.ctx.network.on(PD_EVENTS.SCORE,  this.onScore as never)
    this.ctx.network.on(PD_EVENTS.WINNER, this.onWinner as never)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)

    if (this.ctx.network.isHost()) {
      this.tickTimer = setInterval(() => this.hostTick(), TICK_MS)
    }
  }

  update(_dt: number): void {
    if (this.gameOver || !this.localSide) return
    const localId = this.ctx.players.getLocalPlayer().id
    if (this.ctx.network.isHost()) {
      if (this.localSide === 'p1') this.p1.vy = this.inputUp ? -PADDLE_SPEED : this.inputDown ? PADDLE_SPEED : 0
      else this.p2.vy = this.inputUp ? -PADDLE_SPEED : this.inputDown ? PADDLE_SPEED : 0
    } else {
      this.ctx.network.send(PD_EVENTS.INPUT, { playerId: localId, up: this.inputUp, down: this.inputDown })
    }
  }

  destroy(): void {
    if (this.tickTimer) clearInterval(this.tickTimer)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.ctx.network.off(PD_EVENTS.INPUT,  this.onInput as never)
    this.ctx.network.off(PD_EVENTS.STATE,  this.onState as never)
    this.ctx.network.off(PD_EVENTS.SCORE,  this.onScore as never)
    this.ctx.network.off(PD_EVENTS.WINNER, this.onWinner as never)
    this.app.stage.removeChildren()
  }

  private hostTick(): void {
    if (this.gameOver) return
    const dt = TICK_MS / 1000

    // Paddles
    this.p1.y = Math.max(PADDLE_H / 2, Math.min(LOGIC_H - PADDLE_H / 2, this.p1.y + this.p1.vy * dt))
    this.p2.y = Math.max(PADDLE_H / 2, Math.min(LOGIC_H - PADDLE_H / 2, this.p2.y + this.p2.vy * dt))

    // Ball
    this.ball.x += this.ball.vx * dt
    this.ball.y += this.ball.vy * dt

    // Wall bounce
    if (this.ball.y - BALL_R < 0) { this.ball.y = BALL_R; this.ball.vy = Math.abs(this.ball.vy) }
    if (this.ball.y + BALL_R > LOGIC_H) { this.ball.y = LOGIC_H - BALL_R; this.ball.vy = -Math.abs(this.ball.vy) }

    // Paddle collisions
    const p1x = 30 + PADDLE_W
    if (this.ball.x - BALL_R <= p1x && this.ball.vx < 0 &&
        this.ball.y > this.p1.y - PADDLE_H / 2 && this.ball.y < this.p1.y + PADDLE_H / 2) {
      this.ball.x = p1x + BALL_R
      this.ball.vx = Math.abs(this.ball.vx) * 1.04
      this.ball.vy += ((this.ball.y - this.p1.y) / (PADDLE_H / 2)) * 120
    }
    const p2x = LOGIC_W - 30 - PADDLE_W
    if (this.ball.x + BALL_R >= p2x && this.ball.vx > 0 &&
        this.ball.y > this.p2.y - PADDLE_H / 2 && this.ball.y < this.p2.y + PADDLE_H / 2) {
      this.ball.x = p2x - BALL_R
      this.ball.vx = -Math.abs(this.ball.vx) * 1.04
      this.ball.vy += ((this.ball.y - this.p2.y) / (PADDLE_H / 2)) * 120
    }

    // Cap ball speed
    const speed = Math.sqrt(this.ball.vx ** 2 + this.ball.vy ** 2)
    if (speed > 700) { this.ball.vx = (this.ball.vx / speed) * 700; this.ball.vy = (this.ball.vy / speed) * 700 }

    // Scoring
    let scored = false
    if (this.ball.x < 0) { this.p2.score++; scored = true }
    if (this.ball.x > LOGIC_W) { this.p1.score++; scored = true }

    if (scored) {
      this.ctx.network.broadcast(PD_EVENTS.SCORE, { p1score: this.p1.score, p2score: this.p2.score })
      this.updateScore()
      this.resetBall()
      if (this.p1.score >= WIN_SCORE || this.p2.score >= WIN_SCORE) {
        const winner = this.p1.score >= WIN_SCORE ? this.p1 : this.p2
        this.gameOver = true
        if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null }
        this.ctx.network.broadcast(PD_EVENTS.WINNER, { winnerId: winner.id, winnerName: winner.name })
        this.showWinner(winner.id, winner.name)
        return
      }
    }

    this.ctx.network.broadcast(PD_EVENTS.STATE, { ...this.ball, p1y: this.p1.y, p2y: this.p2.y })
    this.renderWorld()
  }

  private resetBall(): void {
    this.ball.x = LOGIC_W / 2; this.ball.y = LOGIC_H / 2
    const dir = Math.random() > 0.5 ? 1 : -1
    this.ball.vx = 260 * dir; this.ball.vy = 140 * (Math.random() > 0.5 ? 1 : -1)
  }

  private buildScene(): void {
    this.stage = new Graphics()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x080810)
    this.app.stage.addChild(this.stage)
    this.scaleStage()

    // Centre line
    for (let y = 0; y < LOGIC_H; y += 28) {
      const dash = new Graphics()
      dash.rect(LOGIC_W / 2 - 2, y, 4, 16).fill({ color: 0x2a2a50, alpha: 0.8 })
      this.stage.addChild(dash)
    }

    this.p1Gfx = new Graphics()
    this.p2Gfx = new Graphics()
    this.ballGfx = new Graphics()
    this.stage.addChild(this.p1Gfx, this.p2Gfx, this.ballGfx)

    this.scoreText = new Text({ text: `0  —  0`, style: new TextStyle({ fontFamily: 'monospace', fontSize: 42, fontWeight: '900', fill: '#ffffff' }) })
    this.scoreText.anchor.set(0.5, 0); this.scoreText.position.set(LOGIC_W / 2, 12)
    this.stage.addChild(this.scoreText)

    const nameL = new Text({ text: this.p1.name, style: new TextStyle({ fontFamily: 'monospace', fontSize: 14, fill: '#00f5ff' }) })
    nameL.anchor.set(0, 0); nameL.position.set(30, 14)
    this.stage.addChild(nameL)

    const nameR = new Text({ text: this.p2.name, style: new TextStyle({ fontFamily: 'monospace', fontSize: 14, fill: '#ff2d78' }) })
    nameR.anchor.set(1, 0); nameR.position.set(LOGIC_W - 30, 14)
    this.stage.addChild(nameR)

    this.statusText = new Text({ text: 'W/S or ↑/↓ to move', style: new TextStyle({ fontFamily: 'monospace', fontSize: 12, fill: '#30304a' }) })
    this.statusText.anchor.set(0.5, 1); this.statusText.position.set(LOGIC_W / 2, LOGIC_H - 6)
    this.stage.addChild(this.statusText)

    this.renderWorld()
  }

  private renderWorld(): void {
    this.p1Gfx.clear()
    this.p1Gfx.roundRect(30, this.p1.y - PADDLE_H / 2, PADDLE_W, PADDLE_H, 4).fill(0x00f5ff)

    this.p2Gfx.clear()
    this.p2Gfx.roundRect(LOGIC_W - 30 - PADDLE_W, this.p2.y - PADDLE_H / 2, PADDLE_W, PADDLE_H, 4).fill(0xff2d78)

    this.ballGfx.clear()
    this.ballGfx.circle(this.ball.x, this.ball.y, BALL_R).fill(0xffffff)
  }

  private updateScore(): void {
    this.scoreText.text = `${this.p1.score}  —  ${this.p2.score}`
  }

  private showWinner(winnerId: string, winnerName: string): void {
    this.gameOver = true
    this.stage.removeChildren()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x080810)
    const localId = this.ctx.players.getLocalPlayer().id
    const isWinner = winnerId === localId
    const t = new Text({ text: isWinner ? '🏆 YOU WIN!' : `${winnerName} wins!`, style: new TextStyle({ fontFamily: 'monospace', fontSize: 40, fontWeight: '900', fill: isWinner ? '#ffd60a' : '#00f5ff' }) })
    t.anchor.set(0.5); t.position.set(LOGIC_W / 2, LOGIC_H / 2 - 20)
    this.stage.addChild(t)
    const sub = new Text({ text: `${this.p1.name}: ${this.p1.score}  —  ${this.p2.name}: ${this.p2.score}`, style: new TextStyle({ fontFamily: 'monospace', fontSize: 22, fill: '#c0c0e0' }) })
    sub.anchor.set(0.5); sub.position.set(LOGIC_W / 2, LOGIC_H / 2 + 50)
    this.stage.addChild(sub)
    if (this.ctx.network.isHost()) {
      this.ctx.stats.record('play')
      if (isWinner) this.ctx.stats.record('win'); else this.ctx.stats.record('loss')
      this.ctx.events.emit('platform:game:ended', { gameId: this.ctx.gameId, winnerId, durationMs: 0, results: [this.p1, this.p2].map((p, i) => ({ playerId: p.id, playerName: p.name, rank: i + 1, score: p.score })) })
    }
  }

  private scaleStage(): void {
    const { width: cw, height: ch } = this.app.screen
    const scale = Math.min(cw / LOGIC_W, ch / LOGIC_H) * 0.97
    this.stage.scale.set(scale)
    this.stage.position.set((cw - LOGIC_W * scale) / 2, (ch - LOGIC_H * scale) / 2)
  }
}
