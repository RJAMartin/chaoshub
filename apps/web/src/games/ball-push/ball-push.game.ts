// ─────────────────────────────────────────────────────────────────────────────
// Ball Push — 2-player physics game
//
// Architecture:
//   Host runs the authoritative Matter.js physics simulation each frame.
//   Host broadcasts body positions to clients at ~20hz (every 3 frames).
//   Clients render received positions via Pixi. Input is sent to host.
//
//   Court: horizontal. Player 1 (host) on the left, Player 2 on the right.
//   Paddles move up/down only. Ball bounces freely.
//   Score when ball crosses the goal line on either side.
// ─────────────────────────────────────────────────────────────────────────────
import {
  Graphics,
  Text,
  TextStyle,
  type Application,
  Container,
} from 'pixi.js'
import Matter, {
  Engine,
  Render as MatterRender,
  Bodies,
  Body,
  World,
  Events as MatterEvents,
  type IEventCollision,
} from 'matter-js'
import type { GameContext, GameInstance } from '@chaoshub/game-sdk'

export const BP_EVENTS = {
  INPUT: 'ball-push:input',
  STATE: 'ball-push:state',
  SCORE: 'ball-push:score',
  RESET: 'ball-push:reset',
  GAME_OVER: 'ball-push:game-over',
} as const

interface BPState {
  ball: { x: number; y: number }
  p1: { y: number }
  p2: { y: number }
}

interface BPScore {
  p1: number
  p2: number
}

const WINNING_SCORE = 3
const BROADCAST_EVERY_N_FRAMES = 2

// Logical game dimensions (we scale to fit the canvas)
const LOGIC_W = 800
const LOGIC_H = 500
const PADDLE_W = 18
const PADDLE_H = 100
const BALL_R = 14
const PADDLE_SPEED = 7
const PADDLE_MARGIN = 40

export class BallPushGame implements GameInstance {
  private ctx: GameContext
  private app: Application
  private stage!: Container

  // Pixi display objects
  private gBall!: Graphics
  private gP1!: Graphics
  private gP2!: Graphics
  private gNet!: Graphics
  private scoreText!: Text
  private statusText!: Text
  private touchUpBtn!: Graphics
  private touchDownBtn!: Graphics

  // Physics (host only)
  private engine?: Matter.Engine
  private ball?: Matter.Body
  private paddle1?: Matter.Body
  private paddle2?: Matter.Body
  private topWall?: Matter.Body
  private bottomWall?: Matter.Body

  // State
  private score: BPScore = { p1: 0, p2: 0 }
  private frameCount = 0
  private gameOver = false
  private isPlayerOne = false // host = p1, first joiner = p2
  private remoteState: BPState = { ball: { x: LOGIC_W / 2, y: LOGIC_H / 2 }, p1: { y: LOGIC_H / 2 }, p2: { y: LOGIC_H / 2 } }

  // Input tracking
  private keysDown = new Set<string>()

  // Network callbacks for cleanup
  private readonly onInput = (msg: { payload: unknown }) => {
    if (!this.ctx.network.isHost()) return
    const { dir } = msg.payload as { dir: 1 | -1 | 0; playerId: string }
    if (this.paddle2) {
      const vy = dir * PADDLE_SPEED
      Body.setVelocity(this.paddle2, { x: 0, y: vy })
    }
  }

  private readonly onState = (msg: { payload: unknown }) => {
    if (this.ctx.network.isHost()) return
    this.remoteState = msg.payload as BPState
  }

  private readonly onScore = (msg: { payload: unknown }) => {
    this.score = msg.payload as BPScore
    this.updateScoreDisplay()
  }

  private readonly onReset = (_msg: unknown) => {
    if (!this.ctx.network.isHost()) {
      this.remoteState = { ball: { x: LOGIC_W / 2, y: LOGIC_H / 2 }, p1: { y: LOGIC_H / 2 }, p2: { y: LOGIC_H / 2 } }
    }
  }

