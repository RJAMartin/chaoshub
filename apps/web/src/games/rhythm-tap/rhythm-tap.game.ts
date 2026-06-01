// Rhythm Tap — tap on the beat, most accurate taps over 30s wins
import { Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'

const LOGIC_W = 600, LOGIC_H = 440
const BPM = 120, BEAT_MS = 60000 / BPM, WINDOW_MS = 150, GAME_DURATION = 30000
const PLAYER_COLORS = [0x00f5ff, 0xff2d78, 0xffd60a, 0x30d158, 0xbf5af2, 0xff9f0a]

interface PlayerRhythm { score: number; combo: number; lastTapDelta: number; rippleAlpha: number; rippleR: number }

export class RhythmTapGame implements GameInstance {
  private ctx: GameContext; private app: Application
  private stage!: Graphics
  private beatGfx!: Graphics; private players: PlayerRhythm[] = []
  private playerGfx: { circle: Graphics; label: Text; scoreLabel: Text; combo: Text }[] = []
  private statusText!: Text; private timerText!: Text; private beatPulse = 0
  private gameOver = false; private startTime = 0; private lastBeatTime = 0
  private gameTimer: ReturnType<typeof setTimeout> | null = null
  private beatInterval: ReturnType<typeof setInterval> | null = null
  private localIndex = 0; private audioCtx: AudioContext | null = null

  private readonly onTap = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { index, delta } = msg.payload as { index: number; delta: number }
    this.applyTap(index, delta)
  }
  private readonly onScore = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const s = msg.payload as { index: number; score: number; combo: number; delta: number }
    const p = this.players[s.index]; if (p) { p.score = s.score; p.combo = s.combo; p.lastTapDelta = s.delta; p.rippleAlpha = 1; p.rippleR = 20 }
    this.updateLabels()
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
    this.players = ps.map(() => ({ score: 0, combo: 0, lastTapDelta: 0, rippleAlpha: 0, rippleR: 20 }))
    this.buildScene()
    this.ctx.network.on('rhythm:tap', this.onTap as never)
    this.ctx.network.on('rhythm:score', this.onScore as never)
    this.ctx.network.on('rhythm:end', this.onEnd as never)
    this.app.stage.eventMode = 'static'
    this.app.stage.on('pointerdown', this.onPointerDown, this)
    document.addEventListener('keydown', this.onKeyDown)
    this.startTime = Date.now()
    this.lastBeatTime = this.startTime
    // Beat metronome
    this.beatInterval = setInterval(() => {
      this.lastBeatTime = Date.now(); this.beatPulse = 1
      this.playBeep()
    }, BEAT_MS)
    this.gameTimer = setTimeout(() => { if (!this.gameOver && this.ctx.network.isHost()) this.triggerFinal() }, GAME_DURATION)
  }

  private playBeep(): void {
    try {
      if (!this.audioCtx) this.audioCtx = new AudioContext()
      const osc = this.audioCtx.createOscillator(), gain = this.audioCtx.createGain()
      osc.connect(gain); gain.connect(this.audioCtx.destination)
      osc.frequency.value = 880; gain.gain.setValueAtTime(0.15, this.audioCtx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.08)
      osc.start(); osc.stop(this.audioCtx.currentTime + 0.08)
    } catch { /* ignore */ }
  }

  private readonly onPointerDown = () => { this.doTap() }
  private readonly onKeyDown = (e: KeyboardEvent) => { if (e.code === 'Space') { e.preventDefault(); this.doTap() } }

  private doTap(): void {
    if (this.gameOver) return
    const now = Date.now()
    const elapsed = now - this.lastBeatTime
    const delta = elapsed <= BEAT_MS / 2 ? elapsed : elapsed - BEAT_MS
    if (this.ctx.network.isHost()) this.applyTap(this.localIndex, delta)
    else this.ctx.network.send('rhythm:tap', { index: this.localIndex, delta })
  }

  private applyTap(index: number, delta: number): void {
    const p = this.players[index]; if (!p) return
    const absDelta = Math.abs(delta)
    if (absDelta <= WINDOW_MS) {
      p.combo++
      const accuracy = 1 - absDelta / WINDOW_MS
      p.score += Math.round(10 * accuracy * (1 + p.combo * 0.1))
    } else { p.combo = 0 }
    p.lastTapDelta = delta; p.rippleAlpha = 1; p.rippleR = 20
    const scoresPayload = { index, score: p.score, combo: p.combo, delta }
    this.ctx.network.broadcast('rhythm:score', scoresPayload)
    this.updateLabels()
  }

  update(dt: number): void {
    // Animate beat pulse
    if (this.beatPulse > 0) { this.beatPulse -= dt * 3; if (this.beatPulse < 0) this.beatPulse = 0 }
    // Animate ripples
    for (const p of this.players) { if (p.rippleAlpha > 0) { p.rippleAlpha -= dt * 4; p.rippleR += dt * 60; if (p.rippleAlpha < 0) p.rippleAlpha = 0 } }
    this.redrawBeat()
    if (!this.gameOver) {
      const elapsed = Date.now() - this.startTime
      const remaining = Math.max(0, Math.ceil((GAME_DURATION - elapsed) / 1000))
      this.timerText.text = `${remaining}s`
    }
  }

  private triggerFinal(): void {
    if (this.beatInterval) clearInterval(this.beatInterval)
    if (this.gameTimer) clearTimeout(this.gameTimer)
    this.gameOver = true
    const ps = this.ctx.players.getPlayers()
    const sorted = ps.map((p, i) => ({ id: p.id, name: p.name, score: this.players[i]?.score ?? 0 })).sort((a, b) => b.score - a.score)
    this.ctx.network.broadcast('rhythm:end', { sorted }); this.showFinal(sorted)
  }

  destroy(): void {
    if (this.beatInterval) clearInterval(this.beatInterval)
    if (this.gameTimer) clearTimeout(this.gameTimer)
    this.app.stage.off('pointerdown', this.onPointerDown, this)
    document.removeEventListener('keydown', this.onKeyDown)
    this.ctx.network.off('rhythm:tap', this.onTap as never)
    this.ctx.network.off('rhythm:score', this.onScore as never)
    this.ctx.network.off('rhythm:end', this.onEnd as never)
    this.app.stage.removeChildren()
  }

  private buildScene(): void {
    this.stage = new Graphics(); this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    this.app.stage.addChild(this.stage); this.scaleStage()
    const title = new Text({ text: 'RHYTHM TAP', style: new TextStyle({ fontFamily: 'monospace', fontSize: 24, fontWeight: '900', fill: '#bf5af2' }) })
    title.anchor.set(0.5, 0); title.position.set(LOGIC_W / 2, 8); this.stage.addChild(title)
    this.timerText = new Text({ text: `${GAME_DURATION / 1000}s`, style: new TextStyle({ fontFamily: 'monospace', fontSize: 18, fontWeight: '700', fill: '#ff6b6b' }) })
    this.timerText.anchor.set(1, 0); this.timerText.position.set(LOGIC_W - 8, 8); this.stage.addChild(this.timerText)
    this.statusText = new Text({ text: 'Tap on the beat! (Space or tap)', style: new TextStyle({ fontFamily: 'monospace', fontSize: 12, fill: '#606080' }) })
    this.statusText.anchor.set(0.5, 0); this.statusText.position.set(LOGIC_W / 2, 36); this.stage.addChild(this.statusText)
    // Central beat circle
    this.beatGfx = new Graphics(); this.stage.addChild(this.beatGfx)
    // Player slots arranged in a circle around center
    const ps = this.ctx.players.getPlayers()
    const cx = LOGIC_W / 2, cy = LOGIC_H / 2 + 10, radius = 120
    ps.forEach((p, i) => {
      const angle = (i / ps.length) * Math.PI * 2 - Math.PI / 2
      const px = cx + Math.cos(angle) * radius, py = cy + Math.sin(angle) * radius
      const color = PLAYER_COLORS[i] ?? 0xffffff
      const circleGfx = new Graphics(); circleGfx.circle(px, py, 28).fill(color); circleGfx.alpha = 0.7; this.stage.addChild(circleGfx)
      const lbl = new Text({ text: p.name, style: new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: '#ffffff' }) })
      lbl.anchor.set(0.5); lbl.position.set(px, py - 40); this.stage.addChild(lbl)
      const scoreLabel = new Text({ text: '0', style: new TextStyle({ fontFamily: 'monospace', fontSize: 14, fontWeight: '700', fill: `#${color.toString(16).padStart(6, '0')}` }) })
      scoreLabel.anchor.set(0.5); scoreLabel.position.set(px, py + 40); this.stage.addChild(scoreLabel)
      const comboLabel = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: '#ffd60a' }) })
      comboLabel.anchor.set(0.5); comboLabel.position.set(px, py); this.stage.addChild(comboLabel)
      this.playerGfx.push({ circle: circleGfx, label: lbl, scoreLabel, combo: comboLabel })
    })
    this.redrawBeat()
  }

  private redrawBeat(): void {
    this.beatGfx.clear()
    const cx = LOGIC_W / 2, cy = LOGIC_H / 2 + 10
    const r = 40 + this.beatPulse * 15
    this.beatGfx.circle(cx, cy, r).fill(0x2a0a4a)
    this.beatGfx.circle(cx, cy, r).stroke({ width: 3 + this.beatPulse * 4, color: 0xbf5af2 })
    // Ripples
    this.players.forEach((p, i) => {
      if (p.rippleAlpha <= 0) return
      const color = PLAYER_COLORS[i] ?? 0xffffff
      const ps2 = this.ctx.players.getPlayers()
      const angle = (i / ps2.length) * Math.PI * 2 - Math.PI / 2
      const px = cx + Math.cos(angle) * 120, py = cy + Math.sin(angle) * 120
      this.beatGfx.circle(px, py, p.rippleR).stroke({ width: 2, color, alpha: p.rippleAlpha })
    })
  }

  private updateLabels(): void {
    this.players.forEach((p, i) => {
      const gfx = this.playerGfx[i]!
      gfx.scoreLabel.text = `${p.score}`
      gfx.combo.text = p.combo > 1 ? `x${p.combo}` : ''
    })
  }

  private showFinal(sorted: { id: string; name: string; score: number }[]): void {
    if (this.beatInterval) clearInterval(this.beatInterval)
    if (this.gameTimer) clearTimeout(this.gameTimer)
    this.stage.removeChildren(); this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    const t = new Text({ text: 'RHYTHM TAP', style: new TextStyle({ fontFamily: 'monospace', fontSize: 28, fontWeight: '900', fill: '#bf5af2' }) })
    t.anchor.set(0.5); t.position.set(LOGIC_W / 2, 80); this.stage.addChild(t)
    sorted.forEach((p, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
      const row = new Text({ text: `${medal}  ${p.name.padEnd(14)}  ${p.score} pts`, style: new TextStyle({ fontFamily: 'monospace', fontSize: 22, fill: i === 0 ? '#ffd60a' : '#c0c0e0' }) })
      row.anchor.set(0.5); row.position.set(LOGIC_W / 2, 160 + i * 52); this.stage.addChild(row)
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
