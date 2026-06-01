// Button Mash — click/tap as fast as possible in 10 seconds. Most clicks wins.
import { Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'

export const BTN_EVENTS = { STATE: 'button-mash:state', FINAL: 'button-mash:final' } as const
const LOGIC_W = 600, LOGIC_H = 480, GAME_MS = 10000
const PLAYER_COLORS = [0x00f5ff, 0xff2d78, 0xffd60a, 0x30d158, 0xbf5af2, 0xff9f0a]

export class ButtonMashGame implements GameInstance {
  private ctx: GameContext; private app: Application
  private stage!: Graphics; private btnGfx!: Graphics; private countText!: Text
  private timerText!: Text; private scoreText!: Text; private statusText!: Text
  private localCount = 0; private scores = new Map<string, number>()
  private timeLeft = GAME_MS / 1000; private gameOver = false
  private startTime = 0; private tickTimer: ReturnType<typeof setInterval> | null = null
  private localColorIdx = 0

  private readonly onState = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { scores, timeLeft } = msg.payload as { scores: { id: string; score: number }[]; timeLeft: number }
    for (const s of scores) this.scores.set(s.id, s.score); this.timeLeft = timeLeft; this.updateHUD()
  }
  private readonly onFinal = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { sorted } = msg.payload as { sorted: { id: string; name: string; score: number }[] }
    this.showFinal(sorted)
  }

  constructor(context: GameContext) { this.ctx = context; this.app = context.pixiApp as Application }

  async init(): Promise<void> {
    const ps = this.ctx.players.getPlayers()
    ps.forEach((p, i) => { this.scores.set(p.id, 0); if (p.id === this.ctx.players.getLocalPlayer().id) this.localColorIdx = i % PLAYER_COLORS.length })
    this.buildScene()
    this.ctx.network.on(BTN_EVENTS.STATE, this.onState as never)
    this.ctx.network.on(BTN_EVENTS.FINAL, this.onFinal as never)
    this.startTime = Date.now()
    if (this.ctx.network.isHost()) {
      this.tickTimer = setInterval(() => {
        this.timeLeft = Math.max(0, Math.round((GAME_MS - (Date.now() - this.startTime)) / 1000))
        const scoresArr = [...this.scores.entries()].map(([id, score]) => ({ id, score }))
        this.ctx.network.broadcast(BTN_EVENTS.STATE, { scores: scoresArr, timeLeft: this.timeLeft })
        this.updateHUD()
        if (this.timeLeft <= 0) {
          this.gameOver = true; clearInterval(this.tickTimer!); this.tickTimer = null
          const sorted = this.ctx.players.getPlayers().map(p => ({ id: p.id, name: p.name, score: this.scores.get(p.id) ?? 0 })).sort((a, b) => b.score - a.score)
          this.ctx.network.broadcast(BTN_EVENTS.FINAL, { sorted }); this.showFinal(sorted)
        }
      }, 200)
    }
  }

  update(_dt: number): void {}

  destroy(): void {
    if (this.tickTimer) clearInterval(this.tickTimer)
    this.ctx.network.off(BTN_EVENTS.STATE, this.onState as never)
    this.ctx.network.off(BTN_EVENTS.FINAL, this.onFinal as never)
    this.app.stage.removeChildren()
  }

  private buildScene(): void {
    this.stage = new Graphics(); this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    this.app.stage.addChild(this.stage); this.scaleStage()
    const title = new Text({ text: 'BUTTON MASH', style: new TextStyle({ fontFamily: 'monospace', fontSize: 26, fontWeight: '900', fill: '#ff2d78', letterSpacing: 4 }) })
    title.anchor.set(0.5, 0); title.position.set(LOGIC_W / 2, 14); this.stage.addChild(title)
    this.timerText = new Text({ text: '10s', style: new TextStyle({ fontFamily: 'monospace', fontSize: 22, fontWeight: '700', fill: '#ffd60a' }) })
    this.timerText.anchor.set(0.5, 0); this.timerText.position.set(LOGIC_W / 2, 52); this.stage.addChild(this.timerText)
    this.countText = new Text({ text: '0', style: new TextStyle({ fontFamily: 'monospace', fontSize: 72, fontWeight: '900', fill: `#${(PLAYER_COLORS[this.localColorIdx] ?? 0xffffff).toString(16).padStart(6, '0')}` }) })
    this.countText.anchor.set(0.5); this.countText.position.set(LOGIC_W / 2, 190); this.stage.addChild(this.countText)
    this.btnGfx = new Graphics()
    this.btnGfx.circle(LOGIC_W / 2, 310, 80).fill({ color: PLAYER_COLORS[this.localColorIdx] ?? 0xff2d78, alpha: 0.85 })
    this.btnGfx.eventMode = 'static'; this.btnGfx.cursor = 'pointer'
    this.btnGfx.on('pointerdown', () => this.handleMash())
    this.stage.addChild(this.btnGfx)
    const tap = new Text({ text: 'TAP!', style: new TextStyle({ fontFamily: 'monospace', fontSize: 28, fontWeight: '900', fill: '#000000' }) })
    tap.anchor.set(0.5); tap.position.set(LOGIC_W / 2, 310); this.stage.addChild(tap)
    this.scoreText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#606080' }) })
    this.scoreText.anchor.set(0.5, 1); this.scoreText.position.set(LOGIC_W / 2, LOGIC_H - 8); this.stage.addChild(this.scoreText)
    this.statusText = new Text({ text: 'Mash as fast as you can!', style: new TextStyle({ fontFamily: 'monospace', fontSize: 14, fill: '#808098' }) })
    this.statusText.anchor.set(0.5, 0); this.statusText.position.set(LOGIC_W / 2, 400); this.stage.addChild(this.statusText)
  }

  private handleMash(): void {
    if (this.gameOver || this.timeLeft <= 0) return
    this.localCount++
    const localId = this.ctx.players.getLocalPlayer().id
    this.scores.set(localId, this.localCount)
    this.countText.text = String(this.localCount)
    this.btnGfx.scale.set(0.92); setTimeout(() => this.btnGfx.scale.set(1), 60)
    if (!this.ctx.network.isHost()) {
      // clients push score each tap — host will merge
      this.ctx.network.send(BTN_EVENTS.STATE, { scores: [{ id: localId, score: this.localCount }], timeLeft: this.timeLeft })
    }
  }

  private updateHUD(): void {
    this.timerText.text = `${this.timeLeft}s`
    ;(this.timerText.style as TextStyle).fill = this.timeLeft <= 3 ? '#ff2d78' : '#ffd60a'
    const localId = this.ctx.players.getLocalPlayer().id
    this.countText.text = String(this.scores.get(localId) ?? this.localCount)
    const ps = this.ctx.players.getPlayers()
    this.scoreText.text = ps.map(p => `${p.name}: ${this.scores.get(p.id) ?? 0}`).join('  |  ')
  }

  private showFinal(sorted: { id: string; name: string; score: number }[]): void {
    this.gameOver = true; this.stage.removeChildren(); this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    const t = new Text({ text: 'MASH COMPLETE', style: new TextStyle({ fontFamily: 'monospace', fontSize: 28, fontWeight: '900', fill: '#ff2d78' }) })
    t.anchor.set(0.5); t.position.set(LOGIC_W / 2, 80); this.stage.addChild(t)
    sorted.forEach((p, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
      const row = new Text({ text: `${medal}  ${p.name.padEnd(14)}  ${p.score} taps`, style: new TextStyle({ fontFamily: 'monospace', fontSize: 22, fill: i === 0 ? '#ffd60a' : '#c0c0e0' }) })
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
