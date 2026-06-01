// Whack-a-Mole — moles pop up, click them before they hide. Most hits wins.
import { Graphics, Text, TextStyle, Circle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'

export const WAM_EVENTS = { STATE: 'wam:state', HIT: 'wam:hit', FINAL: 'wam:final' } as const

const COLS = 4, ROWS = 3, TOTAL = COLS * ROWS
const LOGIC_W = 700, LOGIC_H = 520
const GAME_MS = 45000
const HOLE_R = 48
const MOLE_R = 36
const GAP_X = (LOGIC_W - COLS * (HOLE_R * 2 + 20)) / 2 + HOLE_R + 10
const GAP_Y = 110
const SPACING_X = (HOLE_R * 2 + 20)
const SPACING_Y = (HOLE_R * 2 + 24)
const PLAYER_COLORS = [0x00f5ff, 0xff2d78, 0xffd60a, 0x30d158, 0xbf5af2, 0xff9f0a]

interface MoleState { idx: number; visible: boolean; hitBy: string | null; hideAt: number }

export class WhackAMoleGame implements GameInstance {
  private ctx: GameContext; private app: Application
  private stage!: Graphics
  private holeGfx: Graphics[] = []; private moleGfx: Graphics[] = []
  private scoreText!: Text; private timerText!: Text; private statusText!: Text
  private scores = new Map<string, number>()
  private moles: MoleState[] = Array.from({ length: TOTAL }, (_, i) => ({ idx: i, visible: false, hitBy: null, hideAt: 0 }))
  private timeLeft = GAME_MS / 1000
  private tickTimer: ReturnType<typeof setInterval> | null = null
  private gameOver = false

  private readonly onState = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { moles, scores, timeLeft } = msg.payload as { moles: MoleState[]; scores: { id: string; score: number }[]; timeLeft: number }
    this.moles = moles; this.timeLeft = timeLeft
    for (const s of scores) this.scores.set(s.id, s.score)
    this.renderMoles(); this.updateHUD()
  }
  private readonly onHit = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { playerId, idx } = msg.payload as { playerId: string; idx: number }
    const m = this.moles[idx]
    if (m?.visible && !m.hitBy) { m.hitBy = playerId; m.visible = false; this.scores.set(playerId, (this.scores.get(playerId) ?? 0) + 1) }
  }
  private readonly onFinal = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { sorted } = msg.payload as { sorted: { id: string; name: string; score: number }[] }
    this.showFinal(sorted)
  }

  constructor(context: GameContext) { this.ctx = context; this.app = context.pixiApp as Application }

  async init(): Promise<void> {
    for (const p of this.ctx.players.getPlayers()) this.scores.set(p.id, 0)
    this.buildScene()
    this.ctx.network.on(WAM_EVENTS.STATE, this.onState as never)
    this.ctx.network.on(WAM_EVENTS.HIT,   this.onHit as never)
    this.ctx.network.on(WAM_EVENTS.FINAL, this.onFinal as never)
    if (this.ctx.network.isHost()) {
      this.tickTimer = setInterval(() => this.hostTick(), 100)
    }
  }

  update(_dt: number): void {}

  destroy(): void {
    if (this.tickTimer) clearInterval(this.tickTimer)
    this.ctx.network.off(WAM_EVENTS.STATE, this.onState as never)
    this.ctx.network.off(WAM_EVENTS.HIT,   this.onHit as never)
    this.ctx.network.off(WAM_EVENTS.FINAL, this.onFinal as never)
    this.app.stage.removeChildren()
  }

  private startTime = Date.now()

  private hostTick(): void {
    if (this.gameOver) return
    const now = Date.now()
    this.timeLeft = Math.max(0, Math.round((GAME_MS - (now - this.startTime)) / 1000))

    // Randomly pop moles
    for (const m of this.moles) {
      if (m.visible && now > m.hideAt) { m.visible = false; m.hitBy = null }
      if (!m.visible && !m.hitBy && Math.random() < 0.012) {
        m.visible = true; m.hitBy = null
        m.hideAt = now + 800 + Math.random() * 1200
      }
    }

    const scoresArr = [...this.scores.entries()].map(([id, score]) => ({ id, score }))
    this.ctx.network.broadcast(WAM_EVENTS.STATE, { moles: this.moles, scores: scoresArr, timeLeft: this.timeLeft })
    this.renderMoles(); this.updateHUD()

    if (this.timeLeft <= 0) {
      this.gameOver = true
      if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null }
      const ps = this.ctx.players.getPlayers()
      const sorted = ps.map(p => ({ id: p.id, name: p.name, score: this.scores.get(p.id) ?? 0 })).sort((a, b) => b.score - a.score)
      this.ctx.network.broadcast(WAM_EVENTS.FINAL, { sorted })
      this.showFinal(sorted)
    }
  }

  private buildScene(): void {
    this.stage = new Graphics(); this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x1a1a0a)
    this.app.stage.addChild(this.stage); this.scaleStage()
    const title = new Text({ text: 'WHACK-A-MOLE', style: new TextStyle({ fontFamily: 'monospace', fontSize: 24, fontWeight: '900', fill: '#ffd60a', letterSpacing: 4 }) })
    title.anchor.set(0.5, 0); title.position.set(LOGIC_W / 2, 10); this.stage.addChild(title)
    this.timerText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 18, fontWeight: '700', fill: '#ffd60a' }) })
    this.timerText.anchor.set(1, 0); this.timerText.position.set(LOGIC_W - 14, 12); this.stage.addChild(this.timerText)
    this.scoreText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#c0c0e0' }) })
    this.scoreText.anchor.set(0, 0); this.scoreText.position.set(14, 14); this.stage.addChild(this.scoreText)
    this.statusText = new Text({ text: 'Click the moles!', style: new TextStyle({ fontFamily: 'monospace', fontSize: 14, fill: '#808060' }) })
    this.statusText.anchor.set(0.5, 1); this.statusText.position.set(LOGIC_W / 2, LOGIC_H - 6); this.stage.addChild(this.statusText)

    for (let i = 0; i < TOTAL; i++) {
      const col = i % COLS; const row = Math.floor(i / COLS)
      const cx = GAP_X + col * SPACING_X; const cy = GAP_Y + row * SPACING_Y
      const hole = new Graphics()
      hole.ellipse(cx, cy + 10, HOLE_R, HOLE_R * 0.4).fill(0x0a0a00)
      hole.ellipse(cx, cy + 10, HOLE_R, HOLE_R * 0.4).stroke({ width: 2, color: 0x3a3a10 })
      this.stage.addChild(hole); this.holeGfx.push(hole)
      const mole = new Graphics()
      mole.eventMode = 'static'; mole.cursor = 'pointer'
      mole.on('pointerdown', () => this.handleHit(i))
      this.stage.addChild(mole); this.moleGfx.push(mole)
    }
  }

  private handleHit(idx: number): void {
    const m = this.moles[idx]; if (!m?.visible) return
    const localId = this.ctx.players.getLocalPlayer().id
    if (this.ctx.network.isHost()) {
      if (m.visible && !m.hitBy) { m.hitBy = localId; m.visible = false; this.scores.set(localId, (this.scores.get(localId) ?? 0) + 1) }
    } else {
      this.ctx.network.send(WAM_EVENTS.HIT, { playerId: localId, idx })
    }
  }

  private renderMoles(): void {
    for (let i = 0; i < TOTAL; i++) {
      const m = this.moles[i]!; const g = this.moleGfx[i]!
      const col = i % COLS; const row = Math.floor(i / COLS)
      const cx = GAP_X + col * SPACING_X; const cy = GAP_Y + row * SPACING_Y
      g.clear()
      if (m.visible) {
        g.ellipse(cx, cy, MOLE_R, MOLE_R * 0.9).fill(0x8b4513)
        g.circle(cx - 10, cy - 8, 6).fill(0xffffff); g.circle(cx - 10, cy - 8, 3).fill(0x000000)
        g.circle(cx + 10, cy - 8, 6).fill(0xffffff); g.circle(cx + 10, cy - 8, 3).fill(0x000000)
        g.ellipse(cx, cy + 6, 10, 6).fill(0xff9999)
        g.hitArea = new Circle(0, 0, MOLE_R) as never
      }
    }
  }

  private updateHUD(): void {
    this.timerText.text = `${this.timeLeft}s`
    ;(this.timerText.style as TextStyle).fill = this.timeLeft <= 10 ? '#ff2d78' : '#ffd60a'
    const ps = this.ctx.players.getPlayers()
    this.scoreText.text = ps.map(p => `${p.name}: ${this.scores.get(p.id) ?? 0}`).join('  |  ')
  }

  private showFinal(sorted: { id: string; name: string; score: number }[]): void {
    this.gameOver = true; this.stage.removeChildren(); this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x1a1a0a)
    const t = new Text({ text: 'WHACK-A-MOLE', style: new TextStyle({ fontFamily: 'monospace', fontSize: 30, fontWeight: '900', fill: '#ffd60a' }) })
    t.anchor.set(0.5); t.position.set(LOGIC_W / 2, 80); this.stage.addChild(t)
    sorted.forEach((p, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
      const row = new Text({ text: `${medal}  ${p.name.padEnd(14)}  ${p.score} hits`, style: new TextStyle({ fontFamily: 'monospace', fontSize: 22, fill: i === 0 ? '#ffd60a' : '#c0c0e0' }) })
      row.anchor.set(0.5); row.position.set(LOGIC_W / 2, 160 + i * 52); this.stage.addChild(row)
    })
    const localId = this.ctx.players.getLocalPlayer().id
    if (this.ctx.network.isHost()) {
      this.ctx.stats.record('play'); if (sorted[0]?.id === localId) this.ctx.stats.record('win'); else this.ctx.stats.record('loss')
      this.ctx.events.emit('platform:game:ended', { gameId: this.ctx.gameId, winnerId: sorted[0]?.id, durationMs: GAME_MS, results: sorted.map((p, i) => ({ playerId: p.id, playerName: p.name, rank: i + 1, score: p.score })) })
    }
  }

  private scaleStage(): void {
    const { width: cw, height: ch } = this.app.screen
    const scale = Math.min(cw / LOGIC_W, ch / LOGIC_H) * 0.97
    this.stage.scale.set(scale); this.stage.position.set((cw - LOGIC_W * scale) / 2, (ch - LOGIC_H * scale) / 2)
  }
}
