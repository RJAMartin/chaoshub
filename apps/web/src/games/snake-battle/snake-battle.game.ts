// ─────────────────────────────────────────────────────────────────────────────
// Snake Battle — multiplayer snake game
//
// Each player controls a snake on a shared 40×30 grid.
// Eat pellets to grow. Collide with a wall or any snake body = death.
// Last snake alive (or highest score when everyone's dead) wins.
//
// Host-authority: host runs the game loop at 8 ticks/sec, broadcasts world.
// Clients send direction inputs; host applies them each tick.
// ─────────────────────────────────────────────────────────────────────────────
import { Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'
import { createGameUI } from '@/core/services/game-ui/game-ui'

export const SB_EVENTS = {
  DIRECTION: 'snake-battle:direction',
  STATE:     'snake-battle:state',
  WINNER:    'snake-battle:winner',
} as const

const COLS = 40
const ROWS = 30
const CELL = 18          // px per cell in logical space
const LOGIC_W = COLS * CELL
const LOGIC_H = ROWS * CELL + 60  // extra for HUD
const TICK_MS = 120      // ms per game tick (~8 fps)
const PELLET_COUNT = 6

const SNAKE_COLORS = [0x00f5ff, 0xff2d78, 0xffd60a, 0x30d158, 0xbf5af2, 0xff9f0a]

type Dir = 'U' | 'D' | 'L' | 'R'
const OPPOSITE: Record<Dir, Dir> = { U: 'D', D: 'U', L: 'R', R: 'L' }

interface SnakeState {
  id: string
  name: string
  body: [number, number][]   // [col, row], head first
  dir: Dir
  nextDir: Dir
  colorIdx: number
  alive: boolean
  score: number
}

interface Pellet { x: number; y: number }

function rnd(n: number) { return Math.floor(Math.random() * n) }

export class SnakeBattleGame implements GameInstance {
  private ctx: GameContext
  private app: Application
  private ui = createGameUI()

  private stage!: Graphics
  private gridGfx!: Graphics
  private snakeGfx: Map<string, Graphics> = new Map()
  private pelletGfx!: Graphics
  private hudText!: Text

  private snakes: Map<string, SnakeState> = new Map()
  private pellets: Pellet[] = []
  private tickTimer: ReturnType<typeof setInterval> | null = null
  private gameOver = false

  // local buffered direction
  private pendingDir: Dir | null = null

  private readonly onDirection = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { playerId, dir } = msg.payload as { playerId: string; dir: Dir }
    const snake = this.snakes.get(playerId)
    if (snake && snake.alive && dir !== OPPOSITE[snake.dir]) snake.nextDir = dir
  }

  private readonly onState = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { snakes, pellets } = msg.payload as { snakes: SnakeState[]; pellets: Pellet[] }
    this.snakes.clear()
    for (const s of snakes) this.snakes.set(s.id, s)
    this.pellets = pellets
    this.renderWorld()
  }

  private readonly onWinner = (msg: NetworkMessage) => {
    const { winnerId, winnerName } = msg.payload as { winnerId: string; winnerName: string }
    this.showWinner(winnerId, winnerName)
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    const map: Record<string, Dir> = {
      ArrowUp: 'U', KeyW: 'U',
      ArrowDown: 'D', KeyS: 'D',
      ArrowLeft: 'L', KeyA: 'L',
      ArrowRight: 'R', KeyD: 'R',
    }
    const dir = map[e.code]
    if (dir) { this.pendingDir = dir; e.preventDefault() }
  }

  constructor(context: GameContext) {
    this.ctx = context
    this.app = context.pixiApp as Application
  }

  async init(): Promise<void> {
    this.buildScene()
    this.ctx.network.on(SB_EVENTS.DIRECTION, this.onDirection as never)
    this.ctx.network.on(SB_EVENTS.STATE,     this.onState as never)
    this.ctx.network.on(SB_EVENTS.WINNER,    this.onWinner as never)
    window.addEventListener('keydown', this.onKeyDown)

    await this.ui.showInstructions(this.ctx, {
      title: '🐍 Snake Battle',
      subtitle: 'Last snake alive wins',
      lines: [
        '🍕 Eat yellow pellets to grow and score points',
        '💀 Hit a wall or any snake body = instant death',
        '👑 Last snake alive (or highest score) wins',
      ],
      controls: 'WASD or Arrow keys to steer',
      accentColor: 0x30d158,
    })
    await this.ui.countdown(this.ctx)
    this.ui.clear()

    if (this.ctx.network.isHost()) {
      this.initWorld()
      this.tickTimer = setInterval(() => this.tick(), TICK_MS)
    }
  }

  update(_dt: number): void {
    if (this.gameOver) return
    if (this.pendingDir) {
      const localId = this.ctx.players.getLocalPlayer().id
      if (this.ctx.network.isHost()) {
        const snake = this.snakes.get(localId)
        if (snake && snake.alive && this.pendingDir !== OPPOSITE[snake.dir]) {
          snake.nextDir = this.pendingDir
        }
      } else {
        this.ctx.network.send(SB_EVENTS.DIRECTION, { playerId: localId, dir: this.pendingDir })
      }
      this.pendingDir = null
    }
  }

  destroy(): void {
    if (this.tickTimer) clearInterval(this.tickTimer)
    window.removeEventListener('keydown', this.onKeyDown)
    this.ctx.network.off(SB_EVENTS.DIRECTION, this.onDirection as never)
    this.ctx.network.off(SB_EVENTS.STATE,     this.onState as never)
    this.ctx.network.off(SB_EVENTS.WINNER,    this.onWinner as never)
    this.ui.destroy()
    this.app.stage.removeChildren()
  }

  private initWorld(): void {
    const players = this.ctx.players.getPlayers()
    const starts: [number, number][] = [
      [5, 5], [COLS - 6, ROWS - 6], [COLS - 6, 5], [5, ROWS - 6],
      [COLS / 2 | 0, 5], [COLS / 2 | 0, ROWS - 6],
    ]
    const dirs: Dir[] = ['R', 'L', 'L', 'R', 'D', 'U']
    players.forEach((p, i) => {
      const [sx, sy] = starts[i % starts.length]!
      const dir = dirs[i % dirs.length]!
      this.snakes.set(p.id, {
        id: p.id, name: p.name,
        body: [[sx, sy], [sx - 1, sy]],
        dir, nextDir: dir,
        colorIdx: i % SNAKE_COLORS.length,
        alive: true, score: 0,
      })
    })
    this.spawnPellets()
  }

  private spawnPellets(): void {
    while (this.pellets.length < PELLET_COUNT) {
      const p = { x: 1 + rnd(COLS - 2), y: 1 + rnd(ROWS - 2) }
      const occupied = [...this.snakes.values()].some(s => s.body.some(([bx, by]) => bx === p.x && by === p.y))
      if (!occupied) this.pellets.push(p)
    }
  }

  private tick(): void {
    if (this.gameOver) return
    const occupied = new Set<string>()
    for (const s of this.snakes.values()) {
      if (!s.alive) continue
      for (const [bx, by] of s.body) occupied.add(`${bx},${by}`)
    }

    // Move all snakes
    for (const snake of this.snakes.values()) {
      if (!snake.alive) continue
      snake.dir = snake.nextDir
      const [hx, hy] = snake.body[0]!
      let nx = hx, ny = hy
      if (snake.dir === 'U') ny--
      else if (snake.dir === 'D') ny++
      else if (snake.dir === 'L') nx--
      else nx++

      // Wall collision
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) { snake.alive = false; continue }

      const newHead: [number, number] = [nx, ny]

      // Pellet?
      const pelletIdx = this.pellets.findIndex(p => p.x === nx && p.y === ny)
      if (pelletIdx >= 0) {
        this.pellets.splice(pelletIdx, 1)
        snake.score++
        snake.body.unshift(newHead)
      } else {
        snake.body.unshift(newHead)
        snake.body.pop()
      }
    }

    // After moving, check self/other collision
    const allBodies = new Map<string, Set<string>>()
    for (const s of this.snakes.values()) {
      if (!s.alive) continue
      allBodies.set(s.id, new Set(s.body.slice(1).map(([x, y]) => `${x},${y}`)))
    }
    for (const snake of this.snakes.values()) {
      if (!snake.alive) continue
      const [hx, hy] = snake.body[0]!
      const hk = `${hx},${hy}`
      // self collision
      if (allBodies.get(snake.id)?.has(hk)) { snake.alive = false; continue }
      // other snake collision
      for (const [oid, bodies] of allBodies) {
        if (oid === snake.id) continue
        if (bodies.has(hk)) { snake.alive = false; break }
      }
    }

    this.spawnPellets()

    const alive = [...this.snakes.values()].filter(s => s.alive)
    if (alive.length <= 1) {
      const winner = alive[0] ?? [...this.snakes.values()].sort((a, b) => b.score - a.score)[0]!
      this.gameOver = true
      if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null }
      this.ctx.network.broadcast(SB_EVENTS.STATE, { snakes: [...this.snakes.values()], pellets: this.pellets })
      this.ctx.network.broadcast(SB_EVENTS.WINNER, { winnerId: winner.id, winnerName: winner.name })
      this.showWinner(winner.id, winner.name)
      return
    }

    this.ctx.network.broadcast(SB_EVENTS.STATE, { snakes: [...this.snakes.values()], pellets: this.pellets })
    this.renderWorld()
  }

  private buildScene(): void {
    this.stage = new Graphics()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x080810)
    this.app.stage.addChild(this.stage)
    this.scaleStage()

    // Grid lines
    this.gridGfx = new Graphics()
    for (let c = 0; c <= COLS; c++) {
      this.gridGfx.moveTo(c * CELL, 0).lineTo(c * CELL, ROWS * CELL)
    }
    for (let r = 0; r <= ROWS; r++) {
      this.gridGfx.moveTo(0, r * CELL).lineTo(LOGIC_W, r * CELL)
    }
    this.gridGfx.stroke({ width: 0.5, color: 0x111128 })
    this.stage.addChild(this.gridGfx)

    this.pelletGfx = new Graphics()
    this.stage.addChild(this.pelletGfx)

    this.hudText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 14, fill: '#c0c0e0' }),
    })
    this.hudText.position.set(8, ROWS * CELL + 8)
    this.stage.addChild(this.hudText)

    const controls = new Text({
      text: 'WASD / Arrow keys to steer',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 12, fill: '#303050' }),
    })
    controls.anchor.set(1, 0)
    controls.position.set(LOGIC_W - 8, ROWS * CELL + 8)
    this.stage.addChild(controls)
  }

  private renderWorld(): void {
    // Pellets
    this.pelletGfx.clear()
    for (const p of this.pellets) {
      this.pelletGfx.circle(p.x * CELL + CELL / 2, p.y * CELL + CELL / 2, CELL * 0.3).fill(0xffd60a)
    }

    // Snakes
    for (const snake of this.snakes.values()) {
      if (!this.snakeGfx.has(snake.id)) {
        const g = new Graphics()
        this.stage.addChild(g)
        this.snakeGfx.set(snake.id, g)
      }
      const g = this.snakeGfx.get(snake.id)!
      g.clear()
      if (!snake.alive) continue
      const color = SNAKE_COLORS[snake.colorIdx] ?? 0xffffff
      snake.body.forEach(([bx, by], idx) => {
        const alpha = idx === 0 ? 1 : 0.75
        g.roundRect(bx * CELL + 1, by * CELL + 1, CELL - 2, CELL - 2, 3).fill({ color, alpha })
      })
    }

    // HUD scores
    const scores = [...this.snakes.values()]
      .sort((a, b) => b.score - a.score)
      .map(s => `${s.alive ? '●' : '✕'} ${s.name}: ${s.score}`)
      .join('  ')
    this.hudText.text = scores
  }

  private showWinner(winnerId: string, winnerName: string): void {
    this.gameOver = true
    const sorted = [...this.snakes.values()].sort((a, b) => b.score - a.score)
    const scoreLine = sorted.map((s, i) => `${['🥇','🥈','🥉'][i] ?? `${i+1}.`} ${s.name}: ${s.score}`).join('  ')
    this.ui.showWinScreen(this.ctx, winnerId, winnerName, scoreLine, 0x30d158)

    if (this.ctx.network.isHost()) {
      this.ctx.stats.record('play')
      const localId = this.ctx.players.getLocalPlayer().id
      if (winnerId === localId) this.ctx.stats.record('win')
      else this.ctx.stats.record('loss')
      this.ctx.events.emit('platform:game:ended', {
        gameId: this.ctx.gameId, winnerId, durationMs: 0,
        results: sorted.map((s, i) => ({ playerId: s.id, playerName: s.name, rank: i + 1, score: s.score })),
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
