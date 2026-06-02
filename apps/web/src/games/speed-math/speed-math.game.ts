// ─────────────────────────────────────────────────────────────────────────────
// Speed Math — Race to solve arithmetic problems
//
// Host generates questions. All players see the same question simultaneously.
// First player to submit the correct answer scores a point.
// 10 rounds, most points wins.
// ─────────────────────────────────────────────────────────────────────────────
import { Container, Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'
import { createGameUI } from '@/core/services/game-ui/game-ui'

export const SM_EVENTS = {
  QUESTION: 'speed-math:question',
  ANSWER:   'speed-math:answer',
  RESULT:   'speed-math:result',
  FINAL:    'speed-math:final',
} as const

const TOTAL_ROUNDS = 10
const ROUND_TIMEOUT_MS = 8000

interface Question { a: number; b: number; op: string; answer: number; round: number }

function makeQuestion(round: number): Question {
  const ops = round < 4 ? ['+', '-'] : round < 7 ? ['+', '-', '×'] : ['+', '-', '×', '÷']
  const op = ops[Math.floor(Math.random() * ops.length)]!
  let a = 0, b = 0, answer = 0
  if (op === '+') { a = 5 + Math.floor(Math.random() * (10 + round * 4)); b = 5 + Math.floor(Math.random() * (10 + round * 4)); answer = a + b }
  else if (op === '-') { a = 10 + Math.floor(Math.random() * (20 + round * 3)); b = 5 + Math.floor(Math.random() * a); answer = a - b }
  else if (op === '×') { a = 2 + Math.floor(Math.random() * (6 + round)); b = 2 + Math.floor(Math.random() * (6 + round)); answer = a * b }
  else { b = 2 + Math.floor(Math.random() * 9); a = b * (1 + Math.floor(Math.random() * 12)); answer = a / b }
  return { a, b, op, answer, round }
}

export class SpeedMathGame implements GameInstance {
  private ctx: GameContext
  private app: Application
  private ui = createGameUI()

  private stage!: Container
  private questionText!: Text
  private inputDisplay!: Text
  private inputBg!: Graphics
  private hud!: Text
  private feedbackText!: Text

  private currentAnswer = 0
  private currentRound = 0
  private inputStr = ''
  private roundOver = false
  private gameOver = false
  private scores = new Map<string, number>()
  private roundTimer: ReturnType<typeof setTimeout> | null = null
  private answeredThisRound = false

  private readonly LOGIC_W = 700
  private readonly LOGIC_H = 460

  private readonly onQuestion = (msg: NetworkMessage) => {
    const q = msg.payload as Question
    this.currentAnswer = q.answer
    this.currentRound = q.round
    this.inputStr = ''
    this.roundOver = false
    this.answeredThisRound = false
    this.showQuestion(q)
  }

  private readonly onAnswer = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { playerId, value } = msg.payload as { playerId: string; value: number }
    if (this.roundOver) return
    if (value === this.currentAnswer) {
      this.roundOver = true
      if (this.roundTimer) { clearTimeout(this.roundTimer); this.roundTimer = null }
      const score = (this.scores.get(playerId) ?? 0) + 1
      this.scores.set(playerId, score)
      const scoresArr = [...this.scores.entries()].map(([id, s]) => ({ id, score: s }))
      const name = this.ctx.players.getPlayers().find(p => p.id === playerId)?.name ?? '?'
      this.ctx.network.broadcast(SM_EVENTS.RESULT, { winnerId: playerId, winnerName: name, answer: this.currentAnswer, scores: scoresArr })
      this.showResult(playerId, name, scoresArr)
      if (this.currentRound < TOTAL_ROUNDS) {
        setTimeout(() => this.hostStartRound(), 2000)
      } else {
        setTimeout(() => this.hostEndGame(), 2000)
      }
    }
  }

  private readonly onResult = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { winnerId, winnerName, answer, scores } = msg.payload as { winnerId: string; winnerName: string; answer: number; scores: {id:string;score:number}[] }
    this.roundOver = true
    for (const s of scores) this.scores.set(s.id, s.score)
    this.showResult(winnerId, winnerName, scores)
  }

  private readonly onFinal = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { sorted } = msg.payload as { sorted: {id:string;name:string;score:number}[] }
    this.showFinal(sorted)
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (this.gameOver || this.roundOver || this.answeredThisRound) return
    if (e.key >= '0' && e.key <= '9') { this.inputStr += e.key; this.updateInput() }
    else if (e.key === '-' && this.inputStr === '') { this.inputStr = '-'; this.updateInput() }
    else if (e.key === 'Backspace') { this.inputStr = this.inputStr.slice(0, -1); this.updateInput() }
    else if (e.key === 'Enter') this.submitAnswer()
  }

  constructor(context: GameContext) {
    this.ctx = context
    this.app = context.pixiApp as Application
  }

  async init(): Promise<void> {
    for (const p of this.ctx.players.getPlayers()) this.scores.set(p.id, 0)
    this.buildScene()
    this.ctx.network.on(SM_EVENTS.QUESTION, this.onQuestion as never)
    this.ctx.network.on(SM_EVENTS.ANSWER,   this.onAnswer   as never)
    this.ctx.network.on(SM_EVENTS.RESULT,   this.onResult   as never)
    this.ctx.network.on(SM_EVENTS.FINAL,    this.onFinal    as never)
    window.addEventListener('keydown', this.onKeyDown)

    await this.ui.showInstructions(this.ctx, {
      title: '🧮 Speed Math',
      subtitle: `${TOTAL_ROUNDS} rounds — first to answer correctly scores`,
      lines: [
        '➕ A maths problem appears on screen for everyone',
        '⚡ Type the answer and press Enter before anyone else',
        '🎯 Problems get harder each round',
        `🏆 Most points after ${TOTAL_ROUNDS} rounds wins`,
      ],
      controls: 'Type answer with keyboard, press Enter to submit',
      accentColor: 0x30d158,
    })
    await this.ui.countdown(this.ctx)
    this.ui.clear()

    if (this.ctx.network.isHost()) {
      this.hostStartRound()
    }
  }

  update(_dt: number): void {}

  destroy(): void {
    if (this.roundTimer) clearTimeout(this.roundTimer)
    window.removeEventListener('keydown', this.onKeyDown)
    this.ctx.network.off(SM_EVENTS.QUESTION, this.onQuestion as never)
    this.ctx.network.off(SM_EVENTS.ANSWER,   this.onAnswer   as never)
    this.ctx.network.off(SM_EVENTS.RESULT,   this.onResult   as never)
    this.ctx.network.off(SM_EVENTS.FINAL,    this.onFinal    as never)
    this.ui.destroy()
    this.app.stage.removeChildren()
  }

  private hostStartRound(): void {
    this.currentRound++
    const q = makeQuestion(this.currentRound)
    this.currentAnswer = q.answer
    this.roundOver = false
    this.ctx.network.broadcast(SM_EVENTS.QUESTION, q)
    this.showQuestion(q)
    this.roundTimer = setTimeout(() => {
      if (!this.roundOver) {
        this.roundOver = true
        const scoresArr = [...this.scores.entries()].map(([id, s]) => ({ id, score: s }))
        this.ctx.network.broadcast(SM_EVENTS.RESULT, { winnerId: '', winnerName: 'Nobody', answer: this.currentAnswer, scores: scoresArr })
        this.showResult('', 'Nobody', scoresArr)
        if (this.currentRound < TOTAL_ROUNDS) setTimeout(() => this.hostStartRound(), 2000)
        else setTimeout(() => this.hostEndGame(), 2000)
      }
    }, ROUND_TIMEOUT_MS)
  }

  private hostEndGame(): void {
    this.gameOver = true
    const sorted = this.ctx.players.getPlayers()
      .map(p => ({ id: p.id, name: p.name, score: this.scores.get(p.id) ?? 0 }))
      .sort((a, b) => b.score - a.score)
    this.ctx.network.broadcast(SM_EVENTS.FINAL, { sorted })
    this.showFinal(sorted)
  }

  private submitAnswer(): void {
    if (this.roundOver || this.answeredThisRound || !this.inputStr) return
    const value = parseInt(this.inputStr, 10)
    if (isNaN(value)) return
    this.answeredThisRound = true
    const localId = this.ctx.players.getLocalPlayer().id
    if (this.ctx.network.isHost()) {
      this.onAnswer({ event: SM_EVENTS.ANSWER, payload: { playerId: localId, value }, from: localId, timestamp: Date.now() })
    } else {
      this.ctx.network.send(SM_EVENTS.ANSWER, { playerId: localId, value })
    }
  }

  private showQuestion(q: Question): void {
    const { width: W, height: H } = this.app.screen
    this.questionText.text = `${q.a}  ${q.op}  ${q.b}  =  ?`
    this.hud.text = `Round ${q.round} / ${TOTAL_ROUNDS}`
    this.feedbackText.text = ''
    this.inputStr = ''
    this.updateInput()
    this.questionText.position.set(W / 2, H / 2 - 60)
    this.updateScoreHUD()
  }

  private showResult(winnerId: string, winnerName: string, scores: {id:string;score:number}[]): void {
    const localId = this.ctx.players.getLocalPlayer().id
    if (winnerId === '') {
      this.feedbackText.text = `⏰ Time's up! Answer was ${this.currentAnswer}`
      ;(this.feedbackText.style as TextStyle).fill = '#ff9f0a'
      this.ctx.sound.beep(220, 0.1)
    } else if (winnerId === localId) {
      this.feedbackText.text = `✅ Correct! +1 point`
      ;(this.feedbackText.style as TextStyle).fill = '#30d158'
      this.ctx.sound.success()
    } else {
      this.feedbackText.text = `❌ ${winnerName} got it first! (${this.currentAnswer})`
      ;(this.feedbackText.style as TextStyle).fill = '#ff6b6b'
      this.ctx.sound.fail()
    }
    for (const s of scores) this.scores.set(s.id, s.score)
    this.updateScoreHUD()
  }

  private showFinal(sorted: {id:string;name:string;score:number}[]): void {
    this.gameOver = true
    const winner = sorted[0]!
    const scoreStr = sorted.map((s, i) => `${['🥇','🥈','🥉'][i] ?? `${i+1}.`} ${s.name}: ${s.score} pts`).join('  ')
    this.ui.showWinScreen(this.ctx, winner.id, winner.name, scoreStr, 0x30d158)
    if (this.ctx.network.isHost()) {
      this.ctx.stats.record('play')
      const localId = this.ctx.players.getLocalPlayer().id
      if (winner.id === localId) this.ctx.stats.record('win'); else this.ctx.stats.record('loss')
      this.ctx.events.emit('platform:game:ended', {
        gameId: this.ctx.gameId, winnerId: winner.id, durationMs: 0,
        results: sorted.map((s, i) => ({ playerId: s.id, playerName: s.name, rank: i + 1, score: s.score })),
      })
    }
  }

  private updateInput(): void {
    this.inputDisplay.text = this.inputStr || '_'
  }

  private updateScoreHUD(): void {
    const ps = this.ctx.players.getPlayers()
    const line = ps.map(p => `${p.name}: ${this.scores.get(p.id) ?? 0}`).join('   ')
    this.hud.text = `Round ${this.currentRound} / ${TOTAL_ROUNDS}   |   ${line}`
  }

  private buildScene(): void {
    const { width: W, height: H } = this.app.screen
    this.stage = new Container()
    this.app.stage.addChild(this.stage)

    const bg = new Graphics()
    bg.rect(0, 0, W, H).fill(0x08080f)
    this.stage.addChild(bg)

    // Question
    this.questionText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: '"Space Grotesk", monospace',
        fontSize: Math.min(W * 0.12, 88),
        fontWeight: '900',
        fill: '#ffffff',
        align: 'center',
      }),
    })
    this.questionText.anchor.set(0.5)
    this.questionText.position.set(W / 2, H / 2 - 60)
    this.stage.addChild(this.questionText)

    // Input box
    this.inputBg = new Graphics()
    this.inputBg.roundRect(W / 2 - 120, H / 2 + 20, 240, 58, 10)
      .fill({ color: 0x1a1a30 })
      .stroke({ color: 0x00f5ff, width: 2, alpha: 0.5 })
    this.stage.addChild(this.inputBg)

    this.inputDisplay = new Text({
      text: '_',
      style: new TextStyle({
        fontFamily: '"Space Grotesk", monospace',
        fontSize: 36,
        fontWeight: '700',
        fill: '#00f5ff',
        align: 'center',
      }),
    })
    this.inputDisplay.anchor.set(0.5)
    this.inputDisplay.position.set(W / 2, H / 2 + 49)
    this.stage.addChild(this.inputDisplay)

    // Feedback
    this.feedbackText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: '"Space Grotesk", monospace',
        fontSize: 18,
        fill: '#30d158',
        align: 'center',
      }),
    })
    this.feedbackText.anchor.set(0.5)
    this.feedbackText.position.set(W / 2, H / 2 + 106)
    this.stage.addChild(this.feedbackText)

    // HUD
    this.hud = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#4040a0', align: 'center' }),
    })
    this.hud.anchor.set(0.5, 0)
    this.hud.position.set(W / 2, 14)
    this.stage.addChild(this.hud)

    const hint = new Text({
      text: 'Type your answer and press Enter',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 12, fill: '#30306a' }),
    })
    hint.anchor.set(0.5, 1)
    hint.position.set(W / 2, H - 10)
    this.stage.addChild(hint)
  }
}
