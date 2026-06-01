// ─────────────────────────────────────────────────────────────────────────────
// Trivia Quiz — 10-round multiple-choice quiz
//
// Host picks a question, shows 4 options. First player to tap the correct
// answer scores a point (speed bonus for answering within 3s).
// 10 rounds, most points wins.
// ─────────────────────────────────────────────────────────────────────────────
import { Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'

export const TQ_EVENTS = {
  QUESTION:   'trivia-quiz:question',
  ANSWER:     'trivia-quiz:answer',
  ROUND_END:  'trivia-quiz:round-end',
  FINAL:      'trivia-quiz:final',
} as const

const TOTAL_ROUNDS = 10
const QUESTION_MS = 20000
const LOGIC_W = 800
const LOGIC_H = 560

interface Question {
  q: string
  options: string[]
  correct: number  // index
}

const QUESTIONS: Question[] = [
  { q: 'What does HTML stand for?', options: ['HyperText Markup Language', 'High Transfer Markup Language', 'HyperText Machine Learning', 'Home Tool Markup Language'], correct: 0 },
  { q: 'Which language runs in the browser?', options: ['Python', 'Java', 'JavaScript', 'C++'], correct: 2 },
  { q: 'What does CSS stand for?', options: ['Counter Style Sheets', 'Cascading Style Sheets', 'Creative Style System', 'Computer Style Sheets'], correct: 1 },
  { q: 'Which tag creates a hyperlink in HTML?', options: ['<link>', '<href>', '<a>', '<url>'], correct: 2 },
  { q: 'What is the correct way to declare a JS variable?', options: ['variable x = 5', 'var x = 5', 'int x = 5', 'declare x = 5'], correct: 1 },
  { q: 'Which company developed TypeScript?', options: ['Google', 'Facebook', 'Microsoft', 'Apple'], correct: 2 },
  { q: 'What does "npm" stand for?', options: ['New Package Manager', 'Node Package Manager', 'Network Protocol Module', 'None of the above'], correct: 1 },
  { q: 'What does JSON stand for?', options: ['JavaScript Object Network', 'JavaScript Open Notation', 'JavaScript Object Notation', 'Just Structured Object Nodes'], correct: 2 },
  { q: 'What is the output of typeof null?', options: ['"null"', '"undefined"', '"object"', '"boolean"'], correct: 2 },
  { q: 'Which HTTP method is used to retrieve data?', options: ['POST', 'GET', 'PUT', 'DELETE'], correct: 1 },
  { q: 'What is a closure in JavaScript?', options: ['A loop', 'A function with access to outer scope', 'A class method', 'An async function'], correct: 1 },
  { q: 'Which of these is NOT a JS data type?', options: ['String', 'Boolean', 'Integer', 'Symbol'], correct: 2 },
  { q: 'What does the "=== " operator check?', options: ['Value only', 'Type only', 'Value and type', 'Reference'], correct: 2 },
  { q: 'What is the DOM?', options: ['Document Object Model', 'Data Object Model', 'Dynamic Object Memory', 'Design Output Module'], correct: 0 },
  { q: 'Which CSS property controls text size?', options: ['text-size', 'font-size', 'text-scale', 'font-height'], correct: 1 },
  { q: 'What does API stand for?', options: ['Application Programming Interface', 'App Process Integration', 'Automated Protocol Interface', 'Advanced Program Injection'], correct: 0 },
  { q: 'Which keyword is used to define a class in JS?', options: ['function', 'def', 'class', 'object'], correct: 2 },
  { q: 'What is a Promise in JavaScript?', options: ['A loop', 'A data type', 'An async operation result', 'A class'], correct: 2 },
  { q: 'What does "git pull" do?', options: ['Push changes', 'Fetch and merge remote changes', 'Delete a branch', 'Create a tag'], correct: 1 },
  { q: 'Which port does HTTPS use by default?', options: ['80', '21', '443', '8080'], correct: 2 },
]

const OPTION_COLORS = [0x3498db, 0xe74c3c, 0x2ecc71, 0xf39c12]
const OPTION_LABELS = ['A', 'B', 'C', 'D']

export class TriviaQuizGame implements GameInstance {
  private ctx: GameContext
  private app: Application

  private stage!: Graphics
  private questionText!: Text
  private roundText!: Text
  private timerText!: Text
  private scoreText!: Text
  private feedbackText!: Text
  private optionBtns: Graphics[] = []
  private optionTexts: Text[] = []

  private usedIndices = new Set<number>()
  private currentQuestion: Question | null = null
  private round = 0
  private scores = new Map<string, number>()
  private roundAnswered = false
  private roundTimer: ReturnType<typeof setTimeout> | null = null
  private tickInterval: ReturnType<typeof setInterval> | null = null
  private questionStartTime = 0
  private timeLeft = 0

  private readonly onQuestion = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { question, round } = msg.payload as { question: Question; round: number }
    this.currentQuestion = question
    this.round = round
    this.roundAnswered = false
    this.timeLeft = QUESTION_MS / 1000
    this.showQuestion()
  }

  private readonly onAnswer = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { playerId, playerName, optionIdx, elapsed } = msg.payload as { playerId: string; playerName: string; optionIdx: number; elapsed: number }
    if (!this.currentQuestion || this.roundAnswered) return
    if (optionIdx === this.currentQuestion.correct) {
      this.roundAnswered = true
      const bonus = elapsed < 3000 ? 2 : 1
      const prev = this.scores.get(playerId) ?? 0
      this.scores.set(playerId, prev + bonus)
      this.endRound(playerId, playerName, optionIdx)
    }
  }

  private readonly onRoundEnd = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { winnerId, winnerName, correctIdx, scores } = msg.payload as {
      winnerId: string | null; winnerName: string | null; correctIdx: number
      scores: { id: string; name: string; score: number }[]
    }
    for (const s of scores) this.scores.set(s.id, s.score)
    this.revealAnswer(correctIdx, winnerId, winnerName)
  }

  private readonly onFinal = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { sorted } = msg.payload as { sorted: { id: string; name: string; score: number }[] }
    this.showFinal(sorted)
  }

  constructor(context: GameContext) {
    this.ctx = context
    this.app = context.pixiApp as Application
  }

  async init(): Promise<void> {
    this.buildScene()
    this.ctx.network.on(TQ_EVENTS.QUESTION,  this.onQuestion as never)
    this.ctx.network.on(TQ_EVENTS.ANSWER,    this.onAnswer as never)
    this.ctx.network.on(TQ_EVENTS.ROUND_END, this.onRoundEnd as never)
    this.ctx.network.on(TQ_EVENTS.FINAL,     this.onFinal as never)
    for (const p of this.ctx.players.getPlayers()) this.scores.set(p.id, 0)
    if (this.ctx.network.isHost()) setTimeout(() => this.nextRound(), 600)
  }

  update(_dt: number): void {}

  destroy(): void {
    if (this.roundTimer) clearTimeout(this.roundTimer)
    if (this.tickInterval) clearInterval(this.tickInterval)
    this.ctx.network.off(TQ_EVENTS.QUESTION,  this.onQuestion as never)
    this.ctx.network.off(TQ_EVENTS.ANSWER,    this.onAnswer as never)
    this.ctx.network.off(TQ_EVENTS.ROUND_END, this.onRoundEnd as never)
    this.ctx.network.off(TQ_EVENTS.FINAL,     this.onFinal as never)
    this.app.stage.removeChildren()
  }

  private nextRound(): void {
    if (this.roundTimer) clearTimeout(this.roundTimer)
    if (this.tickInterval) clearInterval(this.tickInterval)
    this.round++
    this.roundAnswered = false

    // Pick unused question
    let idx: number
    do { idx = Math.floor(Math.random() * QUESTIONS.length) }
    while (this.usedIndices.has(idx) && this.usedIndices.size < QUESTIONS.length)
    this.usedIndices.add(idx)
    this.currentQuestion = QUESTIONS[idx]!

    this.questionStartTime = Date.now()
    this.timeLeft = QUESTION_MS / 1000

    this.ctx.network.broadcast(TQ_EVENTS.QUESTION, { question: this.currentQuestion, round: this.round })
    this.showQuestion()

    this.tickInterval = setInterval(() => {
      this.timeLeft = Math.max(0, Math.round((QUESTION_MS - (Date.now() - this.questionStartTime)) / 1000))
      this.timerText.text = `${this.timeLeft}s`
      ;(this.timerText.style as TextStyle).fill = this.timeLeft <= 5 ? '#ff2d78' : '#ffd60a'
    }, 500)

    this.roundTimer = setTimeout(() => {
      if (!this.roundAnswered) this.endRound(null, null, -1)
    }, QUESTION_MS)
  }

  private endRound(winnerId: string | null, winnerName: string | null, correctIdx: number): void {
    if (this.roundTimer) clearTimeout(this.roundTimer)
    if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = null }
    const scoresArr = [...this.scores.entries()].map(([id, score]) => {
      const p = this.ctx.players.getPlayers().find(pl => pl.id === id)
      return { id, name: p?.name ?? id, score }
    })
    this.ctx.network.broadcast(TQ_EVENTS.ROUND_END, { winnerId, winnerName, correctIdx, scores: scoresArr })
    this.revealAnswer(correctIdx, winnerId, winnerName)

    if (this.round >= TOTAL_ROUNDS) {
      setTimeout(() => this.triggerFinal(), 2500)
    } else {
      setTimeout(() => this.nextRound(), 2500)
    }
  }

  private triggerFinal(): void {
    const sorted = [...this.scores.entries()]
      .map(([id, score]) => { const p = this.ctx.players.getPlayers().find(pl => pl.id === id); return { id, name: p?.name ?? id, score } })
      .sort((a, b) => b.score - a.score)
    this.ctx.network.broadcast(TQ_EVENTS.FINAL, { sorted })
    this.showFinal(sorted)
  }

  private buildScene(): void {
    this.stage = new Graphics()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    this.app.stage.addChild(this.stage)
    this.scaleStage()

    const title = new Text({ text: 'TRIVIA QUIZ', style: new TextStyle({ fontFamily: 'monospace', fontSize: 26, fontWeight: '900', fill: '#00f5ff', letterSpacing: 5 }) })
    title.anchor.set(0.5, 0); title.position.set(LOGIC_W / 2, 12)
    this.stage.addChild(title)

    this.roundText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 14, fill: '#ffd60a' }) })
    this.roundText.anchor.set(0, 0); this.roundText.position.set(16, 14)
    this.stage.addChild(this.roundText)

    this.timerText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 14, fill: '#ffd60a' }) })
    this.timerText.anchor.set(1, 0); this.timerText.position.set(LOGIC_W - 16, 14)
    this.stage.addChild(this.timerText)

    this.questionText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 20, fill: '#ffffff', wordWrap: true, wordWrapWidth: LOGIC_W - 60, align: 'center' }) })
    this.questionText.anchor.set(0.5, 0); this.questionText.position.set(LOGIC_W / 2, 55)
    this.stage.addChild(this.questionText)

    this.feedbackText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 16, fill: '#30d158' }) })
    this.feedbackText.anchor.set(0.5, 0); this.feedbackText.position.set(LOGIC_W / 2, 148)
    this.stage.addChild(this.feedbackText)

    // 4 answer buttons
    const btnW = 350; const btnH = 56; const gap = 14
    const startX = (LOGIC_W - (btnW * 2 + gap)) / 2
    const startY = 175
    for (let i = 0; i < 4; i++) {
      const col = i % 2; const row = Math.floor(i / 2)
      const x = startX + col * (btnW + gap); const y = startY + row * (btnH + gap)
      const btn = new Graphics()
      btn.roundRect(0, 0, btnW, btnH, 10).fill({ color: OPTION_COLORS[i]!, alpha: 0.18 })
      btn.roundRect(0, 0, btnW, btnH, 10).stroke({ width: 1.5, color: OPTION_COLORS[i]! })
      btn.position.set(x, y); btn.eventMode = 'static'; btn.cursor = 'pointer'
      btn.on('pointerdown', () => this.handleAnswer(i))
      this.stage.addChild(btn); this.optionBtns.push(btn)

      const lbl = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 15, fill: `#${(OPTION_COLORS[i]!).toString(16).padStart(6, '0')}`, wordWrap: true, wordWrapWidth: btnW - 52 }) })
      lbl.position.set(x + 48, y + 10)
      this.stage.addChild(lbl); this.optionTexts.push(lbl)

      const letter = new Text({ text: OPTION_LABELS[i]!, style: new TextStyle({ fontFamily: 'monospace', fontSize: 20, fontWeight: '700', fill: `#${(OPTION_COLORS[i]!).toString(16).padStart(6, '0')}` }) })
      letter.anchor.set(0, 0.5); letter.position.set(x + 14, y + btnH / 2)
      this.stage.addChild(letter)
    }

    this.scoreText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#606080' }) })
    this.scoreText.anchor.set(0.5, 0); this.scoreText.position.set(LOGIC_W / 2, 380)
    this.stage.addChild(this.scoreText)
  }

  private showQuestion(): void {
    if (!this.currentQuestion) return
    this.roundText.text = `Q ${this.round}/${TOTAL_ROUNDS}`
    this.timerText.text = `${QUESTION_MS / 1000}s`
    this.questionText.text = this.currentQuestion.q
    this.feedbackText.text = ''
    this.currentQuestion.options.forEach((opt, i) => {
      this.optionTexts[i]!.text = opt
      const btn = this.optionBtns[i]!
      btn.clear()
      btn.roundRect(0, 0, 350, 56, 10).fill({ color: OPTION_COLORS[i]!, alpha: 0.18 })
      btn.roundRect(0, 0, 350, 56, 10).stroke({ width: 1.5, color: OPTION_COLORS[i]! })
      btn.eventMode = 'static'; btn.alpha = 1
    })
    this.updateScores()
  }

  private handleAnswer(optionIdx: number): void {
    const localId = this.ctx.players.getLocalPlayer().id
    const localName = this.ctx.players.getLocalPlayer().name
    const elapsed = Date.now() - this.questionStartTime
    if (this.ctx.network.isHost()) {
      if (!this.currentQuestion || this.roundAnswered) return
      if (optionIdx === this.currentQuestion.correct) {
        this.roundAnswered = true
        const bonus = elapsed < 3000 ? 2 : 1
        const prev = this.scores.get(localId) ?? 0
        this.scores.set(localId, prev + bonus)
        this.endRound(localId, localName, optionIdx)
      } else {
        this.revealWrong(optionIdx)
      }
    } else {
      this.ctx.network.send(TQ_EVENTS.ANSWER, { playerId: localId, playerName: localName, optionIdx, elapsed })
      this.revealWrong(optionIdx)
    }
  }

  private revealWrong(optionIdx: number): void {
    const btn = this.optionBtns[optionIdx]
    if (!btn) return
    btn.clear()
    btn.roundRect(0, 0, 350, 56, 10).fill({ color: 0x330000, alpha: 0.7 })
    btn.roundRect(0, 0, 350, 56, 10).stroke({ width: 1.5, color: 0xff2d78 })
    btn.eventMode = 'none'
  }

  private revealAnswer(correctIdx: number, winnerId: string | null, winnerName: string | null): void {
    if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = null }
    // Highlight correct
    if (correctIdx >= 0) {
      const btn = this.optionBtns[correctIdx]
      if (btn) {
        btn.clear()
        btn.roundRect(0, 0, 350, 56, 10).fill({ color: 0x1a4a1a, alpha: 1 })
        btn.roundRect(0, 0, 350, 56, 10).stroke({ width: 2.5, color: 0x30d158 })
      }
    }
    for (const btn of this.optionBtns) btn.eventMode = 'none'
    const localId = this.ctx.players.getLocalPlayer().id
    if (winnerId) {
      this.feedbackText.text = winnerId === localId ? '✓ Correct! +points' : `${winnerName} answered first!`
      ;(this.feedbackText.style as TextStyle).fill = winnerId === localId ? '#30d158' : '#ff6b6b'
    } else {
      this.feedbackText.text = correctIdx >= 0 ? `Time\'s up!` : 'No correct answer this round.'
      ;(this.feedbackText.style as TextStyle).fill = '#ffd60a'
    }
    this.updateScores()
  }

  private updateScores(): void {
    const parts = [...this.scores.entries()].map(([id, score]) => {
      const p = this.ctx.players.getPlayers().find(pl => pl.id === id)
      return `${p?.name ?? id}: ${score}`
    })
    this.scoreText.text = parts.join('  |  ')
  }

  private showFinal(sorted: { id: string; name: string; score: number }[]): void {
    this.stage.removeChildren()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    const title = new Text({ text: 'QUIZ OVER', style: new TextStyle({ fontFamily: 'monospace', fontSize: 36, fontWeight: '900', fill: '#00f5ff', letterSpacing: 4 }) })
    title.anchor.set(0.5); title.position.set(LOGIC_W / 2, 80)
    this.stage.addChild(title)
    sorted.forEach((p, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
      const t = new Text({ text: `${medal}  ${p.name.padEnd(14)}  ${p.score} pts`, style: new TextStyle({ fontFamily: 'monospace', fontSize: 22, fill: i === 0 ? '#ffd60a' : '#c0c0e0' }) })
      t.anchor.set(0.5); t.position.set(LOGIC_W / 2, 170 + i * 52)
      this.stage.addChild(t)
    })
    const localId = this.ctx.players.getLocalPlayer().id
    if (this.ctx.network.isHost()) {
      this.ctx.stats.record('play')
      if (sorted[0]?.id === localId) this.ctx.stats.record('win')
      else this.ctx.stats.record('loss')
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