  private readonly onGameOver = (msg: { payload: unknown }) => {
    const { winner } = msg.payload as { winner: 'p1' | 'p2' }
    this.showGameOver(winner)
  }

  constructor(context: GameContext) {
    this.ctx = context
    this.app = context.pixiApp as Application
  }

  async init(): Promise<void> {
    this.buildScene()
    this.registerNetworkListeners()
    this.registerInputListeners()

    const players = this.ctx.players.getPlayers()
    // Host is always p1
    this.isPlayerOne = this.ctx.network.isHost()
    // If only 1 player, still run as p1
    if (players.length < 2 && !this.ctx.network.isHost()) {
      this.isPlayerOne = false
    }

    if (this.ctx.network.isHost()) {
      this.initPhysics()
    }
  }

  // ── Scene ──────────────────────────────────────────────────────────────────

  private buildScene(): void {
    this.stage = new Container()
    this.app.stage.addChild(this.stage)

    // Court background
    const bg = new Graphics()
    bg.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x080812)
    this.stage.addChild(bg)

    // Net (center dashed line)
    this.gNet = new Graphics()
    this.drawNet()
    this.stage.addChild(this.gNet)

    // Paddles
    this.gP1 = new Graphics()
    this.gP1.roundRect(-PADDLE_W / 2, -PADDLE_H / 2, PADDLE_W, PADDLE_H, 4).fill(0x4d96ff)
    this.stage.addChild(this.gP1)

    this.gP2 = new Graphics()
    this.gP2.roundRect(-PADDLE_W / 2, -PADDLE_H / 2, PADDLE_W, PADDLE_H, 4).fill(0xff6b6b)
    this.stage.addChild(this.gP2)

    // Ball
    this.gBall = new Graphics()
    this.gBall.circle(0, 0, BALL_R).fill(0xffd60a)
    this.stage.addChild(this.gBall)

    // Score
    this.scoreText = new Text({
      text: '0  —  0',
      style: new TextStyle({
        fontFamily: '"Space Grotesk", sans-serif',
        fontSize: 32,
        fontWeight: '800',
        fill: '#f0f0ff',
        align: 'center',
      }),
    })
    this.scoreText.anchor.set(0.5, 0)
    this.scoreText.position.set(LOGIC_W / 2, 12)
    this.stage.addChild(this.scoreText)

