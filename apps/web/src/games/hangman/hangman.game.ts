// Hangman — guess the word letter by letter, 6 wrong guesses allowed
import { Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'

export const HG_EVENTS = { NEW_ROUND: 'hangman:new-round', GUESS: 'hangman:guess', RESULT: 'hangman:result', FINAL: 'hangman:final' } as const
const TOTAL_ROUNDS = 8, MAX_WRONG = 6, LOGIC_W = 700, LOGIC_H = 520

const WORDS = ['elephant','javascript','keyboard','mountain','alchemy','blanket','crystal','dolphin','eclipse','furnace','glacier','harmony','igloo','journey','kitchen','lantern','mystery','nucleus','octopus','penguin','quantum','rainbow','silence','thunder','umbrella','volcano','whisper','xylophone','yoghurt','zeppelin','abstract','balloon','compass','diamond','emerald','fiction','granite','horizon','illusion','jungle','kingdom','labyrinth','meadow','notable','orbital','pyramid','quarter','reptile','saffron','tundra']

export class HangmanGame implements GameInstance {
  private ctx: GameContext; private app: Application
  private stage!: Graphics; private hangmanGfx!: Graphics
  private wordText!: Text; private wrongText!: Text; private roundText!: Text; private scoreText!: Text; private statusText!: Text
  private letterBtns: Map<string, Graphics> = new Map(); private letterLabels: Map<string, Text> = new Map()
  private currentWord = ''; private guessedLetters = new Set<string>(); private wrongGuesses = 0
  private round = 0; private scores = new Map<string, number>(); private roundOver = false
  private roundTimer: ReturnType<typeof setTimeout> | null = null

  private readonly onNewRound = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { round, wordLength } = msg.payload as { round: number; wordLength: number }
    this.round = round; this.currentWord = '_'.repeat(wordLength)
    this.startRound()
  }
  private readonly onResult = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { letter, correct, word, scores, wrongCount } = msg.payload as { letter: string; correct: boolean; word: string; scores: { id: string; score: number }[]; wrongCount: number }
    this.guessedLetters.add(letter); this.wrongGuesses = wrongCount
    if (correct && word) this.currentWord = word
    for (const s of scores) this.scores.set(s.id, s.score)
    this.updateLetterBtn(letter, correct)
    this.redrawHangman(); this.updateWordDisplay(); this.updateScores()
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
    this.ctx.network.on(HG_EVENTS.NEW_ROUND, this.onNewRound as never)
    this.ctx.network.on(HG_EVENTS.RESULT, this.onResult as never)
    this.ctx.network.on(HG_EVENTS.FINAL, this.onFinal as never)
    if (this.ctx.network.isHost()) setTimeout(() => this.nextRound(), 500)
  }

  update(_dt: number): void {}

  destroy(): void {
    if (this.roundTimer) clearTimeout(this.roundTimer)
    this.ctx.network.off(HG_EVENTS.NEW_ROUND, this.onNewRound as never)
    this.ctx.network.off(HG_EVENTS.RESULT, this.onResult as never)
    this.ctx.network.off(HG_EVENTS.FINAL, this.onFinal as never)
    this.app.stage.removeChildren()
  }

  private nextRound(): void {
    if (this.roundTimer) clearTimeout(this.roundTimer)
    this.round++; this.roundOver = false
    this.currentWord = WORDS[Math.floor(Math.random() * WORDS.length)]!
    this.guessedLetters.clear(); this.wrongGuesses = 0
    this.ctx.network.broadcast(HG_EVENTS.NEW_ROUND, { round: this.round, wordLength: this.currentWord.length })
    this.startRound()
    // Auto-end after 120s
    this.roundTimer = setTimeout(() => { if (!this.roundOver) { this.roundOver = true; this.statusText.text = `Time's up! The word was: ${this.currentWord}`; if (this.round >= TOTAL_ROUNDS) setTimeout(() => this.triggerFinal(), 2500); else setTimeout(() => this.nextRound(), 2500) } }, 120000)
  }

  private startRound(): void {
    this.guessedLetters.clear(); this.wrongGuesses = 0
    this.roundText.text = `Round ${this.round}/${TOTAL_ROUNDS}`
    this.statusText.text = 'Click a letter to guess!'
    ;(this.statusText.style as TextStyle).fill = '#c0c0e0'
    // Reset all letter buttons
    for (const [letter, btn] of this.letterBtns) {
      btn.clear()
      btn.roundRect(0, 0, 32, 32, 5).fill(0x1a1a3a)
      btn.roundRect(0, 0, 32, 32, 5).stroke({ width: 1, color: 0x4a4a8a })
      btn.eventMode = 'static'; btn.alpha = 1
      const lbl = this.letterLabels.get(letter)!
      ;(lbl.style as TextStyle).fill = '#c0c0e0'
    }
    this.redrawHangman(); this.updateWordDisplay(); this.updateScores()
  }

  private handleGuess(letter: string): void {
    if (this.roundOver || this.guessedLetters.has(letter)) return
    this.guessedLetters.add(letter)
    const localId = this.ctx.players.getLocalPlayer().id
    if (this.ctx.network.isHost()) this.applyGuess(localId, letter)
    else this.ctx.network.send(HG_EVENTS.GUESS, { playerId: localId, letter })
  }

  private applyGuess(playerId: string, letter: string): void {
    if (this.roundOver) return
    this.guessedLetters.add(letter)
    const correct = this.currentWord.includes(letter)
    if (!correct) this.wrongGuesses++
    const maskedWord = this.currentWord.split('').map(c => this.guessedLetters.has(c) ? c : '_').join('')
    const solved = !maskedWord.includes('_')
    if (solved || (!correct && this.wrongGuesses >= MAX_WRONG)) {
      if (solved) this.scores.set(playerId, (this.scores.get(playerId) ?? 0) + 1)
      this.roundOver = true
    }
    const scoresArr = [...this.scores.entries()].map(([id, score]) => ({ id, score }))
    this.ctx.network.broadcast(HG_EVENTS.RESULT, { letter, correct, word: maskedWord, scores: scoresArr, wrongCount: this.wrongGuesses })
    this.guessedLetters.add(letter)
    this.updateLetterBtn(letter, correct)
    this.redrawHangman()
    this.currentWord = this.roundOver ? this.currentWord : maskedWord
    this.updateWordDisplay(); this.updateScores()
    if (this.roundOver) {
      this.statusText.text = solved ? `✓ Solved! (${this.currentWord})` : `💀 The word was: ${this.currentWord}`
      ;(this.statusText.style as TextStyle).fill = solved ? '#30d158' : '#ff2d78'
      if (this.round >= TOTAL_ROUNDS) setTimeout(() => this.triggerFinal(), 2500)
      else setTimeout(() => this.nextRound(), 2500)
    }
  }

  private triggerFinal(): void {
    const sorted = this.ctx.players.getPlayers().map(p => ({ id: p.id, name: p.name, score: this.scores.get(p.id) ?? 0 })).sort((a, b) => b.score - a.score)
    this.ctx.network.broadcast(HG_EVENTS.FINAL, { sorted }); this.showFinal(sorted)
  }

  private buildScene(): void {
    this.stage = new Graphics(); this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    this.app.stage.addChild(this.stage); this.scaleStage()
    const title = new Text({ text: 'HANGMAN', style: new TextStyle({ fontFamily: 'monospace', fontSize: 26, fontWeight: '900', fill: '#00f5ff', letterSpacing: 5 }) })
    title.anchor.set(0.5, 0); title.position.set(LOGIC_W / 2, 10); this.stage.addChild(title)
    this.roundText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#ffd60a' }) })
    this.roundText.anchor.set(1, 0); this.roundText.position.set(LOGIC_W - 10, 12); this.stage.addChild(this.roundText)
    this.hangmanGfx = new Graphics(); this.hangmanGfx.position.set(30, 40); this.stage.addChild(this.hangmanGfx)
    this.wordText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 32, fontWeight: '700', fill: '#ffffff', letterSpacing: 10 }) })
    this.wordText.anchor.set(0.5); this.wordText.position.set(LOGIC_W / 2, 170); this.stage.addChild(this.wordText)
    this.wrongText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 14, fill: '#ff6b6b' }) })
    this.wrongText.anchor.set(0.5); this.wrongText.position.set(LOGIC_W / 2, 210); this.stage.addChild(this.wrongText)
    this.statusText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 14, fill: '#c0c0e0' }) })
    this.statusText.anchor.set(0.5); this.statusText.position.set(LOGIC_W / 2, 230); this.stage.addChild(this.statusText)
    this.scoreText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 12, fill: '#606080' }) })
    this.scoreText.anchor.set(0.5, 1); this.scoreText.position.set(LOGIC_W / 2, LOGIC_H - 6); this.stage.addChild(this.scoreText)
    // Alphabet buttons
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const btnW = 32, btnGap = 4, perRow = 13
    const startX = (LOGIC_W - perRow * (btnW + btnGap)) / 2
    letters.split('').forEach((l, i) => {
      const col = i % perRow; const row = Math.floor(i / perRow)
      const x = startX + col * (btnW + btnGap); const y = 252 + row * (btnW + btnGap + 2)
      const btn = new Graphics()
      btn.roundRect(x, y, btnW, btnW, 5).fill(0x1a1a3a)
      btn.roundRect(x, y, btnW, btnW, 5).stroke({ width: 1, color: 0x4a4a8a })
      btn.eventMode = 'static'; btn.cursor = 'pointer'
      btn.on('pointerdown', () => this.handleGuess(l.toLowerCase()))
      this.stage.addChild(btn); this.letterBtns.set(l.toLowerCase(), btn)
      const lbl = new Text({ text: l, style: new TextStyle({ fontFamily: 'monospace', fontSize: 14, fontWeight: '700', fill: '#c0c0e0' }) })
      lbl.anchor.set(0.5); lbl.position.set(x + btnW / 2, y + btnW / 2); this.stage.addChild(lbl); this.letterLabels.set(l.toLowerCase(), lbl)
    })
  }

  private redrawHangman(): void {
    const g = this.hangmanGfx; g.clear()
    // Gallows
    g.moveTo(0, 160).lineTo(80, 160).stroke({ width: 3, color: 0x6a6a9a })
    g.moveTo(40, 160).lineTo(40, 10).stroke({ width: 3, color: 0x6a6a9a })
    g.moveTo(40, 10).lineTo(100, 10).stroke({ width: 3, color: 0x6a6a9a })
    g.moveTo(100, 10).lineTo(100, 30).stroke({ width: 3, color: 0x6a6a9a })
    const w = this.wrongGuesses
    if (w >= 1) g.circle(100, 48, 18).stroke({ width: 3, color: 0xff6b6b })
    if (w >= 2) g.moveTo(100, 66).lineTo(100, 110).stroke({ width: 3, color: 0xff6b6b })
    if (w >= 3) g.moveTo(100, 78).lineTo(76, 100).stroke({ width: 3, color: 0xff6b6b })
    if (w >= 4) g.moveTo(100, 78).lineTo(124, 100).stroke({ width: 3, color: 0xff6b6b })
    if (w >= 5) g.moveTo(100, 110).lineTo(76, 140).stroke({ width: 3, color: 0xff6b6b })
    if (w >= 6) g.moveTo(100, 110).lineTo(124, 140).stroke({ width: 3, color: 0xff6b6b })
    this.wrongText.text = `Wrong: ${this.wrongGuesses}/${MAX_WRONG}`
  }

  private updateWordDisplay(): void {
    const display = this.ctx.network.isHost() && !this.roundOver
      ? this.currentWord.split('').map(c => this.guessedLetters.has(c) ? c : '_').join(' ')
      : this.currentWord.split('').join(' ')
    this.wordText.text = display
  }

  private updateLetterBtn(letter: string, correct: boolean): void {
    const btn = this.letterBtns.get(letter); const lbl = this.letterLabels.get(letter)
    if (!btn || !lbl) return
    btn.clear()
    if (correct) { btn.roundRect(0, 0, 32, 32, 5).fill(0x0d2a0d); btn.roundRect(0, 0, 32, 32, 5).stroke({ width: 1, color: 0x30d158 }); (lbl.style as TextStyle).fill = '#30d158' }
    else { btn.roundRect(0, 0, 32, 32, 5).fill(0x2a0d0d); btn.roundRect(0, 0, 32, 32, 5).stroke({ width: 1, color: 0xff2d78 }); (lbl.style as TextStyle).fill = '#ff2d78' }
    btn.eventMode = 'none'
  }

  private updateScores(): void {
    const ps = this.ctx.players.getPlayers()
    this.scoreText.text = ps.map(p => `${p.name}: ${this.scores.get(p.id) ?? 0}`).join('  |  ')
  }

  private showFinal(sorted: { id: string; name: string; score: number }[]): void {
    this.stage.removeChildren(); this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    const t = new Text({ text: 'HANGMAN', style: new TextStyle({ fontFamily: 'monospace', fontSize: 32, fontWeight: '900', fill: '#00f5ff' }) })
    t.anchor.set(0.5); t.position.set(LOGIC_W / 2, 80); this.stage.addChild(t)
    sorted.forEach((p, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
      const row = new Text({ text: `${medal}  ${p.name.padEnd(14)}  ${p.score} pts`, style: new TextStyle({ fontFamily: 'monospace', fontSize: 22, fill: i === 0 ? '#ffd60a' : '#c0c0e0' }) })
      row.anchor.set(0.5); row.position.set(LOGIC_W / 2, 160 + i * 52); this.stage.addChild(row)
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
    this.stage.scale.set(scale); this.stage.position.set((cw - LOGIC_W * scale) / 2, (ch - LOGIC_H * scale) / 2)
  }
}
