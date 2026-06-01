// Breakout Blitz — competitive breakout: each player has their own paddle + brick row, race to clear first
import { Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'

const LOGIC_W = 640, LOGIC_H = 520, PADDLE_W = 90, PADDLE_H = 10
const BALL_R = 8, BRICK_COLS = 10, BRICK_ROWS = 4, BRICK_W = 56, BRICK_H = 16, BRICK_GAP = 2
const BRICK_AREA_TOP = 40, PLAYER_COLORS = [0x00f5ff, 0xff2d78, 0xffd60a, 0x30d158, 0xbf5af2, 0xff9f0a]

interface Ball { x: number; y: number; vx: number; vy: number }
interface Brick { x: number; y: number; alive: boolean }
interface PlayerState { paddle: number; ball: Ball; bricks: Brick[]; score: number; done: boolean; color: number }

export class BreakoutBlitzGame implements GameInstance {
  private ctx: GameContext; private app: Application
  private stage!: Graphics
  private players: PlayerState[] = []
  private playerGfx: { paddle: Graphics; ball: Graphics; bricks: Graphics[]; label: Text; scoreLabel: Text }[] = []
  private statusText!: Text
  private gameOver = false
  private localIndex = 0
  private mouseX = LOGIC_W / 4

  private readonly onState = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const s = msg.payload as { players: { paddle: number; ball: Ball; bricks: boolean[]; score: number; done: boolean }[] }
    s.players.forEach((ps, i) => {
      const p = this.players[i]; if (!p) return
      p.paddle = ps.paddle; p.ball = ps.ball; p.score = ps.score; p.done = ps.done
      ps.bricks.forEach((alive, j) => { if (p.bricks[j]) p.bricks[j]!.alive = alive })
    })
    this.redraw()
  }
  private readonly onEnd = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { sorted } = msg.payload as { sorted: { id: string; name: string; score: number }[] }
    this.showFinal(sorted)
  }

  constructor(context: GameContext) { this.ctx = context; this.app = context.pixiApp as Application }

  async init(): Promise<void> {
    const ps = this.ctx.players.getPlayers()
    const localId = this.ctx.players.getLocalPlayer().id
    this.localIndex = ps.findIndex(p => p.id === localId)
    this.players = ps.map((_, i) => this.makePlayerState(i))
    this.buildScene()
    this.ctx.network.on('breakout:state', this.onState as never)
    this.ctx.network.on('breakout:end', this.onEnd as never)
    this.app.stage.eventMode = 'static'
    this.app.stage.on('pointermove', this.onPointerMove, this)
  }

  private onPointerMove(e: { global: { x: number } }): void {
    const scale = this.stage.scale.x, ox = this.stage.position.x
    this.mouseX = (e.global.x - ox) / scale
  }

  private makePlayerState(i: number): PlayerState {
    const col = i % 2, row = Math.floor(i / 2)
    const areaW = LOGIC_W / 2 - 10, areaX = col * (LOGIC_W / 2) + 5
    const areaH = (LOGIC_H - 20) / Math.ceil(this.ctx.players.getPlayers().length / 2)
    const areaY = 10 + row * areaH
    const bricks: Brick[] = []
    const brickStartX = areaX + (areaW - BRICK_COLS * (BRICK_W + BRICK_GAP)) / 2
    for (let r = 0; r < BRICK_ROWS; r++) for (let c = 0; c < BRICK_COLS; c++) {
      bricks.push({ x: brickStartX + c * (BRICK_W + BRICK_GAP), y: areaY + BRICK_AREA_TOP + r * (BRICK_H + BRICK_GAP), alive: true })
    }
    const paddleY = areaY + areaH - 20
    const ball: Ball = { x: areaX + areaW / 2, y: paddleY - BALL_R - 2, vx: (Math.random() > 0.5 ? 1 : -1) * 3, vy: -5 }
    return { paddle: areaX + areaW / 2, ball, bricks, score: 0, done: false, color: PLAYER_COLORS[i] ?? 0xffffff }
  }

  update(_dt: number): void {
    if (!this.ctx.network.isHost() || this.gameOver) return
    const ps = this.ctx.players.getPlayers()
    // Update local player paddle
    const lp = this.players[this.localIndex]
    if (lp) {
      const col = this.localIndex % 2, areaW = LOGIC_W / 2 - 10, areaX = col * (LOGIC_W / 2) + 5
      lp.paddle = Math.max(areaX + PADDLE_W / 2, Math.min(areaX + areaW - PADDLE_W / 2, this.mouseX))
    }
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i]!; if (p.done) continue
      const col = i % 2, areaW = LOGIC_W / 2 - 10, areaX = col * (LOGIC_W / 2) + 5
      const areaH = (LOGIC_H - 20) / Math.ceil(ps.length / 2), row = Math.floor(i / 2)
      const areaY = 10 + row * areaH, paddleY = areaY + areaH - 20
      // Move ball
      p.ball.x += p.ball.vx; p.ball.y += p.ball.vy
      // Wall bounces
      if (p.ball.x < areaX + BALL_R || p.ball.x > areaX + areaW - BALL_R) { p.ball.vx *= -1; p.ball.x = Math.max(areaX + BALL_R, Math.min(areaX + areaW - BALL_R, p.ball.x)) }
      if (p.ball.y < areaY + BALL_R) { p.ball.vy *= -1; p.ball.y = areaY + BALL_R }
      // Paddle
      if (p.ball.y > paddleY - BALL_R && p.ball.y < paddleY + PADDLE_H && Math.abs(p.ball.x - p.paddle) < PADDLE_W / 2 + BALL_R) {
        p.ball.vy = -Math.abs(p.ball.vy); p.ball.vx += (p.ball.x - p.paddle) * 0.1
      }
      // Lost ball
      if (p.ball.y > paddleY + 30) { p.ball = { x: p.paddle, y: paddleY - BALL_R - 2, vx: (Math.random() > 0.5 ? 1 : -1) * 3, vy: -5 } }
      // Brick collision
      for (const b of p.bricks) {
        if (!b.alive) continue
        if (p.ball.x > b.x && p.ball.x < b.x + BRICK_W && p.ball.y > b.y && p.ball.y < b.y + BRICK_H) {
          b.alive = false; p.ball.vy *= -1; p.score++
        }
      }
      if (p.bricks.every(b => !b.alive)) { p.done = true }
    }
    const bricksArr = this.players.map(p => p.bricks.map(b => b.alive))
    this.ctx.network.broadcast('breakout:state', { players: this.players.map((p, i) => ({ paddle: p.paddle, ball: p.ball, bricks: bricksArr[i]!, score: p.score, done: p.done })) })
    this.redraw()
    if (this.players.some(p => p.done) && !this.gameOver) { this.gameOver = true; setTimeout(() => this.triggerFinal(), 1500) }
  }

  private triggerFinal(): void {
    const ps = this.ctx.players.getPlayers()
    const sorted = ps.map((p, i) => ({ id: p.id, name: p.name, score: this.players[i]?.score ?? 0 })).sort((a, b) => b.score - a.score)
    this.ctx.network.broadcast('breakout:end', { sorted }); this.showFinal(sorted)
  }

  destroy(): void {
    this.app.stage.off('pointermove', this.onPointerMove, this)
    this.ctx.network.off('breakout:state', this.onState as never)
    this.ctx.network.off('breakout:end', this.onEnd as never)
    this.app.stage.removeChildren()
  }

  private buildScene(): void {
    this.stage = new Graphics(); this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    this.app.stage.addChild(this.stage); this.scaleStage()
    const ps = this.ctx.players.getPlayers()
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i]!
      const paddleGfx = new Graphics(); this.stage.addChild(paddleGfx)
      const ballGfx = new Graphics(); ballGfx.circle(0, 0, BALL_R).fill(0xffffff); this.stage.addChild(ballGfx)
      const brickGfxArr: Graphics[] = p.bricks.map(b => {
        const bg = new Graphics(); bg.rect(b.x, b.y, BRICK_W, BRICK_H).fill(p.color); bg.rect(b.x, b.y, BRICK_W, BRICK_H).stroke({ width: 1, color: 0x000000 })
        this.stage.addChild(bg); return bg
      })
      const col = i % 2, row = Math.floor(i / 2)
      const areaW = LOGIC_W / 2 - 10, areaX = col * (LOGIC_W / 2) + 5
      const areaH = (LOGIC_H - 20) / Math.ceil(ps.length / 2), areaY = 10 + row * areaH
      const label = new Text({ text: ps[i]?.name ?? `P${i + 1}`, style: new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: `#${p.color.toString(16).padStart(6, '0')}` }) })
      label.anchor.set(0.5, 0); label.position.set(areaX + areaW / 2, areaY + 4); this.stage.addChild(label)
      const scoreLabel = new Text({ text: '0', style: new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: '#ffffff' }) })
      scoreLabel.anchor.set(0.5, 0); scoreLabel.position.set(areaX + areaW / 2, areaY + 16); this.stage.addChild(scoreLabel)
      this.playerGfx.push({ paddle: paddleGfx, ball: ballGfx, bricks: brickGfxArr, label, scoreLabel })
    }
    this.redraw()
  }

  private redraw(): void {
    const ps = this.ctx.players.getPlayers()
    this.players.forEach((p, i) => {
      const gfx = this.playerGfx[i]!
      const col = i % 2, areaH = (LOGIC_H - 20) / Math.ceil(ps.length / 2), row = Math.floor(i / 2)
      const areaY = 10 + row * areaH, paddleY = areaY + areaH - 20
      gfx.paddle.clear(); gfx.paddle.rect(p.paddle - PADDLE_W / 2, paddleY, PADDLE_W, PADDLE_H).fill(p.color)
      gfx.ball.position.set(p.ball.x, p.ball.y)
      gfx.bricks.forEach((bg, j) => { bg.alpha = p.bricks[j]?.alive ? 1 : 0 })
      gfx.scoreLabel.text = `${p.score} bricks`
    })
  }

  private showFinal(sorted: { id: string; name: string; score: number }[]): void {
    this.stage.removeChildren(); this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    const t = new Text({ text: 'BREAKOUT BLITZ', style: new TextStyle({ fontFamily: 'monospace', fontSize: 28, fontWeight: '900', fill: '#ffd60a' }) })
    t.anchor.set(0.5); t.position.set(LOGIC_W / 2, 80); this.stage.addChild(t)
    sorted.forEach((p, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
      const row = new Text({ text: `${medal}  ${p.name.padEnd(14)}  ${p.score} bricks`, style: new TextStyle({ fontFamily: 'monospace', fontSize: 22, fill: i === 0 ? '#ffd60a' : '#c0c0e0' }) })
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
