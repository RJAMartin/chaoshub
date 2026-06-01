// ─────────────────────────────────────────────────────────────────────────────
// Sumo Shove — physics-based arena brawl
//
// Players are circles on a circular platform. Use Matter.js forces to shove
// others off the edge. Falling off = losing a life (3 lives).
// Last survivor wins.
//
// Host-authority: host simulates Matter.js, broadcasts body positions at 20Hz.
// Clients send input; host applies forces.
// ─────────────────────────────────────────────────────────────────────────────
import { Graphics, Text, TextStyle, type Application } from 'pixi.js'
import Matter from 'matter-js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'

export const SS2_EVENTS = {
  INPUT:   'sumo-shove:input',
  STATE:   'sumo-shove:state',
  FELL:    'sumo-shove:fell',
  WINNER:  'sumo-shove:winner',
} as const

const LOGIC_W = 700
const LOGIC_H = 600
const ARENA_R = 220
const ARENA_CX = LOGIC_W / 2
const ARENA_CY = LOGIC_H / 2 + 20
const PLAYER_R = 22
const SHOVE_FORCE = 0.018
const LIVES = 3
const TICK_MS = 50

const PLAYER_COLORS = [0x00f5ff, 0xff2d78, 0xffd60a, 0x30d158, 0xbf5af2, 0xff9f0a]

interface PlayerState { id: string; name: string; x: number; y: number; vx: number; vy: number; lives: number; colorIdx: number; alive: boolean }

export class SumoShoveGame implements GameInstance {
  private ctx: GameContext
  private app: Application

  private stage!: Graphics
  private arenaGfx!: Graphics
  private playerGfx: Map<string, Graphics> = new Map()
  private playerLabels: Map<string, Text> = new Map()
  private hudText!: Text

  // Matter.js
  private engine!: Matter.Engine
  private bodies: Map<string, Matter.Body> = new Map()

  private players: Map<string, PlayerState> = new Map()
  private tickTimer: ReturnType<typeof setInterval> | null = null
  private gameOver = false

  // Local input
  private inputLeft = false; private inputRight = false; private inputUp = false; private inputDown = false

