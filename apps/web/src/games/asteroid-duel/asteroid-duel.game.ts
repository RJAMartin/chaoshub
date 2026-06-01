// ─────────────────────────────────────────────────────────────────────────────
// Asteroid Duel — Game Implementation
//
// Each player controls a ship (arrow keys or WASD + Space to shoot).
// Asteroids spawn and drift across the screen. Shooting one scores a point.
// Players can also shoot each other — being hit deducts a life.
// First to 20 points OR last ship standing wins.
//
// Host-authority: host owns asteroid positions and bullet collisions.
// Clients send input state each frame; host broadcasts world state.
// ─────────────────────────────────────────────────────────────────────────────
import { Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'

// ── Constants ─────────────────────────────────────────────────────────────────

export const AD_EVENTS = {
  INPUT:  'asteroid-duel:input',
  STATE:  'asteroid-duel:state',
  WINNER: 'asteroid-duel:winner',
} as const

const LOGIC_W    = 900
const LOGIC_H    = 600
const SHIP_SPEED = 200
const BULLET_SPEED = 500
const TURN_SPEED = 3.5   // rad/s
const WIN_SCORE  = 20
const LIVES      = 3
const ASTEROID_COUNT = 8
const TICK_MS    = 50     // 20 Hz state broadcast

const SHIP_COLORS = [0x00f5ff, 0xff2d78, 0xffd60a, 0x30d158, 0xbf5af2, 0xff9f0a]

// ── Types ─────────────────────────────────────────────────────────────────────

interface Ship {
  id: string
  name: string
  x: number
  y: number
  angle: number  // radians
  vx: number
  vy: number
  score: number
  lives: number
  colorIdx: number
  dead: boolean
}

interface Bullet {
  id: string       // owner ship id
  x: number
  y: number
  vx: number
  vy: number
  life: number     // ms remaining
}

interface Asteroid {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  angle: number
}

interface InputState {
  left: boolean
  right: boolean
  thrust: boolean
  fire: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let _bulletIdCounter = 0
function bulletId() { return `b${_bulletIdCounter++}` }

function randomAsteroid(): Asteroid {
  const edge = Math.floor(Math.random() * 4)
  let x: number, y: number
  if (edge === 0) { x = Math.random() * LOGIC_W; y = -30 }
  else if (edge === 1) { x = LOGIC_W + 30; y = Math.random() * LOGIC_H }
  else if (edge === 2) { x = Math.random() * LOGIC_W; y = LOGIC_H + 30 }
  else { x = -30; y = Math.random() * LOGIC_H }
  const speed = 40 + Math.random() * 60
  const dir = Math.atan2(LOGIC_H / 2 - y, LOGIC_W / 2 - x) + (Math.random() - 0.5) * 1.2
  return { x, y, vx: Math.cos(dir) * speed, vy: Math.sin(dir) * speed, radius: 20 + Math.random() * 20, angle: 0 }
}

// ── Game class ────────────────────────────────────────────────────────────────

export class AsteroidDuelGame implements GameInstance {
  private ctx: GameContext
  private app: Application

  // World state (host-owned)
  private ships: Map<string, Ship> = new Map()
  private bullets: Map<string, Bullet> = new Map()
  private asteroids: Asteroid[] = []
  private lastTick = 0
  private tickInterval: ReturnType<typeof setInterval> | null = null
  private gameOver = false

  // Local input
  private inputState: InputState = { left: false, right: false, thrust: false, fire: false }
  private lastFire = 0
  private fireInterval = 300  // ms between shots

  // Pixi
  private stage!: Graphics
  private shipGraphics: Map<string, Graphics> = new Map()
  private shipLabels: Map<string, Text> = new Map()
  private bulletGraphics: Map<string, Graphics> = new Map()
  private asteroidGraphics: Graphics[] = []
  private scoreText!: Text
  private livesText!: Text

  // ── Network ───────────────────────────────────────────────────────────────

  private readonly onInput = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { playerId, input } = msg.payload as { playerId: string; input: InputState }
    const ship = this.ships.get(playerId)
    if (ship && !ship.dead) this.applyInput(ship, input)
  }

  private readonly onState = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const s = msg.payload as {
      ships: Ship[]; bullets: { id: string; x: number; y: number; vx: number; vy: number; life: number }[];
      asteroids: Asteroid[]
    }
    for (const ship of s.ships) this.ships.set(ship.id, ship)
    this.bullets.clear()
    for (const b of s.bullets) this.bullets.set(b.id, b)
    this.asteroids = s.asteroids
    this.renderWorld()
  }

  private readonly onWinner = (msg: NetworkMessage) => {
    const { winnerId, winnerName } = msg.payload as { winnerId: string; winnerName: string }
    this.showWinner(winnerId, winnerName)
  }

  // ── Key handling ──────────────────────────────────────────────────────────

  private readonly onKeyDown = (e: KeyboardEvent) => {
    switch (e.code) {
      case 'ArrowLeft':  case 'KeyA': this.inputState.left   = true; break
      case 'ArrowRight': case 'KeyD': this.inputState.right  = true; break
      case 'ArrowUp':    case 'KeyW': this.inputState.thrust = true; break
      case 'Space':                    this.inputState.fire   = true; break
    }
    e.preventDefault()
  }
  private readonly onKeyUp = (e: KeyboardEvent) => {
    switch (e.code) {
      case 'ArrowLeft':  case 'KeyA': this.inputState.left   = false; break
      case 'ArrowRight': case 'KeyD': this.inputState.right  = false; break
      case 'ArrowUp':    case 'KeyW': this.inputState.thrust = false; break
      case 'Space':                    this.inputState.fire   = false; break
    }
  }

  constructor(context: GameContext) {
    this.ctx = context
    this.app = context.pixiApp as Application
  }

  async init(): Promise<void> {
    this.buildScene()
    this.ctx.network.on(AD_EVENTS.INPUT,  this.onInput as never)
    this.ctx.network.on(AD_EVENTS.STATE,  this.onState as never)
    this.ctx.network.on(AD_EVENTS.WINNER, this.onWinner as never)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)

    if (this.ctx.network.isHost()) {
      this.initWorld()
      this.tickInterval = setInterval(() => this.broadcastState(), TICK_MS)
    }
  }

  update(dt: number): void {
    if (this.gameOver) return
    const now = Date.now()
    const localId = this.ctx.players.getLocalPlayer().id

    // Send input to host
    if (!this.ctx.network.isHost()) {
      this.ctx.network.send(AD_EVENTS.INPUT, { playerId: localId, input: this.inputState })
    }

    if (this.ctx.network.isHost()) {
      this.hostUpdate(dt, now, localId)
    }
  }

  destroy(): void {
    if (this.tickInterval) clearInterval(this.tickInterval)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.ctx.network.off(AD_EVENTS.INPUT,  this.onInput as never)
    this.ctx.network.off(AD_EVENTS.STATE,  this.onState as never)
    this.ctx.network.off(AD_EVENTS.WINNER, this.onWinner as never)
    this.app.stage.removeChildren()
  }

  // ── World init ────────────────────────────────────────────────────────────

  private initWorld(): void {
    const players = this.ctx.players.getPlayers()
    const startPositions = [
      { x: 150, y: LOGIC_H / 2 },
      { x: LOGIC_W - 150, y: LOGIC_H / 2 },
      { x: LOGIC_W / 2, y: 120 },
      { x: LOGIC_W / 2, y: LOGIC_H - 120 },
    ]
    players.forEach((p, i) => {
      const pos = startPositions[i % startPositions.length]!
      this.ships.set(p.id, {
        id: p.id, name: p.name,
        x: pos.x, y: pos.y,
        angle: 0, vx: 0, vy: 0,
        score: 0, lives: LIVES,
        colorIdx: i % SHIP_COLORS.length,
        dead: false,
      })
    })
    for (let i = 0; i < ASTEROID_COUNT; i++) this.asteroids.push(randomAsteroid())
  }

  // ── Host game update ──────────────────────────────────────────────────────

  private hostUpdate(dt: number, now: number, localId: string): void {
    const localShip = this.ships.get(localId)
    if (localShip && !localShip.dead) {
      this.applyInput(localShip, this.inputState)
      // Fire
      if (this.inputState.fire && now - this.lastFire > this.fireInterval) {
        this.spawnBullet(localShip)
        this.lastFire = now
      }
    }

    // Physics
    for (const ship of this.ships.values()) {
      if (ship.dead) continue
      ship.x = (ship.x + ship.vx * dt + LOGIC_W) % LOGIC_W
      ship.y = (ship.y + ship.vy * dt + LOGIC_H) % LOGIC_H
      ship.vx *= 0.995
      ship.vy *= 0.995
    }

    // Bullets
    for (const [id, b] of [...this.bullets.entries()]) {
      b.x = (b.x + b.vx * dt + LOGIC_W) % LOGIC_W
      b.y = (b.y + b.vy * dt + LOGIC_H) % LOGIC_H
      b.life -= dt * 1000
      if (b.life <= 0) { this.bullets.delete(id); continue }

      // Bullet vs asteroid
      let hit = false
      for (let i = this.asteroids.length - 1; i >= 0; i--) {
        const a = this.asteroids[i]!
        const dx = b.x - a.x; const dy = b.y - a.y
        if (dx * dx + dy * dy < a.radius * a.radius) {
          const owner = this.ships.get(b.id)
          if (owner) owner.score++
          this.asteroids.splice(i, 1)
          this.asteroids.push(randomAsteroid())
          this.bullets.delete(id)
          hit = true
          if (owner && owner.score >= WIN_SCORE) { this.triggerWin(owner); return }
          break
        }
      }
      if (hit) continue

      // Bullet vs ship
      for (const ship of this.ships.values()) {
        if (ship.id === b.id || ship.dead) continue
        const dx = b.x - ship.x; const dy = b.y - ship.y
        if (dx * dx + dy * dy < 400) {
          ship.lives--
          this.bullets.delete(id)
          if (ship.lives <= 0) {
            ship.dead = true
            const remaining = [...this.ships.values()].filter(s => !s.dead)
            if (remaining.length === 1) { this.triggerWin(remaining[0]!); return }
          }
          break
        }
      }
    }

    // Asteroids
    for (const a of this.asteroids) {
      a.x = (a.x + a.vx * dt + LOGIC_W) % LOGIC_W
      a.y = (a.y + a.vy * dt + LOGIC_H) % LOGIC_H
      a.angle += dt * 0.5
    }

    this.renderWorld()
  }

  private applyInput(ship: Ship, input: InputState): void {
    if (input.left)   ship.angle -= TURN_SPEED * (TICK_MS / 1000)
    if (input.right)  ship.angle += TURN_SPEED * (TICK_MS / 1000)
    if (input.thrust) {
      ship.vx += Math.cos(ship.angle) * SHIP_SPEED * (TICK_MS / 1000)
      ship.vy += Math.sin(ship.angle) * SHIP_SPEED * (TICK_MS / 1000)
    }
  }

  private spawnBullet(ship: Ship): void {
    const id = bulletId()
    this.bullets.set(id, {
      id: ship.id,
      x: ship.x + Math.cos(ship.angle) * 18,
      y: ship.y + Math.sin(ship.angle) * 18,
      vx: ship.vx + Math.cos(ship.angle) * BULLET_SPEED,
      vy: ship.vy + Math.sin(ship.angle) * BULLET_SPEED,
      life: 1800,
    })
  }

  private triggerWin(winner: Ship): void {
    if (this.gameOver) return
    this.gameOver = true
    if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = null }
    this.ctx.network.broadcast(AD_EVENTS.WINNER, { winnerId: winner.id, winnerName: winner.name })
    this.showWinner(winner.id, winner.name)
  }

  private broadcastState(): void {
    this.ctx.network.broadcast(AD_EVENTS.STATE, {
      ships: [...this.ships.values()],
      bullets: [...this.bullets.entries()].map(([bId, b]) => ({ bulletKey: bId, ...b })),
      asteroids: this.asteroids,
    })
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  private buildScene(): void {
    this.stage = new Graphics()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x050510)
    this.app.stage.addChild(this.stage)
    this.scaleStage()

    this.scoreText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 14, fill: '#c0c0e0' }),
    })
    this.scoreText.position.set(10, 8)
    this.stage.addChild(this.scoreText)

    this.livesText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 14, fill: '#ff2d78' }),
    })
    this.livesText.anchor.set(1, 0)
    this.livesText.position.set(LOGIC_W - 10, 8)
    this.stage.addChild(this.livesText)

    const controls = new Text({
      text: 'A/D or ←/→ turn  |  W or ↑ thrust  |  Space shoot',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: '#30304a' }),
    })
    controls.anchor.set(0.5, 1)
    controls.position.set(LOGIC_W / 2, LOGIC_H - 6)
    this.stage.addChild(controls)
  }

  private renderWorld(): void {
    // Remove old ship/bullet/asteroid graphics
    for (const g of this.shipGraphics.values()) g.clear()
    for (const g of this.bulletGraphics.values()) g.clear()
    for (const g of this.asteroidGraphics) g.clear()

    // Asteroids
    while (this.asteroidGraphics.length < this.asteroids.length) {
      const g = new Graphics()
      this.stage.addChildAt(g, 1)
      this.asteroidGraphics.push(g)
    }
    this.asteroids.forEach((a, i) => {
      const g = this.asteroidGraphics[i]!
      g.clear()
      g.position.set(a.x, a.y)
      g.rotation = a.angle
      g.poly(this.asteroidShape(a.radius)).stroke({ width: 1.5, color: 0x8080a0 })
    })

    // Ships
    for (const ship of this.ships.values()) {
      if (!this.shipGraphics.has(ship.id)) {
        const g = new Graphics()
        this.stage.addChild(g)
        this.shipGraphics.set(ship.id, g)
        const lbl = new Text({
          text: ship.name.slice(0, 8),
          style: new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: `#${(SHIP_COLORS[ship.colorIdx] ?? 0xffffff).toString(16).padStart(6, '0')}` }),
        })
        lbl.anchor.set(0.5, 1)
        this.stage.addChild(lbl)
        this.shipLabels.set(ship.id, lbl)
      }
      const g = this.shipGraphics.get(ship.id)!
      const lbl = this.shipLabels.get(ship.id)!
      g.clear()
      if (ship.dead) { lbl.text = ''; continue }
      const color = SHIP_COLORS[ship.colorIdx] ?? 0xffffff
      g.position.set(ship.x, ship.y)
      g.rotation = ship.angle
      g.poly([0, -14, -8, 10, 0, 5, 8, 10]).fill({ color, alpha: 0.85 })
      lbl.position.set(ship.x, ship.y - 18)
    }

    // Bullets
    for (const [id, b] of this.bullets) {
      if (!this.bulletGraphics.has(id)) {
        const g = new Graphics()
        this.stage.addChild(g)
        this.bulletGraphics.set(id, g)
      }
      const g = this.bulletGraphics.get(id)!
      const ownerShip = this.ships.get(b.id)
      const color = ownerShip ? (SHIP_COLORS[ownerShip.colorIdx] ?? 0xffffff) : 0xffffff
      g.clear()
      g.circle(b.x, b.y, 3).fill(color)
    }

    // HUD
    const localId = this.ctx.players.getLocalPlayer().id
    const localShip = this.ships.get(localId)
    if (localShip) {
      this.scoreText.text = `Score: ${localShip.score}/${WIN_SCORE}`
      this.livesText.text = '♥ '.repeat(localShip.lives)
    }
  }

  private asteroidShape(r: number): number[] {
    const pts: number[] = []
    const sides = 8
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2
      const rr = r * (0.75 + Math.random() * 0.25)
      pts.push(Math.cos(a) * rr, Math.sin(a) * rr)
    }
    return pts
  }

  private showWinner(winnerId: string, winnerName: string): void {
    this.gameOver = true
    this.stage.removeChildren()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x050510)

    const localId = this.ctx.players.getLocalPlayer().id
    const isWinner = winnerId === localId

    const t = new Text({
      text: isWinner ? '🏆 YOU WIN!' : `${winnerName} wins!`,
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 38, fontWeight: '900', fill: isWinner ? '#ffd60a' : '#00f5ff' }),
    })
    t.anchor.set(0.5)
    t.position.set(LOGIC_W / 2, LOGIC_H / 2)
    this.stage.addChild(t)

    if (this.ctx.network.isHost()) {
      this.ctx.stats.record('play')
      if (isWinner) this.ctx.stats.record('win')
      else this.ctx.stats.record('loss')
      this.ctx.events.emit('platform:game:ended', {
        gameId: this.ctx.gameId,
        winnerId,
        durationMs: 0,
        results: [...this.ships.values()].map((s, i) => ({ playerId: s.id, playerName: s.name, rank: i + 1, score: s.score })),
      })
    }
  }

  private scaleStage(): void {
    const { width: cw, height: ch } = this.app.screen
    const scale = Math.min(cw / LOGIC_W, ch / LOGIC_H) * 0.97
    this.stage.scale.set(scale)
    this.stage.position.set((cw - LOGIC_W * scale) / 2, (ch - LOGIC_H * scale) / 2)
  }
}
