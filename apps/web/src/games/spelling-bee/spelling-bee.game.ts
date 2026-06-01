// Spelling Bee — Scrambled word + category hint, first to spell it wins
import { Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'

export const SB_EVENTS = {
  NEW_ROUND: 'spelling-bee:new-round',
  ANSWER: 'spelling-bee:answer',
  ROUND_END: 'spelling-bee:round-end',
  FINAL: 'spelling-bee:final',
} as const

const LOGIC_W = 700, LOGIC_H = 480, TOTAL_ROUNDS = 10, ROUND_MS = 20000

const WORDS: { word: string; category: string }[] = [
  { word: 'elephant', category: 'Animal' }, { word: 'giraffe', category: 'Animal' },
  { word: 'dolphin', category: 'Animal' }, { word: 'penguin', category: 'Animal' },
  { word: 'butterfly', category: 'Animal' }, { word: 'crocodile', category: 'Animal' },
  { word: 'rhinoceros', category: 'Animal' }, { word: 'chimpanzee', category: 'Animal' },
  { word: 'broccoli', category: 'Food' }, { word: 'avocado', category: 'Food' },
  { word: 'spaghetti', category: 'Food' }, { word: 'chocolate', category: 'Food' },
  { word: 'strawberry', category: 'Food' }, { word: 'cinnamon', category: 'Food' },
  { word: 'cauliflower', category: 'Food' }, { word: 'mayonnaise', category: 'Food' },
  { word: 'molecule', category: 'Science' }, { word: 'chemistry', category: 'Science' },
  { word: 'telescope', category: 'Science' }, { word: 'hypothesis', category: 'Science' },
  { word: 'algorithm', category: 'Technology' }, { word: 'database', category: 'Technology' },
  { word: 'encryption', category: 'Technology' }, { word: 'bandwidth', category: 'Technology' },
  { word: 'javascript', category: 'Technology' }, { word: 'typescript', category: 'Technology' },
  { word: 'orchestra', category: 'Music' }, { word: 'symphony', category: 'Music' },
  { word: 'percussion', category: 'Music' }, { word: 'saxophone', category: 'Music' },
  { word: 'geography', category: 'School' }, { word: 'arithmetic', category: 'School' },
  { word: 'archaeology', category: 'Science' }, { word: 'phenomenon', category: 'Science' },
  { word: 'parliament', category: 'Politics' }, { word: 'constitution', category: 'Politics' },
  { word: 'mediterranean', category: 'Geography' }, { word: 'bangladesh', category: 'Geography' },
  { word: 'fluorescent', category: 'Science' }, { word: 'bureaucracy', category: 'Politics' },
]

function scramble(word: string): string {
  const arr = word.split('')
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[arr[i], arr[j]] = [arr[j]!, arr[i]!] }
  if (arr.join('') === word && word.length > 1) return scramble(word)
  return arr.join('')
}

export class SpellingBeeGame implements GameInstance {
  private ctx: GameContext; private app: Application
  private stage!: Graphics
  private scrambledText!: Text
  private categoryText!: Text
  private statusText!: Text
  private roundText!: Text
  private timerText!: Text
  private scoreText!: Text
  private inputEl: HTMLInputElement | null = null

  private currentWord = ''
  private round = 0
  private scores = new Map<string, number>()
  private roundWon = false
  private roundTimer: ReturnType<typeof setTimeout> | null = null
  private tickInterval: ReturnType<typeof setInterval> | null = null
  private roundStart = 0
  private usedIndices = new Set<number>()