    // Status text
    this.statusText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: '"Space Grotesk", sans-serif',
        fontSize: 22,
        fontWeight: '700',
        fill: '#ffd60a',
        align: 'center',
      }),
    })
    this.statusText.anchor.set(0.5)
    this.statusText.position.set(LOGIC_W / 2, LOGIC_H / 2 - 60)
    this.stage.addChild(this.statusText)

    // Touch controls (visible on touch devices, semi-transparent on desktop)
    this.buildTouchControls()

    // Scale stage to fit canvas
    this.scaleStage()

    // Initial positions
    this.gP1.position.set(PADDLE_MARGIN, LOGIC_H / 2)
    this.gP2.position.set(LOGIC_W - PADDLE_MARGIN, LOGIC_H / 2)
    this.gBall.position.set(LOGIC_W / 2, LOGIC_H / 2)
  }

  private buildTouchControls(): void {
    const BTN_W = 80
    const BTN_H = 60
    const BTN_X = LOGIC_W - BTN_W - 8
    const BTN_ALPHA = 0.35

    // UP button
    this.touchUpBtn = new Graphics()
    this.touchUpBtn
      .roundRect(0, 0, BTN_W, BTN_H, 10)
      .fill({ color: 0x4d96ff, alpha: BTN_ALPHA })
    const upArrow = new Text({ text: '▲', style: new TextStyle({ fontSize: 28, fill: '#ffffff', fontFamily: 'sans-serif' }) })
    upArrow.anchor.set(0.5)
    upArrow.position.set(BTN_W / 2, BTN_H / 2)
    this.touchUpBtn.addChild(upArrow)
    this.touchUpBtn.position.set(BTN_X, LOGIC_H / 2 - BTN_H - 8)
    this.touchUpBtn.eventMode = 'static'
    this.touchUpBtn.cursor = 'pointer'
    this.touchUpBtn.on('pointerdown', () => this.keysDown.add('ArrowUp'))
    this.touchUpBtn.on('pointerup', () => this.keysDown.delete('ArrowUp'))
    this.touchUpBtn.on('pointerupoutside', () => this.keysDown.delete('ArrowUp'))
    this.stage.addChild(this.touchUpBtn)

    // DOWN button
    this.touchDownBtn = new Graphics()
    this.touchDownBtn
      .roundRect(0, 0, BTN_W, BTN_H, 10)
      .fill({ color: 0x4d96ff, alpha: BTN_ALPHA })
    const downArrow = new Text({ text: '▼', style: new TextStyle({ fontSize: 28, fill: '#ffffff', fontFamily: 'sans-serif' }) })
    downArrow.anchor.set(0.5)
    downArrow.position.set(BTN_W / 2, BTN_H / 2)
    this.touchDownBtn.addChild(downArrow)
    this.touchDownBtn.position.set(BTN_X, LOGIC_H / 2 + 8)
    this.touchDownBtn.eventMode = 'static'
    this.touchDownBtn.cursor = 'pointer'
    this.touchDownBtn.on('pointerdown', () => this.keysDown.add('ArrowDown'))
    this.touchDownBtn.on('pointerup', () => this.keysDown.delete('ArrowDown'))
    this.touchDownBtn.on('pointerupoutside', () => this.keysDown.delete('ArrowDown'))
    this.stage.addChild(this.touchDownBtn)
  }

  private drawNet(): void {
    this.gNet.clear()
    const x = LOGIC_W / 2
    for (let y = 10; y < LOGIC_H; y += 20) {
      this.gNet.moveTo(x, y)
      this.gNet.lineTo(x, y + 10)
      this.gNet.stroke({ width: 2, color: 0x2a2a45 })
    }
  }

  private scaleStage(): void {
    const cw = this.app.screen.width
    const ch = this.app.screen.height
    const scale = Math.min(cw / LOGIC_W, ch / LOGIC_H) * 0.95
    this.stage.scale.set(scale)
    this.stage.position.set(
      (cw - LOGIC_W * scale) / 2,
      (ch - LOGIC_H * scale) / 2,
    )
  }

  // ── Physics (host only) ───────────────────────────────────────────────────

  private initPhysics(): void {
    this.engine = Engine.create({ gravity: { x: 0, y: 0 } })
    const w = this.engine

    this.topWall = Bodies.rectangle(LOGIC_W / 2, -10, LOGIC_W, 20, { isStatic: true, label: 'wall' })
    this.bottomWall = Bodies.rectangle(LOGIC_W / 2, LOGIC_H + 10, LOGIC_W, 20, { isStatic: true, label: 'wall' })

    this.paddle1 = Bodies.rectangle(PADDLE_MARGIN, LOGIC_H / 2, PADDLE_W, PADDLE_H, {
      isStatic: false, label: 'paddle1', frictionAir: 0.3, inertia: Infinity,
    })
    this.paddle2 = Bodies.rectangle(LOGIC_W - PADDLE_MARGIN, LOGIC_H / 2, PADDLE_W, PADDLE_H, {
      isStatic: false, label: 'paddle2', frictionAir: 0.3, inertia: Infinity,
    })

    this.ball = Bodies.circle(LOGIC_W / 2, LOGIC_H / 2, BALL_R, {
      label: 'ball', restitution: 1, friction: 0, frictionAir: 0,
    })

    World.add(w.world, [this.topWall, this.bottomWall, this.paddle1, this.paddle2, this.ball])

    // Kick off ball
    this.resetBall()
  }

  private resetBall(): void {
    if (!this.ball) return
    Body.setPosition(this.ball, { x: LOGIC_W / 2, y: LOGIC_H / 2 })
    const angle = (Math.random() * Math.PI) / 3 - Math.PI / 6
    const dir = Math.random() > 0.5 ? 1 : -1
    Body.setVelocity(this.ball, {
      x: dir * 6 * Math.cos(angle),
      y: 6 * Math.sin(angle),
    })
    this.ctx.network.broadcast(BP_EVENTS.RESET, {})
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  private registerInputListeners(): void {
    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup', this.handleKeyUp)
  }

  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    this.keysDown.add(e.key)
  }

  private readonly handleKeyUp = (e: KeyboardEvent): void => {
    this.keysDown.delete(e.key)
  }

  // ── Network ────────────────────────────────────────────────────────────────

  private registerNetworkListeners(): void {
    this.ctx.network.on(BP_EVENTS.INPUT, this.onInput as never)
    this.ctx.network.on(BP_EVENTS.STATE, this.onState as never)
    this.ctx.network.on(BP_EVENTS.SCORE, this.onScore as never)
    this.ctx.network.on(BP_EVENTS.RESET, this.onReset as never)
    this.ctx.network.on(BP_EVENTS.GAME_OVER, this.onGameOver as never)
  }

  // ── Update loop ───────────────────────────────────────────────────────────

  update(_deltaTime: number): void {
    if (this.gameOver) return

    this.frameCount++

    if (this.ctx.network.isHost()) {
      this.updateHostInput()
      this.stepPhysics()
      this.checkGoals()

      if (this.frameCount % BROADCAST_EVERY_N_FRAMES === 0) {
        this.broadcastState()
      }

      // Render from physics
      this.renderFromPhysics()
    } else {
      // Non-host: send input, render from received state
      this.sendClientInput()
      this.renderFromRemoteState()
    }
  }

  private updateHostInput(): void {
    if (!this.paddle1) return
    let vy = 0
    if (this.keysDown.has('ArrowUp') || this.keysDown.has('w') || this.keysDown.has('W')) vy = -PADDLE_SPEED
    if (this.keysDown.has('ArrowDown') || this.keysDown.has('s') || this.keysDown.has('S')) vy = PADDLE_SPEED
    Body.setVelocity(this.paddle1, { x: 0, y: vy })

    // Clamp to court
    const py = this.paddle1.position.y
    if (py - PADDLE_H / 2 < 0) Body.setPosition(this.paddle1, { x: this.paddle1.position.x, y: PADDLE_H / 2 })
    if (py + PADDLE_H / 2 > LOGIC_H) Body.setPosition(this.paddle1, { x: this.paddle1.position.x, y: LOGIC_H - PADDLE_H / 2 })

    if (this.paddle2) {
      const p2y = this.paddle2.position.y
      if (p2y - PADDLE_H / 2 < 0) Body.setPosition(this.paddle2, { x: this.paddle2.position.x, y: PADDLE_H / 2 })
      if (p2y + PADDLE_H / 2 > LOGIC_H) Body.setPosition(this.paddle2, { x: this.paddle2.position.x, y: LOGIC_H - PADDLE_H / 2 })
    }
  }

  private sendClientInput(): void {
    let dir: 1 | -1 | 0 = 0
    if (this.keysDown.has('ArrowUp') || this.keysDown.has('w') || this.keysDown.has('W')) dir = -1
    if (this.keysDown.has('ArrowDown') || this.keysDown.has('s') || this.keysDown.has('S')) dir = 1

    if (this.frameCount % 2 === 0) {
      this.ctx.network.send(BP_EVENTS.INPUT, { dir, playerId: this.ctx.players.getLocalPlayer().id })
    }
  }

  private stepPhysics(): void {
    if (!this.engine) return
    Engine.update(this.engine, 1000 / 60)
  }

  private checkGoals(): void {
    if (!this.ball) return
    const bx = this.ball.position.x

    if (bx < 0) {
      // P2 scores
      this.score.p2++
      this.onScorePoint()
    } else if (bx > LOGIC_W) {
      // P1 scores
      this.score.p1++
      this.onScorePoint()
    }
  }

  private onScorePoint(): void {
    this.ctx.network.broadcast(BP_EVENTS.SCORE, this.score)
    this.updateScoreDisplay()

    if (this.score.p1 >= WINNING_SCORE || this.score.p2 >= WINNING_SCORE) {
      const winner = this.score.p1 >= WINNING_SCORE ? 'p1' : 'p2'
      this.ctx.network.broadcast(BP_EVENTS.GAME_OVER, { winner })
      this.showGameOver(winner)
      this.handleGameEnd(winner)
    } else {
      setTimeout(() => this.resetBall(), 1500)
    }
  }

  private broadcastState(): void {
    if (!this.ball || !this.paddle1 || !this.paddle2) return
    this.ctx.network.broadcast(BP_EVENTS.STATE, {
      ball: { x: this.ball.position.x, y: this.ball.position.y },
      p1: { y: this.paddle1.position.y },
      p2: { y: this.paddle2.position.y },
    })
  }

  private renderFromPhysics(): void {
    if (!this.ball || !this.paddle1 || !this.paddle2) return
    this.gBall.position.set(this.ball.position.x, this.ball.position.y)
    this.gP1.position.set(PADDLE_MARGIN, this.paddle1.position.y)
    this.gP2.position.set(LOGIC_W - PADDLE_MARGIN, this.paddle2.position.y)
  }

  private renderFromRemoteState(): void {
    const s = this.remoteState
    this.gBall.position.set(s.ball.x, s.ball.y)
    this.gP1.position.set(PADDLE_MARGIN, s.p1.y)
    this.gP2.position.set(LOGIC_W - PADDLE_MARGIN, s.p2.y)
  }

  // ── UI ─────────────────────────────────────────────────────────────────────

  private updateScoreDisplay(): void {
    this.scoreText.text = `${this.score.p1}  —  ${this.score.p2}`
  }

  private showGameOver(winner: 'p1' | 'p2'): void {
    this.gameOver = true
    const localId = this.ctx.players.getLocalPlayer().id
    const isHost = this.ctx.network.isHost()
    const iWon = (winner === 'p1' && isHost) || (winner === 'p2' && !isHost)

    this.statusText.text = iWon ? '🏆 YOU WIN!' : '💀 YOU LOSE'
    ;(this.statusText.style as TextStyle).fill = iWon ? '#30d158' : '#ff6b6b'

    // Schedule platform game end
    if (isHost) {
      setTimeout(() => {
        this.ctx.events.emit('platform:game:ended', {
          gameId: this.ctx.gameId,
          winnerId: localId,
          durationMs: 0,
          results: [],
        })
      }, 3000)
    }
  }

  private handleGameEnd(winner: 'p1' | 'p2'): void {
    const isHost = this.ctx.network.isHost()
    const iWon = (winner === 'p1' && isHost) || (winner === 'p2' && !isHost)
    this.ctx.stats.record('play')
    this.ctx.stats.record(iWon ? 'win' : 'loss')
  }

  // ── GameInstance lifecycle ─────────────────────────────────────────────────

  destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup', this.handleKeyUp)

    this.ctx.network.off(BP_EVENTS.INPUT, this.onInput as never)
    this.ctx.network.off(BP_EVENTS.STATE, this.onState as never)
    this.ctx.network.off(BP_EVENTS.SCORE, this.onScore as never)
    this.ctx.network.off(BP_EVENTS.RESET, this.onReset as never)
    this.ctx.network.off(BP_EVENTS.GAME_OVER, this.onGameOver as never)

    if (this.engine) {
      World.clear(this.engine.world, false)
      Engine.clear(this.engine)
    }

    // Clear stage — do NOT destroy the Pixi app
    this.app.stage.removeChildren()
  }
}
