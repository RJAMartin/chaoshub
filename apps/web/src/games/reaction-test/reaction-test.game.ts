// ─────────────────────────────────────────────────────────────────────────────
// Reaction Test — Game Implementation
//
// Flow: waiting → countdown → ready (red) → SIGNAL (green) → results
//
// Host:
//   - Manages state machine + timers
//   - Broadcasts state changes to all clients
//   - Collects click timestamps, ranks players, broadcasts results
//
// Client:
//   - Renders current state in the shared Pixi app
//   - Sends click timestamp to host on signal
// ─────────────────────────────────────────────────────────────────────────────
import { Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance } from '@chaoshub/game-sdk'

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
  reactionMs: number | null
  rank: number
}

const TOTAL_ROUNDS = 3
const COUNTDOWN_MS = 3000
const MIN_SIGNAL_DELAY_MS = 1500
const MAX_SIGNAL_DELAY_MS = 5000

export class ReactionTestGame implements GameInstance {
  private ctx: GameContext
  private app: Application

  // Scene objects
  private bg!: Graphics
  private mainText!: Text
  private subText!: Text
  private countdownText!: Text

  // State
  private state: RTState = 'waiting'
  private currentRound = 0
  private signalTime: number | null = null
  private signalTimeout: ReturnType<typeof setTimeout> | null = null
  private countdownInterval: ReturnType<typeof setInterval> | null = null
  private clickTimes = new Map<string, number>()
  private falseStarters = new Set<string>()
  private hasClickedThisRound = false

  // Network event callbacks stored for cleanup
  private readonly onStateChange = (msg: { payload: unknown }) => {
    if (this.ctx.network.isHost()) return
    const payload = msg.payload as { state: RTState; round: number }
    this.state = payload.state
    this.currentRound = payload.round
    this.hasClickedThisRound = false
    this.renderState(payload.state)
  }

  private readonly onPlayerClicked = (msg: { payload: unknown }) => {
    if (!this.ctx.network.isHost()) return
    const payload = msg.payload as { playerId: string; timestamp: number }
    this.recordClick(payload.playerId, payload.timestamp)
  }

  private readonly onResults = (msg: { payload: unknown }) => {
    if (this.ctx.network.isHost()) return
    const payload = msg.payload as { results: RTResult[]; round: number; final: boolean }
    this.showResults(payload.results, payload.final)
  }

  private readonly onNextRound = (_msg: unknown) => {
    if (this.ctx.network.isHost()) return
    this.startCountdown()
  }

  constructor(context: GameContext) {
    this.ctx = context
    this.app = context.pixiApp as Application
  }

  async init(): Promise<void> {
    this.buildScene()
    this.registerNetworkListeners()

    if (this.ctx.network.isHost()) {
      // Small delay so clients have time to init their scene
      setTimeout(() => this.startCountdown(), 500)
    }
  }

  // ── Scene ──────────────────────────────────────────────────────────────────

