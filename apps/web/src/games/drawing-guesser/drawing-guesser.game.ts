// ─────────────────────────────────────────────────────────────────────────────
// Drawing Guesser — Pictionary-style
//
// Each round one player is the "Drawer" (rotates each round).
// The Drawer sees the secret word and draws on a shared HTML canvas overlay.
// Other players type guesses. First to guess correctly scores a point.
// Drawer earns a bonus point when someone guesses correctly.
// 8 rounds (one round per player, cycling if needed).
// ─────────────────────────────────────────────────────────────────────────────
import { Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'

export const DG_EVENTS = {
  ROUND_START: 'drawing-guesser:round-start',
  STROKE:      'drawing-guesser:stroke',
  CLEAR:       'drawing-guesser:clear',
  GUESS:       'drawing-guesser:guess',
  ROUND_END:   'drawing-guesser:round-end',
  FINAL:       'drawing-guesser:final',
} as const

const TOTAL_ROUNDS = 8
const ROUND_MS = 60000
const LOGIC_W = 900
const LOGIC_H = 580

const WORDS = [
  'cat', 'dog', 'house', 'tree', 'car', 'boat', 'sun', 'moon', 'star', 'fish',
  'bird', 'flower', 'mountain', 'river', 'clock', 'phone', 'book', 'chair', 'table',
  'apple', 'banana', 'pizza', 'guitar', 'airplane', 'rocket', 'robot', 'dragon',
  'castle', 'bridge', 'beach', 'volcano', 'rainbow', 'snowman', 'umbrella',
]

interface StrokePoint { x: number; y: number; pressure?: number }

export class DrawingGuesserGame implements GameInstance {
  private ctx: GameContext
  private app: Application

  private stage!: Graphics
  private hudText!: Text
  private timerText!: Text
  private wordText!: Text
  private guessLog: Text[] = []
  private statusText!: Text

  // HTML canvas overlay for drawing
  private drawCanvas: HTMLCanvasElement | null = null
  private drawCtx2d: CanvasRenderingContext2D | null = null
  private inputEl: HTMLInputElement | null = null

  private round = 0
  private scores = new Map<string, number>()
  private players: { id: string; name: string }[] = []
  private drawerIndex = 0
  private currentWord = ''
  private roundTimer: ReturnType<typeof setTimeout> | null = null
  private tickInterval: ReturnType<typeof setInterval> | null = null
  private timeLeft = 0
  private guessedThisRound = new Set<string>()
  private guessLogLines: string[] = []

  // Drawing state
  private isDrawing = false
  private lastX = 0; private lastY = 0
  private brushColor = '#000000'
  private brushSize = 6

  // ── Network ───────────────────────────────────────────────────────────────

  private readonly onRoundStart = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { round, drawerIndex, wordLength } = msg.payload as { round: number; drawerIndex: number; wordLength: number }
    this.round = round; this.drawerIndex = drawerIndex
    this.currentWord = '_'.repeat(wordLength)
    this.guessedThisRound.clear(); this.guessLogLines = []
    this.timeLeft = ROUND_MS / 1000
    this.clearDrawCanvas()
    this.updateHud()
    this.wordText.text = this.isLocalDrawer() ? '(you are drawing)' : `Word: ${'_ '.repeat(wordLength).trim()}`
    if (this.inputEl) { this.inputEl.disabled = this.isLocalDrawer(); this.inputEl.placeholder = this.isLocalDrawer() ? 'You are drawing!' : 'Type your guess…' }
    this.setDrawingEnabled(this.isLocalDrawer())
  }

  private readonly onStroke = (msg: NetworkMessage) => {
    if (this.isLocalDrawer()) return
    const { points, color, size } = msg.payload as { points: StrokePoint[]; color: string; size: number }
    const c = this.drawCtx2d; if (!c || points.length < 2) return
    c.strokeStyle = color; c.lineWidth = size; c.lineCap = 'round'; c.lineJoin = 'round'
    c.beginPath(); c.moveTo(points[0]!.x, points[0]!.y)
    for (const p of points.slice(1)) c.lineTo(p.x, p.y)
    c.stroke()
  }

  private readonly onClear = (_msg: NetworkMessage) => { this.clearDrawCanvas() }

  private readonly onGuess = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { playerId, playerName, guess } = msg.payload as { playerId: string; playerName: string; guess: string }
    if (this.guessedThisRound.has(playerId)) return
    const isCorrect = guess.toLowerCase().trim() === this.currentWord.toLowerCase()
    if (isCorrect) {
      this.guessedThisRound.add(playerId)
      this.scores.set(playerId, (this.scores.get(playerId) ?? 0) + 1)
      // Drawer bonus
      const drawer = this.players[this.drawerIndex]
      if (drawer) this.scores.set(drawer.id, (this.scores.get(drawer.id) ?? 0) + 1)
      this.broadcastGuessResult(playerName, true)
      // End round early if everyone guessed
      const guessers = this.players.filter(p => p.id !== drawer?.id)
      if (this.guessedThisRound.size >= guessers.length) this.endRound()
    } else {
      this.broadcastGuessResult(playerName, false)
    }
  }

  private readonly onRoundEnd = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { word, scores } = msg.payload as { word: string; scores: { id: string; score: number }[] }
    for (const s of scores) this.scores.set(s.id, s.score)
    this.currentWord = word
    this.addGuessLog(`Round over! Word was: ${word}`)
    this.wordText.text = `Answer: ${word}`
    this.updateHud()
  }

  private readonly onFinal = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { sorted } = msg.payload as { sorted: { id: string; name: string; score: number }[] }
    this.showFinal(sorted)
  }

  // ── Constructor ───────────────────────────────────────────────────────────

  constructor(context: GameContext) { this.ctx = context; this.app = context.pixiApp as Application }

  async init(): Promise<void> {
    this.players = this.ctx.players.getPlayers().map(p => ({ id: p.id, name: p.name }))
    for (const p of this.players) this.scores.set(p.id, 0)
    this.buildScene()
    this.ctx.network.on(DG_EVENTS.ROUND_START, this.onRoundStart as never)
    this.ctx.network.on(DG_EVENTS.STROKE,      this.onStroke as never)
    this.ctx.network.on(DG_EVENTS.CLEAR,       this.onClear as never)
    this.ctx.network.on(DG_EVENTS.GUESS,       this.onGuess as never)
    this.ctx.network.on(DG_EVENTS.ROUND_END,   this.onRoundEnd as never)
    this.ctx.network.on(DG_EVENTS.FINAL,       this.onFinal as never)
    if (this.ctx.network.isHost()) setTimeout(() => this.nextRound(), 600)
  }

  update(_dt: number): void {}

  destroy(): void {
    if (this.roundTimer) clearTimeout(this.roundTimer)
    if (this.tickInterval) clearInterval(this.tickInterval)
    this.drawCanvas?.remove()
    this.inputEl?.remove()
    this.ctx.network.off(DG_EVENTS.ROUND_START, this.onRoundStart as never)
    this.ctx.network.off(DG_EVENTS.STROKE,      this.onStroke as never)
    this.ctx.network.off(DG_EVENTS.CLEAR,       this.onClear as never)
    this.ctx.network.off(DG_EVENTS.GUESS,       this.onGuess as never)
    this.ctx.network.off(DG_EVENTS.ROUND_END,   this.onRoundEnd as never)
    this.ctx.network.off(DG_EVENTS.FINAL,       this.onFinal as never)
    this.app.stage.removeChildren()
  }

  // ── Host logic ────────────────────────────────────────────────────────────

  private nextRound(): void {
    if (this.roundTimer) clearTimeout(this.roundTimer)
    if (this.tickInterval) clearInterval(this.tickInterval)
    this.round++; this.guessedThisRound.clear(); this.guessLogLines = []
    this.drawerIndex = (this.round - 1) % this.players.length
    this.currentWord = WORDS[Math.floor(Math.random() * WORDS.length)]!
    this.timeLeft = ROUND_MS / 1000
    this.ctx.network.broadcast(DG_EVENTS.ROUND_START, { round: this.round, drawerIndex: this.drawerIndex, wordLength: this.currentWord.length })
    this.ctx.network.broadcast(DG_EVENTS.CLEAR, {})
    this.clearDrawCanvas()
    this.guessLogLines = []
    this.updateHud()
    this.wordText.text = this.isLocalDrawer() ? `Draw: ${this.currentWord.toUpperCase()}` : `Word: ${'_ '.repeat(this.currentWord.length).trim()}`
    if (this.inputEl) { this.inputEl.disabled = this.isLocalDrawer(); this.inputEl.placeholder = this.isLocalDrawer() ? 'You are drawing!' : 'Type your guess…' }
    this.setDrawingEnabled(this.isLocalDrawer())
    this.tickInterval = setInterval(() => {
      this.timeLeft = Math.max(0, Math.round((ROUND_MS - (Date.now() - (this.roundStartTime ?? Date.now()))) / 1000))
      this.timerText.text = `${this.timeLeft}s`
      ;(this.timerText.style as TextStyle).fill = this.timeLeft <= 10 ? '#ff2d78' : '#ffd60a'
    }, 500)
    this.roundStartTime = Date.now()
    this.roundTimer = setTimeout(() => this.endRound(), ROUND_MS)
  }

  private roundStartTime = 0

  private endRound(): void {
    if (this.roundTimer) clearTimeout(this.roundTimer)
    if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = null }
    const scoresArr = [...this.scores.entries()].map(([id, score]) => ({ id, score }))
    this.ctx.network.broadcast(DG_EVENTS.ROUND_END, { word: this.currentWord, scores: scoresArr })
    this.addGuessLog(`Round over! Word was: ${this.currentWord}`)
    this.wordText.text = `Answer: ${this.currentWord}`
    if (this.round >= TOTAL_ROUNDS) setTimeout(() => this.triggerFinal(), 3000)
    else setTimeout(() => this.nextRound(), 3000)
  }

  private broadcastGuessResult(playerName: string, correct: boolean): void {
    const scoresArr = [...this.scores.entries()].map(([id, score]) => ({ id, score }))
    const line = correct ? `✓ ${playerName} guessed it!` : `✗ ${playerName}: wrong`
    this.addGuessLog(line)
    this.ctx.network.broadcast(DG_EVENTS.ROUND_END, { word: correct ? this.currentWord : '...still guessing', scores: scoresArr, partial: true } as never)
    // Actually broadcast a custom message to update log
    this.ctx.network.broadcast('drawing-guesser:log' as never, { line } as never)
  }

  private triggerFinal(): void {
    const sorted = [...this.scores.entries()].map(([id, score]) => { const p = this.players.find(pl => pl.id === id); return { id, name: p?.name ?? id, score } }).sort((a, b) => b.score - a.score)
    this.ctx.network.broadcast(DG_EVENTS.FINAL, { sorted })
    this.showFinal(sorted)
  }

  // ── Scene ─────────────────────────────────────────────────────────────────

  private buildScene(): void {
    this.stage = new Graphics()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    this.app.stage.addChild(this.stage)
    this.scaleStage()

    const title = new Text({ text: 'DRAWING GUESSER', style: new TextStyle({ fontFamily: 'monospace', fontSize: 22, fontWeight: '900', fill: '#00f5ff', letterSpacing: 4 }) })
    title.anchor.set(0.5, 0); title.position.set(LOGIC_W / 2, 10); this.stage.addChild(title)

    this.hudText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#c0c0e0' }) })
    this.hudText.anchor.set(0, 0); this.hudText.position.set(10, 42); this.stage.addChild(this.hudText)

    this.timerText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 18, fontWeight: '700', fill: '#ffd60a' }) })
    this.timerText.anchor.set(1, 0); this.timerText.position.set(LOGIC_W - 10, 38); this.stage.addChild(this.timerText)

    this.wordText = new Text({ text: 'Waiting…', style: new TextStyle({ fontFamily: 'monospace', fontSize: 20, fontWeight: '700', fill: '#ffffff', align: 'center' }) })
    this.wordText.anchor.set(0.5, 0); this.wordText.position.set(LOGIC_W / 2, 38); this.stage.addChild(this.wordText)

    this.statusText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 12, fill: '#606080' }) })
    this.statusText.anchor.set(0.5, 1); this.statusText.position.set(LOGIC_W / 2, LOGIC_H - 4); this.stage.addChild(this.statusText)

    // Guess log (right side)
    for (let i = 0; i < 8; i++) {
      const t = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 12, fill: '#808098', wordWrap: true, wordWrapWidth: 200 }) })
      t.position.set(LOGIC_W - 215, 70 + i * 36); this.stage.addChild(t); this.guessLog.push(t)
    }

    // Draw canvas & input overlays
    this.createDrawCanvas()
    this.createInputOverlay()
  }

  private createDrawCanvas(): void {
    const canvas = this.app.canvas; const rect = canvas.getBoundingClientRect()
    // Scale: canvas covers left ~75% for drawing
    const canvasW = rect.width * 0.74; const canvasH = rect.height * 0.82
    const el = document.createElement('canvas')
    el.width = canvasW; el.height = canvasH
    el.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top + rect.height * 0.12}px;width:${canvasW}px;height:${canvasH}px;background:white;z-index:9999;cursor:crosshair;touch-action:none;`
    document.body.appendChild(el)
    this.drawCanvas = el
    this.drawCtx2d = el.getContext('2d')!
    // Drawing events
    el.addEventListener('pointerdown', (e) => { this.isDrawing = true; this.lastX = e.offsetX; this.lastY = e.offsetY })
    el.addEventListener('pointermove', (e) => {
      if (!this.isDrawing) return
      const pts: StrokePoint[] = [{ x: this.lastX, y: this.lastY }, { x: e.offsetX, y: e.offsetY }]
      this.drawStroke(pts); this.lastX = e.offsetX; this.lastY = e.offsetY
      this.ctx.network.broadcast(DG_EVENTS.STROKE, { points: pts, color: this.brushColor, size: this.brushSize })
    })
    el.addEventListener('pointerup', () => { this.isDrawing = false })
    el.addEventListener('pointerleave', () => { this.isDrawing = false })

    // Draw toolbar (color pickers + clear)
    const colors = ['#000000', '#ff2d78', '#3498db', '#2ecc71', '#e67e22', '#9b59b6', '#ffffff']
    const btnSize = 28
    colors.forEach((c, i) => {
      const btn = document.createElement('button')
      btn.style.cssText = `position:fixed;left:${rect.left + i * (btnSize + 4)}px;top:${rect.top + rect.height * 0.12 + canvasH + 4}px;width:${btnSize}px;height:${btnSize}px;background:${c};border:2px solid #fff;border-radius:50%;cursor:pointer;z-index:10000;`
      btn.onclick = () => { this.brushColor = c }
      document.body.appendChild(btn)
    })
    const clearBtn = document.createElement('button')
    clearBtn.textContent = '🗑'
    clearBtn.style.cssText = `position:fixed;left:${rect.left + colors.length * (btnSize + 4) + 8}px;top:${rect.top + rect.height * 0.12 + canvasH + 4}px;height:${btnSize}px;padding:0 10px;background:#333;color:#fff;border:none;border-radius:6px;cursor:pointer;z-index:10000;font-size:16px;`
    clearBtn.onclick = () => { this.clearDrawCanvas(); this.ctx.network.broadcast(DG_EVENTS.CLEAR, {}) }
    document.body.appendChild(clearBtn)
  }

  private createInputOverlay(): void {
    const canvas = this.app.canvas; const rect = canvas.getBoundingClientRect()
    const el = document.createElement('input')
    el.type = 'text'; el.autocomplete = 'off'; el.spellcheck = false
    el.setAttribute('autocorrect', 'off'); el.setAttribute('autocapitalize', 'off')
    const inputW = rect.width * 0.22; const inputLeft = rect.left + rect.width * 0.76
    el.style.cssText = `position:fixed;left:${inputLeft}px;top:${rect.top + rect.height * 0.88}px;width:${inputW}px;height:40px;background:#16162a;border:2px solid #00f5ff44;border-radius:8px;color:#e0e0ff;font-family:monospace;font-size:15px;padding:0 8px;outline:none;z-index:9999;`
    el.placeholder = 'Guess…'
    document.body.appendChild(el); this.inputEl = el
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.submitGuess() })
  }

  private submitGuess(): void {
    if (!this.inputEl) return
    const guess = this.inputEl.value.trim(); this.inputEl.value = ''
    if (!guess) return
    const localId = this.ctx.players.getLocalPlayer().id; const localName = this.ctx.players.getLocalPlayer().name
    if (this.ctx.network.isHost()) {
      if (!this.guessedThisRound.has(localId) && guess.toLowerCase() === this.currentWord.toLowerCase()) {
        this.guessedThisRound.add(localId); this.scores.set(localId, (this.scores.get(localId) ?? 0) + 1)
        const drawer = this.players[this.drawerIndex]; if (drawer) this.scores.set(drawer.id, (this.scores.get(drawer.id) ?? 0) + 1)
        this.broadcastGuessResult(localName, true)
        const guessers = this.players.filter(p => p.id !== drawer?.id)
        if (this.guessedThisRound.size >= guessers.length) this.endRound()
      } else { this.addGuessLog(`${localName}: ${guess}`) }
    } else {
      this.ctx.network.send(DG_EVENTS.GUESS, { playerId: localId, playerName: localName, guess })
      this.addGuessLog(`${localName}: ${guess}`)
    }
  }

  private addGuessLog(line: string): void {
    this.guessLogLines.unshift(line)
    if (this.guessLogLines.length > 8) this.guessLogLines.pop()
    this.guessLog.forEach((t, i) => { t.text = this.guessLogLines[i] ?? '' })
  }

  private drawStroke(points: StrokePoint[]): void {
    const c = this.drawCtx2d; if (!c || points.length < 2) return
    c.strokeStyle = this.brushColor; c.lineWidth = this.brushSize; c.lineCap = 'round'; c.lineJoin = 'round'
    c.beginPath(); c.moveTo(points[0]!.x, points[0]!.y)
    for (const p of points.slice(1)) c.lineTo(p.x, p.y)
    c.stroke()
  }

  private clearDrawCanvas(): void { if (this.drawCtx2d && this.drawCanvas) this.drawCtx2d.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height) }

  private setDrawingEnabled(enabled: boolean): void {
    if (this.drawCanvas) this.drawCanvas.style.pointerEvents = enabled ? 'auto' : 'none'
  }

  private isLocalDrawer(): boolean {
    const drawer = this.players[this.drawerIndex]
    return drawer?.id === this.ctx.players.getLocalPlayer().id
  }

  private updateHud(): void {
    const drawer = this.players[this.drawerIndex]
    this.hudText.text = `Round ${this.round}/${TOTAL_ROUNDS}  |  Drawer: ${drawer?.name ?? '?'}`
    const parts = this.players.map(p => `${p.name}: ${this.scores.get(p.id) ?? 0}`).join('  |  ')
    this.statusText.text = parts
  }

  private showFinal(sorted: { id: string; name: string; score: number }[]): void {
    this.drawCanvas?.remove(); this.drawCanvas = null
    this.inputEl?.remove(); this.inputEl = null
    this.stage.removeChildren(); this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    const title = new Text({ text: 'GAME OVER', style: new TextStyle({ fontFamily: 'monospace', fontSize: 36, fontWeight: '900', fill: '#00f5ff', letterSpacing: 4 }) })
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