  private readonly onNewRound = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { scrambled, category, round } = msg.payload as { scrambled: string; category: string; round: number }
    this.round = round; this.roundWon = false
    this.showRound(scrambled, category)
  }

  private readonly onRoundEnd = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { winnerId, winnerName, word, scores } = msg.payload as {
      winnerId: string | null; winnerName: string | null; word: string
      scores: { id: string; name: string; score: number }[]
    }
    for (const s of scores) this.scores.set(s.id, s.score)
    if (this.inputEl) this.inputEl.disabled = true
    const localId = this.ctx.players.getLocalPlayer().id
    this.statusText.text = winnerId ? (winnerId === localId ? `✓ Correct! "${word}"` : `${winnerName} got it! "${word}"`) : `Time's up! "${word}"`
    ;(this.statusText.style as TextStyle).fill = winnerId === localId ? '#30d158' : '#ffd60a'
    this.updateScores()
  }

  private readonly onFinalMsg = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { sorted } = msg.payload as { sorted: { id: string; name: string; score: number }[] }
    this.showFinal(sorted)
  }

  private readonly onAnswer = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost() || this.roundWon) return
    const { playerId, playerName, answer } = msg.payload as { playerId: string; playerName: string; answer: string }
    if (answer.toLowerCase().trim() === this.currentWord) {
      this.roundWon = true
      this.scores.set(playerId, (this.scores.get(playerId) ?? 0) + 1)
      this.endRound(playerId, playerName)
    }
  }

  constructor(context: GameContext) { this.ctx = context; this.app = context.pixiApp as Application }

  async init(): Promise<void> {
    for (const p of this.ctx.players.getPlayers()) this.scores.set(p.id, 0)
    this.buildScene()
    this.ctx.network.on(SB_EVENTS.NEW_ROUND, this.onNewRound as never)
    this.ctx.network.on(SB_EVENTS.ANSWER, this.onAnswer as never)
    this.ctx.network.on(SB_EVENTS.ROUND_END, this.onRoundEnd as never)
    this.ctx.network.on(SB_EVENTS.FINAL, this.onFinalMsg as never)
    if (this.ctx.network.isHost()) setTimeout(() => this.nextRound(), 600)
  }

  update(_dt: number): void {}

  destroy(): void {
    if (this.roundTimer) clearTimeout(this.roundTimer)
    if (this.tickInterval) clearInterval(this.tickInterval)
    this.inputEl?.remove()
    this.ctx.network.off(SB_EVENTS.NEW_ROUND, this.onNewRound as never)
    this.ctx.network.off(SB_EVENTS.ANSWER, this.onAnswer as never)
    this.ctx.network.off(SB_EVENTS.ROUND_END, this.onRoundEnd as never)
    this.ctx.network.off(SB_EVENTS.FINAL, this.onFinalMsg as never)
    this.app.stage.removeChildren()
  }

  private nextRound(): void {
    if (this.roundTimer) clearTimeout(this.roundTimer)
    if (this.tickInterval) clearInterval(this.tickInterval)
    this.round++; this.roundWon = false
    let idx: number
    do { idx = Math.floor(Math.random() * WORDS.length) }
    while (this.usedIndices.has(idx) && this.usedIndices.size < WORDS.length)
    this.usedIndices.add(idx)
    const entry = WORDS[idx]!
    this.currentWord = entry.word
    const sc = scramble(entry.word)
    this.roundStart = Date.now()
    this.ctx.network.broadcast(SB_EVENTS.NEW_ROUND, { scrambled: sc, category: entry.category, round: this.round })
    this.showRound(sc, entry.category)
    this.tickInterval = setInterval(() => {
      const left = Math.max(0, Math.round((ROUND_MS - (Date.now() - this.roundStart)) / 1000))
      this.timerText.text = `${left}s`
      ;(this.timerText.style as TextStyle).fill = left <= 5 ? '#ff2d78' : '#ffd60a'
    }, 500)
    this.roundTimer = setTimeout(() => { if (!this.roundWon) this.endRound(null, null) }, ROUND_MS)
  }

  private submitAnswer(ans: string): void {
    if (this.roundWon) return
    const localId = this.ctx.players.getLocalPlayer().id
    const localName = this.ctx.players.getLocalPlayer().name
    if (this.ctx.network.isHost()) {
      if (ans.toLowerCase().trim() === this.currentWord) {
        this.roundWon = true
        this.scores.set(localId, (this.scores.get(localId) ?? 0) + 1)
        this.endRound(localId, localName)
      }
    } else {
      this.ctx.network.send(SB_EVENTS.ANSWER, { playerId: localId, playerName: localName, answer: ans })
    }
  }

  private endRound(winnerId: string | null, winnerName: string | null): void {
    if (this.roundTimer) clearTimeout(this.roundTimer)
    if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = null }
    const scoresArr = [...this.scores.entries()].map(([id, score]) => { const p = this.ctx.players.getPlayers().find(pl => pl.id === id); return { id, name: p?.name ?? id, score } })
    this.ctx.network.broadcast(SB_EVENTS.ROUND_END, { winnerId, winnerName, word: this.currentWord, scores: scoresArr })
    if (this.inputEl) this.inputEl.disabled = true
    const localId = this.ctx.players.getLocalPlayer().id
    this.statusText.text = winnerId ? (winnerId === localId ? `✓ Correct! "${this.currentWord}"` : `${winnerName} got it! "${this.currentWord}"`) : `Time's up! "${this.currentWord}"`
    ;(this.statusText.style as TextStyle).fill = winnerId === localId ? '#30d158' : '#ffd60a'
    this.updateScores()
    if (this.round >= TOTAL_ROUNDS) setTimeout(() => this.triggerFinal(), 2500)
    else setTimeout(() => this.nextRound(), 2500)
  }

  private triggerFinal(): void {
    const sorted = [...this.scores.entries()]
      .map(([id, score]) => { const p = this.ctx.players.getPlayers().find(pl => pl.id === id); return { id, name: p?.name ?? id, score } })
      .sort((a, b) => b.score - a.score)
    this.ctx.network.broadcast(SB_EVENTS.FINAL, { sorted })
    this.showFinal(sorted)
  }

  private buildScene(): void {
    this.stage = new Graphics()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    this.app.stage.addChild(this.stage); this.scaleStage()

    const title = new Text({ text: 'SPELLING BEE 🐝', style: new TextStyle({ fontFamily: 'monospace', fontSize: 24, fontWeight: '900', fill: '#ffd60a', letterSpacing: 4 }) })
    title.anchor.set(0.5, 0); title.position.set(LOGIC_W / 2, 12); this.stage.addChild(title)

    this.roundText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#ffd60a' }) })
    this.roundText.anchor.set(0, 0); this.roundText.position.set(16, 14); this.stage.addChild(this.roundText)

    this.timerText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#ffd60a' }) })
    this.timerText.anchor.set(1, 0); this.timerText.position.set(LOGIC_W - 16, 14); this.stage.addChild(this.timerText)

    this.categoryText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 16, fill: '#00f5ff' }) })
    this.categoryText.anchor.set(0.5, 0); this.categoryText.position.set(LOGIC_W / 2, 55); this.stage.addChild(this.categoryText)

    this.scrambledText = new Text({ text: '...', style: new TextStyle({ fontFamily: 'monospace', fontSize: 52, fontWeight: '900', fill: '#ffffff', letterSpacing: 8 }) })
    this.scrambledText.anchor.set(0.5); this.scrambledText.position.set(LOGIC_W / 2, 170); this.stage.addChild(this.scrambledText)

    this.statusText = new Text({ text: 'Unscramble the word!', style: new TextStyle({ fontFamily: 'monospace', fontSize: 16, fill: '#c0c0e0' }) })
    this.statusText.anchor.set(0.5, 0); this.statusText.position.set(LOGIC_W / 2, 250); this.stage.addChild(this.statusText)

    this.scoreText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#606080' }) })
    this.scoreText.anchor.set(0.5, 0); this.scoreText.position.set(LOGIC_W / 2, 390); this.stage.addChild(this.scoreText)

    this.createInputOverlay()
  }

  private createInputOverlay(): void {
    const canvas = this.app.canvas; const rect = canvas.getBoundingClientRect()
    const el = document.createElement('input')
    el.type = 'text'; el.autocomplete = 'off'; el.spellcheck = false
    el.setAttribute('autocorrect', 'off'); el.setAttribute('autocapitalize', 'off')
    el.placeholder = 'Spell it correctly, press Enter'
    el.style.cssText = `position:fixed;left:${rect.left + rect.width * 0.15}px;top:${rect.top + rect.height * 0.73}px;width:${rect.width * 0.7}px;height:42px;background:#16162a;border:2px solid #ffd60a44;border-radius:8px;color:#e0e0ff;font-family:monospace;font-size:20px;text-align:center;padding:0 12px;outline:none;z-index:9999;caret-color:#ffd60a;`
    document.body.appendChild(el); this.inputEl = el
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const v = el.value.trim(); if (v) { this.submitAnswer(v); el.value = '' } } })
    el.focus()
  }

  private showRound(scrambled: string, category: string): void {
    this.roundText.text = `Round ${this.round}/${TOTAL_ROUNDS}`
    this.scrambledText.text = scrambled.toUpperCase()
    this.categoryText.text = `Category: ${category}`
    this.statusText.text = 'Unscramble and spell it correctly!'
    ;(this.statusText.style as TextStyle).fill = '#c0c0e0'
    this.timerText.text = `${ROUND_MS / 1000}s`
    this.updateScores()
    if (this.inputEl) { this.inputEl.disabled = false; this.inputEl.value = ''; this.inputEl.focus() }
  }

  private updateScores(): void {
    const parts = [...this.scores.entries()].map(([id, score]) => { const p = this.ctx.players.getPlayers().find(pl => pl.id === id); return `${p?.name ?? id}: ${score}` })
    this.scoreText.text = parts.join('  |  ')
  }

  private showFinal(sorted: { id: string; name: string; score: number }[]): void {
    if (this.inputEl) this.inputEl.disabled = true
    this.stage.removeChildren()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    const t = new Text({ text: 'FINAL SCORES', style: new TextStyle({ fontFamily: 'monospace', fontSize: 32, fontWeight: '900', fill: '#ffd60a', letterSpacing: 4 }) })
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
