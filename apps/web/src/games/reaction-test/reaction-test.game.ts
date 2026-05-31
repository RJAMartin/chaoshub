// ─────────────────────────────────────────────────────────────────────────────
// Reaction Test — Game Implementation
//
// Flow: waiting → countdown → ready (red) → SIGNAL (green) → results
//
// Host:
//   - Manages state machine
//   - Broadcasts state changes
//   - Collects click timestamps
//   - Ranks players, broadcasts results
//
// Client:
//   - Renders current state via Pixi
//   - Sends click timestamp to host on signal
// ─────────────────────────────────────────────────────────────────────────────
import type { Application, Graphics, Text } from 'pixi.js'
import { Application as PixiApp, Graphics as PixiGraphics, Text as PixiText, TextStyle } from 'pixi.js'
import type { GameContext, GameInstance } from '@chaoshub/game-sdk'

// Network event names (prefixed with game id)
export const RT_EVENTS = {
  STATE_CHANGE: 'reaction-test:state-change',
  PLAYER_CLICKED: 'reaction-test:player-clicked',
  RESULTS: 'reaction-test:results',
  NEXT_ROUND: 'reaction-test:next-round',
} as const

export type RTState = 'waiting' | 'countdown' | 'ready' | 'signal' | 'false-start' | 'results'

export interface RTResult {
  playerId: string
  playerName: string
  reactionMs: number | null // null = false start or no click
  rank: number
}

const TOTAL_ROUNDS = 3
const COUNTDOWN_MS = 3000
const MIN_SIGNAL_DELAY_MS = 1500
const MAX_SIGNAL_DELAY_MS = 5000

export class ReactionTestGame implements GameInstance {
  private ctx: GameContext
  private app: PixiApp | null = null
  private bg!: PixiGraphics
  private mainText!: PixiText
  private subText!: PixiText

  // State
  private state: RTState = 'waiting'
  private currentRound = 0
  private signalTime: number | null = null
  private signalTimeout: ReturnType<typeof setTimeout> | null = null
  private clickTimes = new Map<string, number>() // playerId → timestamp
  private falseStarters = new Set<string>()
  private roundResults: RTResult[][] = []
  private hasClickedThisRound = false

  constructor(context: GameContext) {
    this.ctx = context
  }

  async init(): Promise<void> {
    // Create a Pixi application
    this.app = new PixiApp()
    await this.app.init({
      backgroundColor: 0x0a0a0f,
      resizeTo: document.querySelector('.game-canvas-container') as HTMLElement ?? window,
      antialias: true,
    })

    // Attach canvas to the DOM container
    const container = document.querySelector('.game-canvas-container')
    if (container) container.appendChild(this.app.canvas)

    this.buildScene()
    this.registerNetworkListeners()

    if (this.ctx.network.isHost()) {
      this.startCountdown()
    }
  }

  private buildScene(): void {
    if (!this.app) return

    // Background
    this.bg = new PixiGraphics()
    this.app.stage.addChild(this.bg)

    // Main text
    this.mainText = new PixiText({
      text: '',
      style: new TextStyle({
        fontFamily: 'Space Grotesk, Inter, sans-serif',
        fontSize: 80,
        fontWeight: '900',
        fill: '#ffffff',
        align: 'center',
      }),
    })
    this.mainText.anchor.set(0.5)
    this.app.stage.addChild(this.mainText)

    // Sub text
    this.subText = new PixiText({
      text: '',
      style: new TextStyle({
        fontFamily: 'Space Grotesk, Inter, sans-serif',
        fontSize: 24,
        fontWeight: '400',
        fill: '#9090b0',
        align: 'center',
      }),
    })
    this.subText.anchor.set(0.5)
    this.app.stage.addChild(this.subText)

    // Click handler
    this.app.canvas.addEventListener('click', this.handleClick)
    this.app.canvas.addEventListener('touchstart', this.handleClick)

    this.renderState('waiting')
  }