  private readonly onInput = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { playerId, left, right, up, down } = msg.payload as { playerId: string; left: boolean; right: boolean; up: boolean; down: boolean }
    const body = this.bodies.get(playerId)
    if (!body) return
    const f = SHOVE_FORCE
    if (left)  Matter.Body.applyForce(body, body.position, { x: -f, y: 0 })
    if (right) Matter.Body.applyForce(body, body.position, { x:  f, y: 0 })
    if (up)    Matter.Body.applyForce(body, body.position, { x: 0, y: -f })
    if (down)  Matter.Body.applyForce(body, body.position, { x: 0, y:  f })
  }

  private readonly onState = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { players } = msg.payload as { players: PlayerState[] }
    for (const p of players) this.players.set(p.id, p)
    this.renderWorld()
  }

  private readonly onFell = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { playerId, lives } = msg.payload as { playerId: string; lives: number }
    const p = this.players.get(playerId)
    if (p) { p.lives = lives; if (lives <= 0) p.alive = false }
    this.updateHud()
  }

  private readonly onWinner = (msg: NetworkMessage) => {
    const { winnerId, winnerName } = msg.payload as { winnerId: string; winnerName: string }
    this.showWinner(winnerId, winnerName)
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'ArrowLeft'  || e.code === 'KeyA') { this.inputLeft  = true; e.preventDefault() }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { this.inputRight = true; e.preventDefault() }
    if (e.code === 'ArrowUp'    || e.code === 'KeyW') { this.inputUp    = true; e.preventDefault() }
    if (e.code === 'ArrowDown'  || e.code === 'KeyS') { this.inputDown  = true; e.preventDefault() }
  }
  private readonly onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'ArrowLeft'  || e.code === 'KeyA') this.inputLeft  = false
    if (e.code === 'ArrowRight' || e.code === 'KeyD') this.inputRight = false
    if (e.code === 'ArrowUp'    || e.code === 'KeyW') this.inputUp    = false
    if (e.code === 'ArrowDown'  || e.code === 'KeyS') this.inputDown  = false
  }

  constructor(context: GameContext) { this.ctx = context; this.app = context.pixiApp as Application }

  async init(): Promise<void> {
    this.buildScene()
    this.ctx.network.on(SS2_EVENTS.INPUT,  this.onInput as never)
    this.ctx.network.on(SS2_EVENTS.STATE,  this.onState as never)
    this.ctx.network.on(SS2_EVENTS.FELL,   this.onFell as never)
    this.ctx.network.on(SS2_EVENTS.WINNER, this.onWinner as never)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)

    if (this.ctx.network.isHost()) {
      this.initPhysics()
      this.tickTimer = setInterval(() => this.hostTick(), TICK_MS)
    }
  }

  update(_dt: number): void {
    if (this.gameOver) return
    const localId = this.ctx.players.getLocalPlayer().id
    if (this.ctx.network.isHost()) {
      const body = this.bodies.get(localId)
      if (body) {
        const f = SHOVE_FORCE
        if (this.inputLeft)  Matter.Body.applyForce(body, body.position, { x: -f, y: 0 })
        if (this.inputRight) Matter.Body.applyForce(body, body.position, { x:  f, y: 0 })
        if (this.inputUp)    Matter.Body.applyForce(body, body.position, { x: 0, y: -f })
        if (this.inputDown)  Matter.Body.applyForce(body, body.position, { x: 0, y:  f })
      }
    } else {
      this.ctx.network.send(SS2_EVENTS.INPUT, { playerId: localId, left: this.inputLeft, right: this.inputRight, up: this.inputUp, down: this.inputDown })
    }
  }

  destroy(): void {
    if (this.tickTimer) clearInterval(this.tickTimer)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.ctx.network.off(SS2_EVENTS.INPUT,  this.onInput as never)
    this.ctx.network.off(SS2_EVENTS.STATE,  this.onState as never)
    this.ctx.network.off(SS2_EVENTS.FELL,   this.onFell as never)
    this.ctx.network.off(SS2_EVENTS.WINNER, this.onWinner as never)
    if (this.engine) Matter.Engine.clear(this.engine)
    this.app.stage.removeChildren()
  }

  // ── Physics init ──────────────────────────────────────────────────────────

  private initPhysics(): void {
    this.engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } })
    const players = this.ctx.players.getPlayers()
    const angleStep = (Math.PI * 2) / players.length
    players.forEach((p, i) => {
      const angle = i * angleStep - Math.PI / 2
      const startR = ARENA_R * 0.55
      const x = ARENA_CX + Math.cos(angle) * startR
      const y = ARENA_CY + Math.sin(angle) * startR
      const body = Matter.Bodies.circle(x, y, PLAYER_R, {
        restitution: 0.4, friction: 0.05, frictionAir: 0.04, mass: 2,
        label: p.id,
      })
      Matter.Composite.add(this.engine.world, body)
      this.bodies.set(p.id, body)
      this.players.set(p.id, { id: p.id, name: p.name, x, y, vx: 0, vy: 0, lives: LIVES, colorIdx: i % PLAYER_COLORS.length, alive: true })
    })
  }

  private hostTick(): void {
    if (this.gameOver) return
    Matter.Engine.update(this.engine, TICK_MS)

    // Sync positions + check falls
    for (const [id, body] of this.bodies) {
      const p = this.players.get(id)
      if (!p || !p.alive) continue
      p.x = body.position.x; p.y = body.position.y
      p.vx = body.velocity.x; p.vy = body.velocity.y

      // Check if outside arena
      const dx = p.x - ARENA_CX; const dy = p.y - ARENA_CY
      if (dx * dx + dy * dy > (ARENA_R + PLAYER_R) ** 2) {
        p.lives--
        this.ctx.network.broadcast(SS2_EVENTS.FELL, { playerId: id, lives: p.lives })
        if (p.lives <= 0) {
          p.alive = false
          Matter.Composite.remove(this.engine.world, body)
          this.bodies.delete(id)
        } else {
          // Respawn at centre
          const angle = Math.random() * Math.PI * 2
          Matter.Body.setPosition(body, { x: ARENA_CX + Math.cos(angle) * 60, y: ARENA_CY + Math.sin(angle) * 60 })
          Matter.Body.setVelocity(body, { x: 0, y: 0 })
        }
      }
    }

    const alive = [...this.players.values()].filter(p => p.alive)
    if (alive.length <= 1 && this.players.size > 1) {
      const winner = alive[0] ?? [...this.players.values()][0]!
      this.gameOver = true
      if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null }
      this.ctx.network.broadcast(SS2_EVENTS.STATE, { players: [...this.players.values()] })
      this.ctx.network.broadcast(SS2_EVENTS.WINNER, { winnerId: winner.id, winnerName: winner.name })
      this.showWinner(winner.id, winner.name)
      return
    }

    this.ctx.network.broadcast(SS2_EVENTS.STATE, { players: [...this.players.values()] })
    this.renderWorld()
  }

  // ── Scene ─────────────────────────────────────────────────────────────────

  private buildScene(): void {
    this.stage = new Graphics()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x080810)
    this.app.stage.addChild(this.stage)
    this.scaleStage()

    // Arena platform
    this.arenaGfx = new Graphics()
    this.arenaGfx.circle(ARENA_CX, ARENA_CY, ARENA_R).fill({ color: 0x1a1a3a })
    this.arenaGfx.circle(ARENA_CX, ARENA_CY, ARENA_R).stroke({ width: 4, color: 0x4a4a8a })
    // Danger ring
    this.arenaGfx.circle(ARENA_CX, ARENA_CY, ARENA_R - 12).stroke({ width: 2, color: 0xff2d7844 })
    this.stage.addChild(this.arenaGfx)

    const title = new Text({ text: 'SUMO SHOVE', style: new TextStyle({ fontFamily: 'monospace', fontSize: 24, fontWeight: '900', fill: '#00f5ff', letterSpacing: 5 }) })
    title.anchor.set(0.5, 0); title.position.set(LOGIC_W / 2, 12); this.stage.addChild(title)

    this.hudText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#c0c0e0' }) })
    this.hudText.anchor.set(0.5, 1); this.hudText.position.set(LOGIC_W / 2, LOGIC_H - 8); this.stage.addChild(this.hudText)

    const controls = new Text({ text: 'WASD / ←↑↓→ to shove', style: new TextStyle({ fontFamily: 'monospace', fontSize: 12, fill: '#30304a' }) })
    controls.anchor.set(0.5, 0); controls.position.set(LOGIC_W / 2, 44); this.stage.addChild(controls)
  }

  private renderWorld(): void {
    for (const p of this.players.values()) {
      if (!this.playerGfx.has(p.id)) {
        const g = new Graphics(); this.stage.addChild(g); this.playerGfx.set(p.id, g)
        const lbl = new Text({ text: p.name.slice(0, 6), style: new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: `#${(PLAYER_COLORS[p.colorIdx] ?? 0xffffff).toString(16).padStart(6, '0')}` }) })
        lbl.anchor.set(0.5, 1); this.stage.addChild(lbl); this.playerLabels.set(p.id, lbl)
      }
      const g = this.playerGfx.get(p.id)!; const lbl = this.playerLabels.get(p.id)!
      g.clear()
      if (!p.alive) { lbl.text = ''; continue }
      const color = PLAYER_COLORS[p.colorIdx] ?? 0xffffff
      g.circle(p.x, p.y, PLAYER_R).fill(color)
      g.circle(p.x, p.y, PLAYER_R).stroke({ width: 2, color: 0x000000, alpha: 0.3 })
      lbl.position.set(p.x, p.y - PLAYER_R - 3)
    }
    this.updateHud()
  }

  private updateHud(): void {
    const parts = [...this.players.values()].map(p => `${p.alive ? '♥'.repeat(p.lives) : '✕'} ${p.name}`)
    this.hudText.text = parts.join('   ')
  }

  private showWinner(winnerId: string, winnerName: string): void {
    this.gameOver = true
    this.stage.removeChildren(); this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x080810)
    const localId = this.ctx.players.getLocalPlayer().id
    const isWinner = winnerId === localId
    const t = new Text({ text: isWinner ? '🏆 YOU WIN!' : `${winnerName} wins!`, style: new TextStyle({ fontFamily: 'monospace', fontSize: 38, fontWeight: '900', fill: isWinner ? '#ffd60a' : '#00f5ff' }) })
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
