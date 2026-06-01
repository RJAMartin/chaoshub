// ─────────────────────────────────────────────────────────────────────────────
// Memory Match — shared flip-card board, fastest to clear wins
//
// A 6×4 grid of 24 cards (12 pairs). Players take turns flipping two cards.
// A match keeps them face-up and scores the player a point.
// No match: cards flip back. When all pairs are found the top scorer wins.
// Host-authority: broadcasts board state after each flip.
// ─────────────────────────────────────────────────────────────────────────────
import { Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'

export const MM_EVENTS = {
  INIT:   'memory-match:init',
  FLIP:   'memory-match:flip',
  STATE:  'memory-match:state',
  FINAL:  'memory-match:final',
} as const

const COLS = 6
const ROWS = 4
const TOTAL = COLS * ROWS  // 24 cards
const CARD_W = 88
const CARD_H = 70
const GAP = 10
const LOGIC_W = COLS * (CARD_W + GAP) + GAP + 120  // extra for score panel
const LOGIC_H = ROWS * (CARD_H + GAP) + GAP + 90

const SYMBOLS = ['🍎', '🍊', '🍋', '🍇', '🍓', '🍒', '🍑', '🥝', '🍍', '🥭', '🍌', '🍉']

interface CardState { symbol: string; flipped: boolean; matched: boolean }

export class MemoryMatchGame implements GameInstance {
  private ctx: GameContext
  private app: Application

  private stage!: Graphics
  private cardGfx: Graphics[] = []
  private cardTexts: Text[] = []
  private turnText!: Text
  private scoreText!: Text

  private cards: CardState[] = []
  private scores = new Map<string, number>()
  private flipped: number[] = []   // indices of currently face-up unmatched cards
  private turnIndex = 0
  private players: { id: string; name: string }[] = []
  private lockInput = false

  private readonly onInit = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { cards, turnIndex } = msg.payload as { cards: CardState[]; turnIndex: number }
    this.cards = cards; this.turnIndex = turnIndex
    this.redrawAll(); this.updateUI()
  }

  private readonly onFlip = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { playerId, cardIdx } = msg.payload as { playerId: string; cardIdx: number }
    const current = this.players[this.turnIndex]
    if (current?.id !== playerId) return
    this.applyFlip(cardIdx)
  }

  private readonly onState = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { cards, turnIndex, scores, flipped } = msg.payload as { cards: CardState[]; turnIndex: number; scores: { id: string; score: number }[]; flipped: number[] }
    this.cards = cards; this.turnIndex = turnIndex; this.flipped = flipped
    for (const s of scores) this.scores.set(s.id, s.score)
    this.redrawAll(); this.updateUI()
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
    this.buildScene()
    this.ctx.network.on(MM_EVENTS.INIT,  this.onInit as never)
    this.ctx.network.on(MM_EVENTS.FLIP,  this.onFlip as never)
    this.ctx.network.on(MM_EVENTS.STATE, this.onState as never)
    this.ctx.network.on(MM_EVENTS.FINAL, this.onFinal as never)

    if (this.ctx.network.isHost()) {
      this.initBoard()
      setTimeout(() => {
        this.ctx.network.broadcast(MM_EVENTS.INIT, { cards: this.cards, turnIndex: this.turnIndex })
        this.redrawAll(); this.updateUI()
      }, 500)
    }
  }

  update(_dt: number): void {}

  destroy(): void {
    this.ctx.network.off(MM_EVENTS.INIT,  this.onInit as never)
    this.ctx.network.off(MM_EVENTS.FLIP,  this.onFlip as never)
    this.ctx.network.off(MM_EVENTS.STATE, this.onState as never)
    this.ctx.network.off(MM_EVENTS.FINAL, this.onFinal as never)
    this.app.stage.removeChildren()
  }

  private initBoard(): void {
    const syms = [...SYMBOLS, ...SYMBOLS]  // 24 cards, 12 pairs
    // Shuffle
    for (let i = syms.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[syms[i], syms[j]] = [syms[j]!, syms[i]!] }
    this.cards = syms.map(s => ({ symbol: s, flipped: false, matched: false }))
  }

  private applyFlip(cardIdx: number): void {
    if (this.lockInput) return
    const card = this.cards[cardIdx]
    if (!card || card.flipped || card.matched) return
    card.flipped = true
    this.flipped.push(cardIdx)

    const broadcast = () => this.ctx.network.broadcast(MM_EVENTS.STATE, {
      cards: this.cards, turnIndex: this.turnIndex,
      scores: [...this.scores.entries()].map(([id, score]) => ({ id, score })),
      flipped: this.flipped,
    })
    broadcast()
    this.redrawAll(); this.updateUI()

    if (this.flipped.length === 2) {
      this.lockInput = true
      const [a, b] = this.flipped as [number, number]
      setTimeout(() => {
        if (this.cards[a]!.symbol === this.cards[b]!.symbol) {
          // Match!
          this.cards[a]!.matched = true; this.cards[b]!.matched = true
          const current = this.players[this.turnIndex]!
          this.scores.set(current.id, (this.scores.get(current.id) ?? 0) + 1)
        } else {
          this.cards[a]!.flipped = false; this.cards[b]!.flipped = false
          this.turnIndex = (this.turnIndex + 1) % this.players.length
        }
        this.flipped = []
        this.lockInput = false

        if (this.cards.every(c => c.matched)) {
          const sorted = this.players.map(p => ({ id: p.id, name: p.name, score: this.scores.get(p.id) ?? 0 })).sort((a, b) => b.score - a.score)
          this.ctx.network.broadcast(MM_EVENTS.FINAL, { sorted })
          this.showFinal(sorted)
        } else {
          broadcast()
          this.redrawAll(); this.updateUI()
        }
      }, 900)
    }
  }

  private buildScene(): void {
    this.stage = new Graphics()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    this.app.stage.addChild(this.stage)
    this.scaleStage()

    const title = new Text({ text: 'MEMORY MATCH', style: new TextStyle({ fontFamily: 'monospace', fontSize: 22, fontWeight: '900', fill: '#00f5ff', letterSpacing: 4 }) })
    title.anchor.set(0.5, 0); title.position.set(LOGIC_W / 2, 10); this.stage.addChild(title)

    this.turnText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 14, fill: '#c0c0e0' }) })
    this.turnText.anchor.set(0.5, 0); this.turnText.position.set(LOGIC_W / 2, 40); this.stage.addChild(this.turnText)

    this.scoreText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#606080' }) })
    this.scoreText.anchor.set(0.5, 0); this.scoreText.position.set(LOGIC_W / 2, 60); this.stage.addChild(this.scoreText)

    const offsetX = GAP
    const offsetY = 82

    for (let i = 0; i < TOTAL; i++) {
      const col = i % COLS; const row = Math.floor(i / COLS)
      const x = offsetX + col * (CARD_W + GAP); const y = offsetY + row * (CARD_H + GAP)
      const g = new Graphics()
      g.roundRect(x, y, CARD_W, CARD_H, 8).fill(0x16162a)
      g.roundRect(x, y, CARD_W, CARD_H, 8).stroke({ width: 1.5, color: 0x2a2a50 })
      g.eventMode = 'static'; g.cursor = 'pointer'; g.on('pointerdown', () => this.handleCardClick(i))
      this.stage.addChild(g); this.cardGfx.push(g)

      const t = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 28 }) })
      t.anchor.set(0.5); t.position.set(x + CARD_W / 2, y + CARD_H / 2)
      this.stage.addChild(t); this.cardTexts.push(t)
    }
  }

  private handleCardClick(idx: number): void {
    if (this.lockInput) return
    const current = this.players[this.turnIndex]
    const localId = this.ctx.players.getLocalPlayer().id
    if (current?.id !== localId) return
    if (this.ctx.network.isHost()) this.applyFlip(idx)
    else this.ctx.network.send(MM_EVENTS.FLIP, { playerId: localId, cardIdx: idx })
  }

  private redrawAll(): void {
    const offsetX = GAP; const offsetY = 82
    for (let i = 0; i < TOTAL; i++) {
      const col = i % COLS; const row = Math.floor(i / COLS)
      const x = offsetX + col * (CARD_W + GAP); const y = offsetY + row * (CARD_H + GAP)
      const card = this.cards[i]; const g = this.cardGfx[i]!; const t = this.cardTexts[i]!
      if (!card) continue
      g.clear()
      if (card.matched) {
        g.roundRect(x, y, CARD_W, CARD_H, 8).fill(0x0d2a0d)
        g.roundRect(x, y, CARD_W, CARD_H, 8).stroke({ width: 2, color: 0x30d158 })
        t.text = card.symbol
      } else if (card.flipped) {
        g.roundRect(x, y, CARD_W, CARD_H, 8).fill(0x1a1a3a)
        g.roundRect(x, y, CARD_W, CARD_H, 8).stroke({ width: 2, color: 0x00f5ff })
        t.text = card.symbol
      } else {
        g.roundRect(x, y, CARD_W, CARD_H, 8).fill(0x16162a)
        g.roundRect(x, y, CARD_W, CARD_H, 8).stroke({ width: 1.5, color: 0x2a2a50 })
        t.text = '?'
      }
    }
  }

  private updateUI(): void {
    const current = this.players[this.turnIndex]
    const localId = this.ctx.players.getLocalPlayer().id
    this.turnText.text = current ? `${current.name}'s turn` : ''
    ;(this.turnText.style as TextStyle).fill = current?.id === localId ? '#30d158' : '#c0c0e0'
    const parts = this.players.map(p => `${p.name}: ${this.scores.get(p.id) ?? 0}`).join('  |  ')
    this.scoreText.text = parts
  }

  private showFinal(sorted: { id: string; name: string; score: number }[]): void {
    this.stage.removeChildren(); this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    const title = new Text({ text: 'BOARD CLEARED!', style: new TextStyle({ fontFamily: 'monospace', fontSize: 32, fontWeight: '900', fill: '#00f5ff', letterSpacing: 3 }) })
    title.anchor.set(0.5); title.position.set(LOGIC_W / 2, 80); this.stage.addChild(title)
    sorted.forEach((p, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
      const t = new Text({ text: `${medal}  ${p.name.padEnd(14)}  ${p.score} pairs`, style: new TextStyle({ fontFamily: 'monospace', fontSize: 22, fill: i === 0 ? '#ffd60a' : '#c0c0e0' }) })
      t.anchor.set(0.5); t.position.set(LOGIC_W / 2, 170 + i * 52); this.stage.addChild(t)
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
    this.stage.scale.set(scale)
    this.stage.position.set((cw - LOGIC_W * scale) / 2, (ch - LOGIC_H * scale) / 2)
  }
}
