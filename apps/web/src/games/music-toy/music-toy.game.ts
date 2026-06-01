// ─────────────────────────────────────────────────────────────────────────────
// Collaborative Music Toy — Shared looping sequencer
//
// Architecture:
//   16-step × 8-note grid. Players toggle cells to place/remove notes.
//   Host is authoritative: validates toggles, broadcasts full grid state.
//   Playback loop runs on every client independently (same tempo, synced to
//   host-broadcast beat counter).
//   No win condition — sandbox creative mode.
//
// Network events:
//   music-toy:toggle      client→host   { step, note, on: bool }
//   music-toy:grid        host→all      { grid: boolean[][] }
//   music-toy:beat        host→all      { beat: number }   (0-15)
// ─────────────────────────────────────────────────────────────────────────────
import { Graphics, Text, TextStyle, Container, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'

export const MT_EVENTS = {
  TOGGLE: 'music-toy:toggle',
  GRID:   'music-toy:grid',
  BEAT:   'music-toy:beat',
} as const

const STEPS = 16
const NOTES = 8
const BPM  = 120
const BEAT_MS = (60 / BPM) * 1000  // ms per beat

// C-major pentatonic scale (MIDI-ish frequencies, Hz)
const SCALE_HZ: number[] = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25]
const NOTE_NAMES = ['C4','D4','E4','G4','A4','C5','D5','E5']
const NOTE_COLORS = [0x00f5ff, 0xff2d78, 0xbf5af2, 0xffd60a, 0x30d158, 0xff6b35, 0x4d96ff, 0xff375f]

// Grid cell dimensions in logical space
const CELL_W = 40
const CELL_H = 36
const LABEL_W = 40
const GRID_PADDING = 12
const LOGIC_W = LABEL_W + STEPS * CELL_W + GRID_PADDING * 2
const LOGIC_H = NOTES  * CELL_H + GRID_PADDING * 3 + 60 // 60 for header

export class MusicToyGame implements GameInstance {
  private ctx: GameContext
  private app: Application
  private stage!: Container

  // Grid state: grid[note][step] = on
  private grid: boolean[][] = Array.from({ length: NOTES }, () => new Array(STEPS).fill(false))

  // Pixi cell graphics [note][step]
  private cells: Graphics[][] = []
  private beatIndicators: Graphics[] = []  // one per step column
  private currentBeat = -1

  // Web Audio
  private audioCtx: AudioContext | null = null

  // Host: beat sequencer
  private beatInterval: ReturnType<typeof setInterval> | null = null
  private hostBeat = 0

