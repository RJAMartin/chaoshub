// ─────────────────────────────────────────────────────────────────────────────
// Word Scramble — Game Implementation
//
// Host picks a word and scrambles it. All players race to type the correct
// answer. First to submit the right word scores a point. 10 rounds, most
// points wins.
// ─────────────────────────────────────────────────────────────────────────────
import { Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'

// ── Constants ─────────────────────────────────────────────────────────────────

export const WS_EVENTS = {
  NEW_WORD:  'word-scramble:new-word',
  ANSWER:    'word-scramble:answer',
  ROUND_END: 'word-scramble:round-end',
  FINAL:     'word-scramble:final',
} as const

const TOTAL_ROUNDS = 10
const ROUND_TIMEOUT_MS = 15000
const LOGIC_W = 700
const LOGIC_H = 500

const WORD_LIST = [
  'javascript', 'typescript', 'keyboard', 'network', 'monitor', 'browser',
  'server', 'client', 'router', 'socket', 'package', 'module', 'function',
  'variable', 'constant', 'interface', 'component', 'template', 'promise',
  'callback', 'closure', 'prototype', 'iterable', 'generator', 'async',
  'canvas', 'shader', 'texture', 'pipeline', 'viewport', 'transform',
  'physics', 'collision', 'velocity', 'gravity', 'friction',
]

function scramble(word: string): string {
  const arr = word.split('')
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  // Avoid accidental correct answer
  if (arr.join('') === word && word.length > 1) return scramble(word)
  return arr.join('')
}

// ── Game class ────────────────────────────────────────────────────────────────

export class WordScrambleGame implements GameInstance {
  private ctx: GameContext
  private app: Application

  private stage!: Graphics
  private scrambledText!: Text
  private statusText!: Text
  private roundText!: Text
  private scoreText!: Text
  private inputEl: HTMLInputElement | null = null

  private currentWord = ''
  private round = 0
  private scores = new Map<string, number>()
  private roundWon = false
  private roundTimer: ReturnType<typeof setTimeout> | null = null

  // ── Network ───────────────────────────────────────────────────────────────

  private readonly onNewWord = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { scrambled, round } = msg.payload as { scrambled: string; round: number }
    this.round = round
    this.currentWord = ''
    this.roundWon = false
    this.showRound(scrambled)
  }

  private readonly onAnswer = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { playerId, playerName, answer } = msg.payload as { playerId: string; playerName: string; answer: string }
    if (answer.toLowerCase() === this.currentWord && !this.roundWon) {
      this.roundWon = true
      const prev = this.scores.get(playerId) ?? 0
      this.scores.set(playerId, prev + 1)
      this.endRound(playerId, playerName)
    }
  }

  private readonly onRoundEnd = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { winnerId, winnerName, scores, word } = msg.payload as {
      winnerId: string | null; winnerName: string | null
      scores: { id: string; name: string; score: number }[]; word: string
    }
    for (const s of scores) this.scores.set(s.id, s.score)
    this.showRoundResult(winnerId, winnerName, word)
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
    this.ctx.network.on(WS_EVENTS.NEW_WORD,  this.onNewWord as never)
    this.ctx.network.on(WS_EVENTS.ANSWER,    this.onAnswer as never)
    this.ctx.network.on(WS_EVENTS.ROUND_END, this.onRoundEnd as never)
    this.ctx.network.on(WS_EVENTS.FINAL,     this.onFinal as never)

    // Init score map
    for (const p of this.ctx.players.getPlayers()) this.scores.set(p.id, 0)

    if (this.ctx.network.isHost()) {
      setTimeout(() => this.nextRound(), 600)
    }
  }

  update(_dt: number): void {}

  destroy(): void {
    if (this.roundTimer) clearTimeout(this.roundTimer)
    this.inputEl?.remove()
    this.ctx.network.off(WS_EVENTS.NEW_WORD,  this.onNewWord as never)
    this.ctx.network.off(WS_EVENTS.ANSWER,    this.onAnswer as never)
    this.ctx.network.off(WS_EVENTS.ROUND_END, this.onRoundEnd as never)
    this.ctx.network.off(WS_EVENTS.FINAL,     this.onFinal as never)
    this.app.stage.removeChildren()
  }

  // ── Host logic ────────────────────────────────────────────────────────────

  private nextRound(): void {
    if (this.roundTimer) clearTimeout(this.roundTimer)
    this.round++
    this.roundWon = false

    const word = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)]!
    this.currentWord = word
    const scrambled = scramble(word)

    this.ctx.network.broadcast(WS_EVENTS.NEW_WORD, { scrambled, round: this.round })
    this.showRound(scrambled)

    // Timeout — nobody answered in time
    this.roundTimer = setTimeout(() => {
      if (!this.roundWon) this.endRound(null, null)
    }, ROUND_TIMEOUT_MS)
  }

  private endRound(winnerId: string | null, winnerName: string | null): void {
    if (this.roundTimer) clearTimeout(this.roundTimer)
    const scoresArr = [...this.scores.entries()].map(([id, score]) => {
      const p = this.ctx.players.getPlayers().find(pl => pl.id === id)
      return { id, name: p?.name ?? id, score }
    })
    this.ctx.network.broadcast(WS_EVENTS.ROUND_END, {
      winnerId, winnerName, scores: scoresArr, word: this.currentWord,
    })
    this.showRoundResult(winnerId, winnerName, this.currentWord)

    if (this.round >= TOTAL_ROUNDS) {
      setTimeout(() => this.triggerFinal(), 2500)
    } else {
      setTimeout(() => this.nextRound(), 2500)
    }
  }

  private triggerFinal(): void {
    const sorted = [...this.scores.entries()]
      .map(([id, score]) => {
        const p = this.ctx.players.getPlayers().find(pl => pl.id === id)
        return { id, name: p?.name ?? id, score }
      })
      .sort((a, b) => b.score - a.score)
    this.ctx.network.broadcast(WS_EVENTS.FINAL, { sorted })
    this.showFinal(sorted)
  }

  // ── Scene ─────────────────────────────────────────────────────────────────

  private buildScene(): void {
    this.stage = new Graphics()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    this.app.stage.addChild(this.stage)
    this.scaleStage()

    const title = new Text({
      text: 'WORD SCRAMBLE',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 26, fontWeight: '900', fill: '#00f5ff', letterSpacing: 5 }),
    })
    title.anchor.set(0.5, 0)
    title.position.set(LOGIC_W / 2, 14)
    this.stage.addChild(title)

    this.roundText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 15, fill: '#ffd60a' }),
    })
    this.roundText.anchor.set(0.5, 0)
    this.roundText.position.set(LOGIC_W / 2, 52)
    this.stage.addChild(this.roundText)

    this.scrambledText = new Text({
      text: '...',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 52, fontWeight: '900', fill: '#ffffff', letterSpacing: 8 }),
    })
    this.scrambledText.anchor.set(0.5)
    this.scrambledText.position.set(LOGIC_W / 2, 190)
    this.stage.addChild(this.scrambledText)

    this.statusText = new Text({
      text: 'Unscramble the word!',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 17, fill: '#c0c0e0' }),
    })
    this.statusText.anchor.set(0.5)
    this.statusText.position.set(LOGIC_W / 2, 270)
    this.stage.addChild(this.statusText)

    this.scoreText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#606080' }),
    })
    this.scoreText.anchor.set(0.5, 0)
    this.scoreText.position.set(LOGIC_W / 2, 420)
    this.stage.addChild(this.scoreText)

    this.createInputOverlay()
  }

  private createInputOverlay(): void {
    const canvas = this.app.canvas
    const rect = canvas.getBoundingClientRect()
    const el = document.createElement('input')
    el.type = 'text'
    el.autocomplete = 'off'
    el.spellcheck = false
    el.setAttribute('autocorrect', 'off')
    el.setAttribute('autocapitalize', 'off')
    el.style.cssText = `
      position: fixed;
      left: ${rect.left + rect.width * 0.15}px;
      top:  ${rect.top  + rect.height * 0.72}px;
      width: ${rect.width * 0.7}px;
      height: 44px;
      background: #16162a;
      border: 2px solid #00f5ff44;
      border-radius: 8px;
      color: #e0e0ff;
      font-family: monospace;
      font-size: 22px;
      text-align: center;
      padding: 0 12px;
      outline: none;
      z-index: 9999;
      caret-color: #00f5ff;
    `
    el.placeholder = 'Type your answer…'
    document.body.appendChild(el)
    this.inputEl = el

    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.submitAnswer()
    })
    el.focus()
  }

  private submitAnswer(): void {
    if (!this.inputEl) return
    const answer = this.inputEl.value.trim()
    this.inputEl.value = ''
    if (!answer) return

    const localId = this.ctx.players.getLocalPlayer().id
    const localName = this.ctx.players.getLocalPlayer().name

    if (this.ctx.network.isHost()) {
      if (answer.toLowerCase() === this.currentWord && !this.roundWon) {
        this.roundWon = true
        const prev = this.scores.get(localId) ?? 0
        this.scores.set(localId, prev + 1)
        this.endRound(localId, localName)
      }
    } else {
      this.ctx.network.send(WS_EVENTS.ANSWER, { playerId: localId, playerName: localName, answer })
    }
  }

  private showRound(scrambled: string): void {
    this.roundText.text = `Round ${this.round} / ${TOTAL_ROUNDS}`
    this.scrambledText.text = scrambled.toUpperCase()
    this.statusText.text = 'Unscramble the word! Press Enter to submit.'
    ;(this.statusText.style as TextStyle).fill = '#c0c0e0'
    this.updateScores()
    if (this.inputEl) { this.inputEl.disabled = false; this.inputEl.focus() }
  }

  private showRoundResult(winnerId: string | null, winnerName: string | null, word: string): void {
    if (this.inputEl) this.inputEl.disabled = true
    const localId = this.ctx.players.getLocalPlayer().id
    const iWon = winnerId === localId
    if (winnerId) {
      this.statusText.text = iWon ? `✓ Correct! You scored a point.` : `${winnerName} got it first! (${word})`
      ;(this.statusText.style as TextStyle).fill = iWon ? '#30d158' : '#ff6b6b'
    } else {
      this.statusText.text = `Time's up! The word was: ${word}`
      ;(this.statusText.style as TextStyle).fill = '#ffd60a'
    }
    this.updateScores()
  }

  private updateScores(): void {
    const parts = [...this.scores.entries()]
      .map(([id, score]) => {
        const p = this.ctx.players.getPlayers().find(pl => pl.id === id)
        return `${p?.name ?? id}: ${score}`
      })
    this.scoreText.text = parts.join('  |  ')
  }

  private showFinal(sorted: { id: string; name: string; score: number }[]): void {
    if (this.inputEl) this.inputEl.disabled = true
    this.stage.removeChildren()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)

    const title = new Text({
      text: 'FINAL SCORES',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 34, fontWeight: '900', fill: '#00f5ff', letterSpacing: 4 }),
    })
    title.anchor.set(0.5)
    title.position.set(LOGIC_W / 2, 80)
    this.stage.addChild(title)

    sorted.forEach((p, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
      const t = new Text({
        text: `${medal}  ${p.name.padEnd(14)}  ${p.score} pts`,
        style: new TextStyle({ fontFamily: 'monospace', fontSize: 22, fill: i === 0 ? '#ffd60a' : '#c0c0e0' }),
      })
      t.anchor.set(0.5)
      t.position.set(LOGIC_W / 2, 170 + i * 52)
      this.stage.addChild(t)
    })

    const localId = this.ctx.players.getLocalPlayer().id
    if (this.ctx.network.isHost()) {
      this.ctx.stats.record('play')
      if (sorted[0]?.id === localId) this.ctx.stats.record('win')
      else this.ctx.stats.record('loss')
      this.ctx.events.emit('platform:game:ended', {
        gameId: this.ctx.gameId,
        winnerId: sorted[0]?.id,
        durationMs: 0,
        results: sorted.map((p, i) => ({ playerId: p.id, playerName: p.name, rank: i + 1, score: p.score })),
      })
    }
  }

  private scaleStage(): void {
    const { width: cw, height: ch } = this.app.screen
    const scale = Math.min(cw / LOGIC_W, ch / LOGIC_H) * 0.97
    this.stage.scale.set(scale)
    this.stage.position.set((cw - LOGIC_W * scale) / 2, (ch - LOGIC_H * scale) / 2)
  }
}
