// ─────────────────────────────────────────────────────────────────────────────
// Simon Says — Game Implementation
//
// A growing colour sequence is shown (flashing panels). All players must
// reproduce the sequence by clicking the panels in order. Any player who
// makes a mistake is eliminated. Last player surviving wins.
//
// Host controls sequence & timing; broadcasts SHOW, INPUT_OPEN, RESULT events.
// ─────────────────────────────────────────────────────────────────────────────
import { Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'
import { createGameUI } from '@/core/services/game-ui/game-ui'

// ── Constants ─────────────────────────────────────────────────────────────────

export const SS_EVENTS = {
  SHOW_SEQUENCE: 'simon-says:show-sequence',
  INPUT_OPEN:    'simon-says:input-open',
  PLAYER_INPUT:  'simon-says:player-input',
  ROUND_RESULT:  'simon-says:round-result',
  ELIMINATED:    'simon-says:eliminated',
  WINNER:        'simon-says:winner',
} as const

const PANEL_COLORS = [0xe74c3c, 0x2ecc71, 0xf1c40f, 0x3498db]  // red, green, yellow, blue
const PANEL_LABELS = ['RED', 'GREEN', 'YELLOW', 'BLUE']
const LOGIC_W = 700
const LOGIC_H = 600
const FLASH_ON_MS  = 600
const FLASH_OFF_MS = 200

// ── Game class ────────────────────────────────────────────────────────────────

export class SimonSaysGame implements GameInstance {
  private ctx: GameContext
  private app: Application
  private ui = createGameUI()

  // Scene
  private stage!: Graphics
  private panels: Graphics[] = []
  private panelLabels: Text[] = []
  private statusText!: Text
  private roundText!: Text
  private survivorsText!: Text

  // State
  private sequence: number[] = []
  private inputIndex = 0
  private inputOpen = false
  private eliminated = new Set<string>()
  private playerInputs = new Map<string, number[]>()
  private round = 0

  // ── Network ───────────────────────────────────────────────────────────────

  private readonly onShowSequence = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { sequence } = msg.payload as { sequence: number[] }
    this.sequence = sequence
    this.playSequence()
  }

  private readonly onInputOpen = (_msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    this.openInput()
  }

  private readonly onPlayerInput = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { playerId, inputs } = msg.payload as { playerId: string; inputs: number[] }
    this.playerInputs.set(playerId, inputs)
    this.checkAllResponded()
  }

  private readonly onRoundResult = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { eliminated } = msg.payload as { eliminated: string[] }
    for (const id of eliminated) this.eliminated.add(id)
    this.updateSurvivors()
  }

  private readonly onEliminated = (msg: NetworkMessage) => {
    const { playerId } = msg.payload as { playerId: string }
    this.eliminated.add(playerId)
    this.updateSurvivors()
    const localId = this.ctx.players.getLocalPlayer().id
    if (playerId === localId) {
      this.statusText.text = 'YOU ARE ELIMINATED'
      ;(this.statusText.style as TextStyle).fill = '#ff2d78'
      this.inputOpen = false
      this.setPanelsInteractive(false)
    }
  }

  private readonly onWinner = (msg: NetworkMessage) => {
    const { winnerId, winnerName } = msg.payload as { winnerId: string; winnerName: string }
    this.showWinner(winnerId, winnerName)
  }

  constructor(context: GameContext) {
    this.ctx = context
    this.app = context.pixiApp as Application
  }

  async init(): Promise<void> {
    this.buildScene()
    this.ctx.network.on(SS_EVENTS.SHOW_SEQUENCE, this.onShowSequence as never)
    this.ctx.network.on(SS_EVENTS.INPUT_OPEN,    this.onInputOpen as never)
    this.ctx.network.on(SS_EVENTS.PLAYER_INPUT,  this.onPlayerInput as never)
    this.ctx.network.on(SS_EVENTS.ROUND_RESULT,  this.onRoundResult as never)
    this.ctx.network.on(SS_EVENTS.ELIMINATED,    this.onEliminated as never)
    this.ctx.network.on(SS_EVENTS.WINNER,        this.onWinner as never)

    await this.ui.showInstructions(this.ctx, {
      title: '🧠 Simon Says',
      subtitle: 'Watch the sequence. Repeat it. Don\'t make mistakes.',
      lines: [
        '👀 Watch the coloured buttons light up in order',
        '🎯 Repeat the exact same sequence by clicking the buttons',
        '❌ One wrong press and you\'re eliminated!',
        '🏆 Last player to survive wins',
      ],
      controls: 'Click / Tap the coloured buttons',
      accentColor: 0xbf5af2,
    })
    await this.ui.countdown(this.ctx)
    this.ui.clear()

    if (this.ctx.network.isHost()) {
      setTimeout(() => this.nextRound(), 400)
    }
  }

  update(_dt: number): void {}

  destroy(): void {
    this.ctx.network.off(SS_EVENTS.SHOW_SEQUENCE, this.onShowSequence as never)
    this.ctx.network.off(SS_EVENTS.INPUT_OPEN,    this.onInputOpen as never)
    this.ctx.network.off(SS_EVENTS.PLAYER_INPUT,  this.onPlayerInput as never)
    this.ctx.network.off(SS_EVENTS.ROUND_RESULT,  this.onRoundResult as never)
    this.ctx.network.off(SS_EVENTS.ELIMINATED,    this.onEliminated as never)
    this.ctx.network.off(SS_EVENTS.WINNER,        this.onWinner as never)
    this.ui.destroy()
    this.app.stage.removeChildren()
  }

  // ── Scene ─────────────────────────────────────────────────────────────────

  private buildScene(): void {
    this.stage = new Graphics()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    this.app.stage.addChild(this.stage)
    this.scaleStage()

    const title = new Text({
      text: 'SIMON SAYS',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 28, fontWeight: '900', fill: '#00f5ff', letterSpacing: 5 }),
    })
    title.anchor.set(0.5, 0)
    title.position.set(LOGIC_W / 2, 14)
    this.stage.addChild(title)

    this.roundText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 16, fill: '#ffd60a' }),
    })
    this.roundText.anchor.set(0.5, 0)
    this.roundText.position.set(LOGIC_W / 2, 52)
    this.stage.addChild(this.roundText)

    this.statusText = new Text({
      text: 'Get ready…',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 18, fill: '#c0c0e0' }),
    })
    this.statusText.anchor.set(0.5, 0)
    this.statusText.position.set(LOGIC_W / 2, 78)
    this.stage.addChild(this.statusText)

    this.survivorsText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#606080' }),
    })
    this.survivorsText.anchor.set(0.5, 0)
    this.survivorsText.position.set(LOGIC_W / 2, 108)
    this.stage.addChild(this.survivorsText)

    // 2×2 grid of panels
    const panelW = 200
    const panelH = 200
    const gap = 20
    const gridX = (LOGIC_W - (panelW * 2 + gap)) / 2
    const gridY = 140

    PANEL_COLORS.forEach((color, i) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      const x = gridX + col * (panelW + gap)
      const y = gridY + row * (panelH + gap)

      const panel = new Graphics()
      panel.roundRect(0, 0, panelW, panelH, 16).fill({ color, alpha: 0.3 })
      panel.position.set(x, y)
      panel.eventMode = 'static'
      panel.cursor = 'pointer'
      panel.on('pointerdown', () => this.handlePanelClick(i))
      this.stage.addChild(panel)
      this.panels.push(panel)

      const label = new Text({
        text: PANEL_LABELS[i] ?? '',
        style: new TextStyle({ fontFamily: 'monospace', fontSize: 18, fontWeight: '700', fill: `#${color.toString(16).padStart(6, '0')}` }),
      })
      label.alpha = 0.6
      label.anchor.set(0.5)
      label.position.set(x + panelW / 2, y + panelH / 2)
      this.stage.addChild(label)
      this.panelLabels.push(label)
    })
  }

  // ── Host logic ────────────────────────────────────────────────────────────

  private nextRound(): void {
    this.round++
    this.sequence.push(Math.floor(Math.random() * 4))
    this.playerInputs.clear()
    this.inputOpen = false

    this.ctx.network.broadcast(SS_EVENTS.SHOW_SEQUENCE, { sequence: this.sequence })
    this.playSequence()
  }

  private playSequence(): void {
    this.inputOpen = false
    this.setPanelsInteractive(false)
    this.roundText.text = `Round ${this.round} — sequence length: ${this.sequence.length}`
    this.statusText.text = 'Watch carefully…'
    ;(this.statusText.style as TextStyle).fill = '#c0c0e0'

    let i = 0
    const flash = () => {
      if (i >= this.sequence.length) {
        setTimeout(() => {
          if (this.ctx.network.isHost()) this.ctx.network.broadcast(SS_EVENTS.INPUT_OPEN, {})
          this.openInput()
        }, 400)
        return
      }
      const idx = this.sequence[i]!
      this.flashPanel(idx, FLASH_ON_MS, () => {
        i++
        setTimeout(flash, FLASH_OFF_MS)
      })
    }
    setTimeout(flash, 600)
  }

  private openInput(): void {
    this.inputIndex = 0
    this.inputOpen = true
    const localId = this.ctx.players.getLocalPlayer().id
    if (this.eliminated.has(localId)) return
    this.setPanelsInteractive(true)
    this.statusText.text = 'Your turn — repeat the sequence!'
    ;(this.statusText.style as TextStyle).fill = '#30d158'
  }

  private handlePanelClick(panelIdx: number): void {
    if (!this.inputOpen) return
    const localId = this.ctx.players.getLocalPlayer().id
    if (this.eliminated.has(localId)) return

    this.flashPanel(panelIdx, 200, () => {})

    const expectedIdx = this.sequence[this.inputIndex]
    if (panelIdx !== expectedIdx) {
      // Wrong — immediately eliminated
      this.inputOpen = false
      this.setPanelsInteractive(false)
      this.statusText.text = 'WRONG! You are out.'
      ;(this.statusText.style as TextStyle).fill = '#ff2d78'
      if (this.ctx.network.isHost()) {
        this.eliminated.add(localId)
        this.ctx.network.broadcast(SS_EVENTS.ELIMINATED, { playerId: localId })
        this.checkAllResponded()
      } else {
        this.ctx.network.send(SS_EVENTS.PLAYER_INPUT, { playerId: localId, inputs: [-1] }) // signal failure
      }
      return
    }

    this.inputIndex++
    if (this.inputIndex >= this.sequence.length) {
      // Completed successfully
      this.inputOpen = false
      this.setPanelsInteractive(false)
      this.statusText.text = 'Correct!'
      ;(this.statusText.style as TextStyle).fill = '#ffd60a'
      if (this.ctx.network.isHost()) {
        this.checkAllResponded()
      } else {
        this.ctx.network.send(SS_EVENTS.PLAYER_INPUT, { playerId: localId, inputs: this.sequence })
      }
    }
  }

  private checkAllResponded(): void {
    if (!this.ctx.network.isHost()) return
    const activePlayers = this.ctx.players.getPlayers().filter(p => !this.eliminated.has(p.id))
    const allResponded = activePlayers.every(p =>
      this.eliminated.has(p.id) || this.playerInputs.has(p.id),
    )
    if (!allResponded) return

    // Determine who was eliminated this round (sent [-1])
    const newlyEliminated: string[] = []
    for (const [id, inputs] of this.playerInputs) {
      if (inputs[0] === -1) {
        newlyEliminated.push(id)
        this.eliminated.add(id)
      }
    }
    if (newlyEliminated.length > 0) {
      this.ctx.network.broadcast(SS_EVENTS.ROUND_RESULT, { eliminated: newlyEliminated })
      this.updateSurvivors()
    }

    const survivors = this.ctx.players.getPlayers().filter(p => !this.eliminated.has(p.id))
    if (survivors.length <= 1) {
      const winner = survivors[0] ?? this.ctx.players.getPlayers()[0]!
      this.ctx.network.broadcast(SS_EVENTS.WINNER, { winnerId: winner.id, winnerName: winner.name })
      this.showWinner(winner.id, winner.name)
    } else {
      setTimeout(() => this.nextRound(), 2000)
    }
  }

  private updateSurvivors(): void {
    const all = this.ctx.players.getPlayers()
    const alive = all.filter(p => !this.eliminated.has(p.id))
    this.survivorsText.text = `Survivors: ${alive.map(p => p.name).join(', ')}`
  }

  // ── Visual helpers ────────────────────────────────────────────────────────

  private flashPanel(idx: number, durationMs: number, cb: () => void): void {
    const panel = this.panels[idx]
    const color = PANEL_COLORS[idx] ?? 0xffffff
    if (!panel) { cb(); return }
    panel.clear()
    panel.roundRect(0, 0, 200, 200, 16).fill({ color, alpha: 1 })
    setTimeout(() => {
      panel.clear()
      panel.roundRect(0, 0, 200, 200, 16).fill({ color, alpha: 0.3 })
      cb()
    }, durationMs)
  }

  private setPanelsInteractive(on: boolean): void {
    for (const p of this.panels) {
      p.eventMode = on ? 'static' : 'none'
      p.cursor = on ? 'pointer' : 'default'
    }
  }

  private showWinner(winnerId: string, winnerName: string): void {
    this.stage.removeChildren()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)

    const localId = this.ctx.players.getLocalPlayer().id
    const isWinner = winnerId === localId

    const headline = new Text({
      text: isWinner ? '🏆 YOU WIN!' : `${winnerName} wins!`,
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 38, fontWeight: '900', fill: isWinner ? '#ffd60a' : '#00f5ff', letterSpacing: 3 }),
    })
    headline.anchor.set(0.5)
    headline.position.set(LOGIC_W / 2, LOGIC_H / 2 - 40)
    this.stage.addChild(headline)

    const sub = new Text({
      text: `Survived ${this.round} rounds`,
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 20, fill: '#c0c0e0' }),
    })
    sub.anchor.set(0.5)
    sub.position.set(LOGIC_W / 2, LOGIC_H / 2 + 30)
    this.stage.addChild(sub)

    if (this.ctx.network.isHost()) {
      this.ctx.stats.record('play')
      if (isWinner) this.ctx.stats.record('win')
      else this.ctx.stats.record('loss')
      this.ctx.events.emit('platform:game:ended', {
        gameId: this.ctx.gameId,
        winnerId,
        durationMs: 0,
        results: [],
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