  // Network callbacks
  private readonly onToggle = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { step, note, on } = msg.payload as { step: number; note: number; on: boolean }
    if (step < 0 || step >= STEPS || note < 0 || note >= NOTES) return
    this.grid[note]![step] = on
    this.ctx.network.broadcast(MT_EVENTS.GRID, { grid: this.grid })
  }

  private readonly onGrid = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { grid } = msg.payload as { grid: boolean[][] }
    this.grid = grid
    this.redrawGrid()
  }

  private readonly onBeat = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { beat } = msg.payload as { beat: number }
    this.advanceBeat(beat)
  }

  constructor(context: GameContext) {
    this.ctx = context
    this.app = context.pixiApp as Application
  }

  async init(): Promise<void> {
    this.buildScene()
    this.registerNetworkListeners()

    // Init Web Audio on first user interaction (autoplay policy)
    const unlock = () => {
      if (!this.audioCtx) {
        this.audioCtx = new AudioContext()
      }
      this.app.canvas.removeEventListener('pointerdown', unlock)
    }
    this.app.canvas.addEventListener('pointerdown', unlock)

    if (this.ctx.network.isHost()) {
      // Send initial blank grid
      this.ctx.network.broadcast(MT_EVENTS.GRID, { grid: this.grid })
      // Start beat clock
      this.beatInterval = setInterval(() => {
        this.hostBeat = (this.hostBeat + 1) % STEPS
        this.ctx.network.broadcast(MT_EVENTS.BEAT, { beat: this.hostBeat })
        this.advanceBeat(this.hostBeat)
      }, BEAT_MS)
    }
  }

  // ── Scene ─────────────────────────────────────────────────────────────────

  private buildScene(): void {
    this.stage = new Container()
    this.app.stage.addChild(this.stage)

    // Background
    const bg = new Graphics()
    bg.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x080812)
    this.stage.addChild(bg)

    // Title
    const title = new Text({
      text: '♪ Collaborative Music',
      style: new TextStyle({
        fontFamily: '"Space Grotesk", sans-serif',
        fontSize: 16,
        fontWeight: '700',
        fill: '#9090b0',
      }),
    })
    title.position.set(GRID_PADDING, GRID_PADDING)
    this.stage.addChild(title)

    const subtitle = new Text({
      text: 'Click cells to place notes. Play together!',
      style: new TextStyle({
        fontFamily: '"Space Grotesk", sans-serif',
        fontSize: 11,
        fill: '#505070',
      }),
    })
    subtitle.position.set(GRID_PADDING, GRID_PADDING + 22)
    this.stage.addChild(subtitle)

    // Beat indicators (one per column, lit up as playhead moves)
    for (let s = 0; s < STEPS; s++) {
      const ind = new Graphics()
      ind.rect(0, 0, CELL_W - 2, 4).fill(0x222244)
      ind.position.set(GRID_PADDING + LABEL_W + s * CELL_W, GRID_PADDING + 46)
      this.beatIndicators.push(ind)
      this.stage.addChild(ind)
    }

    // Note labels + grid cells
    this.cells = []
    for (let n = 0; n < NOTES; n++) {
      const row: Graphics[] = []
      const noteN = NOTES - 1 - n   // top row = highest note

      // Note label
      const label = new Text({
        text: NOTE_NAMES[noteN] ?? '',
        style: new TextStyle({
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 10,
          fill: '#606080',
        }),
      })
      label.anchor.set(1, 0.5)
      label.position.set(
        GRID_PADDING + LABEL_W - 4,
        GRID_PADDING + 60 + n * CELL_H + CELL_H / 2,
      )
      this.stage.addChild(label)

      for (let s = 0; s < STEPS; s++) {
        const cell = new Graphics()
        this.drawCell(cell, noteN, s, false)
        cell.position.set(
          GRID_PADDING + LABEL_W + s * CELL_W,
          GRID_PADDING + 60 + n * CELL_H,
        )
        cell.eventMode = 'static'
        cell.cursor = 'pointer'
        cell.on('pointerdown', () => this.handleCellClick(noteN, s))
        this.stage.addChild(cell)
        row.push(cell)
      }
      this.cells[noteN] = row
    }

    this.scaleStage()
  }

  private drawCell(cell: Graphics, note: number, step: number, on: boolean): void {
    cell.clear()
    const isEvenGroup = Math.floor(step / 4) % 2 === 0
    const bgColor = on
      ? NOTE_COLORS[note % NOTE_COLORS.length]
      : isEvenGroup ? 0x161628 : 0x111120
    cell.roundRect(1, 1, CELL_W - 2, CELL_H - 2, 3).fill(bgColor)
    if (on) {
      cell.roundRect(1, 1, CELL_W - 2, CELL_H - 2, 3).stroke({ width: 1, color: 0xffffff, alpha: 0.3 })
    }
  }

  private redrawGrid(): void {
    for (let n = 0; n < NOTES; n++) {
      for (let s = 0; s < STEPS; s++) {
        const cell = this.cells[n]?.[s]
        if (cell) this.drawCell(cell, n, s, this.grid[n]?.[s] ?? false)
      }
    }
  }

  private scaleStage(): void {
    const cw = this.app.screen.width
    const ch = this.app.screen.height
    const scale = Math.min(cw / LOGIC_W, ch / LOGIC_H) * 0.96
    this.stage.scale.set(scale)
    this.stage.position.set(
      (cw - LOGIC_W * scale) / 2,
      (ch - LOGIC_H * scale) / 2,
    )
  }

  // ── Cell click ────────────────────────────────────────────────────────────

  private handleCellClick(note: number, step: number): void {
    // Init audio context on first click
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext()
    }

    const newState = !(this.grid[note]?.[step] ?? false)

    if (this.ctx.network.isHost()) {
      this.grid[note]![step] = newState
      this.drawCell(this.cells[note]![step]!, note, step, newState)
      this.ctx.network.broadcast(MT_EVENTS.GRID, { grid: this.grid })
    } else {
      // Optimistic local update
      this.grid[note]![step] = newState
      this.drawCell(this.cells[note]![step]!, note, step, newState)
      this.ctx.network.send(MT_EVENTS.TOGGLE, { step, note, on: newState })
    }

    // Play preview note
    if (newState) this.playNote(note, 0.15)
  }

  // ── Beat / playback ───────────────────────────────────────────────────────

  private advanceBeat(beat: number): void {
    // Clear previous beat indicator
    const prevInd = this.beatIndicators[this.currentBeat]
    if (this.currentBeat >= 0 && prevInd) {
      prevInd.clear()
      prevInd.rect(0, 0, CELL_W - 2, 4).fill(0x222244)
    }

    this.currentBeat = beat

    // Light up current beat indicator
    const curInd = this.beatIndicators[beat]
    if (curInd) {
      curInd.clear()
      curInd.rect(0, 0, CELL_W - 2, 4).fill(0x00f5ff)
    }

    // Play all active notes in this step
    for (let n = 0; n < NOTES; n++) {
      if (this.grid[n]?.[beat]) {
        this.playNote(n, (BEAT_MS * 0.8) / 1000)
      }
    }
  }

  private playNote(noteIndex: number, durationS: number): void {
    if (!this.audioCtx) return
    const ctx = this.audioCtx
    if (ctx.state === 'suspended') ctx.resume()

    const now = ctx.currentTime
    const freq = SCALE_HZ[noteIndex % SCALE_HZ.length] ?? 440

    // Simple sine wave with attack/release
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, now)

    // Add a slightly detuned oscillator for richness
    const osc2 = ctx.createOscillator()
    osc2.connect(gain)
    osc2.type = 'triangle'
    osc2.frequency.setValueAtTime(freq * 1.005, now)

    const dur = Math.max(durationS, 0.1)
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.18, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur)

    osc.start(now)
    osc.stop(now + dur + 0.05)
    osc2.start(now)
    osc2.stop(now + dur + 0.05)
  }

  // ── Network ───────────────────────────────────────────────────────────────

  private registerNetworkListeners(): void {
    this.ctx.network.on(MT_EVENTS.TOGGLE, this.onToggle as never)
    this.ctx.network.on(MT_EVENTS.GRID,   this.onGrid   as never)
    this.ctx.network.on(MT_EVENTS.BEAT,   this.onBeat   as never)
  }

  // ── Resize ────────────────────────────────────────────────────────────────

  private readonly onCanvasResized = () => { this.scaleStage() }

  // ── GameInstance lifecycle ────────────────────────────────────────────────

  update(_dt: number): void { /* all logic is event/timer-driven */ }

  destroy(): void {
    if (this.beatInterval) clearInterval(this.beatInterval)
    if (this.audioCtx) { this.audioCtx.close(); this.audioCtx = null }

    this.ctx.network.off(MT_EVENTS.TOGGLE, this.onToggle as never)
    this.ctx.network.off(MT_EVENTS.GRID,   this.onGrid   as never)
    this.ctx.network.off(MT_EVENTS.BEAT,   this.onBeat   as never)
    this.ctx.events.off('platform:canvas:resized', this.onCanvasResized as never)

    this.app.stage.removeChildren()
  }
}
