// Hot or Cold — Host picks 1-1000, players guess, get hotter/colder feedback
import { Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'

export const HC_EVENTS = {
  NEW_ROUND: 'hot-or-cold:new-round',
  GUESS: 'hot-or-cold:guess',
  RESULT: 'hot-or-cold:result',
  FINAL: 'hot-or-cold:final',
} as const

const LOGIC_W = 600, LOGIC_H = 500, TOTAL_ROUNDS = 8

export class HotOrColdGame implements GameInstance {
  private ctx: GameContext; private app: Application
  private stage!: Graphics
  private gaugeGfx!: Graphics
  private statusText!: Text
  private roundText!: Text
  private scoreText!: Text
  private historyText!: Text
  private inputEl: HTMLInputElement | null = null

  private secretNumber = 0
  private lastGuess = 500
  private round = 0
  private scores = new Map<string, number>()
  private roundWon = false
  private roundTimer: ReturnType<typeof setTimeout> | null = null
  private guessHistory: string[] = []

  private readonly onNewRound = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { round } = msg.payload as { round: number }
    this.round = round; this.roundWon = false; this.lastGuess = 500; this.guessHistory = []
    this.showRound()
  }

  private readonly onResult = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { hint, guesserName, guess, correct, number } = msg.payload as {
      hint: string; guesserName: string; guess: number; correct: boolean; number: number | null
    }
    this.lastGuess = guess
    const entry = `${guesserName}: ${guess} → ${hint}`
    this.guessHistory.unshift(entry)
    if (this.guessHistory.length > 6) this.guessHistory.pop()
    this.updateGauge()
    this.historyText.text = this.guessHistory.join('\n')
    if (correct) {
      const localId = this.ctx.players.getLocalPlayer().id
      this.statusText.text = guesserName === this.ctx.players.getLocalPlayer().name ? `🎉 You got it! (${number})` : `${guesserName} got it! (${number})`
      ;(this.statusText.style as TextStyle).fill = '#30d158'
    } else {
      this.statusText.text = hint.includes('CORRECT') ? `✓ ${entry}` : entry
    }
  }

  private readonly onFinalMsg = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { sorted } = msg.payload as { sorted: { id: string; name: string; score: number }[] }
    this.showFinal(sorted)
  }

  constructor(context: GameContext) { this.ctx = context; this.app = context.pixiApp as Application }

  async init(): Promise<void> {
    for (const p of this.ctx.players.getPlayers()) this.scores.set(p.id, 0)
    this.buildScene()
    this.ctx.network.on(HC_EVENTS.NEW_ROUND, this.onNewRound as never)
    this.ctx.network.on(HC_EVENTS.RESULT, this.onResult as never)
    this.ctx.network.on(HC_EVENTS.FINAL, this.onFinalMsg as never)
    if (this.ctx.network.isHost()) setTimeout(() => this.nextRound(), 600)
  }

  update(_dt: number): void {}

  destroy(): void {
    if (this.roundTimer) clearTimeout(this.roundTimer)
    this.inputEl?.remove()
    this.ctx.network.off(HC_EVENTS.NEW_ROUND, this.onNewRound as never)
    this.ctx.network.off(HC_EVENTS.RESULT, this.onResult as never)
    this.ctx.network.off(HC_EVENTS.FINAL, this.onFinalMsg as never)
    this.app.stage.removeChildren()
  }

  private nextRound(): void {
    if (this.roundTimer) clearTimeout(this.roundTimer)
    this.round++; this.roundWon = false; this.lastGuess = 500; this.guessHistory = []
    this.secretNumber = Math.floor(Math.random() * 1000) + 1
    this.ctx.network.broadcast(HC_EVENTS.NEW_ROUND, { round: this.round })
    this.showRound()
    this.roundTimer = setTimeout(() => { if (!this.roundWon) this.endRound(null, null) }, 60000)
  }

  private submitGuess(val: number): void {
    const localId = this.ctx.players.getLocalPlayer().id
    const localName = this.ctx.players.getLocalPlayer().name
    if (this.ctx.network.isHost()) {
      this.processGuess(localId, localName, val)
    } else {
      this.ctx.network.send(HC_EVENTS.GUESS, { playerId: localId, playerName: localName, guess: val })
    }
  }

  private readonly onGuess = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { playerId, playerName, guess } = msg.payload as { playerId: string; playerName: string; guess: number }
    this.processGuess(playerId, playerName, guess)
  }

  private processGuess(playerId: string, playerName: string, guess: number): void {
    if (this.roundWon) return
    const diff = Math.abs(guess - this.secretNumber)
    const prevDiff = Math.abs(this.lastGuess - this.secretNumber)
    const correct = diff === 0
    let hint: string
    if (correct) hint = 'CORRECT! 🎉'
    else if (diff < prevDiff) hint = diff < 50 ? '🔥 VERY HOT!' : '♨️ HOTTER'
    else if (diff > prevDiff) hint = diff > 300 ? '🧊 ICE COLD' : '❄️ COLDER'
    else hint = '→ SAME'
    this.lastGuess = guess
    const entry = `${playerName}: ${guess} → ${hint}`
    this.guessHistory.unshift(entry)
    if (this.guessHistory.length > 6) this.guessHistory.pop()
    this.ctx.network.broadcast(HC_EVENTS.RESULT, { hint, guesserName: playerName, guess, correct, number: correct ? this.secretNumber : null })
    this.updateGauge()
    this.historyText.text = this.guessHistory.join('\n')
    this.statusText.text = entry
    if (correct) {
      this.roundWon = true
      const prev = this.scores.get(playerId) ?? 0
      this.scores.set(playerId, prev + 1)
      this.updateScores()
      this.endRound(playerId, playerName)
    }
  }

  private endRound(winnerId: string | null, _winnerName: string | null): void {
    if (this.roundTimer) clearTimeout(this.roundTimer)
    this.roundWon = true
    if (this.round >= TOTAL_ROUNDS) setTimeout(() => this.triggerFinal(), 2500)
    else setTimeout(() => this.nextRound(), 2500)
  }

  private triggerFinal(): void {
    const sorted = [...this.scores.entries()]
      .map(([id, score]) => { const p = this.ctx.players.getPlayers().find(pl => pl.id === id); return { id, name: p?.name ?? id, score } })
      .sort((a, b) => b.score - a.score)
    this.ctx.network.broadcast(HC_EVENTS.FINAL, { sorted })
    this.showFinal(sorted)
  }

  private buildScene(): void {
    this.stage = new Graphics()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    this.app.stage.addChild(this.stage); this.scaleStage()

    const title = new Text({ text: 'HOT OR COLD', style: new TextStyle({ fontFamily: 'monospace', fontSize: 24, fontWeight: '900', fill: '#ff2d78', letterSpacing: 5 }) })
    title.anchor.set(0.5, 0); title.position.set(LOGIC_W / 2, 12); this.stage.addChild(title)

    this.roundText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#ffd60a' }) })
    this.roundText.anchor.set(0, 0); this.roundText.position.set(16, 14); this.stage.addChild(this.roundText)

    this.scoreText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#606080' }) })
    this.scoreText.anchor.set(1, 0); this.scoreText.position.set(LOGIC_W - 16, 14); this.stage.addChild(this.scoreText)

    // Gauge
    this.gaugeGfx = new Graphics(); this.stage.addChild(this.gaugeGfx)
    this.drawGaugeFrame()

    this.statusText = new Text({ text: 'Pick a number 1-1000', style: new TextStyle({ fontFamily: 'monospace', fontSize: 16, fill: '#c0c0e0', wordWrap: true, wordWrapWidth: 340 }) })
    this.statusText.anchor.set(0, 0); this.statusText.position.set(170, 130); this.stage.addChild(this.statusText)

    this.historyText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#909090', wordWrap: true, wordWrapWidth: 340 }) })
    this.historyText.anchor.set(0, 0); this.historyText.position.set(170, 175); this.stage.addChild(this.historyText)

    this.createInputOverlay()
  }

  private drawGaugeFrame(): void {
    const g = this.gaugeGfx; const gx = 60, gy = 80, gw = 50, gh = 340
    g.rect(gx - 2, gy - 2, gw + 4, gh + 4).fill(0x202030)
    g.rect(gx, gy, gw, gh).fill(0x101020)
    // labels
  }

  private updateGauge(): void {
    const g = this.gaugeGfx; g.clear(); this.drawGaugeFrame()
    const gx = 60, gy = 80, gw = 50, gh = 340
    const proximity = 1 - Math.abs(this.lastGuess - 500) / 500
    const fillH = proximity * gh
    const hot = 0xff4444; const cold = 0x4444ff
    const r = ((hot >> 16) & 0xff) * proximity + ((cold >> 16) & 0xff) * (1 - proximity)
    const gg = 0
    const b = ((hot) & 0xff) * proximity + ((cold) & 0xff) * (1 - proximity)
    const col = (Math.floor(r) << 16) | (Math.floor(gg) << 8) | Math.floor(b)
    g.rect(gx, gy + gh - fillH, gw, fillH).fill(col)
    g.rect(gx - 2, gy - 2, gw + 4, gh + 4).stroke({ width: 2, color: 0x404060 })
    const mark = gy + gh - (this.lastGuess / 1000) * gh
    g.rect(gx - 8, mark - 2, gw + 16, 4).fill(0xffd60a)
  }

  private createInputOverlay(): void {
    const canvas = this.app.canvas; const rect = canvas.getBoundingClientRect()
    const el = document.createElement('input')
    el.type = 'number'; el.min = '1'; el.max = '1000'
    el.placeholder = 'Guess 1-1000, press Enter'
    el.style.cssText = `position:fixed;left:${rect.left + rect.width * 0.28}px;top:${rect.top + rect.height * 0.88}px;width:${rect.width * 0.44}px;height:42px;background:#16162a;border:2px solid #ff2d7844;border-radius:8px;color:#e0e0ff;font-family:monospace;font-size:20px;text-align:center;padding:0 12px;outline:none;z-index:9999;caret-color:#ff2d78;`
    document.body.appendChild(el); this.inputEl = el
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const v = parseInt(el.value); if (!isNaN(v) && v >= 1 && v <= 1000) { this.submitGuess(v); el.value = '' } } })
    el.focus()
  }

  private showRound(): void {
    this.roundText.text = `Round ${this.round}/${TOTAL_ROUNDS}`
    this.statusText.text = `Guess the number (1-1000)!`
    ;(this.statusText.style as TextStyle).fill = '#c0c0e0'
    this.historyText.text = ''
    this.lastGuess = 500; this.updateGauge()
    this.updateScores()
    if (this.inputEl) { this.inputEl.disabled = false; this.inputEl.focus() }
  }

  private updateScores(): void {
    const parts = [...this.scores.entries()].map(([id, score]) => { const p = this.ctx.players.getPlayers().find(pl => pl.id === id); return `${p?.name ?? id}: ${score}` })
    this.scoreText.text = parts.join(' | ')
  }

  private showFinal(sorted: { id: string; name: string; score: number }[]): void {
    if (this.inputEl) this.inputEl.disabled = true
    this.stage.removeChildren()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    const t = new Text({ text: 'FINAL SCORES', style: new TextStyle({ fontFamily: 'monospace', fontSize: 32, fontWeight: '900', fill: '#ff2d78', letterSpacing: 4 }) })
    t.anchor.set(0.5); t.position.set(LOGIC_W / 2, 80); this.stage.addChild(t)
    sorted.forEach((p, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
      const row = new Text({ text: `${medal}  ${p.name.padEnd(14)}  ${p.score} pts`, style: new TextStyle({ fontFamily: 'monospace', fontSize: 22, fill: i === 0 ? '#ffd60a' : '#c0c0e0' }) })
      row.anchor.set(0.5); row.position.set(LOGIC_W / 2, 160 + i * 52); this.stage.addChild(row)
    })
    const localId = this.ctx.players.getLocalPlayer().id
    if (this.ctx.network.isHost()) {
      this.ctx.stats.record('play')
      if (sorted[0]?.id === localId) this.ctx.stats.record('win'); else this.ctx.stats.record('loss')
      this.ctx.events.emit('platform:game:ended', { gameId: this.ctx.gameId, winnerId: sorted[0]?.id, durationMs: 0, results: sorted.map((p, i) => ({ playerId: p.id, playerName: p.name, rank: i + 1, score: p.score })) })
    }
  }

  private scaleStage(): void {
    const { width: cw, height: ch } = this.app.screen
    const scale = Math.min(cw / LOGIC_W, ch / LOGIC_H) * 0.97
    this.stage.scale.set(scale); this.stage.position.set((cw - LOGIC_W * scale) / 2, (ch - LOGIC_H * scale) / 2)
  }
}
