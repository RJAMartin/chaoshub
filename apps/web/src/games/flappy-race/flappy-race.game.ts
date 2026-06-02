// ─────────────────────────────────────────────────────────────────────────────
// Flappy Race — Side-scrolling parallel flappy-bird race
//
// Each player controls their own bird in a separate lane.
// Tap to flap. Navigate through pipe gaps.
// First to 10 pipes cleared wins, or last bird alive.
// Host-authority: each player simulates their own bird locally AND sends
// state to host, which rebroadcasts for spectating. All birds share pipe seed.
// ─────────────────────────────────────────────────────────────────────────────
import { Container, Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'
import { createGameUI } from '@/core/services/game-ui/game-ui'

export const FR_EVENTS = {
  BIRD_STATE: 'flappy-race:bird-state',
  SCORED:     'flappy-race:scored',
  DEAD:       'flappy-race:dead',
  WINNER:     'flappy-race:winner',
} as const

const PIPE_SPEED   = 160    // px/s
const GRAVITY      = 1200   // px/s²
const FLAP_VEL     = -380   // px/s upward
const BIRD_R       = 14
const PIPE_W       = 52
const GAP_H        = 140
const PIPES_TO_WIN = 10
const LANE_H       = 120    // height per player lane

const PLAYER_COLORS = [0x00f5ff, 0xff2d78, 0xffd60a, 0x30d158, 0xbf5af2, 0xff9f0a]

interface BirdState {
  id: string
  name: string
  y: number
  vy: number
  alive: boolean
  score: number
  colorIdx: number
  laneY: number   // top of this player's lane in the canvas
}

interface Pipe { x: number; gapY: number }

export class FlappyRaceGame implements GameInstance {
  private ctx: GameContext
  private app: Application
  private ui = createGameUI()

  private stage!: Container
  private birdGfx = new Map<string, Graphics>()
  private pipeGfx!: Graphics
  private hudText!: Text
  private birds = new Map<string, BirdState>()
  private pipes: Pipe[] = []

  private GAME_W = 0
  private GAME_H = 0
  private localId = ''
  private gameOver = false
  private lastTime = 0
  private nextPipeX = 0
  private pipeSeed = 0
  private pipeRng = 0

  constructor(context: GameContext) {
    this.ctx = context
    this.app = context.pixiApp as Application
  }

  async init(): Promise<void> {
    this.localId = this.ctx.players.getLocalPlayer().id
    const players = this.ctx.players.getPlayers()
    this.GAME_W = this.app.screen.width
    this.GAME_H = this.app.screen.height

    this.pipeSeed = Math.floor(Math.random() * 100000)
    this.pipeRng = this.pipeSeed

    const laneCount = players.length
    const laneH = Math.min(LANE_H, Math.floor((this.GAME_H - 40) / laneCount))

    players.forEach((p, i) => {
      const laneY = 30 + i * laneH
      this.birds.set(p.id, {
        id: p.id, name: p.name,
        y: laneY + laneH / 2,
        vy: 0, alive: true, score: 0,
        colorIdx: i % PLAYER_COLORS.length,
        laneY,
      })
    })

    this.buildScene()
    this.ctx.network.on(FR_EVENTS.BIRD_STATE, this.onBirdState as never)
    this.ctx.network.on(FR_EVENTS.DEAD,       this.onDead      as never)
    this.ctx.network.on(FR_EVENTS.WINNER,     this.onWinner    as never)

    await this.ui.showInstructions(this.ctx, {
      title: '🐦 Flappy Race',
      subtitle: `First to clear ${PIPES_TO_WIN} pipes wins`,
      lines: [
        '🖱️ Click / Tap or press Space to flap your bird',
        '🚀 Each player has their own lane — same pipes',
        `🏆 Clear ${PIPES_TO_WIN} pipe gaps first to win`,
        '💀 Hit a pipe or the lane walls = eliminated',
      ],
      controls: 'Click / Tap / Space to flap',
      accentColor: 0xffd60a,
    })

    // Sync pipe seed to all clients
    if (this.ctx.network.isHost()) {
      this.ctx.network.broadcast(FR_EVENTS.BIRD_STATE, { seed: this.pipeSeed })
    }

    await this.ui.countdown(this.ctx)
    this.ui.clear()

    this.lastTime = performance.now()
    this.nextPipeX = this.GAME_W + 80
    this.spawnPipe()

    this.app.canvas.addEventListener('click', this.handleFlap)
    this.app.canvas.addEventListener('touchstart', this.handleFlap, { passive: true })
    window.addEventListener('keydown', this.handleKeyFlap)
  }

  update(dt: number): void {
    if (this.gameOver) return
    const myBird = this.birds.get(this.localId)
    if (!myBird || !myBird.alive) return

    // Simulate local bird
    myBird.vy += GRAVITY * dt
    myBird.y += myBird.vy * dt

    const players = this.ctx.players.getPlayers()
    const laneCount = players.length
    const laneH = Math.min(LANE_H, Math.floor((this.GAME_H - 40) / laneCount))
    const laneTop = myBird.laneY
    const laneBot = myBird.laneY + laneH

    // Lane wall collision
    if (myBird.y - BIRD_R < laneTop || myBird.y + BIRD_R > laneBot) {
      this.killBird(this.localId)
      return
    }

    // Pipe collision
    for (const pipe of this.pipes) {
      const birdX = 80
      if (birdX + BIRD_R > pipe.x && birdX - BIRD_R < pipe.x + PIPE_W) {
        // Map pipe gap to local lane
        const gapFrac = (pipe.gapY - 0.5) / 1.0  // -0.5..0.5
        const gapCenter = laneTop + laneH / 2 + gapFrac * (laneH - GAP_H) * 0.5
        const gapTop    = gapCenter - GAP_H / 2
        const gapBottom = gapCenter + GAP_H / 2
        if (myBird.y - BIRD_R < gapTop || myBird.y + BIRD_R > gapBottom) {
          this.killBird(this.localId)
          return
        }
      }
    }

    // Score: passed a pipe
    for (const pipe of this.pipes) {
      if (!pipe['_scored' as keyof Pipe] && pipe.x + PIPE_W < 80 - BIRD_R) {
        (pipe as any)._scored = true
        myBird.score++
        this.ctx.sound.beep(660, 0.05, 0.1)
        if (myBird.score >= PIPES_TO_WIN) {
          this.declareWinner(this.localId, myBird.name)
          return
        }
      }
    }

    // Send my state to others
    if (this.ctx.network.isHost()) {
      this.ctx.network.broadcast(FR_EVENTS.BIRD_STATE, { id: this.localId, y: myBird.y, score: myBird.score, alive: true })
    } else {
      this.ctx.network.send(FR_EVENTS.BIRD_STATE, { id: this.localId, y: myBird.y, score: myBird.score, alive: true })
    }

    // Move pipes (everyone moves them at same speed, same seed — they stay in sync)
    for (const pipe of this.pipes) pipe.x -= PIPE_SPEED * dt
    this.pipes = this.pipes.filter(p => p.x > -PIPE_W - 10)
    this.nextPipeX -= PIPE_SPEED * dt
    if (this.nextPipeX < this.GAME_W - 100) {
      this.spawnPipe()
      this.nextPipeX = this.GAME_W + 200 + Math.random() * 100
    }

    this.renderFrame()
  }

  destroy(): void {
    this.app.canvas.removeEventListener('click', this.handleFlap)
    this.app.canvas.removeEventListener('touchstart', this.handleFlap)
    window.removeEventListener('keydown', this.handleKeyFlap)
    this.ctx.network.off(FR_EVENTS.BIRD_STATE, this.onBirdState as never)
    this.ctx.network.off(FR_EVENTS.DEAD,       this.onDead      as never)
    this.ctx.network.off(FR_EVENTS.WINNER,     this.onWinner    as never)
    this.ui.destroy()
    this.app.stage.removeChildren()
  }

  private readonly handleFlap = (): void => {
    const b = this.birds.get(this.localId)
    if (b && b.alive && !this.gameOver) {
      b.vy = FLAP_VEL
      this.ctx.sound.beep(880, 0.04, 0.08)
    }
  }

  private readonly handleKeyFlap = (e: KeyboardEvent): void => {
    if (e.code === 'Space') { e.preventDefault(); this.handleFlap() }
  }

  private readonly onBirdState = (msg: NetworkMessage) => {
    const data = msg.payload as any
    if (data.seed !== undefined) { this.pipeSeed = data.seed; return }
    const b = this.birds.get(data.id)
    if (b && !b.alive) return
    if (b) { b.y = data.y; b.score = data.score }
  }

  private readonly onDead = (msg: NetworkMessage) => {
    const { id } = msg.payload as { id: string }
    const b = this.birds.get(id)
    if (b) b.alive = false
    this.checkAllDead()
  }

  private readonly onWinner = (msg: NetworkMessage) => {
    const { id, name, scores } = msg.payload as { id: string; name: string; scores: {id:string;score:number}[] }
    this.gameOver = true
    for (const s of scores) { const b = this.birds.get(s.id); if (b) b.score = s.score }
    const scoreStr = [...this.birds.values()].sort((a,b) => b.score-a.score).map((b,i) => `${['🥇','🥈','🥉'][i]??`${i+1}.`} ${b.name}: ${b.score}`).join('  ')
    this.ui.showWinScreen(this.ctx, id, name, scoreStr, 0xffd60a)
  }

  private killBird(id: string): void {
    const b = this.birds.get(id)
    if (!b || !b.alive) return
    b.alive = false
    this.ctx.sound.fail()
    this.ctx.network.broadcast(FR_EVENTS.DEAD, { id })
    this.checkAllDead()
  }

  private checkAllDead(): void {
    const alive = [...this.birds.values()].filter(b => b.alive)
    if (alive.length === 0) {
      const winner = [...this.birds.values()].sort((a,b) => b.score - a.score)[0]!
      this.declareWinner(winner.id, winner.name)
    }
  }

  private declareWinner(id: string, name: string): void {
    if (this.gameOver) return
    this.gameOver = true
    const scores = [...this.birds.values()].map(b => ({ id: b.id, score: b.score }))
    this.ctx.network.broadcast(FR_EVENTS.WINNER, { id, name, scores })
    const scoreStr = [...this.birds.values()].sort((a,b) => b.score-a.score).map((b,i) => `${['🥇','🥈','🥉'][i]??`${i+1}.`} ${b.name}: ${b.score}`).join('  ')
    this.ui.showWinScreen(this.ctx, id, name, scoreStr, 0xffd60a)

    if (this.ctx.network.isHost()) {
      this.ctx.stats.record('play')
      const localId = this.ctx.players.getLocalPlayer().id
      if (id === localId) this.ctx.stats.record('win'); else this.ctx.stats.record('loss')
      this.ctx.events.emit('platform:game:ended', {
        gameId: this.ctx.gameId, winnerId: id, durationMs: 0,
        results: [...this.birds.values()].sort((a,b) => b.score-a.score).map((b,i) => ({ playerId: b.id, playerName: b.name, rank: i+1, score: b.score })),
      })
    }
  }

  private spawnPipe(): void {
    // Deterministic pipe gap using linear congruential
    this.pipeRng = (this.pipeRng * 1664525 + 1013904223) & 0x7fffffff
    const gapY = 0.2 + (this.pipeRng % 1000) / 1000 * 0.6  // 0.2..0.8
    this.pipes.push({ x: this.GAME_W + 60, gapY })
  }

  private renderFrame(): void {
    const players = this.ctx.players.getPlayers()
    const laneH = Math.min(LANE_H, Math.floor((this.GAME_H - 40) / players.length))

    this.pipeGfx.clear()

    // Draw lane backgrounds + dividers
    for (const bird of this.birds.values()) {
      const laneY = bird.laneY
      this.pipeGfx.rect(0, laneY, this.GAME_W, laneH)
        .fill({ color: bird.alive ? 0x0a0a14 : 0x100808, alpha: 1 })
      // Divider
      this.pipeGfx.rect(0, laneY + laneH - 1, this.GAME_W, 1).fill({ color: 0x1a1a30 })

      // Player label
    }

    // Pipes in each lane
    for (const pipe of this.pipes) {
      for (const bird of this.birds.values()) {
        if (!bird.alive) continue
        const laneY = bird.laneY
        const gapFrac = (pipe.gapY - 0.5)
        const gapCenter = laneY + laneH / 2 + gapFrac * (laneH - GAP_H) * 0.5
        const gapTop    = gapCenter - GAP_H / 2
        const gapBottom = gapCenter + GAP_H / 2
        // Top pipe
        this.pipeGfx.rect(pipe.x, laneY, PIPE_W, gapTop - laneY).fill({ color: 0x2a6b2a })
        // Bottom pipe
        this.pipeGfx.rect(pipe.x, gapBottom, PIPE_W, laneY + laneH - gapBottom).fill({ color: 0x2a6b2a })
        // Pipe caps
        this.pipeGfx.rect(pipe.x - 4, gapTop - 14, PIPE_W + 8, 14).fill({ color: 0x30d158 })
        this.pipeGfx.rect(pipe.x - 4, gapBottom,   PIPE_W + 8, 14).fill({ color: 0x30d158 })
      }
    }

    // Birds
    for (const [id, bird] of this.birds) {
      let g = this.birdGfx.get(id)
      if (!g) { g = new Graphics(); this.stage.addChild(g); this.birdGfx.set(id, g) }
      g.clear()
      if (!bird.alive) {
        g.circle(80, bird.y, BIRD_R).fill({ color: PLAYER_COLORS[bird.colorIdx]!, alpha: 0.2 })
      } else {
        g.circle(80, bird.y, BIRD_R).fill({ color: PLAYER_COLORS[bird.colorIdx]! })
        g.circle(80 + BIRD_R * 0.3, bird.y - BIRD_R * 0.2, BIRD_R * 0.25).fill({ color: 0xffffff })
      }
    }

    // HUD scores
    const scores = [...this.birds.values()].map(b => `${b.name}: ${b.score}`).join('   ')
    this.hudText.text = scores
  }

  private buildScene(): void {
    const { width: W, height: H } = this.app.screen
    this.stage = new Container()
    this.app.stage.addChild(this.stage)

    const bg = new Graphics()
    bg.rect(0, 0, W, H).fill(0x08080f)
    this.stage.addChild(bg)

    this.pipeGfx = new Graphics()
    this.stage.addChild(this.pipeGfx)

    this.hudText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 12, fill: '#30306a', align: 'center' }),
    })
    this.hudText.anchor.set(0.5, 1)
    this.hudText.position.set(W / 2, H - 6)
    this.stage.addChild(this.hudText)
  }
}
