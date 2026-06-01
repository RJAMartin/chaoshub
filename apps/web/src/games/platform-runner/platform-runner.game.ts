// Platform Runner — side-scrolling platformer, avoid obstacles, furthest distance wins
import { Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'

const LOGIC_W = 640, LOGIC_H = 400
const GROUND_Y = 320, PLAYER_W = 24, PLAYER_H = 28, GRAVITY = 0.6, JUMP_VY = -13
const OBSTACLE_W = 22, OBSTACLE_MIN_H = 30, OBSTACLE_MAX_H = 80, OBSTACLE_INTERVAL_START = 80
const PLAYER_COLORS = [0x00f5ff, 0xff2d78, 0xffd60a, 0x30d158, 0xbf5af2, 0xff9f0a]
const GAME_DURATION = 45000

interface Obstacle { x: number; h: number; passed: boolean }
interface Runner { vy: number; y: number; alive: boolean; score: number; jumpPressed: boolean }

export class PlatformRunnerGame implements GameInstance {
  private ctx: GameContext; private app: Application
  private stage!: Graphics; private worldGfx!: Graphics
  private runners: Runner[] = []; private obstacles: Obstacle[] = []
  private playerGfx: Graphics[] = []; private scoreLabels: Text[] = []
  private statusText!: Text; private timerText!: Text
  private scrollSpeed = 5; private tick = 0; private nextObstacle = OBSTACLE_INTERVAL_START
  private gameOver = false; private startTime = 0
  private gameTimer: ReturnType<typeof setTimeout> | null = null
  private localIndex = 0

  private readonly onJump = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { index } = msg.payload as { index: number }
    const r = this.runners[index]; if (r && r.alive && r.y >= GROUND_Y - PLAYER_H) r.vy = JUMP_VY
  }
  private readonly onState = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const s = msg.payload as { runners: { y: number; vy: number; alive: boolean; score: number }[]; obstacles: Obstacle[] }
    s.runners.forEach((sr, i) => { const r = this.runners[i]; if (r) { r.y = sr.y; r.vy = sr.vy; r.alive = sr.alive; r.score = sr.score } })
    this.obstacles = s.obstacles; this.redraw()
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
    this.localIndex = players.findIndex(p => p.id === localId)
    this.runners = players.map(() => ({ vy: 0, y: GROUND_Y - PLAYER_H, alive: true, score: 0, jumpPressed: false }))
    this.buildScene()
    this.ctx.network.on('runner:jump', this.onJump as never)
    this.ctx.network.on('runner:state', this.onState as never)
    this.ctx.network.on('runner:end', this.onEnd as never)
    this.app.stage.eventMode = 'static'
    this.app.stage.on('pointerdown', this.onPointerDown, this)
    document.addEventListener('keydown', this.onKeyDown)
    this.startTime = Date.now()
    this.gameTimer = setTimeout(() => { if (!this.gameOver && this.ctx.network.isHost()) this.triggerFinal() }, GAME_DURATION)
  }

  private readonly onPointerDown = () => { this.doJump() }
  private readonly onKeyDown = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); this.doJump() } }

  private doJump(): void {
    const r = this.runners[this.localIndex]
    if (r && r.alive && r.y >= GROUND_Y - PLAYER_H - 2) {
      if (this.ctx.network.isHost()) { r.vy = JUMP_VY }
      else { this.ctx.network.send('runner:jump', { index: this.localIndex }) }
    }
  }

  update(_dt: number): void {
    if (!this.ctx.network.isHost() || this.gameOver) return
    this.tick++
    this.scrollSpeed = 5 + Math.floor(this.tick / 300) * 0.5
    // Spawn obstacles
    if (this.tick >= this.nextObstacle) {
      const h = OBSTACLE_MIN_H + Math.random() * (OBSTACLE_MAX_H - OBSTACLE_MIN_H)
      this.obstacles.push({ x: LOGIC_W + 30, h, passed: false })
      this.nextObstacle = this.tick + OBSTACLE_INTERVAL_START + Math.floor(Math.random() * 40)
    }
    // Move obstacles
    for (const o of this.obstacles) o.x -= this.scrollSpeed
    this.obstacles = this.obstacles.filter(o => o.x > -60)
    // Update runners
    for (const r of this.runners) {
      if (!r.alive) continue
      r.vy += GRAVITY; r.y += r.vy
      if (r.y >= GROUND_Y - PLAYER_H) { r.y = GROUND_Y - PLAYER_H; r.vy = 0 }
      // Collision
      const rx = 80, ry = r.y
      for (const o of this.obstacles) {
        if (rx + PLAYER_W > o.x && rx < o.x + OBSTACLE_W && ry + PLAYER_H > GROUND_Y - o.h) { r.alive = false; break }
        if (!o.passed && o.x + OBSTACLE_W < rx) { o.passed = true; r.score++ }
      }
    }
    // Broadcast every 3 ticks
    if (this.tick % 3 === 0) {
      this.ctx.network.broadcast('runner:state', { runners: this.runners.map(r => ({ y: r.y, vy: r.vy, alive: r.alive, score: r.score })), obstacles: this.obstacles })
    }
    this.redraw()
    // Timer
    const elapsed = Date.now() - this.startTime
    const remaining = Math.max(0, Math.ceil((GAME_DURATION - elapsed) / 1000))
    this.timerText.text = `${remaining}s`
    if (this.runners.every(r => !r.alive) && !this.gameOver) { this.gameOver = true; setTimeout(() => this.triggerFinal(), 1000) }
  }

  private triggerFinal(): void {
    if (this.gameTimer) clearTimeout(this.gameTimer)
    this.gameOver = true
    const ps = this.ctx.players.getPlayers()
    const sorted = ps.map((p, i) => ({ id: p.id, name: p.name, score: this.runners[i]?.score ?? 0 })).sort((a, b) => b.score - a.score)
    this.ctx.network.broadcast('runner:end', { sorted }); this.showFinal(sorted)
  }

  destroy(): void {
    if (this.gameTimer) clearTimeout(this.gameTimer)
    this.app.stage.off('pointerdown', this.onPointerDown, this)
    document.removeEventListener('keydown', this.onKeyDown)
    this.ctx.network.off('runner:jump', this.onJump as never)
    this.ctx.network.off('runner:state', this.onState as never)
    this.ctx.network.off('runner:end', this.onEnd as never)
    this.app.stage.removeChildren()
  }

  private buildScene(): void {
    this.stage = new Graphics(); this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    this.app.stage.addChild(this.stage); this.scaleStage()
    const title = new Text({ text: 'PLATFORM RUNNER', style: new TextStyle({ fontFamily: 'monospace', fontSize: 18, fontWeight: '900', fill: '#30d158' }) })
    title.anchor.set(0.5, 0); title.position.set(LOGIC_W / 2, 6); this.stage.addChild(title)
    this.timerText = new Text({ text: `${GAME_DURATION / 1000}s`, style: new TextStyle({ fontFamily: 'monospace', fontSize: 18, fontWeight: '700', fill: '#ff6b6b' }) })
    this.timerText.anchor.set(1, 0); this.timerText.position.set(LOGIC_W - 8, 6); this.stage.addChild(this.timerText)
    this.statusText = new Text({ text: 'Tap / Space to jump!', style: new TextStyle({ fontFamily: 'monospace', fontSize: 12, fill: '#606080' }) })
    this.statusText.anchor.set(0, 0); this.statusText.position.set(8, 6); this.stage.addChild(this.statusText)
    this.worldGfx = new Graphics(); this.stage.addChild(this.worldGfx)
    // Ground
    const ground = new Graphics(); ground.rect(0, GROUND_Y, LOGIC_W, 4).fill(0x4a4a8a); this.stage.addChild(ground)
    const ps = this.ctx.players.getPlayers()
    ps.forEach((p, i) => {
      const color = PLAYER_COLORS[i] ?? 0xffffff
      const pg = new Graphics(); pg.rect(0, 0, PLAYER_W, PLAYER_H).fill(color); this.stage.addChild(pg); this.playerGfx.push(pg)
      const sl = new Text({ text: `${p.name}: 0`, style: new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: `#${color.toString(16).padStart(6, '0')}` }) })
      sl.position.set(8, 30 + i * 16); this.stage.addChild(sl); this.scoreLabels.push(sl)
    })
    this.redraw()
  }

  private redraw(): void {
    this.worldGfx.clear()
    for (const o of this.obstacles) {
      this.worldGfx.rect(o.x, GROUND_Y - o.h, OBSTACLE_W, o.h).fill(0xff2d78)
    }
    this.runners.forEach((r, i) => {
      const pg = this.playerGfx[i]!
      pg.position.set(80, r.y); pg.alpha = r.alive ? 1 : 0.3
      const sl = this.scoreLabels[i]!; const pname = this.ctx.players.getPlayers()[i]?.name ?? `P${i + 1}`
      sl.text = `${pname}: ${r.score}`
    })
  }

  private showFinal(sorted: { id: string; name: string; score: number }[]): void {
    if (this.gameTimer) clearTimeout(this.gameTimer)
    this.stage.removeChildren(); this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    const t = new Text({ text: 'PLATFORM RUNNER', style: new TextStyle({ fontFamily: 'monospace', fontSize: 26, fontWeight: '900', fill: '#30d158' }) })
    t.anchor.set(0.5); t.position.set(LOGIC_W / 2, 80); this.stage.addChild(t)
    sorted.forEach((p, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
      const row = new Text({ text: `${medal}  ${p.name.padEnd(14)}  ${p.score} obstacles`, style: new TextStyle({ fontFamily: 'monospace', fontSize: 20, fill: i === 0 ? '#ffd60a' : '#c0c0e0' }) })
      row.anchor.set(0.5); row.position.set(LOGIC_W / 2, 160 + i * 50); this.stage.addChild(row)
    })
    const localId = this.ctx.players.getLocalPlayer().id
    if (this.ctx.network.isHost()) {
      this.ctx.stats.record('play'); if (sorted[0]?.id === localId) this.ctx.stats.record('win'); else this.ctx.stats.record('loss')
      this.ctx.events.emit('platform:game:ended', { gameId: this.ctx.gameId, winnerId: sorted[0]?.id, durationMs: GAME_DURATION, results: sorted.map((p, i) => ({ playerId: p.id, playerName: p.name, rank: i + 1, score: p.score })) })
    }
  }

  private scaleStage(): void {
    const { width: cw, height: ch } = this.app.screen
    const scale = Math.min(cw / LOGIC_W, ch / LOGIC_H) * 0.97
    this.stage.scale.set(scale); this.stage.position.set((cw - LOGIC_W * scale) / 2, (ch - LOGIC_H * scale) / 2)
  }
}
