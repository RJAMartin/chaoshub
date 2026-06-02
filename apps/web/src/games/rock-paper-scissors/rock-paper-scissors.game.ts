// ─────────────────────────────────────────────────────────────────────────────
// Rock Paper Scissors — Simultaneous reveal, best of 5 rounds
//
// All players pick in secret simultaneously.
// Host collects picks, reveals all at once, awards points, repeats for 5 rounds.
// Most wins after 5 rounds wins the match.
// ─────────────────────────────────────────────────────────────────────────────
import { Container, Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'
import { createGameUI } from '@/core/services/game-ui/game-ui'

export const RPS_EVENTS = {
  PICK:   'rps:pick',
  REVEAL: 'rps:reveal',
  FINAL:  'rps:final',
} as const

type Move = 'rock' | 'paper' | 'scissors'
const MOVES: Move[] = ['rock', 'paper', 'scissors']
const EMOJI: Record<Move, string> = { rock: '🪨', paper: '📄', scissors: '✂️' }
const BEATS: Record<Move, Move> = { rock: 'scissors', scissors: 'paper', paper: 'rock' }
const TOTAL_ROUNDS = 5
const PICK_TIMEOUT_MS = 5000

function beats(a: Move, b: Move): boolean { return BEATS[a] === b }

export class RockPaperScissorsGame implements GameInstance {
  private ctx: GameContext
  private app: Application
  private ui = createGameUI()

  private stage!: Container
  private statusText!: Text
  private picksDisplay!: Container
  private scoreHud!: Text

  private currentRound = 0
  private myPick: Move | null = null
  private pickLocked = false
  private gameOver = false
  private scores = new Map<string, number>()
  private picks = new Map<string, Move>()
  private pickTimer: ReturnType<typeof setTimeout> | null = null
  private btnContainers: Container[] = []

  private readonly onPick = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { playerId, move } = msg.payload as { playerId: string; move: Move }
    if (!this.picks.has(playerId)) {
      this.picks.set(playerId, move)
      const players = this.ctx.players.getPlayers()
      if (this.picks.size >= players.length) this.hostReveal()
    }
  }

  private readonly onReveal = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { picks, scores, round } = msg.payload as { picks: {id:string;move:Move}[]; scores: {id:string;score:number}[]; round: number }
    for (const s of scores) this.scores.set(s.id, s.score)
    this.currentRound = round
    this.showReveal(picks, scores)
  }

  private readonly onFinal = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { sorted } = msg.payload as { sorted: {id:string;name:string;score:number}[] }
    this.showFinal(sorted)
  }

  constructor(context: GameContext) {
    this.ctx = context
    this.app = context.pixiApp as Application
  }

  async init(): Promise<void> {
    for (const p of this.ctx.players.getPlayers()) this.scores.set(p.id, 0)
    this.buildScene()
    this.ctx.network.on(RPS_EVENTS.PICK,   this.onPick   as never)
    this.ctx.network.on(RPS_EVENTS.REVEAL, this.onReveal as never)
    this.ctx.network.on(RPS_EVENTS.FINAL,  this.onFinal  as never)

    await this.ui.showInstructions(this.ctx, {
      title: '🪨📄✂️ RPS',
      subtitle: `Best of ${TOTAL_ROUNDS} rounds`,
      lines: [
        '🤜 Everyone picks Rock, Paper, or Scissors at the same time',
        '✂️ Scissors beats Paper  |  📄 Paper beats Rock  |  🪨 Rock beats Scissors',
        `🏆 Most wins after ${TOTAL_ROUNDS} rounds takes the match`,
        '⏱ You have 5 seconds to pick each round!',
      ],
      controls: 'Click or tap your choice',
      accentColor: 0xff9f0a,
    })
    await this.ui.countdown(this.ctx)
    this.ui.clear()
    this.startRound()
  }

  update(_dt: number): void {}

  destroy(): void {
    if (this.pickTimer) clearTimeout(this.pickTimer)
    this.ctx.network.off(RPS_EVENTS.PICK,   this.onPick   as never)
    this.ctx.network.off(RPS_EVENTS.REVEAL, this.onReveal as never)
    this.ctx.network.off(RPS_EVENTS.FINAL,  this.onFinal  as never)
    this.ui.destroy()
    this.app.stage.removeChildren()
  }

  private startRound(): void {
    this.currentRound++
    this.myPick = null
    this.pickLocked = false
    this.picks.clear()
    this.showPickPhase()

    if (this.ctx.network.isHost()) {
      this.pickTimer = setTimeout(() => {
        if (this.picks.size < this.ctx.players.getPlayers().length) {
          // Fill missing picks randomly
          for (const p of this.ctx.players.getPlayers()) {
            if (!this.picks.has(p.id)) {
              this.picks.set(p.id, MOVES[Math.floor(Math.random() * 3)]!)
            }
          }
          this.hostReveal()
        }
      }, PICK_TIMEOUT_MS)
    }
  }

  private hostReveal(): void {
    if (this.pickTimer) { clearTimeout(this.pickTimer); this.pickTimer = null }
    const players = this.ctx.players.getPlayers()

    // Score
    for (const p of players) {
      const myMove = this.picks.get(p.id)!
      let won = false
      for (const other of players) {
        if (other.id === p.id) continue
        const otherMove = this.picks.get(other.id)!
        if (beats(myMove, otherMove)) won = true
      }
      if (won) this.scores.set(p.id, (this.scores.get(p.id) ?? 0) + 1)
    }

    const picksArr = players.map(p => ({ id: p.id, move: this.picks.get(p.id)! }))
    const scoresArr = [...this.scores.entries()].map(([id, score]) => ({ id, score }))
    this.ctx.network.broadcast(RPS_EVENTS.REVEAL, { picks: picksArr, scores: scoresArr, round: this.currentRound })
    this.showReveal(picksArr, scoresArr)

    if (this.currentRound >= TOTAL_ROUNDS) {
      setTimeout(() => this.hostEndGame(), 2500)
    } else {
      setTimeout(() => this.startRound(), 2500)
    }
  }

  private hostEndGame(): void {
    this.gameOver = true
    const sorted = this.ctx.players.getPlayers()
      .map(p => ({ id: p.id, name: p.name, score: this.scores.get(p.id) ?? 0 }))
      .sort((a, b) => b.score - a.score)
    this.ctx.network.broadcast(RPS_EVENTS.FINAL, { sorted })
    this.showFinal(sorted)
  }

  private pick(move: Move): void {
    if (this.pickLocked) return
    this.pickLocked = true
    this.myPick = move
    this.ctx.sound.beep(440, 0.05)
    this.updatePickButtons(move)
    const localId = this.ctx.players.getLocalPlayer().id
    if (this.ctx.network.isHost()) {
      this.onPick({ event: RPS_EVENTS.PICK, payload: { playerId: localId, move }, from: localId, timestamp: Date.now() })
    } else {
      this.ctx.network.send(RPS_EVENTS.PICK, { playerId: localId, move })
    }
    this.statusText.text = `You picked ${EMOJI[move]} — waiting for others…`
  }

  private showPickPhase(): void {
    const { width: W, height: H } = this.app.screen
    this.picksDisplay.removeChildren()
    this.statusText.text = `Round ${this.currentRound} / ${TOTAL_ROUNDS}  —  Choose!`
    ;(this.statusText.style as TextStyle).fill = '#ffffff'

    // Show big pick buttons
    this.btnContainers.forEach(b => { if (!b.destroyed) b.destroy({ children: true }) })
    this.btnContainers = []

    MOVES.forEach((move, i) => {
      const bw = Math.min(W * 0.22, 140)
      const bh = bw * 1.1
      const totalW = MOVES.length * (bw + 20) - 20
      const bx = W / 2 - totalW / 2 + i * (bw + 20)
      const by = H / 2 - bh / 2 + 30

      const ctr = new Container()
      const bg = new Graphics()
      bg.roundRect(0, 0, bw, bh, 14).fill({ color: 0x1a1a2e }).stroke({ color: 0x4040a0, width: 2 })
      ctr.addChild(bg)

      const em = new Text({ text: EMOJI[move], style: new TextStyle({ fontSize: bw * 0.45 }) })
      em.anchor.set(0.5)
      em.position.set(bw / 2, bh * 0.38)
      ctr.addChild(em)

      const label = new Text({ text: move.toUpperCase(), style: new TextStyle({ fontFamily: '"Space Grotesk", monospace', fontSize: 13, fontWeight: '700', fill: '#8080c0' }) })
      label.anchor.set(0.5)
      label.position.set(bw / 2, bh * 0.78)
      ctr.addChild(label)

      ctr.position.set(bx, by)
      ctr.eventMode = 'static'
      ctr.cursor = 'pointer'
      ctr.on('pointerdown', () => this.pick(move))
      ctr.on('pointerover', () => { bg.clear(); bg.roundRect(0, 0, bw, bh, 14).fill({ color: 0x22223a }).stroke({ color: 0x00f5ff, width: 2 }) })
      ctr.on('pointerout',  () => { bg.clear(); bg.roundRect(0, 0, bw, bh, 14).fill({ color: 0x1a1a2e }).stroke({ color: 0x4040a0, width: 2 }) })
      this.stage.addChild(ctr)
      this.btnContainers.push(ctr)
    })
  }

  private updatePickButtons(selected: Move): void {
    this.btnContainers.forEach((ctr, i) => {
      const move = MOVES[i]!
      const bg = ctr.children[0] as Graphics
      bg.clear()
      if (move === selected) {
        const bw = ctr.width; const bh = ctr.height
        bg.roundRect(0, 0, bw, bh, 14).fill({ color: 0x0a1a0a }).stroke({ color: 0x30d158, width: 3 })
      }
    })
  }

  private showReveal(picks: {id:string;move:Move}[], scores: {id:string;score:number}[]): void {
    this.btnContainers.forEach(b => { if (!b.destroyed) b.destroy({ children: true }) })
    this.btnContainers = []
    this.picksDisplay.removeChildren()

    const { width: W, height: H } = this.app.screen
    const players = this.ctx.players.getPlayers()
    const colW = Math.min(W / players.length - 20, 160)
    const startX = W / 2 - (players.length * (colW + 20) - 20) / 2

    picks.forEach((pick, i) => {
      const player = players.find(p => p.id === pick.id)
      if (!player) return
      const myScore = scores.find(s => s.id === pick.id)?.score ?? 0
      const x = startX + i * (colW + 20)

      const col = new Container()
      col.position.set(x, H / 2 - 80)

      const em = new Text({ text: EMOJI[pick.move], style: new TextStyle({ fontSize: colW * 0.5 }) })
      em.anchor.set(0.5, 0)
      em.position.set(colW / 2, 0)
      col.addChild(em)

      const name = new Text({ text: player.name, style: new TextStyle({ fontFamily: '"Space Grotesk", monospace', fontSize: 14, fill: '#c0c0e0', align: 'center' }) })
      name.anchor.set(0.5, 0)
      name.position.set(colW / 2, em.height + 8)
      col.addChild(name)

      const scoreT = new Text({ text: `${myScore} pts`, style: new TextStyle({ fontFamily: '"Space Grotesk", monospace', fontSize: 12, fill: '#4040a0', align: 'center' }) })
      scoreT.anchor.set(0.5, 0)
      scoreT.position.set(colW / 2, em.height + name.height + 12)
      col.addChild(scoreT)

      this.picksDisplay.addChild(col)
    })

    // Determine what to say
    const myPick = picks.find(p => p.id === this.ctx.players.getLocalPlayer().id)
    if (myPick) {
      const others = picks.filter(p => p.id !== this.ctx.players.getLocalPlayer().id)
      const wonAgainst = others.filter(o => beats(myPick.move, o.move)).length
      const lostTo = others.filter(o => beats(o.move, myPick.move)).length
      if (wonAgainst > 0 && lostTo === 0) { this.statusText.text = '✅ You win this round!'; ;(this.statusText.style as TextStyle).fill = '#30d158'; this.ctx.sound.success() }
      else if (lostTo > 0 && wonAgainst === 0) { this.statusText.text = '❌ You lose this round'; ;(this.statusText.style as TextStyle).fill = '#ff6b6b'; this.ctx.sound.fail() }
      else { this.statusText.text = '🤝 Draw!'; ;(this.statusText.style as TextStyle).fill = '#ffd60a' }
    }
    this.updateScoreHud(scores)
  }

  private updateScoreHud(scores: {id:string;score:number}[]): void {
    const players = this.ctx.players.getPlayers()
    this.scoreHud.text = players.map(p => `${p.name}: ${scores.find(s => s.id === p.id)?.score ?? 0}`).join('   ')
  }

  private showFinal(sorted: {id:string;name:string;score:number}[]): void {
    this.gameOver = true
    const winner = sorted[0]!
    const scoreStr = sorted.map((s, i) => `${['🥇','🥈','🥉'][i] ?? `${i+1}.`} ${s.name}: ${s.score} pts`).join('  ')
    this.ui.showWinScreen(this.ctx, winner.id, winner.name, scoreStr, 0xff9f0a)
    if (this.ctx.network.isHost()) {
      this.ctx.stats.record('play')
      const localId = this.ctx.players.getLocalPlayer().id
      if (winner.id === localId) this.ctx.stats.record('win'); else this.ctx.stats.record('loss')
      this.ctx.events.emit('platform:game:ended', {
        gameId: this.ctx.gameId, winnerId: winner.id, durationMs: 0,
        results: sorted.map((s, i) => ({ playerId: s.id, playerName: s.name, rank: i + 1, score: s.score })),
      })
    }
  }

  private buildScene(): void {
    const { width: W, height: H } = this.app.screen
    this.stage = new Container()
    this.app.stage.addChild(this.stage)

    const bg = new Graphics()
    bg.rect(0, 0, W, H).fill(0x08080f)
    this.stage.addChild(bg)

    this.statusText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: '"Space Grotesk", monospace', fontSize: Math.min(W * 0.05, 28), fontWeight: '700', fill: '#ffffff', align: 'center' }),
    })
    this.statusText.anchor.set(0.5, 0)
    this.statusText.position.set(W / 2, 20)
    this.stage.addChild(this.statusText)

    this.picksDisplay = new Container()
    this.stage.addChild(this.picksDisplay)

    this.scoreHud = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#30306a', align: 'center' }),
    })
    this.scoreHud.anchor.set(0.5, 1)
    this.scoreHud.position.set(W / 2, H - 12)
    this.stage.addChild(this.scoreHud)
  }
}
