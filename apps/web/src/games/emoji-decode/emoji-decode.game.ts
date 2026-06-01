// Emoji Decode — Decode emoji puzzles representing movies/shows/phrases
import { Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'

export const ED_EVENTS = {
  NEW_ROUND: 'emoji-decode:new-round',
  ANSWER: 'emoji-decode:answer',
  ROUND_END: 'emoji-decode:round-end',
  FINAL: 'emoji-decode:final',
} as const

const LOGIC_W = 700, LOGIC_H = 500, TOTAL_ROUNDS = 10, ROUND_MS = 30000

const PUZZLES: { emojis: string; answer: string; hint: string }[] = [
  { emojis: '🦁👑', answer: 'the lion king', hint: 'Disney movie' },
  { emojis: '🕷️👨', answer: 'spider-man', hint: 'Marvel superhero' },
  { emojis: '🧊❄️👸', answer: 'frozen', hint: 'Disney movie' },
  { emojis: '🐟🔍', answer: 'finding nemo', hint: 'Pixar movie' },
  { emojis: '🤖🤝', answer: 'wall-e', hint: 'Pixar robot' },
  { emojis: '🪄⚡🧙', answer: 'harry potter', hint: 'Wizard school' },
  { emojis: '💍🔥🌋', answer: 'lord of the rings', hint: 'Epic fantasy' },
  { emojis: '⭐🌌🚀', answer: 'star wars', hint: 'Space opera' },
  { emojis: '🦈🌊😱', answer: 'jaws', hint: 'Spielberg thriller' },
  { emojis: '🦕🏝️🔬', answer: 'jurassic park', hint: 'Dinosaur park' },
  { emojis: '🕰️⬅️🚗', answer: 'back to the future', hint: 'Time travel' },
  { emojis: '🌹👹', answer: 'beauty and the beast', hint: 'Disney fairy tale' },
  { emojis: '🧜‍♀️🌊', answer: 'the little mermaid', hint: 'Underwater princess' },
  { emojis: '🦇🤵🌃', answer: 'batman', hint: 'DC superhero' },
  { emojis: '🕶️💊🔴🔵', answer: 'the matrix', hint: 'Choose the pill' },
  { emojis: '🚢🌊💘🧊', answer: 'titanic', hint: 'Ship tragedy' },
  { emojis: '👻🍕🏙️', answer: 'ghostbusters', hint: 'Who ya gonna call' },
  { emojis: '🦅🥊🇺🇸', answer: 'captain america', hint: 'Marvel hero' },
  { emojis: '🐉🔥👸🗡️', answer: 'game of thrones', hint: 'TV dragons' },
  { emojis: '💀☠️🏴‍☠️⚓', answer: 'pirates of the caribbean', hint: 'Jack Sparrow' },
  { emojis: '🐻🍯🌲', answer: 'winnie the pooh', hint: 'Hundred Acre Wood' },
  { emojis: '🐠🌊🐙', answer: 'finding dory', hint: 'Pixar sequel' },
  { emojis: '🤸‍♀️🎪🐘', answer: 'dumbo', hint: 'Flying elephant' },
  { emojis: '🧸❤️🚀', answer: 'toy story', hint: 'Woody and Buzz' },
  { emojis: '🍄🎮👨🔧', answer: 'super mario', hint: 'Nintendo plumber' },
  { emojis: '🧝🏹🌳', answer: 'lord of the rings', hint: 'Legolas' },
  { emojis: '🐺🌕👨', answer: 'twilight', hint: 'Vampires vs werewolves' },
  { emojis: '🕵️🔎🔬💀', answer: 'sherlock holmes', hint: 'Baker Street detective' },
  { emojis: '🌪️🏠👠', answer: 'wizard of oz', hint: 'Follow the yellow brick road' },
  { emojis: '🧟🌍🔫🏃', answer: 'the walking dead', hint: 'Zombie TV show' },
  { emojis: '🦸‍♀️⚡⭐', answer: 'wonder woman', hint: 'DC superhero' },
  { emojis: '🚂🎄⛄🎁', answer: 'polar express', hint: 'Christmas train' },
]

export class EmojiDecodeGame implements GameInstance {
  private ctx: GameContext; private app: Application
  private stage!: Graphics
  private emojiText!: Text
  private statusText!: Text
  private roundText!: Text
  private timerText!: Text
  private scoreText!: Text
  private hintText!: Text
  private inputEl: HTMLInputElement | null = null

  private currentAnswer = ''
  private round = 0
  private scores = new Map<string, number>()
  private roundWon = false
  private roundTimer: ReturnType<typeof setTimeout> | null = null
  private tickInterval: ReturnType<typeof setInterval> | null = null
  private roundStart = 0
  private usedIndices = new Set<number>()

  private readonly onNewRound = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { emojis, hint, round } = msg.payload as { emojis: string; hint: string; round: number }
    this.round = round; this.roundWon = false
    this.showRound(emojis, hint)
  }

  private readonly onRoundEnd = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { winnerId, winnerName, answer, scores } = msg.payload as {
      winnerId: string | null; winnerName: string | null; answer: string
      scores: { id: string; name: string; score: number }[]
    }
    for (const s of scores) this.scores.set(s.id, s.score)
    if (this.inputEl) this.inputEl.disabled = true
    const localId = this.ctx.players.getLocalPlayer().id
    this.statusText.text = winnerId ? (winnerId === localId ? `✓ Correct! "${answer}"` : `${winnerName} got it! "${answer}"`) : `Time's up! "${answer}"`
    ;(this.statusText.style as TextStyle).fill = winnerId === localId ? '#30d158' : '#ffd60a'
    this.updateScores()
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
    this.ctx.network.on(ED_EVENTS.NEW_ROUND, this.onNewRound as never)
    this.ctx.network.on(ED_EVENTS.ROUND_END, this.onRoundEnd as never)
    this.ctx.network.on(ED_EVENTS.FINAL, this.onFinalMsg as never)
    if (this.ctx.network.isHost()) setTimeout(() => this.nextRound(), 600)
  }

  update(_dt: number): void {}

  destroy(): void {
    if (this.roundTimer) clearTimeout(this.roundTimer)
    if (this.tickInterval) clearInterval(this.tickInterval)
    this.inputEl?.remove()
    this.ctx.network.off(ED_EVENTS.NEW_ROUND, this.onNewRound as never)
    this.ctx.network.off(ED_EVENTS.ROUND_END, this.onRoundEnd as never)
    this.ctx.network.off(ED_EVENTS.FINAL, this.onFinalMsg as never)
    this.app.stage.removeChildren()
  }

  private nextRound(): void {
    if (this.roundTimer) clearTimeout(this.roundTimer)
    if (this.tickInterval) clearInterval(this.tickInterval)
    this.round++; this.roundWon = false
    let idx: number
    do { idx = Math.floor(Math.random() * PUZZLES.length) }
    while (this.usedIndices.has(idx) && this.usedIndices.size < PUZZLES.length)
    this.usedIndices.add(idx)
    const puzzle = PUZZLES[idx]!
    this.currentAnswer = puzzle.answer
    this.roundStart = Date.now()
    this.ctx.network.broadcast(ED_EVENTS.NEW_ROUND, { emojis: puzzle.emojis, hint: puzzle.hint, round: this.round })
    this.showRound(puzzle.emojis, puzzle.hint)
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
      if (ans.toLowerCase().trim() === this.currentAnswer) {
        this.roundWon = true
        this.scores.set(localId, (this.scores.get(localId) ?? 0) + 1)
        this.endRound(localId, localName)
      }
    } else {
      this.ctx.network.send(ED_EVENTS.ANSWER, { playerId: localId, playerName: localName, answer: ans })
    }
  }

  private readonly onAnswer = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost() || this.roundWon) return
    const { playerId, playerName, answer } = msg.payload as { playerId: string; playerName: string; answer: string }
    if (answer.toLowerCase().trim() === this.currentAnswer) {
      this.roundWon = true
      this.scores.set(playerId, (this.scores.get(playerId) ?? 0) + 1)
      this.endRound(playerId, playerName)
    }
  }

  private endRound(winnerId: string | null, winnerName: string | null): void {
    if (this.roundTimer) clearTimeout(this.roundTimer)
    if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = null }
    const scoresArr = [...this.scores.entries()].map(([id, score]) => { const p = this.ctx.players.getPlayers().find(pl => pl.id === id); return { id, name: p?.name ?? id, score } })
    this.ctx.network.broadcast(ED_EVENTS.ROUND_END, { winnerId, winnerName, answer: this.currentAnswer, scores: scoresArr })
    if (this.inputEl) this.inputEl.disabled = true
    const localId = this.ctx.players.getLocalPlayer().id
    this.statusText.text = winnerId ? (winnerId === localId ? `✓ Correct! "${this.currentAnswer}"` : `${winnerName} got it! "${this.currentAnswer}"`) : `Time's up! "${this.currentAnswer}"`
    ;(this.statusText.style as TextStyle).fill = winnerId === localId ? '#30d158' : '#ffd60a'
    this.updateScores()
    if (this.round >= TOTAL_ROUNDS) setTimeout(() => this.triggerFinal(), 2500)
    else setTimeout(() => this.nextRound(), 2500)
  }

  private triggerFinal(): void {
    const sorted = [...this.scores.entries()]
      .map(([id, score]) => { const p = this.ctx.players.getPlayers().find(pl => pl.id === id); return { id, name: p?.name ?? id, score } })
      .sort((a, b) => b.score - a.score)
    this.ctx.network.broadcast(ED_EVENTS.FINAL, { sorted })
    this.showFinal(sorted)
  }

  private buildScene(): void {
    this.stage = new Graphics()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    this.app.stage.addChild(this.stage); this.scaleStage()

    const title = new Text({ text: 'EMOJI DECODE', style: new TextStyle({ fontFamily: 'monospace', fontSize: 24, fontWeight: '900', fill: '#ffd60a', letterSpacing: 5 }) })
    title.anchor.set(0.5, 0); title.position.set(LOGIC_W / 2, 12); this.stage.addChild(title)

    this.roundText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#ffd60a' }) })
    this.roundText.anchor.set(0, 0); this.roundText.position.set(16, 14); this.stage.addChild(this.roundText)

    this.timerText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#ffd60a' }) })
    this.timerText.anchor.set(1, 0); this.timerText.position.set(LOGIC_W - 16, 14); this.stage.addChild(this.timerText)

    this.emojiText = new Text({ text: '🤔', style: new TextStyle({ fontSize: 64 }) })
    this.emojiText.anchor.set(0.5, 0); this.emojiText.position.set(LOGIC_W / 2, 60); this.stage.addChild(this.emojiText)

    this.hintText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 16, fill: '#909090' }) })
    this.hintText.anchor.set(0.5, 0); this.hintText.position.set(LOGIC_W / 2, 175); this.stage.addChild(this.hintText)

    this.statusText = new Text({ text: 'What does this emoji sequence mean?', style: new TextStyle({ fontFamily: 'monospace', fontSize: 16, fill: '#c0c0e0', wordWrap: true, wordWrapWidth: 600 }) })
    this.statusText.anchor.set(0.5, 0); this.statusText.position.set(LOGIC_W / 2, 210); this.stage.addChild(this.statusText)

    this.scoreText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#606080' }) })
    this.scoreText.anchor.set(0.5, 0); this.scoreText.position.set(LOGIC_W / 2, 420); this.stage.addChild(this.scoreText)

    this.createInputOverlay()
  }

  private createInputOverlay(): void {
    const canvas = this.app.canvas; const rect = canvas.getBoundingClientRect()
    const el = document.createElement('input')
    el.type = 'text'; el.autocomplete = 'off'; el.spellcheck = false
    el.setAttribute('autocorrect', 'off'); el.setAttribute('autocapitalize', 'off')
    el.placeholder = 'Type your answer, press Enter'
    el.style.cssText = `position:fixed;left:${rect.left + rect.width * 0.1}px;top:${rect.top + rect.height * 0.82}px;width:${rect.width * 0.8}px;height:42px;background:#16162a;border:2px solid #ffd60a44;border-radius:8px;color:#e0e0ff;font-family:monospace;font-size:20px;text-align:center;padding:0 12px;outline:none;z-index:9999;caret-color:#ffd60a;`
    document.body.appendChild(el); this.inputEl = el
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const v = el.value.trim(); if (v) { this.submitAnswer(v); el.value = '' } } })
    el.focus()
  }

  private showRound(emojis: string, hint: string): void {
    this.roundText.text = `Round ${this.round}/${TOTAL_ROUNDS}`
    this.emojiText.text = emojis
    this.hintText.text = `Hint: ${hint}`
    this.statusText.text = 'What does this emoji sequence represent?'
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
      row.anchor.set(0.5); row.position.set(LOGIC_W / 2, 170 + i * 52); this.stage.addChild(row)
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