  private buildScene(): void {
    const { width: w, height: h } = this.app.screen

    this.bg = new Graphics()
    this.app.stage.addChild(this.bg)

    this.mainText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: '"Space Grotesk", Inter, sans-serif',
        fontSize: Math.min(w * 0.12, 96),
        fontWeight: '900',
        fill: '#ffffff',
        align: 'center',
      }),
    })
    this.mainText.anchor.set(0.5)
    this.mainText.position.set(w / 2, h / 2 - 40)
    this.app.stage.addChild(this.mainText)

    this.subText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: '"Space Grotesk", Inter, sans-serif',
        fontSize: Math.min(w * 0.03, 22),
        fontWeight: '400',
        fill: '#9090b0',
        align: 'center',
      }),
    })
    this.subText.anchor.set(0.5)
    this.subText.position.set(w / 2, h / 2 + 60)
    this.app.stage.addChild(this.subText)

    this.countdownText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: '"Space Grotesk", Inter, sans-serif',
        fontSize: Math.min(w * 0.06, 48),
        fontWeight: '700',
        fill: '#ffd60a',
        align: 'center',
      }),
    })
    this.countdownText.anchor.set(0.5)
    this.countdownText.position.set(w / 2, h / 2 + 120)
    this.app.stage.addChild(this.countdownText)

    // Click handler
    this.app.canvas.addEventListener('click', this.handleClick)
    this.app.canvas.addEventListener('touchstart', this.handleClick, { passive: true })

    this.renderState('waiting')
  }

  // ── Network ────────────────────────────────────────────────────────────────

  private registerNetworkListeners(): void {
    this.ctx.network.on(RT_EVENTS.STATE_CHANGE, this.onStateChange as never)
    this.ctx.network.on(RT_EVENTS.PLAYER_CLICKED, this.onPlayerClicked as never)
    this.ctx.network.on(RT_EVENTS.RESULTS, this.onResults as never)
    this.ctx.network.on(RT_EVENTS.NEXT_ROUND, this.onNextRound as never)
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

    let count = 3
    this.countdownText.text = String(count)
    this.animateCountdownPulse(count)
    this.ctx.sound.beep(440, 0.08, 0.15)

    this.countdownInterval = setInterval(() => {
      count--
      if (count > 0) {
        this.countdownText.text = String(count)
        this.animateCountdownPulse(count)
        this.ctx.sound.beep(440, 0.08, 0.15)
      } else {
        clearInterval(this.countdownInterval!)
        this.countdownInterval = null
        this.countdownText.text = 'GO!'
        this.ctx.sound.beep(880, 0.12, 0.2)
        setTimeout(() => { this.countdownText.text = '' }, 400)
        this.showReady()
      }
    }, 1000)
  }

  private animateCountdownPulse(n: number): void {
    const { width: w, height: h } = this.app.screen
    const size = Math.min(w * 0.18, 140)
    ;(this.countdownText.style as TextStyle).fontSize = size
    this.countdownText.position.set(w / 2, h / 2 + 40)
    // Shrink back over 800ms
    let elapsed = 0
    const target = Math.min(w * 0.06, 48)
    const animate = () => {
      elapsed += 16
      const t = Math.min(elapsed / 800, 1)
      const current = size + (target - size) * t
      ;(this.countdownText.style as TextStyle).fontSize = current
      if (t < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
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

    // Auto-collect after 3s even if nobody clicked
    this.signalTimeout = setTimeout(() => {
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
    if (this.state === 'ready' || this.state === 'countdown') {
      this.falseStarters.add(playerId)
      // Show false start locally if it's our own click
      if (playerId === this.ctx.players.getLocalPlayer().id) {
        this.renderState('false-start')
      }
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
        const reactionMs =
          !isFalseStart && clickTime && this.signalTime
            ? clickTime - this.signalTime
            : null
        return { playerId: p.id, playerName: p.name, reactionMs, rank: 0 }
      })
      .sort((a, b) => {
        if (a.reactionMs === null && b.reactionMs === null) return 0
        if (a.reactionMs === null) return 1
        if (b.reactionMs === null) return -1
        return a.reactionMs - b.reactionMs
      })
      .map((r, i) => ({ ...r, rank: i + 1 }))

    this.currentRound++
    const isFinal = this.currentRound >= TOTAL_ROUNDS

    this.ctx.network.broadcast(RT_EVENTS.RESULTS, { results, round: this.currentRound, final: isFinal })
    this.showResults(results, isFinal)

    if (!isFinal) {
      this.signalTimeout = setTimeout(() => {
        this.ctx.network.broadcast(RT_EVENTS.NEXT_ROUND, {})
        this.startCountdown()
      }, 3500)
    } else {
      this.handleGameEnd(results)
    }
  }

  private handleGameEnd(results: RTResult[]): void {
    const localId = this.ctx.players.getLocalPlayer().id
    const myResult = results.find((r) => r.playerId === localId)
    const winner = results[0]
    this.ctx.stats.record('play')
    if (winner?.playerId === localId && myResult?.reactionMs !== null) {
      this.ctx.stats.record('win')
    } else if (myResult?.reactionMs !== null) {
      this.ctx.stats.record('loss')
    }

    // Signal platform that game ended, carrying results for the ScoreBoard
    this.ctx.events.emit('platform:game:ended', {
      gameId: this.ctx.gameId,
      winnerId: winner?.playerId,
      durationMs: 0, // filled in by game.store
      results,
    })
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  private renderState(state: RTState): void {
    const { width: w, height: h } = this.app.screen

    this.mainText.position.set(w / 2, h / 2 - 40)
    this.subText.position.set(w / 2, h / 2 + 60)
    this.countdownText.position.set(w / 2, h / 2 + 120)

    this.bg.clear()

    const configs: Record<RTState, { bg: number; main: string; sub: string; mainColor: string }> = {
      waiting:      { bg: 0x0a0a0f, main: 'WAITING…',    sub: 'Get ready for the first round', mainColor: '#9090b0' },
      countdown:    { bg: 0x0d0d1a, main: 'PREPARE',     sub: 'Watch for the signal — DO NOT CLICK', mainColor: '#ffd60a' },
      ready:        { bg: 0x1a0808, main: '⚠ WAIT',      sub: 'Do not click yet!', mainColor: '#ff6b6b' },
      signal:       { bg: 0x061a06, main: 'CLICK NOW!',  sub: 'As fast as you can!', mainColor: '#30d158' },
      'false-start':{ bg: 0x1a0505, main: 'TOO EARLY!',  sub: 'False start — you are disqualified this round', mainColor: '#ff2d78' },
      results:      { bg: 0x0a0a0f, main: 'RESULTS',     sub: '', mainColor: '#00f5ff' },
    }

    const cfg = configs[state]

    this.bg.rect(0, 0, w, h).fill(cfg.bg)
    this.mainText.text = cfg.main
    this.subText.text = cfg.sub
    ;(this.mainText.style as TextStyle).fill = cfg.mainColor
  }

  private showResults(results: RTResult[], isFinal: boolean): void {
    this.renderState('results')
    const lines = results.slice(0, 6).map((r) => {
      const medal = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `${r.rank}.`
      const time = r.reactionMs !== null ? `${r.reactionMs}ms` : 'DNF'
      return `${medal} ${r.playerName}  ${time}`
    })
    if (isFinal) lines.unshift(`— FINAL RESULTS —\n`)
    else lines.unshift(`— Round ${this.currentRound}/${TOTAL_ROUNDS} —\n`)

    this.subText.text = lines.join('\n')
    ;(this.subText.style as TextStyle).fontSize = 17
    ;(this.subText.style as TextStyle).lineHeight = 26
    ;(this.subText.style as TextStyle).fill = '#c0c0e0'
  }

  private broadcastState(state: RTState): void {
    this.ctx.network.broadcast(RT_EVENTS.STATE_CHANGE, {
      state,
      round: this.currentRound,
    })
  }

  // ── GameInstance lifecycle ─────────────────────────────────────────────────

  update(_deltaTime: number): void {
    // All logic is event-driven and timer-based; no per-frame work needed
  }

  destroy(): void {
    if (this.signalTimeout) clearTimeout(this.signalTimeout)
    if (this.countdownInterval) clearInterval(this.countdownInterval)

    this.ctx.network.off(RT_EVENTS.STATE_CHANGE, this.onStateChange as never)
    this.ctx.network.off(RT_EVENTS.PLAYER_CLICKED, this.onPlayerClicked as never)
    this.ctx.network.off(RT_EVENTS.RESULTS, this.onResults as never)
    this.ctx.network.off(RT_EVENTS.NEXT_ROUND, this.onNextRound as never)

    this.app.canvas.removeEventListener('click', this.handleClick)
    this.app.canvas.removeEventListener('touchstart', this.handleClick)

    // Clear stage (do NOT destroy the app — it belongs to <GameCanvas>)
    this.app.stage.removeChildren()
  }
}