  private registerNetworkListeners(): void {
    this.ctx.network.on(RT_EVENTS.STATE_CHANGE, (msg) => {
      const payload = msg.payload as { state: RTState; round: number }
      if (!this.ctx.network.isHost()) {
        this.state = payload.state
        this.currentRound = payload.round
        this.hasClickedThisRound = false
        this.renderState(payload.state)
      }
    })

    // Host receives click from client
    this.ctx.network.on(RT_EVENTS.PLAYER_CLICKED, (msg) => {
      if (!this.ctx.network.isHost()) return
      const payload = msg.payload as { playerId: string; timestamp: number }
      this.recordClick(payload.playerId, payload.timestamp)
    })

    // Client receives results
    this.ctx.network.on(RT_EVENTS.RESULTS, (msg) => {
      if (!this.ctx.network.isHost()) {
        const payload = msg.payload as { results: RTResult[]; round: number; final: boolean }
        this.showResults(payload.results, payload.final)
      }
    })

    this.ctx.network.on(RT_EVENTS.NEXT_ROUND, (_msg) => {
      if (!this.ctx.network.isHost()) {
        this.startCountdown()
      }
    })
  }

  // ── Host logic ─────────────────────────────────────────────────────────────

  private startCountdown(): void {
    this.state = 'countdown'
    this.hasClickedThisRound = false
    this.signalTime = null
    this.clickTimes.clear()
    this.falseStarters.clear()

    this.broadcastState('countdown')
    this.renderState('countdown')

    setTimeout(() => this.showReady(), COUNTDOWN_MS)
  }

  private showReady(): void {
    this.state = 'ready'
    this.broadcastState('ready')
    this.renderState('ready')

    const delay = MIN_SIGNAL_DELAY_MS + Math.random() * (MAX_SIGNAL_DELAY_MS - MIN_SIGNAL_DELAY_MS)
    this.signalTimeout = setTimeout(() => this.showSignal(), delay)
  }

  private showSignal(): void {
    this.state = 'signal'
    this.signalTime = Date.now()
    this.broadcastState('signal')
    this.renderState('signal')

    // Auto-close round after 3 seconds if nobody clicked
    setTimeout(() => {
      if (this.state === 'signal') this.collectResults()
    }, 3000)
  }

  private readonly handleClick = (): void => {
    if (this.hasClickedThisRound) return
    this.hasClickedThisRound = true

    const timestamp = Date.now()
    const localId = this.ctx.players.getLocalPlayer().id

    if (this.ctx.network.isHost()) {
      this.recordClick(localId, timestamp)
    } else {
      this.ctx.network.send(RT_EVENTS.PLAYER_CLICKED, { playerId: localId, timestamp })
    }
  }

  private recordClick(playerId: string, timestamp: number): void {
    if (!this.ctx.network.isHost()) return

    if (this.state === 'ready') {
      // False start!
      this.falseStarters.add(playerId)
      return
    }

    if (this.state !== 'signal') return
    if (this.clickTimes.has(playerId)) return
    this.clickTimes.set(playerId, timestamp)
  }

  private collectResults(): void {
    if (!this.ctx.network.isHost()) return

    const players = this.ctx.players.getPlayers()
    const results: RTResult[] = players
      .map((p) => {
        const clickTime = this.clickTimes.get(p.id)
        const isFalseStart = this.falseStarters.has(p.id)
        const reactionMs = isFalseStart || !clickTime || !this.signalTime
          ? null
          : clickTime - this.signalTime
        return { playerId: p.id, playerName: p.name, reactionMs, rank: 0 }
      })
      .sort((a, b) => {
        if (a.reactionMs === null && b.reactionMs === null) return 0
        if (a.reactionMs === null) return 1
        if (b.reactionMs === null) return -1
        return a.reactionMs - b.reactionMs
      })
      .map((r, i) => ({ ...r, rank: i + 1 }))

    this.roundResults.push(results)
    this.currentRound++

    const isFinal = this.currentRound >= TOTAL_ROUNDS
    this.ctx.network.broadcast(RT_EVENTS.RESULTS, { results, round: this.currentRound, final: isFinal })
    this.showResults(results, isFinal)

    if (!isFinal) {
      setTimeout(() => {
        this.ctx.network.broadcast(RT_EVENTS.NEXT_ROUND, {})
        this.startCountdown()
      }, 3000)
    } else {
      this.handleGameEnd(results)
    }
  }

