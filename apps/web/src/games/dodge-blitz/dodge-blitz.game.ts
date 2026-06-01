// ─────────────────────────────────────────────────────────────────────────────
// Dodge Blitz — avoid falling objects, last player alive wins
//
// Each player controls a character that can move left/right.
// Objects fall from the top and accelerate over time.
// Getting hit = losing a life (3 lives). Last survivor wins.
// Host-authority: host spawns & simulates objects, broadcasts state at 20Hz.
// ─────────────────────────────────────────────────────────────────────────────
import { Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'

export const DB_EVENTS = {
  INPUT:  'dodge-blitz:input',
  STATE:  'dodge-blitz:state',
  HIT:    'dodge-blitz:hit',
  WINNER: 'dodge-blitz:winner',
} as const

const LOGIC_W = 800
const LOGIC_H = 540
const PLAYER_W = 34
const PLAYER_H = 34
const PLAYER_Y = LOGIC_H - 50
const PLAYER_SPEED = 320
const OBJ_W = 28
const SPAWN_INTERVAL_MS = 700
const TICK_MS = 50
const LIVES = 3

const PLAYER_COLORS = [0x00f5ff, 0xff2d78, 0xffd60a, 0x30d158, 0xbf5af2, 0xff9f0a]
const OBJ_COLORS = [0xff6b6b, 0xffa500, 0xffffff, 0xc084fc]

interface FallingObj { id: number; x: number; y: number; speed: number; color: number }
interface PlayerState { id: string; name: string; x: number; lives: number; colorIdx: number; alive: boolean }

let _oid = 0

export class DodgeBlitzGame implements GameInstance {
  private ctx: GameContext
  private app: Application

  private stage!: Graphics
  private playerGfx: Map<string, Graphics> = new Map()
  private playerLabels: Map<string, Text> = new Map()
  private objGfx: Map<number, Graphics> = new Map()
  private hudText!: Text

  private players: Map<string, PlayerState> = new Map()
  private objects: FallingObj[] = []
  private elapsed = 0
  private spawnTimer = 0
  private tickTimer: ReturnType<typeof setInterval> | null = null
  private gameOver = false

  private inputLeft = false
  private inputRight = false

  private readonly onInput = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { playerId, left, right } = msg.payload as { playerId: string; left: boolean; right: boolean }
    const p = this.players.get(playerId)
    if (p) { (p as PlayerState & { _left?: boolean; _right?: boolean })._left = left; (p as PlayerState & { _left?: boolean; _right?: boolean })._right = right }
  }

  private readonly onState = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { players, objects } = msg.payload as { players: PlayerState[]; objects: FallingObj[] }
    for (const p of players) this.players.set(p.id, p)
    this.objects = objects
    this.renderWorld()
  }

  private readonly onHit = (msg: NetworkMessage) => {
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
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { this.inputLeft = true; e.preventDefault() }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { this.inputRight = true; e.preventDefault() }
  }
  private readonly onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.inputLeft = false
    if (e.code === 'ArrowRight' || e.code === 'KeyD') this.inputRight = false
  }

  constructor(context: GameContext) { this.ctx = context; this.app = context.pixiApp as Application }

  async init(): Promise<void> {
    this.buildScene()
    this.ctx.network.on(DB_EVENTS.INPUT,  this.onInput as never)
    this.ctx.network.on(DB_EVENTS.STATE,  this.onState as never)
    this.ctx.network.on(DB_EVENTS.HIT,    this.onHit as never)
    this.ctx.network.on(DB_EVENTS.WINNER, this.onWinner as never)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)

    if (this.ctx.network.isHost()) {
      const ps = this.ctx.players.getPlayers()
      const spacing = LOGIC_W / (ps.length + 1)
      ps.forEach((p, i) => {
        this.players.set(p.id, Object.assign({ id: p.id, name: p.name, x: spacing * (i + 1), lives: LIVES, colorIdx: i % PLAYER_COLORS.length, alive: true, _left: false, _right: false }))
      })
      this.tickTimer = setInterval(() => this.hostTick(), TICK_MS)
    }
  }

  update(_dt: number): void {
    if (this.gameOver) return
    const localId = this.ctx.players.getLocalPlayer().id
    if (this.ctx.network.isHost()) {
      const p = this.players.get(localId) as PlayerState & { _left?: boolean; _right?: boolean }
      if (p) { p._left = this.inputLeft; p._right = this.inputRight }
    } else {
      this.ctx.network.send(DB_EVENTS.INPUT, { playerId: localId, left: this.inputLeft, right: this.inputRight })
    }
  }

  destroy(): void {
    if (this.tickTimer) clearInterval(this.tickTimer)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.ctx.network.off(DB_EVENTS.INPUT,  this.onInput as never)
    this.ctx.network.off(DB_EVENTS.STATE,  this.onState as never)
    this.ctx.network.off(DB_EVENTS.HIT,    this.onHit as never)
    this.ctx.network.off(DB_EVENTS.WINNER, this.onWinner as never)
    this.app.stage.removeChildren()
  }

  private hostTick(): void {
    if (this.gameOver) return
    const dt = TICK_MS / 1000
    this.elapsed += TICK_MS
    this.spawnTimer += TICK_MS

    const speed = 120 + this.elapsed / 1000 * 18

    // Move players
    for (const p of this.players.values()) {
      if (!p.alive) continue
      const pp = p as PlayerState & { _left?: boolean; _right?: boolean }
      if (pp._left) p.x = Math.max(PLAYER_W / 2, p.x - PLAYER_SPEED * dt)
      if (pp._right) p.x = Math.min(LOGIC_W - PLAYER_W / 2, p.x + PLAYER_SPEED * dt)
    }

    // Spawn
    const interval = Math.max(220, SPAWN_INTERVAL_MS - this.elapsed / 1000 * 12)
    if (this.spawnTimer >= interval) {
      this.spawnTimer = 0
      const count = this.elapsed > 20000 ? 3 : this.elapsed > 10000 ? 2 : 1
      for (let i = 0; i < count; i++) {
        this.objects.push({ id: _oid++, x: OBJ_W / 2 + Math.random() * (LOGIC_W - OBJ_W), y: -OBJ_W, speed, color: OBJ_COLORS[Math.floor(Math.random() * OBJ_COLORS.length)]! })
      }
    }

    // Move objects + collision
    for (let i = this.objects.length - 1; i >= 0; i--) {
      const o = this.objects[i]!
      o.y += o.speed * dt
      if (o.y > LOGIC_H + 40) { this.objects.splice(i, 1); continue }

      for (const p of this.players.values()) {
        if (!p.alive) continue
        const dx = Math.abs(o.x - p.x); const dy = Math.abs(o.y - PLAYER_Y)
        if (dx < (OBJ_W + PLAYER_W) / 2 && dy < (OBJ_W + PLAYER_H) / 2) {
          p.lives--
          this.objects.splice(i, 1)
          this.ctx.network.broadcast(DB_EVENTS.HIT, { playerId: p.id, lives: p.lives })
          if (p.lives <= 0) p.alive = false
          break
        }
      }
    }

    const alive = [...this.players.values()].filter(p => p.alive)
    if (alive.length <= 1 && this.players.size > 1) {
      const winner = alive[0] ?? [...this.players.values()][0]!
      this.gameOver = true
      if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null }
      this.ctx.network.broadcast(DB_EVENTS.STATE, { players: [...this.players.values()], objects: this.objects })
      this.ctx.network.broadcast(DB_EVENTS.WINNER, { winnerId: winner.id, winnerName: winner.name })
      this.showWinner(winner.id, winner.name)
      return
    }

    this.ctx.network.broadcast(DB_EVENTS.STATE, { players: [...this.players.values()], objects: this.objects })
    this.renderWorld()
  }

  private buildScene(): void {
    this.stage = new Graphics()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x080818)
    this.app.stage.addChild(this.stage)
    this.scaleStage()

    // Floor
    const floor = new Graphics()
    floor.rect(0, PLAYER_Y + PLAYER_H / 2 + 4, LOGIC_W, 3).fill(0x2a2a50)
    this.stage.addChild(floor)

    this.hudText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#c0c0e0' }) })
    this.hudText.position.set(8, 8)
    this.stage.addChild(this.hudText)

    const controls = new Text({ text: 'A/D or ←/→ to dodge', style: new TextStyle({ fontFamily: 'monospace', fontSize: 12, fill: '#303050' }) })
    controls.anchor.set(1, 0); controls.position.set(LOGIC_W - 8, 8)
    this.stage.addChild(controls)
  }

  private renderWorld(): void {
    // Objects
    const seen = new Set<number>()
    for (const o of this.objects) {
      seen.add(o.id)
      if (!this.objGfx.has(o.id)) { const g = new Graphics(); this.stage.addChild(g); this.objGfx.set(o.id, g) }
      const g = this.objGfx.get(o.id)!
      g.clear()
      g.roundRect(o.x - OBJ_W / 2, o.y - OBJ_W / 2, OBJ_W, OBJ_W, 4).fill(o.color)
    }
    for (const [id, g] of this.objGfx) { if (!seen.has(id)) { g.clear(); this.objGfx.delete(id) } }

    // Players
    for (const p of this.players.values()) {
      if (!this.playerGfx.has(p.id)) {
        const g = new Graphics(); this.stage.addChild(g); this.playerGfx.set(p.id, g)
        const lbl = new Text({ text: p.name.slice(0, 8), style: new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: `#${(PLAYER_COLORS[p.colorIdx] ?? 0xffffff).toString(16).padStart(6, '0')}` }) })
        lbl.anchor.set(0.5, 1); this.stage.addChild(lbl); this.playerLabels.set(p.id, lbl)
      }
      const g = this.playerGfx.get(p.id)!; const lbl = this.playerLabels.get(p.id)!
      g.clear()
      if (!p.alive) { lbl.text = ''; continue }
      const color = PLAYER_COLORS[p.colorIdx] ?? 0xffffff
      g.roundRect(p.x - PLAYER_W / 2, PLAYER_Y - PLAYER_H / 2, PLAYER_W, PLAYER_H, 6).fill(color)
      lbl.position.set(p.x, PLAYER_Y - PLAYER_H / 2 - 4)
    }
    this.updateHud()
  }

  private updateHud(): void {
    const parts = [...this.players.values()].map(p => `${p.alive ? '♥'.repeat(p.lives) : '✕'} ${p.name}`)
    this.hudText.text = parts.join('   ')
  }

  private showWinner(winnerId: string, winnerName: string): void {
    this.gameOver = true
    this.stage.removeChildren()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x080818)
    const localId = this.ctx.players.getLocalPlayer().id
    const isWinner = winnerId === localId
    const t = new Text({ text: isWinner ? '🏆 YOU SURVIVED!' : `${winnerName} survived!`, style: new TextStyle({ fontFamily: 'monospace', fontSize: 36, fontWeight: '900', fill: isWinner ? '#ffd60a' : '#00f5ff' }) })
    t.anchor.set(0.5); t.position.set(LOGIC_W / 2, LOGIC_H / 2)
    this.stage.addChild(t)
    if (this.ctx.network.isHost()) {
      this.ctx.stats.record('play')
      if (isWinner) this.ctx.stats.record('win'); else this.ctx.stats.record('loss')
      this.ctx.events.emit('platform:game:ended', { gameId: this.ctx.gameId, winnerId, durationMs: this.elapsed, results: [] })
    }
  }

  private scaleStage(): void {
    const { width: cw, height: ch } = this.app.screen
    const scale = Math.min(cw / LOGIC_W, ch / LOGIC_H) * 0.97
    this.stage.scale.set(scale)
    this.stage.position.set((cw - LOGIC_W * scale) / 2, (ch - LOGIC_H * scale) / 2)
  }
}
