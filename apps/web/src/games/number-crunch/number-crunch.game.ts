// ─────────────────────────────────────────────────────────────────────────────
// Number Crunch — arithmetic race
//
// Host presents a math problem (add/sub/mul, increasing difficulty).
// First player to type the correct answer scores a point. 15 rounds.
// ─────────────────────────────────────────────────────────────────────────────
import { Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'

export const NC_EVENTS = {
  QUESTION:  'number-crunch:question',
  ANSWER:    'number-crunch:answer',
  ROUND_END: 'number-crunch:round-end',
  FINAL:     'number-crunch:final',
} as const

const TOTAL_ROUNDS = 15
const QUESTION_MS = 12000
const LOGIC_W = 700
const LOGIC_H = 480

function genQuestion(round: number): { text: string; answer: number } {
  const ops = round < 5 ? ['+', '-'] : round < 10 ? ['+', '-', '*'] : ['+', '-', '*', '**2']
  const op = ops[Math.floor(Math.random() * ops.length)]!
  const a = Math.floor(Math.random() * (round < 5 ? 20 : round < 10 ? 50 : 100)) + 1
  const b = Math.floor(Math.random() * (round < 5 ? 20 : round < 10 ? 50 : 100)) + 1
  if (op === '**2') return { text: `${a}²`, answer: a * a }
  const answer = op === '+' ? a + b : op === '-' ? a - b : a * b
  return { text: `${a} ${op} ${b}`, answer }
}

export class NumberCrunchGame implements GameInstance {
  private ctx: GameContext
  private app: Application

  private stage!: Graphics
  private questionText!: Text
  private roundText!: Text
  private timerText!: Text
  private scoreText!: Text
  private feedbackText!: Text
  private inputEl: HTMLInputElement | null = null

  private currentAnswer = 0
  private round = 0
  private scores = new Map<string, number>()
  private roundAnswered = false
  private roundTimer: ReturnType<typeof setTimeout> | null = null
  private tickInterval: ReturnType<typeof setInterval> | null = null
  private questionStartTime = 0
  private timeLeft = 0

  private readonly onQuestion = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { text, round } = msg.payload as { text: string; round: number }
    this.round = round; this.roundAnswered = false; this.timeLeft = QUESTION_MS / 1000
    this.showQuestion(text)
  }

  private readonly onAnswer = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { playerId, playerName, value } = msg.payload as { playerId: string; playerName: string; value: number }
    if (!this.roundAnswered && value === this.currentAnswer) {
      this.roundAnswered = true
      this.scores.set(playerId, (this.scores.get(playerId) ?? 0) + 1)
      this.endRound(playerId, playerName)
    }
  }

  private readonly onRoundEnd = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { winnerId, winnerName, answer, scores } = msg.payload as { winnerId: string | null; winnerName: string | null; answer: number; scores: { id: string; score: number }[] }
    for (const s of scores) this.scores.set(s.id, s.score)
    this.revealAnswer(winnerId, winnerName, answer)
  }

  private readonly onFinal = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { sorted } = msg.payload as { sorted: { id: string; name: string; score: number }[] }
    this.showFinal(sorted)
  }

  constructor(context: GameContext) { this.ctx = context; this.app = context.pixiApp as Application }

  async init(): Promise<void> {
    this.buildScene()
    this.ctx.network.on(NC_EVENTS.QUESTION,  this.onQuestion as never)
    this.ctx.network.on(NC_EVENTS.ANSWER,    this.onAnswer as never)
    this.ctx.network.on(NC_EVENTS.ROUND_END, this.onRoundEnd as never)
    this.ctx.network.on(NC_EVENTS.FINAL,     this.onFinal as never)
    for (const p of this.ctx.players.getPlayers()) this.scores.set(p.id, 0)
    if (this.ctx.network.isHost()) setTimeout(() => this.nextRound(), 600)
  }

  update(_dt: number): void {}

  destroy(): void {
    if (this.roundTimer) clearTimeout(this.roundTimer)
    if (this.tickInterval) clearInterval(this.tickInterval)
    this.inputEl?.remove()
    this.ctx.network.off(NC_EVENTS.QUESTION,  this.onQuestion as never)
    this.ctx.network.off(NC_EVENTS.ANSWER,    this.onAnswer as never)
    this.ctx.network.off(NC_EVENTS.ROUND_END, this.onRoundEnd as never)
    this.ctx.network.off(NC_EVENTS.FINAL,     this.onFinal as never)
    this.app.stage.removeChildren()
  }

  private nextRound(): void {
    if (this.roundTimer) clearTimeout(this.roundTimer)
    if (this.tickInterval) clearInterval(this.tickInterval)
    this.round++; this.roundAnswered = false
    const { text, answer } = genQuestion(this.round)
    this.currentAnswer = answer
    this.questionStartTime = Date.now(); this.timeLeft = QUESTION_MS / 1000
    this.ctx.network.broadcast(NC_EVENTS.QUESTION, { text, round: this.round })
    this.showQuestion(text)
    this.tickInterval = setInterval(() => {
      this.timeLeft = Math.max(0, Math.round((QUESTION_MS - (Date.now() - this.questionStartTime)) / 1000))
      this.timerText.text = `${this.timeLeft}s`
      ;(this.timerText.style as TextStyle).fill = this.timeLeft <= 3 ? '#ff2d78' : '#ffd60a'
    }, 500)
    this.roundTimer = setTimeout(() => { if (!this.roundAnswered) this.endRound(null, null) }, QUESTION_MS)
  }

  private endRound(winnerId: string | null, winnerName: string | null): void {
    if (this.roundTimer) clearTimeout(this.roundTimer)
    if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = null }
    const scoresArr = [...this.scores.entries()].map(([id, score]) => { const p = this.ctx.players.getPlayers().find(pl => pl.id === id); return { id, name: p?.name ?? id, score } })
    this.ctx.network.broadcast(NC_EVENTS.ROUND_END, { winnerId, winnerName, answer: this.currentAnswer, scores: scoresArr })
    this.revealAnswer(winnerId, winnerName, this.currentAnswer)
    if (this.round >= TOTAL_ROUNDS) setTimeout(() => this.triggerFinal(), 2000)
    else setTimeout(() => this.nextRound(), 2000)
  }

  private triggerFinal(): void {
    const sorted = [...this.scores.entries()].map(([id, score]) => { const p = this.ctx.players.getPlayers().find(pl => pl.id === id); return { id, name: p?.name ?? id, score } }).sort((a, b) => b.score - a.score)
    this.ctx.network.broadcast(NC_EVENTS.FINAL, { sorted })
    this.showFinal(sorted)
  }

  private buildScene(): void {
    this.stage = new Graphics()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    this.app.stage.addChild(this.stage)
    this.scaleStage()

    const title = new Text({ text: 'NUMBER CRUNCH', style: new TextStyle({ fontFamily: 'monospace', fontSize: 24, fontWeight: '900', fill: '#00f5ff', letterSpacing: 5 }) })
    title.anchor.set(0.5, 0); title.position.set(LOGIC_W / 2, 12); this.stage.addChild(title)
    this.roundText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 14, fill: '#ffd60a' }) })
    this.roundText.anchor.set(0, 0); this.roundText.position.set(16, 14); this.stage.addChild(this.roundText)
    this.timerText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 14, fill: '#ffd60a' }) })
    this.timerText.anchor.set(1, 0); this.timerText.position.set(LOGIC_W - 16, 14); this.stage.addChild(this.timerText)
    this.questionText = new Text({ text: '...', style: new TextStyle({ fontFamily: 'monospace', fontSize: 64, fontWeight: '900', fill: '#ffffff', letterSpacing: 4 }) })
    this.questionText.anchor.set(0.5); this.questionText.position.set(LOGIC_W / 2, 180); this.stage.addChild(this.questionText)
    this.feedbackText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 18, fill: '#30d158' }) })
    this.feedbackText.anchor.set(0.5); this.feedbackText.position.set(LOGIC_W / 2, 275); this.stage.addChild(this.feedbackText)
    this.scoreText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#606080' }) })
    this.scoreText.anchor.set(0.5, 0); this.scoreText.position.set(LOGIC_W / 2, 375); this.stage.addChild(this.scoreText)
    this.createInputOverlay()
  }

  private createInputOverlay(): void {
    const canvas = this.app.canvas; const rect = canvas.getBoundingClientRect()
    const el = document.createElement('input')
    el.type = 'number'; el.autocomplete = 'off'
    el.style.cssText = `position:fixed;left:${rect.left + rect.width * 0.25}px;top:${rect.top + rect.height * 0.62}px;width:${rect.width * 0.5}px;height:52px;background:#16162a;border:2px solid #00f5ff44;border-radius:8px;color:#e0e0ff;font-family:monospace;font-size:28px;text-align:center;padding:0 12px;outline:none;z-index:9999;caret-color:#00f5ff;`
    el.placeholder = '?'
    document.body.appendChild(el)
    this.inputEl = el
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.submitAnswer() })
    el.focus()
  }

  private submitAnswer(): void {
    if (!this.inputEl) return
    const value = parseInt(this.inputEl.value, 10)
    this.inputEl.value = ''
    if (isNaN(value)) return
    const localId = this.ctx.players.getLocalPlayer().id; const localName = this.ctx.players.getLocalPlayer().name
    if (this.ctx.network.isHost()) {
      if (!this.roundAnswered && value === this.currentAnswer) { this.roundAnswered = true; this.scores.set(localId, (this.scores.get(localId) ?? 0) + 1); this.endRound(localId, localName) }
      else if (value !== this.currentAnswer) { this.feedbackText.text = 'Wrong!'; ;(this.feedbackText.style as TextStyle).fill = '#ff2d78' }
    } else {
      this.ctx.network.send(NC_EVENTS.ANSWER, { playerId: localId, playerName: localName, value })
      if (value !== this.currentAnswer) { this.feedbackText.text = 'Wrong!'; ;(this.feedbackText.style as TextStyle).fill = '#ff2d78' }
    }
  }

  private showQuestion(text: string): void {
    this.roundText.text = `Q ${this.round}/${TOTAL_ROUNDS}`
    this.questionText.text = text
    this.feedbackText.text = 'Type the answer and press Enter'
    ;(this.feedbackText.style as TextStyle).fill = '#606080'
    this.updateScores()
    if (this.inputEl) { this.inputEl.disabled = false; this.inputEl.focus() }
  }

  private revealAnswer(winnerId: string | null, winnerName: string | null, answer: number): void {
    if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = null }
    if (this.inputEl) this.inputEl.disabled = true
    const localId = this.ctx.players.getLocalPlayer().id
    this.feedbackText.text = winnerId ? (winnerId === localId ? `✓ Correct! Answer: ${answer}` : `${winnerName} got it! Answer: ${answer}`) : `Time's up! Answer: ${answer}`
    ;(this.feedbackText.style as TextStyle).fill = winnerId === localId ? '#30d158' : '#c0c0e0'
    this.updateScores()
  }

  private updateScores(): void {
    const parts = [...this.scores.entries()].map(([id, score]) => { const p = this.ctx.players.getPlayers().find(pl => pl.id === id); return `${p?.name ?? id}: ${score}` })
    this.scoreText.text = parts.join('  |  ')
  }

  private showFinal(sorted: { id: string; name: string; score: number }[]): void {
    if (this.inputEl) this.inputEl.disabled = true
    this.stage.removeChildren(); this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    const title = new Text({ text: 'FINAL SCORES', style: new TextStyle({ fontFamily: 'monospace', fontSize: 34, fontWeight: '900', fill: '#00f5ff', letterSpacing: 4 }) })
    title.anchor.set(0.5); title.position.set(LOGIC_W / 2, 80); this.stage.addChild(title)
    sorted.forEach((p, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
      const t = new Text({ text: `${medal}  ${p.name.padEnd(14)}  ${p.score} pts`, style: new TextStyle({ fontFamily: 'monospace', fontSize: 22, fill: i === 0 ? '#ffd60a' : '#c0c0e0' }) })
      t.anchor.set(0.5); t.position.set(LOGIC_W / 2, 170 + i * 52); this.stage.addChild(t)
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
    this.stage.scale.set(scale)
    this.stage.position.set((cw - LOGIC_W * scale) / 2, (ch - LOGIC_H * scale) / 2)
  }
}
