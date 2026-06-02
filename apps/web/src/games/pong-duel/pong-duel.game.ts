// ─────────────────────────────────────────────────────────────────────────────
// Pong Duel — classic Pong with full GameUI: instructions, countdown, win screen
// First to WIN_SCORE points wins the match.
// Host-authority: host simulates physics at 20Hz, broadcasts state.
// ─────────────────────────────────────────────────────────────────────────────
import { Container, Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'
import { createGameUI } from '@/core/services/game-ui/game-ui'

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
  private ui = createGameUI()

  private worldCtr!: Container
  private ballGfx!: Graphics
  private p1Gfx!: Graphics
  private p2Gfx!: Graphics
  private scoreText!: Text
  private centreLines!: Container

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
    const { winnerId, winnerName, p1score, p2score } = msg.payload as { winnerId: string; winnerName: string; p1score: number; p2score: number }
    this.gameOver = true
    this.ui.showWinScreen(this.ctx, winnerId, winnerName, `${this.p1.name} ${p1score} — ${p2score} ${this.p2.name}`)
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'ArrowUp'   || e.code === 'KeyW') { this.inputUp   = true;  e.preventDefault() }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { this.inputDown = true;  e.preventDefault() }
  }
  private readonly onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'ArrowUp'   || e.code === 'KeyW') this.inputUp   = false
    if (e.code === 'ArrowDown' || e.code === 'KeyS') this.inputDown = false
  }

  constructor(context: GameContext) {
    this.ctx = context
    this.app = context.pixiApp as Application
  }

  async init(): Promise<void> {
    const players = this.ctx.players.getPlayers()
    this.p1.id = players[0]?.id ?? ''; this.p1.name = players[0]?.name ?? 'Player 1'
    this.p2.id = players[1]?.id ?? players[0]?.id ?? ''; this.p2.name = players[1]?.name ?? 'Player 2'
    const localId = this.ctx.players.getLocalPlayer().id
    this.localSide = localId === this.p1.id ? 'p1' : localId === this.p2.id ? 'p2' : null

    this.buildWorld()

    this.ctx.network.on(PD_EVENTS.INPUT,   this.onInput  as never)
    this.ctx.network.on(PD_EVENTS.STATE,   this.onState  as never)
    this.ctx.network.on(PD_EVENTS.SCORE,   this.onScore  as never)
    this.ctx.network.on(PD_EVENTS.WINNER,  this.onWinner as never)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup',   this.onKeyUp)

    // Instructions → countdown → play
    await this.ui.showInstructions(this.ctx, {
      title: '🏓 Pong Duel',
      subtitle: `First to ${WIN_SCORE} points wins`,
      lines: [
        `🔵 ${this.p1.name}  →  left paddle`,
        `🔴 ${this.p2.name}  →  right paddle`,
        '⚡ Ball speeds up with every hit',
        `🏆 First to ${WIN_SCORE} points wins the match`,
      ],
      controls: 'W / S   or   ↑ / ↓   to move paddle',
      accentColor: 0x00f5ff,
    })

    await this.ui.countdown(this.ctx)
    this.ui.clear()
    this.worldCtr.visible = true

    if (this.ctx.network.isHost()) {
      this.tickTimer = setInterval(() => this.hostTick(), TICK_MS)
    }
  }

  update(_dt: number): void {
    if (this.gameOver || !this.localSide) return
    const localId = this.ctx.players.getLocalPlayer().id
    if (this.ctx.network.isHost()) {
      if (this.localSide === 'p1') this.p1.vy = this.inputUp ? -PADDLE_SPEED : this.inputDown ? PADDLE_SPEED : 0
      else                         this.p2.vy = this.inputUp ? -PADDLE_SPEED : this.inputDown ? PADDLE_SPEED : 0
    } else {
      this.ctx.network.send(PD_EVENTS.INPUT, { playerId: localId, up: this.inputUp, down: this.inputDown })
    }
  }

  destroy(): void {
    if (this.tickTimer) clearInterval(this.tickTimer)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup',   this.onKeyUp)
    this.ctx.network.off(PD_EVENTS.INPUT,   this.onInput  as never)
    this.ctx.network.off(PD_EVENTS.STATE,   this.onState  as never)
    this.ctx.network.off(PD_EVENTS.SCORE,   this.onScore  as never)
    this.ctx.network.off(PD_EVENTS.WINNER,  this.onWinner as never)
    this.ui.destroy()
    this.app.stage.removeChildren()
  }

  // ── Host simulation ────────────────────────────────────────────────────────

  private hostTick(): void {
    if (this.gameOver) return
    const dt = TICK_MS / 1000

    this.p1.y = Math.max(PADDLE_H / 2, Math.min(LOGIC_H - PADDLE_H / 2, this.p1.y + this.p1.vy * dt))
    this.p2.y = Math.max(PADDLE_H / 2, Math.min(LOGIC_H - PADDLE_H / 2, this.p2.y + this.p2.vy * dt))

    this.ball.x += this.ball.vx * dt
    this.ball.y += this.ball.vy * dt

    if (this.ball.y - BALL_R < 0)      { this.ball.y = BALL_R;          this.ball.vy =  Math.abs(this.ball.vy) }
    if (this.ball.y + BALL_R > LOGIC_H) { this.ball.y = LOGIC_H - BALL_R; this.ball.vy = -Math.abs(this.ball.vy) }

    const p1x = 30 + PADDLE_W
    if (this.ball.x - BALL_R <= p1x && this.ball.vx < 0 &&
        this.ball.y > this.p1.y - PADDLE_H / 2 && this.ball.y < this.p1.y + PADDLE_H / 2) {
      this.ball.x = p1x + BALL_R
      this.ball.vx = Math.abs(this.ball.vx) * 1.04
      this.ball.vy += ((this.ball.y - this.p1.y) / (PADDLE_H / 2)) * 100
      this.ctx.sound.beep(440, 0.05, 0.15)
    }
    const p2x = LOGIC_W - 30 - PADDLE_W
    if (this.ball.x + BALL_R >= p2x && this.ball.vx > 0 &&
        this.ball.y > this.p2.y - PADDLE_H / 2 && this.ball.y < this.p2.y + PADDLE_H / 2) {
      this.ball.x = p2x - BALL_R
      this.ball.vx = -Math.abs(this.ball.vx) * 1.04
      this.ball.vy += ((this.ball.y - this.p2.y) / (PADDLE_H / 2)) * 100
      this.ctx.sound.beep(440, 0.05, 0.15)
    }

    const speed = Math.sqrt(this.ball.vx ** 2 + this.ball.vy ** 2)
    if (speed > 700) { this.ball.vx = (this.ball.vx / speed) * 700; this.ball.vy = (this.ball.vy / speed) * 700 }

    let scored = false
    if (this.ball.x < 0)       { this.p2.score++; scored = true; this.ctx.sound.beep(220, 0.12, 0.2) }
    if (this.ball.x > LOGIC_W) { this.p1.score++; scored = true; this.ctx.sound.beep(220, 0.12, 0.2) }

    if (scored) {
      this.ctx.network.broadcast(PD_EVENTS.SCORE, { p1score: this.p1.score, p2score: this.p2.score })
      this.updateScore()
      this.resetBall()

      if (this.p1.score >= WIN_SCORE || this.p2.score >= WIN_SCORE) {
        const winner = this.p1.score >= WIN_SCORE ? this.p1 : this.p2
        this.gameOver = true
        clearInterval(this.tickTimer!); this.tickTimer = null
        this.ctx.network.broadcast(PD_EVENTS.WINNER, { winnerId: winner.id, winnerName: winner.name, p1score: this.p1.score, p2score: this.p2.score })
        this.ui.showWinScreen(this.ctx, winner.id, winner.name, `${this.p1.name} ${this.p1.score} — ${this.p2.score} ${this.p2.name}`)
        this.ctx.stats.record('play')
        const localId = this.ctx.players.getLocalPlayer().id
        if (winner.id === localId) this.ctx.stats.record('win'); else this.ctx.stats.record('loss')
        this.ctx.events.emit('platform:game:ended', {
          gameId: this.ctx.gameId, winnerId: winner.id, durationMs: 0,
          results: [this.p1, this.p2].map((p, i) => ({ playerId: p.id, playerName: p.name, rank: i + 1, score: p.score })),
        })
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

  // ── Scene ──────────────────────────────────────────────────────────────────

  private buildWorld(): void {
    this.worldCtr = new Container()
    this.worldCtr.visible = false
    this.app.stage.addChild(this.worldCtr)

    const bg = new Graphics()
    bg.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x08080f)
    this.worldCtr.addChild(bg)

    // Centre dashes
    this.centreLines = new Container()
    for (let yy = 0; yy < LOGIC_H; yy += 28) {
      const dash = new Graphics()
      dash.rect(LOGIC_W / 2 - 2, yy, 4, 16).fill({ color: 0x2a2a50, alpha: 0.9 })
      this.centreLines.addChild(dash)
    }
    this.worldCtr.addChild(this.centreLines)

    this.p1Gfx  = new Graphics()
    this.p2Gfx  = new Graphics()
    this.ballGfx = new Graphics()
    this.worldCtr.addChild(this.p1Gfx, this.p2Gfx, this.ballGfx)

    this.scoreText = new Text({
      text: '0  —  0',
      style: new TextStyle({ fontFamily: '"Space Grotesk", monospace', fontSize: 40, fontWeight: '900', fill: '#ffffff', align: 'center' }),
    })
    this.scoreText.anchor.set(0.5, 0)
    this.scoreText.position.set(LOGIC_W / 2, 10)
    this.worldCtr.addChild(this.scoreText)

    const nameL = new Text({ text: this.p1.name, style: new TextStyle({ fontFamily: '"Space Grotesk", monospace', fontSize: 13, fill: '#00f5ff' }) })
    nameL.position.set(30, 12)
    this.worldCtr.addChild(nameL)

    const nameR = new Text({ text: this.p2.name, style: new TextStyle({ fontFamily: '"Space Grotesk", monospace', fontSize: 13, fill: '#ff2d78' }) })
    nameR.anchor.set(1, 0)
    nameR.position.set(LOGIC_W - 30, 12)
    this.worldCtr.addChild(nameR)

    const hint = new Text({ text: 'W/S or ↑/↓', style: new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: '#2a2a50' }) })
    hint.anchor.set(0.5, 1)
    hint.position.set(LOGIC_W / 2, LOGIC_H - 4)
    this.worldCtr.addChild(hint)

    this.scaleWorld()
    this.renderWorld()
  }

  private renderWorld(): void {
    this.p1Gfx.clear()
    this.p1Gfx.roundRect(30, this.p1.y - PADDLE_H / 2, PADDLE_W, PADDLE_H, 5).fill(0x00f5ff)

    this.p2Gfx.clear()
    this.p2Gfx.roundRect(LOGIC_W - 30 - PADDLE_W, this.p2.y - PADDLE_H / 2, PADDLE_W, PADDLE_H, 5).fill(0xff2d78)

    this.ballGfx.clear()
    this.ballGfx.circle(this.ball.x, this.ball.y, BALL_R).fill(0xffffff)
  }

  private updateScore(): void {
    this.scoreText.text = `${this.p1.score}  —  ${this.p2.score}`
  }

  private scaleWorld(): void {
    const { width: cw, height: ch } = this.app.screen
    const scale = Math.min(cw / LOGIC_W, ch / LOGIC_H) * 0.97
    this.worldCtr.scale.set(scale)
    this.worldCtr.position.set((cw - LOGIC_W * scale) / 2, (ch - LOGIC_H * scale) / 2)
  }
}
