// Air Hockey — physics-based puck, two paddles, first to 7 wins
import { Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'

const LOGIC_W = 600, LOGIC_H = 520
const PUCK_R = 16, PADDLE_R = 28, GOAL_W = 160
const WALL_BOUNCE = 0.85, MAX_SPEED = 18, WIN_SCORE = 7
const PLAYER_COLORS = [0x00f5ff, 0xff2d78, 0xffd60a, 0x30d158, 0xbf5af2, 0xff9f0a]

interface Vec2 { x: number; y: number }

export class AirHockeyGame implements GameInstance {
  private ctx: GameContext; private app: Application
  private stage!: Graphics; private rink!: Graphics
  private puckGfx!: Graphics; private paddle0Gfx!: Graphics; private paddle1Gfx!: Graphics
  private scoreText!: Text; private statusText!: Text
  private puck: Vec2 = { x: LOGIC_W / 2, y: LOGIC_H / 2 }
  private puckV: Vec2 = { x: 4, y: -4 }
  private paddle0: Vec2 = { x: LOGIC_W / 2, y: LOGIC_H - 80 }
  private paddle1: Vec2 = { x: LOGIC_W / 2, y: 80 }
  private scores = [0, 0]
  private gameOver = false
  private mousePos: Vec2 = { x: LOGIC_W / 2, y: LOGIC_H - 80 }
  private localIndex = 0
  private tickCount = 0
  private moveInterval: ReturnType<typeof setInterval> | null = null

  private readonly onState = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const s = msg.payload as { puck: Vec2; puckV: Vec2; p0: Vec2; p1: Vec2; scores: number[] }
    this.puck = s.puck; this.puckV = s.puckV; this.paddle0 = s.p0; this.paddle1 = s.p1; this.scores = s.scores
    this.redraw()
  }
  private readonly onPaddleMove = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { pos } = msg.payload as { pos: Vec2 }
    this.paddle1 = pos
  }
  private readonly onGoal = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { scores, scorer } = msg.payload as { scores: number[]; scorer: number }
    this.scores = scores
    this.statusText.text = scorer === 0 ? 'GOAL! Bottom scores!' : 'GOAL! Top scores!'
    this.updateScoreText()
  }
  private readonly onEnd = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { sorted } = msg.payload as { sorted: { id: string; name: string; score: number }[] }
    this.showFinal(sorted)
  }

  constructor(context: GameContext) { this.ctx = context; this.app = context.pixiApp as Application }

  async init(): Promise<void> {
    const players = this.ctx.players.getPlayers()
    const localId = this.ctx.players.getLocalPlayer().id
    this.localIndex = players.findIndex(p => p.id === localId) === 0 ? 0 : 1
    this.buildScene()
    this.ctx.network.on('air-hockey:state', this.onState as never)
    this.ctx.network.on('air-hockey:paddle', this.onPaddleMove as never)
    this.ctx.network.on('air-hockey:goal', this.onGoal as never)
    this.ctx.network.on('air-hockey:end', this.onEnd as never)
    // Mouse tracking
    this.app.stage.eventMode = 'static'
    this.app.stage.on('pointermove', this.onPointerMove, this)
    // Send paddle position at 20hz
    this.moveInterval = setInterval(() => {
      if (!this.ctx.network.isHost()) {
        this.ctx.network.send('air-hockey:paddle', { pos: this.mousePos })
      } else {
        this.paddle0 = { ...this.mousePos }
      }
    }, 50)
  }

  private onPointerMove(e: { global: Vec2 }): void {
    const scale = this.stage.scale.x
    const ox = this.stage.position.x, oy = this.stage.position.y
    const lx = (e.global.x - ox) / scale, ly = (e.global.y - oy) / scale
    // Clamp to half-court
    if (this.localIndex === 0) this.mousePos = { x: Math.max(PADDLE_R, Math.min(LOGIC_W - PADDLE_R, lx)), y: Math.max(LOGIC_H / 2 + 10, Math.min(LOGIC_H - PADDLE_R, ly)) }
    else this.mousePos = { x: Math.max(PADDLE_R, Math.min(LOGIC_W - PADDLE_R, lx)), y: Math.max(PADDLE_R, Math.min(LOGIC_H / 2 - 10, ly)) }
  }

  update(_dt: number): void {
    if (!this.ctx.network.isHost() || this.gameOver) return
    this.tickCount++
    // Move puck
    this.puck.x += this.puckV.x; this.puck.y += this.puckV.y
    // Wall collisions
    if (this.puck.x < PUCK_R || this.puck.x > LOGIC_W - PUCK_R) { this.puckV.x *= -WALL_BOUNCE; this.puck.x = Math.max(PUCK_R, Math.min(LOGIC_W - PUCK_R, this.puck.x)) }
    const goalLeft = (LOGIC_W - GOAL_W) / 2, goalRight = goalLeft + GOAL_W
    // Top wall / goal
    if (this.puck.y < PUCK_R) {
      if (this.puck.x > goalLeft && this.puck.x < goalRight) { this.scores[0]!++; this.handleGoal(0) }
      else { this.puckV.y *= -WALL_BOUNCE; this.puck.y = PUCK_R }
    }
    // Bottom wall / goal
    if (this.puck.y > LOGIC_H - PUCK_R) {
      if (this.puck.x > goalLeft && this.puck.x < goalRight) { this.scores[1]!++; this.handleGoal(1) }
      else { this.puckV.y *= -WALL_BOUNCE; this.puck.y = LOGIC_H - PUCK_R }
    }
    // Paddle collision helper
    this.collidePaddle(this.paddle0); this.collidePaddle(this.paddle1)
    // Cap speed
    const spd = Math.hypot(this.puckV.x, this.puckV.y)
    if (spd > MAX_SPEED) { this.puckV.x = this.puckV.x / spd * MAX_SPEED; this.puckV.y = this.puckV.y / spd * MAX_SPEED }
    // Broadcast state at 30hz
    if (this.tickCount % 2 === 0) {
      this.ctx.network.broadcast('air-hockey:state', { puck: this.puck, puckV: this.puckV, p0: this.paddle0, p1: this.paddle1, scores: this.scores })
    }
    this.redraw()
  }

  private collidePaddle(paddle: Vec2): void {
    const dx = this.puck.x - paddle.x, dy = this.puck.y - paddle.y
    const dist = Math.hypot(dx, dy)
    if (dist < PUCK_R + PADDLE_R && dist > 0) {
      const nx = dx / dist, ny = dy / dist
      this.puck.x = paddle.x + nx * (PUCK_R + PADDLE_R + 1); this.puck.y = paddle.y + ny * (PUCK_R + PADDLE_R + 1)
      const dot = this.puckV.x * nx + this.puckV.y * ny
      this.puckV.x -= 2 * dot * nx * WALL_BOUNCE; this.puckV.y -= 2 * dot * ny * WALL_BOUNCE
      const spd = Math.hypot(this.puckV.x, this.puckV.y)
      if (spd < 4) { this.puckV.x = nx * 4; this.puckV.y = ny * 4 }
    }
  }

  private handleGoal(scorer: number): void {
    this.ctx.network.broadcast('air-hockey:goal', { scores: [...this.scores], scorer })
    this.statusText.text = scorer === 0 ? 'GOAL! Bottom scores!' : 'GOAL! Top scores!'
    this.updateScoreText()
    if (this.scores[0]! >= WIN_SCORE || this.scores[1]! >= WIN_SCORE) { this.gameOver = true; setTimeout(() => this.triggerFinal(), 1500) }
    else { this.puck = { x: LOGIC_W / 2, y: LOGIC_H / 2 }; this.puckV = { x: (Math.random() > 0.5 ? 1 : -1) * 4, y: scorer === 0 ? 4 : -4 } }
  }

  private triggerFinal(): void {
    const players = this.ctx.players.getPlayers()
    const sorted = players.map((p, i) => ({ id: p.id, name: p.name, score: this.scores[i] ?? 0 })).sort((a, b) => b.score - a.score)
    this.ctx.network.broadcast('air-hockey:end', { sorted }); this.showFinal(sorted)
  }

  destroy(): void {
    if (this.moveInterval) clearInterval(this.moveInterval)
    this.app.stage.off('pointermove', this.onPointerMove, this)
    this.ctx.network.off('air-hockey:state', this.onState as never)
    this.ctx.network.off('air-hockey:paddle', this.onPaddleMove as never)
    this.ctx.network.off('air-hockey:goal', this.onGoal as never)
    this.ctx.network.off('air-hockey:end', this.onEnd as never)
    this.app.stage.removeChildren()
  }

  private buildScene(): void {
    this.stage = new Graphics(); this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    this.app.stage.addChild(this.stage); this.scaleStage()
    // Rink
    this.rink = new Graphics(); this.stage.addChild(this.rink)
    // Goal zones
    const gl = (LOGIC_W - GOAL_W) / 2
    this.rink.rect(gl, 0, GOAL_W, 6).fill(0xff2d78)
    this.rink.rect(gl, LOGIC_H - 6, GOAL_W, 6).fill(0x00f5ff)
    // Center line
    this.rink.rect(0, LOGIC_H / 2 - 1, LOGIC_W, 2).fill(0x2a2a4a)
    // Center circle
    this.rink.circle(LOGIC_W / 2, LOGIC_H / 2, 60).stroke({ width: 1, color: 0x2a2a4a })
    // Border
    this.rink.rect(0, 0, LOGIC_W, LOGIC_H).stroke({ width: 3, color: 0x3a3a6a })
    this.scoreText = new Text({ text: '0  —  0', style: new TextStyle({ fontFamily: 'monospace', fontSize: 28, fontWeight: '900', fill: '#ffffff' }) })
    this.scoreText.anchor.set(0.5); this.scoreText.position.set(LOGIC_W / 2, LOGIC_H / 2 - 20); this.stage.addChild(this.scoreText)
    this.statusText = new Text({ text: 'AIR HOCKEY', style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#606080' }) })
    this.statusText.anchor.set(0.5); this.statusText.position.set(LOGIC_W / 2, LOGIC_H / 2 + 12); this.stage.addChild(this.statusText)
    // Puck & paddles
    this.puckGfx = new Graphics(); this.puckGfx.circle(0, 0, PUCK_R).fill(0xffffff); this.stage.addChild(this.puckGfx)
    const p0Color = PLAYER_COLORS[0]!, p1Color = PLAYER_COLORS[1]!
    this.paddle0Gfx = new Graphics(); this.paddle0Gfx.circle(0, 0, PADDLE_R).fill(p0Color); this.paddle0Gfx.circle(0, 0, PADDLE_R).stroke({ width: 3, color: 0xffffff }); this.stage.addChild(this.paddle0Gfx)
    this.paddle1Gfx = new Graphics(); this.paddle1Gfx.circle(0, 0, PADDLE_R).fill(p1Color); this.paddle1Gfx.circle(0, 0, PADDLE_R).stroke({ width: 3, color: 0xffffff }); this.stage.addChild(this.paddle1Gfx)
    // Player labels
    const players = this.ctx.players.getPlayers()
    const lbl0 = new Text({ text: (players[0]?.name ?? 'P1') + ' ↓', style: new TextStyle({ fontFamily: 'monospace', fontSize: 12, fill: '#00f5ff' }) })
    lbl0.anchor.set(0.5, 1); lbl0.position.set(LOGIC_W / 2, LOGIC_H - 4); this.stage.addChild(lbl0)
    const lbl1 = new Text({ text: '↑ ' + (players[1]?.name ?? 'P2'), style: new TextStyle({ fontFamily: 'monospace', fontSize: 12, fill: '#ff2d78' }) })
    lbl1.anchor.set(0.5, 0); lbl1.position.set(LOGIC_W / 2, 4); this.stage.addChild(lbl1)
    this.redraw()
  }

  private redraw(): void {
    this.puckGfx.position.set(this.puck.x, this.puck.y)
    this.paddle0Gfx.position.set(this.paddle0.x, this.paddle0.y)
    this.paddle1Gfx.position.set(this.paddle1.x, this.paddle1.y)
  }

  private updateScoreText(): void { this.scoreText.text = `${this.scores[0]}  —  ${this.scores[1]}` }

  private showFinal(sorted: { id: string; name: string; score: number }[]): void {
    this.stage.removeChildren(); this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    const t = new Text({ text: 'AIR HOCKEY', style: new TextStyle({ fontFamily: 'monospace', fontSize: 32, fontWeight: '900', fill: '#00f5ff' }) })
    t.anchor.set(0.5); t.position.set(LOGIC_W / 2, 80); this.stage.addChild(t)
    sorted.forEach((p, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : `${i + 1}.`
      const row = new Text({ text: `${medal}  ${p.name.padEnd(14)}  ${p.score} goals`, style: new TextStyle({ fontFamily: 'monospace', fontSize: 22, fill: i === 0 ? '#ffd60a' : '#c0c0e0' }) })
      row.anchor.set(0.5); row.position.set(LOGIC_W / 2, 160 + i * 52); this.stage.addChild(row)
    })
    const localId = this.ctx.players.getLocalPlayer().id
    if (this.ctx.network.isHost()) {
      this.ctx.stats.record('play'); if (sorted[0]?.id === localId) this.ctx.stats.record('win'); else this.ctx.stats.record('loss')
      this.ctx.events.emit('platform:game:ended', { gameId: this.ctx.gameId, winnerId: sorted[0]?.id, durationMs: 0, results: sorted.map((p, i) => ({ playerId: p.id, playerName: p.name, rank: i + 1, score: p.score })) })
    }
  }

  private scaleStage(): void {
    const { width: cw, height: ch } = this.app.screen
    const scale = Math.min(cw / LOGIC_W, ch / LOGIC_H) * 0.97
    this.stage.scale.set(scale); this.stage.position.set((cw - LOGIC_W * scale) / 2, (ch - LOGIC_H * scale) / 2)
  }
}
