// ─────────────────────────────────────────────────────────────────────────────
// Coin Grab — collect coins spawning across the arena, most in 60s wins
//
// Each player has a character they move with WASD/arrows.
// Coins spawn at random positions. Walking over one collects it.
// Host-authority: spawns coins, checks collisions, broadcasts state at 20Hz.
// ─────────────────────────────────────────────────────────────────────────────
import { Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'
import { createGameUI } from '@/core/services/game-ui/game-ui'

export const CG_EVENTS = {
  INPUT:  'coin-grab:input',
  STATE:  'coin-grab:state',
  WINNER: 'coin-grab:winner',
} as const

const LOGIC_W = 800
const LOGIC_H = 540
const PLAYER_SIZE = 30
const PLAYER_SPEED = 240
const COIN_R = 10
const MAX_COINS = 12
const GAME_DURATION_S = 60
const TICK_MS = 50

const PLAYER_COLORS = [0x00f5ff, 0xff2d78, 0xffd60a, 0x30d158, 0xbf5af2, 0xff9f0a]

interface Coin { id: number; x: number; y: number }
interface PlayerState { id: string; name: string; x: number; y: number; score: number; colorIdx: number }

let _cid = 0

export class CoinGrabGame implements GameInstance {
  private ctx: GameContext
  private app: Application
  private ui = createGameUI()

  private stage!: Graphics
  private playerGfx: Map<string, Graphics> = new Map()
  private playerLabels: Map<string, Text> = new Map()
  private coinGfx: Map<number, Graphics> = new Map()
  private hudText!: Text
  private timerText!: Text

  private players: Map<string, PlayerState & { _left?: boolean; _right?: boolean; _up?: boolean; _down?: boolean }> = new Map()
  private coins: Coin[] = []
  private timeLeft = GAME_DURATION_S
  private tickTimer: ReturnType<typeof setInterval> | null = null
  private timerInterval: ReturnType<typeof setInterval> | null = null
  private gameOver = false

  private inputLeft = false; private inputRight = false; private inputUp = false; private inputDown = false

  private readonly onInput = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { playerId, left, right, up, down } = msg.payload as { playerId: string; left: boolean; right: boolean; up: boolean; down: boolean }
    const p = this.players.get(playerId)
    if (p) { p._left = left; p._right = right; p._up = up; p._down = down }
  }

  private readonly onState = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { players, coins, timeLeft } = msg.payload as { players: PlayerState[]; coins: Coin[]; timeLeft: number }
    for (const p of players) this.players.set(p.id, p)
    this.coins = coins
    this.timeLeft = timeLeft
    this.renderWorld()
  }

  private readonly onWinner = (msg: NetworkMessage) => {
    const { sorted } = msg.payload as { sorted: { id: string; name: string; score: number }[] }
    this.showResults(sorted)
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { this.inputLeft = true; e.preventDefault() }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { this.inputRight = true; e.preventDefault() }
    if (e.code === 'ArrowUp' || e.code === 'KeyW') { this.inputUp = true; e.preventDefault() }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { this.inputDown = true; e.preventDefault() }
  }
  private readonly onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.inputLeft = false
    if (e.code === 'ArrowRight' || e.code === 'KeyD') this.inputRight = false
    if (e.code === 'ArrowUp' || e.code === 'KeyW') this.inputUp = false
    if (e.code === 'ArrowDown' || e.code === 'KeyS') this.inputDown = false
  }

  constructor(context: GameContext) { this.ctx = context; this.app = context.pixiApp as Application }

  async init(): Promise<void> {
    this.buildScene()
    this.ctx.network.on(CG_EVENTS.INPUT,  this.onInput as never)
    this.ctx.network.on(CG_EVENTS.STATE,  this.onState as never)
    this.ctx.network.on(CG_EVENTS.WINNER, this.onWinner as never)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)

    await this.ui.showInstructions(this.ctx, {
      title: '🪙 Coin Grab',
      subtitle: 'Collect the most coins in 60 seconds',
      lines: [
        '🪙 Move your character to collect gold coins',
        '⏱ You have 60 seconds — grab as many as you can',
        '🏆 Most coins collected wins',
      ],
      controls: 'WASD or Arrow keys to move',
      accentColor: 0xffd60a,
    })
    await this.ui.countdown(this.ctx)
    this.ui.clear()

    if (this.ctx.network.isHost()) {
      const ps = this.ctx.players.getPlayers()
      const starts = [[100, 100], [LOGIC_W - 100, 100], [100, LOGIC_H - 100], [LOGIC_W - 100, LOGIC_H - 100], [LOGIC_W / 2, 80], [LOGIC_W / 2, LOGIC_H - 80]]
      ps.forEach((p, i) => {
        const [sx, sy] = starts[i % starts.length]!
        this.players.set(p.id, { id: p.id, name: p.name, x: sx ?? 100, y: sy ?? 100, score: 0, colorIdx: i % PLAYER_COLORS.length, _left: false, _right: false, _up: false, _down: false })
      })
      this.spawnCoins()
      this.tickTimer = setInterval(() => this.hostTick(), TICK_MS)
      this.timerInterval = setInterval(() => {
        this.timeLeft--
        if (this.timeLeft <= 0) this.endGame()
      }, 1000)
    }
  }

  update(_dt: number): void {
    if (this.gameOver) return
    const localId = this.ctx.players.getLocalPlayer().id
    if (this.ctx.network.isHost()) {
      const p = this.players.get(localId)
      if (p) { p._left = this.inputLeft; p._right = this.inputRight; p._up = this.inputUp; p._down = this.inputDown }
    } else {
      this.ctx.network.send(CG_EVENTS.INPUT, { playerId: localId, left: this.inputLeft, right: this.inputRight, up: this.inputUp, down: this.inputDown })
    }
  }

  destroy(): void {
    if (this.tickTimer) clearInterval(this.tickTimer)
    if (this.timerInterval) clearInterval(this.timerInterval)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.ctx.network.off(CG_EVENTS.INPUT,  this.onInput as never)
    this.ctx.network.off(CG_EVENTS.STATE,  this.onState as never)
    this.ctx.network.off(CG_EVENTS.WINNER, this.onWinner as never)
    this.ui.destroy()
    this.app.stage.removeChildren()
  }

  private spawnCoins(): void {
    while (this.coins.length < MAX_COINS) {
      this.coins.push({ id: _cid++, x: COIN_R * 2 + Math.random() * (LOGIC_W - COIN_R * 4), y: COIN_R * 2 + Math.random() * (LOGIC_H - COIN_R * 4) })
    }
  }

  private hostTick(): void {
    if (this.gameOver) return
    const dt = TICK_MS / 1000
    for (const p of this.players.values()) {
      if (p._left) p.x = Math.max(PLAYER_SIZE / 2, p.x - PLAYER_SPEED * dt)
      if (p._right) p.x = Math.min(LOGIC_W - PLAYER_SIZE / 2, p.x + PLAYER_SPEED * dt)
      if (p._up) p.y = Math.max(PLAYER_SIZE / 2, p.y - PLAYER_SPEED * dt)
      if (p._down) p.y = Math.min(LOGIC_H - PLAYER_SIZE / 2, p.y + PLAYER_SPEED * dt)

      for (let i = this.coins.length - 1; i >= 0; i--) {
        const c = this.coins[i]!
        const dx = p.x - c.x; const dy = p.y - c.y
        if (dx * dx + dy * dy < (PLAYER_SIZE / 2 + COIN_R) ** 2) {
          p.score++; this.coins.splice(i, 1)
        }
      }
    }
    this.spawnCoins()
    this.ctx.network.broadcast(CG_EVENTS.STATE, { players: [...this.players.values()], coins: this.coins, timeLeft: this.timeLeft })
    this.renderWorld()
  }

  private endGame(): void {
    if (this.gameOver) return
    this.gameOver = true
    if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null }
    if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null }
    const sorted = [...this.players.values()].sort((a, b) => b.score - a.score).map(p => ({ id: p.id, name: p.name, score: p.score }))
    this.ctx.network.broadcast(CG_EVENTS.WINNER, { sorted })
    this.showResults(sorted)
  }

  private buildScene(): void {
    this.stage = new Graphics()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a18)
    this.app.stage.addChild(this.stage)
    this.scaleStage()
    this.hudText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#c0c0e0' }) })
    this.hudText.position.set(8, 8); this.stage.addChild(this.hudText)
    this.timerText = new Text({ text: `${GAME_DURATION_S}s`, style: new TextStyle({ fontFamily: 'monospace', fontSize: 20, fontWeight: '700', fill: '#ffd60a' }) })
    this.timerText.anchor.set(0.5, 0); this.timerText.position.set(LOGIC_W / 2, 8); this.stage.addChild(this.timerText)
    const controls = new Text({ text: 'WASD / ←↑↓→ to move', style: new TextStyle({ fontFamily: 'monospace', fontSize: 12, fill: '#303050' }) })
    controls.anchor.set(1, 0); controls.position.set(LOGIC_W - 8, 8); this.stage.addChild(controls)
  }

  private renderWorld(): void {
    this.timerText.text = `${this.timeLeft}s`
    ;(this.timerText.style as TextStyle).fill = this.timeLeft <= 10 ? '#ff2d78' : '#ffd60a'

    const seenCoins = new Set<number>()
    for (const c of this.coins) {
      seenCoins.add(c.id)
      if (!this.coinGfx.has(c.id)) { const g = new Graphics(); this.stage.addChild(g); this.coinGfx.set(c.id, g) }
      const g = this.coinGfx.get(c.id)!
      g.clear(); g.circle(c.x, c.y, COIN_R).fill(0xffd60a); g.circle(c.x, c.y, COIN_R - 3).fill(0xffaa00)
    }
    for (const [id, g] of this.coinGfx) { if (!seenCoins.has(id)) { g.clear(); this.coinGfx.delete(id) } }

    for (const p of this.players.values()) {
      if (!this.playerGfx.has(p.id)) {
        const g = new Graphics(); this.stage.addChild(g); this.playerGfx.set(p.id, g)
        const lbl = new Text({ text: p.name.slice(0, 8), style: new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: `#${(PLAYER_COLORS[p.colorIdx] ?? 0xffffff).toString(16).padStart(6, '0')}` }) })
        lbl.anchor.set(0.5, 1); this.stage.addChild(lbl); this.playerLabels.set(p.id, lbl)
      }
      const g = this.playerGfx.get(p.id)!; const lbl = this.playerLabels.get(p.id)!
      const color = PLAYER_COLORS[p.colorIdx] ?? 0xffffff
      g.clear(); g.roundRect(p.x - PLAYER_SIZE / 2, p.y - PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE, 8).fill(color)
      lbl.position.set(p.x, p.y - PLAYER_SIZE / 2 - 3)
    }

    const scores = [...this.players.values()].sort((a, b) => b.score - a.score).map(p => `${p.name}: ${p.score}`).join('  |  ')
    this.hudText.text = `🪙 ${scores}`
  }

  private showResults(sorted: { id: string; name: string; score: number }[]): void {
    this.gameOver = true
    this.stage.removeChildren(); this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a18)
    const title = new Text({ text: 'TIME\'S UP!', style: new TextStyle({ fontFamily: 'monospace', fontSize: 36, fontWeight: '900', fill: '#ffd60a', letterSpacing: 4 }) })
    title.anchor.set(0.5); title.position.set(LOGIC_W / 2, 80); this.stage.addChild(title)
    sorted.forEach((p, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
      const t = new Text({ text: `${medal}  ${p.name.padEnd(14)}  ${p.score} coins`, style: new TextStyle({ fontFamily: 'monospace', fontSize: 22, fill: i === 0 ? '#ffd60a' : '#c0c0e0' }) })
      t.anchor.set(0.5); t.position.set(LOGIC_W / 2, 170 + i * 52); this.stage.addChild(t)
    })
    const localId = this.ctx.players.getLocalPlayer().id
    if (this.ctx.network.isHost()) {
      this.ctx.stats.record('play')
      if (sorted[0]?.id === localId) this.ctx.stats.record('win'); else this.ctx.stats.record('loss')
      this.ctx.events.emit('platform:game:ended', { gameId: this.ctx.gameId, winnerId: sorted[0]?.id, durationMs: GAME_DURATION_S * 1000, results: sorted.map((p, i) => ({ playerId: p.id, playerName: p.name, rank: i + 1, score: p.score })) })
    }
  }

  private scaleStage(): void {
    const { width: cw, height: ch } = this.app.screen
    const scale = Math.min(cw / LOGIC_W, ch / LOGIC_H) * 0.97
    this.stage.scale.set(scale)
    this.stage.position.set((cw - LOGIC_W * scale) / 2, (ch - LOGIC_H * scale) / 2)
  }
}