  private handleGameEnd(lastResults: RTResult[]): void {
    const winner = lastResults[0]
    if (winner) {
      const localId = this.ctx.players.getLocalPlayer().id
      if (winner.playerId === localId) {
        this.ctx.stats.record('win')
      } else {
        this.ctx.stats.record('loss')
      }
    }
    this.ctx.stats.record('play')
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  private renderState(state: RTState): void {
    if (!this.app) return
    const w = this.app.screen.width
    const h = this.app.screen.height

    this.mainText.position.set(w / 2, h / 2 - 30)
    this.subText.position.set(w / 2, h / 2 + 60)

    this.bg.clear()

    const configs: Record<RTState, { bg: number; main: string; sub: string }> = {
      waiting: { bg: 0x0a0a0f, main: 'GET READY', sub: 'A round will start soon…' },
      countdown: { bg: 0x0a0a0f, main: 'PREPARE!', sub: 'Watch for the signal…' },
      ready: { bg: 0x1a0a0a, main: '⚠', sub: 'DO NOT CLICK YET' },
      signal: { bg: 0x0a1a0a, main: 'CLICK!', sub: 'GO GO GO' },
      'false-start': { bg: 0x1a0505, main: 'FALSE START!', sub: 'Too early…' },
      results: { bg: 0x0a0a0f, main: 'RESULTS', sub: '' },
    }

    const cfg = configs[state] ?? configs.waiting

    this.bg.rect(0, 0, w, h)
    this.bg.fill(cfg.bg)

    this.mainText.text = cfg.main
    this.subText.text = cfg.sub

    // Neon colors per state
    const textColors: Record<RTState, string> = {
      waiting: '#9090b0',
      countdown: '#ffd60a',
      ready: '#ff6b6b',
      signal: '#30d158',
      'false-start': '#ff2d78',
      results: '#00f5ff',
    }
    ;(this.mainText.style as TextStyle).fill = textColors[state] ?? '#ffffff'
  }

  private showResults(results: RTResult[], _isFinal: boolean): void {
    this.renderState('results')
    if (!this.app) return
    // Results are rendered in the sub-text as a simple list
    const lines = results.slice(0, 5).map((r, i) => {
      const time = r.reactionMs !== null ? `${r.reactionMs}ms` : 'DNF'
      return `${i + 1}. ${r.playerName}  ${time}`
    })
    this.subText.text = lines.join('\n')
    ;(this.subText.style as TextStyle).fontSize = 18
  }

  private broadcastState(state: RTState): void {
    this.ctx.network.broadcast(RT_EVENTS.STATE_CHANGE, {
      state,
      round: this.currentRound,
    })
  }

  // ── GameInstance lifecycle ─────────────────────────────────────────────────

  update(_deltaTime: number): void {
    // Game logic is event-driven; no per-frame work needed beyond Pixi rendering
  }

  destroy(): void {
    if (this.signalTimeout) clearTimeout(this.signalTimeout)
    this.ctx.network.off(RT_EVENTS.STATE_CHANGE, () => {})
    this.ctx.network.off(RT_EVENTS.PLAYER_CLICKED, () => {})
    this.ctx.network.off(RT_EVENTS.RESULTS, () => {})
    this.ctx.network.off(RT_EVENTS.NEXT_ROUND, () => {})
    if (this.app) {
      this.app.canvas.removeEventListener('click', this.handleClick)
      this.app.canvas.removeEventListener('touchstart', this.handleClick)
      this.app.destroy(true, { children: true })
      this.app = null
    }
  }
}
