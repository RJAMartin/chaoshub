// ─────────────────────────────────────────────────────────────────────────────
// Wordle Race — 5-letter word, 6 guesses, first to solve wins
//
// Host picks a secret 5-letter word. All players guess simultaneously.
// Each guess returns per-letter hints: correct (green), present (yellow),
// absent (grey). First player to guess the word wins the round.
// 5 rounds total.
// ─────────────────────────────────────────────────────────────────────────────
import { Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'

export const WR_EVENTS = {
  NEW_ROUND:  'wordle-race:new-round',
  GUESS:      'wordle-race:guess',
  HINT:       'wordle-race:hint',
  ROUND_END:  'wordle-race:round-end',
  FINAL:      'wordle-race:final',
} as const

const TOTAL_ROUNDS = 5
const MAX_GUESSES = 6
const LOGIC_W = 800
const LOGIC_H = 580
const CELL = 54
const GAP = 6

type Hint = 'correct' | 'present' | 'absent'

const WORDS = [
  'crane','slate','audio','shire','blend','crypt','flown','grave','jazzy','kneel',
  'mourn','plumb','squat','trove','vouch','waltz','xerox','yacht','zippy','abbey',
  'blaze','chime','dowry','expel','flame','globe','hedge','ingot','joust','knave',
  'lymph','mirth','notch','optic','prism','quest','rebel','scorn','thumb','ulcer',
  'vapor','weave','xylem','yearn','zesty','altar','boxer','cubic','delve','ember',
  'facet','gripe','horde','ivory','joker','karma','leech','maple','nerve','oaken',
  'pearl','query','rivet','scald','thorn','untie','vivid','wreck','x-ray','yodel',
]

function getHints(guess: string, answer: string): Hint[] {
  const hints: Hint[] = Array(5).fill('absent')
  const answerArr = answer.split('')
  const guessArr = guess.split('')
  // First pass: correct
  for (let i = 0; i < 5; i++) {
    if (guessArr[i] === answerArr[i]) { hints[i] = 'correct'; answerArr[i] = '#'; guessArr[i] = '*' }
  }
  // Second pass: present
  for (let i = 0; i < 5; i++) {
    if (guessArr[i] === '*') continue
    const j = answerArr.indexOf(guessArr[i]!)
    if (j !== -1) { hints[i] = 'present'; answerArr[j] = '#' }
  }
  return hints
}

const HINT_COLORS: Record<Hint, number> = { correct: 0x538d4e, present: 0xb59f3b, absent: 0x3a3a3c }
const HINT_BORDER: Record<Hint, number> = { correct: 0x6aaa64, present: 0xc9b458, absent: 0x565758 }

interface PlayerBoard {
  guesses: string[]
  hints: Hint[][]
  solved: boolean
}

export class WordleRaceGame implements GameInstance {
  private ctx: GameContext
  private app: Application

  private stage!: Graphics
  private boardContainers: Map<string, Graphics> = new Map()
  private roundText!: Text
  private statusText!: Text
  private scoreText!: Text
  private inputEl: HTMLInputElement | null = null

  private answer = ''
  private round = 0
  private scores = new Map<string, number>()
  private playerBoards = new Map<string, PlayerBoard>()
  private players: { id: string; name: string }[] = []
  private roundOver = false

  // ── Network ───────────────────────────────────────────────────────────────

  private readonly onNewRound = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { round } = msg.payload as { round: number }
    this.round = round
    this.answer = ''
    this.roundOver = false
    this.initBoards()
    this.rebuildBoardScene()
    this.updateUI()
    if (this.inputEl) { this.inputEl.value = ''; this.inputEl.disabled = false; this.inputEl.focus() }
  }

  private readonly onGuess = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { playerId, guess } = msg.payload as { playerId: string; guess: string }
    this.processGuess(playerId, guess)
  }

  private readonly onHint = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { playerId, guess, hints, solved } = msg.payload as { playerId: string; guess: string; hints: Hint[]; solved: boolean }
    const board = this.playerBoards.get(playerId)
    if (!board) return
    board.guesses.push(guess)
    board.hints.push(hints)
    board.solved = solved
    this.redrawBoard(playerId)
  }

  private readonly onRoundEnd = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { winnerId, winnerName, answer, scores } = msg.payload as { winnerId: string | null; winnerName: string | null; answer: string; scores: { id: string; score: number }[] }
    this.answer = answer
    this.roundOver = true
    for (const s of scores) this.scores.set(s.id, s.score)
    if (this.inputEl) this.inputEl.disabled = true
    this.statusText.text = winnerId
      ? (winnerId === this.ctx.players.getLocalPlayer().id ? `✓ You solved it! (${answer})` : `${winnerName} solved it! (${answer})`)
      : `Nobody solved it. Word was: ${answer}`
    ;(this.statusText.style as TextStyle).fill = winnerId === this.ctx.players.getLocalPlayer().id ? '#30d158' : '#ff6b6b'
    this.updateUI()
  }

  private readonly onFinal = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { sorted } = msg.payload as { sorted: { id: string; name: string; score: number }[] }
    this.showFinal(sorted)
  }

  constructor(context: GameContext) { this.ctx = context; this.app = context.pixiApp as Application }

  async init(): Promise<void> {
    this.players = this.ctx.players.getPlayers().map(p => ({ id: p.id, name: p.name }))
    for (const p of this.players) this.scores.set(p.id, 0)
    this.initBoards()
    this.buildScene()
    this.ctx.network.on(WR_EVENTS.NEW_ROUND,  this.onNewRound as never)
    this.ctx.network.on(WR_EVENTS.GUESS,      this.onGuess as never)
    this.ctx.network.on(WR_EVENTS.HINT,       this.onHint as never)
    this.ctx.network.on(WR_EVENTS.ROUND_END,  this.onRoundEnd as never)
    this.ctx.network.on(WR_EVENTS.FINAL,      this.onFinal as never)
    if (this.ctx.network.isHost()) setTimeout(() => this.nextRound(), 600)
  }

  update(_dt: number): void {}

  destroy(): void {
    this.inputEl?.remove()
    this.ctx.network.off(WR_EVENTS.NEW_ROUND,  this.onNewRound as never)
    this.ctx.network.off(WR_EVENTS.GUESS,      this.onGuess as never)
    this.ctx.network.off(WR_EVENTS.HINT,       this.onHint as never)
    this.ctx.network.off(WR_EVENTS.ROUND_END,  this.onRoundEnd as never)
    this.ctx.network.off(WR_EVENTS.FINAL,      this.onFinal as never)
    this.app.stage.removeChildren()
  }

  // ── Host logic ────────────────────────────────────────────────────────────

  private nextRound(): void {
    this.round++
    this.roundOver = false
    this.answer = WORDS[Math.floor(Math.random() * WORDS.length)]!
    this.initBoards()
    this.ctx.network.broadcast(WR_EVENTS.NEW_ROUND, { round: this.round })
    this.rebuildBoardScene()
    this.updateUI()
    if (this.inputEl) { this.inputEl.value = ''; this.inputEl.disabled = false; this.inputEl.focus() }
    // Auto-end after all 6 guesses used by everyone or timeout
    setTimeout(() => { if (!this.roundOver) this.endRound(null, null) }, MAX_GUESSES * 15000)
  }

  private processGuess(playerId: string, guess: string): void {
    if (this.roundOver) return
    const board = this.playerBoards.get(playerId)
    if (!board || board.solved || board.guesses.length >= MAX_GUESSES) return
    const hints = getHints(guess, this.answer)
    const solved = guess === this.answer
    board.guesses.push(guess)
    board.hints.push(hints)
    board.solved = solved
    this.redrawBoard(playerId)
    this.ctx.network.broadcast(WR_EVENTS.HINT, { playerId, guess, hints, solved })
    if (solved) {
      this.roundOver = true
      const p = this.players.find(pl => pl.id === playerId)!
      this.scores.set(playerId, (this.scores.get(playerId) ?? 0) + 1)
      this.endRound(playerId, p.name)
    } else {
      // Check if all players exhausted guesses
      const allDone = [...this.playerBoards.values()].every(b => b.solved || b.guesses.length >= MAX_GUESSES)
      if (allDone) this.endRound(null, null)
    }
  }

  private endRound(winnerId: string | null, winnerName: string | null): void {
    this.roundOver = true
    if (this.inputEl) this.inputEl.disabled = true
    const scoresArr = [...this.scores.entries()].map(([id, score]) => ({ id, score }))
    this.ctx.network.broadcast(WR_EVENTS.ROUND_END, { winnerId, winnerName, answer: this.answer, scores: scoresArr })
    this.statusText.text = winnerId
      ? (winnerId === this.ctx.players.getLocalPlayer().id ? `✓ You solved it! (${this.answer})` : `${winnerName} solved it! (${this.answer})`)
      : `Nobody solved it. Word was: ${this.answer}`
    ;(this.statusText.style as TextStyle).fill = winnerId === this.ctx.players.getLocalPlayer().id ? '#30d158' : '#ff6b6b'
    this.updateUI()
    if (this.round >= TOTAL_ROUNDS) setTimeout(() => this.triggerFinal(), 3000)
    else setTimeout(() => this.nextRound(), 3500)
  }

  private triggerFinal(): void {
    const sorted = this.players.map(p => ({ id: p.id, name: p.name, score: this.scores.get(p.id) ?? 0 })).sort((a, b) => b.score - a.score)
    this.ctx.network.broadcast(WR_EVENTS.FINAL, { sorted })
    this.showFinal(sorted)
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  private submitGuess(): void {
    if (!this.inputEl || this.roundOver) return
    const guess = this.inputEl.value.trim().toLowerCase()
    if (guess.length !== 5 || !/^[a-z]+$/.test(guess)) return
    this.inputEl.value = ''
    const localId = this.ctx.players.getLocalPlayer().id
    if (this.ctx.network.isHost()) this.processGuess(localId, guess)
    else this.ctx.network.send(WR_EVENTS.GUESS, { playerId: localId, guess })
  }

  // ── Scene ─────────────────────────────────────────────────────────────────

  private initBoards(): void {
    for (const p of this.players) {
      this.playerBoards.set(p.id, { guesses: [], hints: [], solved: false })
    }
  }

  private buildScene(): void {
    this.stage = new Graphics()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x121213)
    this.app.stage.addChild(this.stage)
    this.scaleStage()

    const title = new Text({ text: 'WORDLE RACE', style: new TextStyle({ fontFamily: 'monospace', fontSize: 26, fontWeight: '900', fill: '#ffffff', letterSpacing: 5 }) })
    title.anchor.set(0.5, 0); title.position.set(LOGIC_W / 2, 12); this.stage.addChild(title)

    this.roundText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 14, fill: '#818384' }) })
    this.roundText.anchor.set(0, 0); this.roundText.position.set(14, 16); this.stage.addChild(this.roundText)

    this.statusText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 16, fill: '#c0c0e0', align: 'center', wordWrap: true, wordWrapWidth: LOGIC_W - 40 }) })
    this.statusText.anchor.set(0.5, 0); this.statusText.position.set(LOGIC_W / 2, 48); this.stage.addChild(this.statusText)

    this.scoreText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#818384' }) })
    this.scoreText.anchor.set(0.5, 1); this.scoreText.position.set(LOGIC_W / 2, LOGIC_H - 8); this.stage.addChild(this.scoreText)

    this.rebuildBoardScene()
    this.createInputOverlay()
  }

  private rebuildBoardScene(): void {
    for (const g of this.boardContainers.values()) g.parent?.removeChild(g)
    this.boardContainers.clear()

    const count = this.players.length || 1
    const boardW = 5 * (CELL + GAP) - GAP
    const totalW = count * boardW + (count - 1) * 20
    const startX = (LOGIC_W - totalW) / 2

    this.players.forEach((p, idx) => {
      const g = new Graphics()
      g.position.set(startX + idx * (boardW + 20), 76)
      this.stage.addChild(g)
      this.boardContainers.set(p.id, g)
      const name = new Text({ text: p.name.slice(0, 8), style: new TextStyle({ fontFamily: 'monospace', fontSize: 12, fill: '#818384' }) })
      name.anchor.set(0.5, 0); name.position.set(boardW / 2, 0); g.addChild(name)
      // Draw empty grid
      for (let row = 0; row < MAX_GUESSES; row++) {
        for (let col = 0; col < 5; col++) {
          const cell = new Graphics()
          cell.roundRect(col * (CELL + GAP), 20 + row * (CELL + GAP), CELL, CELL, 4).fill(0x121213)
          cell.roundRect(col * (CELL + GAP), 20 + row * (CELL + GAP), CELL, CELL, 4).stroke({ width: 2, color: 0x3a3a3c })
          g.addChild(cell)
        }
      }
    })
    this.updateBoards()
  }

  private updateBoards(): void {
    for (const [id] of this.playerBoards) this.redrawBoard(id)
  }

  private redrawBoard(playerId: string): void {
    const g = this.boardContainers.get(playerId)
    const board = this.playerBoards.get(playerId)
    if (!g || !board) return
    // Clear and redraw filled rows
    // Remove all but the name label (child 0)
    while (g.children.length > 1) g.removeChildAt(1)

    for (let row = 0; row < MAX_GUESSES; row++) {
      const guess = board.guesses[row]
      const hints = board.hints[row]
      for (let col = 0; col < 5; col++) {
        const x = col * (CELL + GAP); const y = 20 + row * (CELL + GAP)
        const cell = new Graphics()
        if (guess && hints) {
          const hint = hints[col]!
          cell.roundRect(x, y, CELL, CELL, 4).fill(HINT_COLORS[hint])
          cell.roundRect(x, y, CELL, CELL, 4).stroke({ width: 2, color: HINT_BORDER[hint] })
          const letter = new Text({ text: guess[col]!.toUpperCase(), style: new TextStyle({ fontFamily: 'monospace', fontSize: 22, fontWeight: '900', fill: '#ffffff' }) })
          letter.anchor.set(0.5); letter.position.set(x + CELL / 2, y + CELL / 2)
          g.addChild(cell); g.addChild(letter)
        } else {
          cell.roundRect(x, y, CELL, CELL, 4).fill(0x121213)
          cell.roundRect(x, y, CELL, CELL, 4).stroke({ width: 2, color: 0x3a3a3c })
          g.addChild(cell)
        }
      }
    }
  }

  private updateUI(): void {
    this.roundText.text = `Round ${this.round}/${TOTAL_ROUNDS}`
    const parts = this.players.map(p => `${p.name}: ${this.scores.get(p.id) ?? 0}`).join('  |  ')
    this.scoreText.text = parts
  }

  private createInputOverlay(): void {
    const canvas = this.app.canvas; const rect = canvas.getBoundingClientRect()
    const el = document.createElement('input')
    el.type = 'text'; el.maxLength = 5; el.autocomplete = 'off'; el.spellcheck = false
    el.setAttribute('autocorrect', 'off'); el.setAttribute('autocapitalize', 'off')
    el.style.cssText = `position:fixed;left:${rect.left + rect.width * 0.3}px;top:${rect.top + rect.height * 0.88}px;width:${rect.width * 0.4}px;height:48px;background:#121213;border:2px solid #565758;border-radius:8px;color:#ffffff;font-family:monospace;font-size:26px;font-weight:900;text-align:center;letter-spacing:8px;padding:0 12px;outline:none;z-index:9999;text-transform:uppercase;`
    el.placeholder = 'GUESS'
    document.body.appendChild(el); this.inputEl = el
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.submitGuess()
      // Block non-alpha
      if (e.key.length === 1 && !/[a-zA-Z]/.test(e.key)) e.preventDefault()
    })
    el.focus()
  }

  private showFinal(sorted: { id: string; name: string; score: number }[]): void {
    this.inputEl?.remove(); this.inputEl = null
    this.stage.removeChildren(); this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x121213)
    const title = new Text({ text: 'WORDLE RACE', style: new TextStyle({ fontFamily: 'monospace', fontSize: 34, fontWeight: '900', fill: '#ffffff', letterSpacing: 4 }) })
    title.anchor.set(0.5); title.position.set(LOGIC_W / 2, 80); this.stage.addChild(title)
    sorted.forEach((p, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
      const t = new Text({ text: `${medal}  ${p.name.padEnd(14)}  ${p.score} pts`, style: new TextStyle({ fontFamily: 'monospace', fontSize: 22, fill: i === 0 ? '#538d4e' : '#c0c0e0' }) })
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
    this.stage.scale.set(scale); this.stage.position.set((cw - LOGIC_W * scale) / 2, (ch - LOGIC_H * scale) / 2)
  }
}
