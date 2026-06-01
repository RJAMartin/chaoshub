// ─────────────────────────────────────────────────────────────────────────────
// Type Racer — Game Implementation
//
// Host picks a prompt from a curated list, broadcasts it with a 3-2-1
// countdown, then accepts per-keystroke progress events and computes WPM.
// First to 100% triggers endgame; if nobody finishes after TIME_LIMIT the
// player with the highest progress wins.
//
// Host authority: host tracks progress map and broadcasts it so every client
// sees all racers moving in real time.
// ─────────────────────────────────────────────────────────────────────────────
import { Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'

// ── Constants ─────────────────────────────────────────────────────────────────

export const TR_EVENTS = {
  START:    'type-racer:start',
  PROGRESS: 'type-racer:progress',
  FINISHED: 'type-racer:finished',
  RESULTS:  'type-racer:results',
  TICK:     'type-racer:tick',
} as const

const TIME_LIMIT_S = 60
const LOGIC_W = 900
const LOGIC_H = 600

const PROMPTS = [
  'The quick brown fox jumps over the lazy dog.',
  'Pack my box with five dozen liquor jugs.',
  'How vexingly quick daft zebras jump.',
  'The five boxing wizards jump quickly.',
  'Sphinx of black quartz, judge my vow.',
  'Two driven jocks help fax my big quiz.',
  'The jay, pig, fox, zebra and my wolves quack.',
  'Bright vixens jump dozy fowl quack.',
  'Jackdaws love my big sphinx of quartz.',
  'A wizard s job is to vex chumps quickly in fog.',
]

const PLAYER_COLORS = [0x00f5ff, 0xff2d78, 0xffd60a, 0x30d158, 0xbf5af2, 0xff9f0a, 0x64d2ff, 0xff6b6b]

// ── Types ─────────────────────────────────────────────────────────────────────

interface RacerState {
  id: string
  name: string
  progress: number  // 0–1
  wpm: number
  finished: boolean
  finishTime: number | null
}

// ── Game class ────────────────────────────────────────────────────────────────

export class TypeRacerGame implements GameInstance {
  private ctx: GameContext
  private app: Application

  // Pixi objects
  private stage!: Graphics
  private promptContainer!: Graphics
  private inputBox!: Text
  private timerText!: Text
  private racerRows: Map<string, { bar: Graphics; label: Text; wpmText: Text }> = new Map()

  // State
  private prompt = ''
  private typed = ''
  private startTime: number | null = null
  private timeLeft = TIME_LIMIT_S
  private timerInterval: ReturnType<typeof setInterval> | null = null
  private racers: Map<string, RacerState> = new Map()
  private localFinished = false
  private gameOver = false

  // Input element overlay (HTML, not canvas — far better typing UX)
  private inputEl: HTMLInputElement | null = null

  // ── Network handlers ──────────────────────────────────────────────────────

  private readonly onStart = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { prompt, racers } = msg.payload as { prompt: string; racers: RacerState[] }
    this.prompt = prompt
    for (const r of racers) this.racers.set(r.id, r)
    this.startRace()
  }

  private readonly onProgress = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { playerId, progress, wpm } = msg.payload as { playerId: string; progress: number; wpm: number }
    const racer = this.racers.get(playerId)
    if (racer) {
      racer.progress = progress
      racer.wpm = wpm
      this.ctx.network.broadcast(TR_EVENTS.PROGRESS, { playerId, progress, wpm })
      this.renderRacers()
    }
  }

  private readonly onProgressBroadcast = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { playerId, progress, wpm } = msg.payload as { playerId: string; progress: number; wpm: number }
    const racer = this.racers.get(playerId)
    if (racer) {
      racer.progress = progress
      racer.wpm = wpm
      this.renderRacers()
    }
  }

  private readonly onFinished = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { playerId, wpm } = msg.payload as { playerId: string; wpm: number }
    const racer = this.racers.get(playerId)
    if (racer && !racer.finished) {
      racer.finished = true
      racer.finishTime = Date.now()
      racer.wpm = wpm
      racer.progress = 1
      this.checkAllFinished()
    }
  }

  private readonly onResults = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { sorted } = msg.payload as { sorted: RacerState[] }
    this.showResults(sorted)
  }

  private readonly onTick = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { timeLeft } = msg.payload as { timeLeft: number }
    this.timeLeft = timeLeft
    this.updateTimer()
  }

  // ── Constructor ───────────────────────────────────────────────────────────

  constructor(context: GameContext) {
    this.ctx = context
    this.app = context.pixiApp as Application
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    this.buildScene()
    this.registerListeners()

    if (this.ctx.network.isHost()) {
      // Build racer map from current players
      for (const p of this.ctx.players.getPlayers()) {
        this.racers.set(p.id, { id: p.id, name: p.name, progress: 0, wpm: 0, finished: false, finishTime: null })
      }
      // Pick a random prompt
      this.prompt = PROMPTS[Math.floor(Math.random() * PROMPTS.length)]!

      // Broadcast start after a short delay
      setTimeout(() => {
        this.ctx.network.broadcast(TR_EVENTS.START, {
          prompt: this.prompt,
          racers: [...this.racers.values()],
        })
        this.startRace()
      }, 600)
    }
  }

  private registerListeners(): void {
    this.ctx.network.on(TR_EVENTS.START,    this.onStart as never)
    this.ctx.network.on(TR_EVENTS.PROGRESS, this.ctx.network.isHost() ? this.onProgress as never : this.onProgressBroadcast as never)
    this.ctx.network.on(TR_EVENTS.FINISHED, this.onFinished as never)
    this.ctx.network.on(TR_EVENTS.RESULTS,  this.onResults as never)
    this.ctx.network.on(TR_EVENTS.TICK,     this.onTick as never)
  }

  update(_dt: number): void { /* timer-driven */ }

  destroy(): void {
    if (this.timerInterval) clearInterval(this.timerInterval)
    this.inputEl?.remove()
    this.ctx.network.off(TR_EVENTS.START,    this.onStart as never)
    this.ctx.network.off(TR_EVENTS.PROGRESS, this.ctx.network.isHost() ? this.onProgress as never : this.onProgressBroadcast as never)
    this.ctx.network.off(TR_EVENTS.FINISHED, this.onFinished as never)
    this.ctx.network.off(TR_EVENTS.RESULTS,  this.onResults as never)
    this.ctx.network.off(TR_EVENTS.TICK,     this.onTick as never)
    this.app.stage.removeChildren()
  }

  // ── Scene ─────────────────────────────────────────────────────────────────

  private buildScene(): void {
    const { width: w, height: h } = this.app.screen

    // Root container (scaled)
    this.stage = new Graphics()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    this.app.stage.addChild(this.stage)
    this.scaleStage()

    // Title
    const title = new Text({
      text: 'TYPE RACER',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 28, fontWeight: '900', fill: '#00f5ff', letterSpacing: 6 }),
    })
    title.anchor.set(0.5, 0)
    title.position.set(LOGIC_W / 2, 20)
    this.stage.addChild(title)

    // Timer
    this.timerText = new Text({
      text: `${TIME_LIMIT_S}s`,
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 22, fontWeight: '700', fill: '#ffd60a' }),
    })
    this.timerText.anchor.set(1, 0)
    this.timerText.position.set(LOGIC_W - 20, 22)
    this.stage.addChild(this.timerText)

    // Prompt box (will be populated when prompt arrives)
    this.promptContainer = new Graphics()
    this.promptContainer.position.set(30, 70)
    this.stage.addChild(this.promptContainer)

    // Racer lane area placeholder
    void w; void h // used indirectly via scaleStage

    // Input element (HTML overlay — better mobile/keyboard support)
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
      left: ${rect.left + rect.width * 0.05}px;
      top:  ${rect.top  + rect.height * 0.82}px;
      width: ${rect.width * 0.9}px;
      height: 44px;
      background: #16162a;
      border: 2px solid #00f5ff44;
      border-radius: 8px;
      color: #e0e0ff;
      font-family: monospace;
      font-size: 18px;
      padding: 0 12px;
      outline: none;
      z-index: 9999;
      caret-color: #00f5ff;
    `
    el.placeholder = 'Waiting for race to start…'
    el.disabled = true
    document.body.appendChild(el)
    this.inputEl = el

    el.addEventListener('input', () => this.handleInput())
    el.focus()
  }

  private drawPrompt(): void {
    this.promptContainer.clear()
    // Background box
    this.promptContainer.roundRect(0, 0, LOGIC_W - 60, 100, 10).fill(0x13132a)
    this.promptContainer.roundRect(0, 0, LOGIC_W - 60, 100, 10).stroke({ width: 1, color: 0x2a2a50 })

    // Render characters with colour coding
    let x = 14
    const y = 14
    const fontSize = 20
    for (let i = 0; i < this.prompt.length; i++) {
      const ch = this.prompt[i] ?? ''
      let fill: string
      if (i < this.typed.length) {
        fill = this.typed[i] === ch ? '#30d158' : '#ff2d78'
      } else if (i === this.typed.length) {
        fill = '#ffffff'
      } else {
        fill = '#4a4a6a'
      }
      const charText = new Text({
        text: ch,
        style: new TextStyle({ fontFamily: 'monospace', fontSize, fill }),
      })
      charText.position.set(x, y)
      this.promptContainer.addChild(charText)
      x += fontSize * 0.62
      if (x > LOGIC_W - 80) {
        x = 14
        charText.position.set(x, y + fontSize + 6)
      }
    }

    this.drawRacerLanes()
  }

  private drawRacerLanes(): void {
    // Remove existing rows
    for (const row of this.racerRows.values()) {
      row.bar.parent?.removeChild(row.bar)
      row.label.parent?.removeChild(row.label)
      row.wpmText.parent?.removeChild(row.wpmText)
    }
    this.racerRows.clear()

    const players = [...this.racers.values()]
    const laneH = 44
    const startY = 185
    const trackW = LOGIC_W - 160

    players.forEach((racer, idx) => {
      const color = PLAYER_COLORS[idx % PLAYER_COLORS.length] ?? 0x00f5ff
      const y = startY + idx * laneH

      // Track BG
      const trackBg = new Graphics()
      trackBg.roundRect(110, y, trackW, 28, 6).fill(0x16162a)
      trackBg.roundRect(110, y, trackW, 28, 6).stroke({ width: 1, color: 0x2a2a50 })
      this.stage.addChild(trackBg)

      // Progress bar
      const bar = new Graphics()
      bar.roundRect(110, y, Math.max(6, trackW * racer.progress), 28, 6).fill({ color, alpha: 0.8 })
      this.stage.addChild(bar)

      // Racer icon (car emoji approximated as colored rect + name)
      const label = new Text({
        text: `${racer.name.slice(0, 10)}`,
        style: new TextStyle({ fontFamily: 'monospace', fontSize: 14, fill: `#${color.toString(16).padStart(6, '0')}` }),
      })
      label.anchor.set(1, 0.5)
      label.position.set(105, y + 14)
      this.stage.addChild(label)

      // WPM text
      const wpmText = new Text({
        text: racer.wpm > 0 ? `${racer.wpm} wpm` : '',
        style: new TextStyle({ fontFamily: 'monospace', fontSize: 12, fill: '#808098' }),
      })
      wpmText.anchor.set(0, 0.5)
      wpmText.position.set(120 + trackW, y + 14)
      this.stage.addChild(wpmText)

      this.racerRows.set(racer.id, { bar, label, wpmText })
    })
  }

  private renderRacers(): void {
    const trackW = LOGIC_W - 160
    for (const [id, row] of this.racerRows) {
      const racer = this.racers.get(id)
      if (!racer) continue
      const color = [...this.racers.keys()].indexOf(id)
      const c = PLAYER_COLORS[color % PLAYER_COLORS.length] ?? 0x00f5ff
      row.bar.clear()
      row.bar.roundRect(110, row.bar.y, Math.max(6, trackW * racer.progress), 28, 6).fill({ color: c, alpha: 0.8 })
      row.wpmText.text = racer.wpm > 0 ? `${racer.wpm} wpm` : ''
    }
  }

  // ── Race logic ────────────────────────────────────────────────────────────

  private startRace(): void {
    this.startTime = Date.now()
    this.timeLeft = TIME_LIMIT_S
    this.typed = ''
    this.drawPrompt()

    if (this.inputEl) {
      this.inputEl.disabled = false
      this.inputEl.placeholder = 'Type here…'
      this.inputEl.value = ''
      this.inputEl.focus()
    }

    if (this.ctx.network.isHost()) {
      this.timerInterval = setInterval(() => {
        this.timeLeft = Math.max(0, TIME_LIMIT_S - Math.floor((Date.now() - this.startTime!) / 1000))
        this.updateTimer()
        this.ctx.network.broadcast(TR_EVENTS.TICK, { timeLeft: this.timeLeft })
        if (this.timeLeft <= 0) this.endGame()
      }, 1000)
    }
  }

  private handleInput(): void {
    if (this.localFinished || this.gameOver || !this.inputEl) return
    this.typed = this.inputEl.value

    const progress = Math.min(this.typed.length / this.prompt.length, 1)
    const wpm = this.calcWpm()

    this.drawPrompt()

    const localId = this.ctx.players.getLocalPlayer().id

    if (this.ctx.network.isHost()) {
      const racer = this.racers.get(localId)
      if (racer) { racer.progress = progress; racer.wpm = wpm }
      this.ctx.network.broadcast(TR_EVENTS.PROGRESS, { playerId: localId, progress, wpm })
    } else {
      this.ctx.network.send(TR_EVENTS.PROGRESS, { playerId: localId, progress, wpm })
    }

    // Check if typed entire prompt correctly
    if (this.typed === this.prompt) {
      this.localFinished = true
      if (this.inputEl) this.inputEl.disabled = true
      if (this.ctx.network.isHost()) {
        const racer = this.racers.get(localId)
        if (racer) { racer.finished = true; racer.finishTime = Date.now(); racer.wpm = wpm; racer.progress = 1 }
        this.checkAllFinished()
      } else {
        this.ctx.network.send(TR_EVENTS.FINISHED, { playerId: localId, wpm })
      }
    }
  }

  private calcWpm(): number {
    if (!this.startTime) return 0
    const elapsed = (Date.now() - this.startTime) / 1000 / 60 // minutes
    if (elapsed < 0.01) return 0
    const words = this.typed.length / 5
    return Math.round(words / elapsed)
  }

  private checkAllFinished(): void {
    const all = [...this.racers.values()]
    const allDone = all.every((r) => r.finished)
    if (allDone) this.endGame()
  }

  private endGame(): void {
    if (!this.ctx.network.isHost()) return
    if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null }

    const sorted = [...this.racers.values()].sort((a, b) => {
      if (a.finished && b.finished) return (a.finishTime ?? 0) - (b.finishTime ?? 0)
      if (a.finished) return -1
      if (b.finished) return 1
      return b.progress - a.progress
    })

    this.ctx.network.broadcast(TR_EVENTS.RESULTS, { sorted })
    this.showResults(sorted)

    const winner = sorted[0]
    const localId = this.ctx.players.getLocalPlayer().id
    this.ctx.stats.record('play')
    if (winner?.id === localId) this.ctx.stats.record('win')
    else this.ctx.stats.record('loss')

    this.ctx.events.emit('platform:game:ended', {
      gameId: this.ctx.gameId,
      winnerId: winner?.id,
      durationMs: this.startTime ? Date.now() - this.startTime : 0,
      results: sorted.map((r, i) => ({ playerId: r.id, playerName: r.name, rank: i + 1, wpm: r.wpm })),
    })
  }

  private showResults(sorted: RacerState[]): void {
    this.gameOver = true
    if (this.inputEl) this.inputEl.disabled = true
    this.stage.clear()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)

    const title = new Text({
      text: 'RACE OVER',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 36, fontWeight: '900', fill: '#00f5ff', letterSpacing: 4 }),
    })
    title.anchor.set(0.5)
    title.position.set(LOGIC_W / 2, 80)
    this.stage.addChild(title)

    sorted.forEach((r, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
      const color = PLAYER_COLORS[i % PLAYER_COLORS.length] ?? 0xffffff
      const t = new Text({
        text: `${medal}  ${r.name.padEnd(16)}  ${r.wpm} wpm  ${r.finished ? '✓' : Math.round(r.progress * 100) + '%'}`,
        style: new TextStyle({ fontFamily: 'monospace', fontSize: 20, fill: `#${color.toString(16).padStart(6, '0')}` }),
      })
      t.anchor.set(0.5)
      t.position.set(LOGIC_W / 2, 160 + i * 48)
      this.stage.addChild(t)
    })
  }

  private updateTimer(): void {
    this.timerText.text = `${this.timeLeft}s`
    ;(this.timerText.style as TextStyle).fill = this.timeLeft <= 10 ? '#ff2d78' : '#ffd60a'
  }

  private scaleStage(): void {
    const { width: cw, height: ch } = this.app.screen
    const scale = Math.min(cw / LOGIC_W, ch / LOGIC_H) * 0.97
    this.stage.scale.set(scale)
    this.stage.position.set((cw - LOGIC_W * scale) / 2, (ch - LOGIC_H * scale) / 2)
  }
}
