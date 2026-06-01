// ─────────────────────────────────────────────────────────────────────────────
// Bomberman — grid-based bomb placement, eliminate others to win
//
// 15×13 grid. Solid walls (indestructible), breakable blocks (random).
// Players move with WASD/arrows, place bombs with Space.
// Bomb explodes after 3s, cross-shaped blast radius (default 2).
// Caught in blast = lose a life (2 lives). Last alive wins.
//
// Host-authority: host runs game loop at 20Hz, broadcasts state.
// ─────────────────────────────────────────────────────────────────────────────
import { Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'

export const BM_EVENTS = {
  INPUT:  'bomberman:input',
  STATE:  'bomberman:state',
  WINNER: 'bomberman:winner',
} as const

const COLS = 15
const ROWS = 13
const CELL = 36
const LOGIC_W = COLS * CELL
const LOGIC_H = ROWS * CELL + 52
const TICK_MS = 50
const BOMB_FUSE_MS = 3000
const BLAST_RADIUS = 2
const LIVES = 2
const RESPAWN_MS = 1500

const PLAYER_COLORS = [0x00f5ff, 0xff2d78, 0xffd60a, 0x30d158, 0xbf5af2, 0xff9f0a]

// Cell types
const EMPTY = 0, WALL = 1, BLOCK = 2

type Dir = 'U' | 'D' | 'L' | 'R' | null

interface Bomb { id: number; col: number; row: number; ownerId: string; fuseEnd: number }
interface Explosion { id: number; cells: { col: number; row: number }[]; endTime: number }
interface PlayerState { id: string; name: string; col: number; row: number; colorIdx: number; lives: number; alive: boolean; respawnAt: number | null }

let _bid = 0; let _eid = 0

function buildGrid(): number[][] {
  const g: number[][] = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => {
      if (r % 2 === 1 && c % 2 === 1) return WALL      // fixed pillars
      // Clear corners for spawn safety
      const nearCorner = (r <= 1 && c <= 1) || (r <= 1 && c >= COLS - 2) ||
                         (r >= ROWS - 2 && c <= 1) || (r >= ROWS - 2 && c >= COLS - 2)
      if (nearCorner) return EMPTY
      return Math.random() < 0.35 ? BLOCK : EMPTY
    }),
  )
  return g
}

export class BombermanGame implements GameInstance {
  private ctx: GameContext
  private app: Application

  private stage!: Graphics
  private gridGfx!: Graphics
  private playerGfx: Map<string, Graphics> = new Map()
  private playerLabels: Map<string, Text> = new Map()
  private bombGfx: Map<number, Graphics> = new Map()
  private explosionGfx: Map<number, Graphics> = new Map()
  private hudText!: Text

  private grid: number[][] = []
  private players: Map<string, PlayerState> = new Map()
  private bombs: Map<number, Bomb> = new Map()
  private explosions: Map<number, Explosion> = new Map()
  private tickTimer: ReturnType<typeof setInterval> | null = null
  private gameOver = false

  // Input per player (host side)
  private inputBuffers: Map<string, { dir: Dir; bomb: boolean }> = new Map()
  private localInput: { dir: Dir; bomb: boolean } = { dir: null, bomb: false }
  private lastMoveTime: Map<string, number> = new Map()
  private readonly MOVE_COOLDOWN = 150  // ms between cell moves

  private readonly onInput = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { playerId, dir, bomb } = msg.payload as { playerId: string; dir: Dir; bomb: boolean }
    this.inputBuffers.set(playerId, { dir, bomb })
  }

  private readonly onState = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const d = msg.payload as { players: PlayerState[]; bombs: Bomb[]; explosions: Explosion[]; grid: number[][] }
    for (const p of d.players) this.players.set(p.id, p)
    this.bombs.clear(); for (const b of d.bombs) this.bombs.set(b.id, b)
    this.explosions.clear(); for (const e of d.explosions) this.explosions.set(e.id, e)
    this.grid = d.grid
    this.redrawGrid(); this.renderDynamic()
  }

  private readonly onWinner = (msg: NetworkMessage) => {
    const { winnerId, winnerName } = msg.payload as { winnerId: string; winnerName: string }
    this.showWinner(winnerId, winnerName)
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'ArrowUp'    || e.code === 'KeyW') { this.localInput.dir = 'U'; e.preventDefault() }
    if (e.code === 'ArrowDown'  || e.code === 'KeyS') { this.localInput.dir = 'D'; e.preventDefault() }
    if (e.code === 'ArrowLeft'  || e.code === 'KeyA') { this.localInput.dir = 'L'; e.preventDefault() }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { this.localInput.dir = 'R'; e.preventDefault() }
    if (e.code === 'Space') { this.localInput.bomb = true; e.preventDefault() }
  }
  private readonly onKeyUp = (e: KeyboardEvent) => {
    const dirs = new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyS','KeyA','KeyD'])
    if (dirs.has(e.code)) this.localInput.dir = null
    if (e.code === 'Space') this.localInput.bomb = false
  }

  constructor(context: GameContext) { this.ctx = context; this.app = context.pixiApp as Application }

  async init(): Promise<void> {
    this.buildScene()
    this.ctx.network.on(BM_EVENTS.INPUT,  this.onInput as never)
    this.ctx.network.on(BM_EVENTS.STATE,  this.onState as never)
    this.ctx.network.on(BM_EVENTS.WINNER, this.onWinner as never)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)

    if (this.ctx.network.isHost()) {
      this.grid = buildGrid()
      const corners: [number, number][] = [[0,0],[COLS-1,0],[0,ROWS-1],[COLS-1,ROWS-1]]
      this.ctx.players.getPlayers().forEach((p, i) => {
        const [sc, sr] = corners[i % corners.length]!
        this.players.set(p.id, { id: p.id, name: p.name, col: sc, row: sr, colorIdx: i % PLAYER_COLORS.length, lives: LIVES, alive: true, respawnAt: null })
        this.inputBuffers.set(p.id, { dir: null, bomb: false })
      })
      this.redrawGrid()
      this.tickTimer = setInterval(() => this.hostTick(), TICK_MS)
    }
  }

  update(_dt: number): void {
    if (this.gameOver) return
    const localId = this.ctx.players.getLocalPlayer().id
    if (this.ctx.network.isHost()) {
      this.inputBuffers.set(localId, { ...this.localInput })
    } else {
      this.ctx.network.send(BM_EVENTS.INPUT, { playerId: localId, ...this.localInput })
    }
  }

  destroy(): void {
    if (this.tickTimer) clearInterval(this.tickTimer)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    this.ctx.network.off(BM_EVENTS.INPUT,  this.onInput as never)
    this.ctx.network.off(BM_EVENTS.STATE,  this.onState as never)
    this.ctx.network.off(BM_EVENTS.WINNER, this.onWinner as never)
    this.app.stage.removeChildren()
  }

  // ── Host game loop ────────────────────────────────────────────────────────

  private hostTick(): void {
    if (this.gameOver) return
    const now = Date.now()

    // Respawn players
    for (const p of this.players.values()) {
      if (p.respawnAt && now >= p.respawnAt) { p.respawnAt = null }
    }

    // Process player inputs
    for (const [id, input] of this.inputBuffers) {
      const p = this.players.get(id)
      if (!p || !p.alive || p.respawnAt) continue

      // Move
      if (input.dir) {
        const lastMove = this.lastMoveTime.get(id) ?? 0
        if (now - lastMove >= this.MOVE_COOLDOWN) {
          const nc = p.col + (input.dir === 'L' ? -1 : input.dir === 'R' ? 1 : 0)
          const nr = p.row + (input.dir === 'U' ? -1 : input.dir === 'D' ? 1 : 0)
          if (nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS &&
              this.grid[nr]?.[nc] === EMPTY &&
              !this.hasBombAt(nc, nr)) {
            p.col = nc; p.row = nr
            this.lastMoveTime.set(id, now)
          }
        }
      }

      // Place bomb
      if (input.bomb) {
        const already = [...this.bombs.values()].some(b => b.ownerId === id)
        if (!already) {
          this.bombs.set(_bid, { id: _bid, col: p.col, row: p.row, ownerId: id, fuseEnd: now + BOMB_FUSE_MS })
          _bid++
        }
        input.bomb = false
      }
    }

    // Detonate expired bombs
    for (const [bid, bomb] of [...this.bombs.entries()]) {
      if (now >= bomb.fuseEnd) {
        this.bombs.delete(bid)
        const cells = this.calcBlast(bomb.col, bomb.row)
        this.explosions.set(_eid, { id: _eid, cells, endTime: now + 500 })
        _eid++
        // Check player hits
        for (const p of this.players.values()) {
          if (!p.alive || p.respawnAt) continue
          if (cells.some(c => c.col === p.col && c.row === p.row)) {
            p.lives--
            if (p.lives <= 0) {
              p.alive = false
            } else {
              p.respawnAt = now + RESPAWN_MS
              // Teleport to safe spawn
              const corners: [number, number][] = [[0,0],[COLS-1,0],[0,ROWS-1],[COLS-1,ROWS-1]]
              const [sc, sr] = corners[p.colorIdx % corners.length]!
              p.col = sc; p.row = sr
            }
          }
        }
      }
    }

    // Clear expired explosions
    for (const [eid, ex] of [...this.explosions.entries()]) {
      if (now >= ex.endTime) this.explosions.delete(eid)
    }

    // Check win condition
    const alive = [...this.players.values()].filter(p => p.alive)
    if (alive.length <= 1 && this.players.size > 1) {
      const winner = alive[0] ?? [...this.players.values()][0]!
      this.gameOver = true
      if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null }
      this.broadcastState()
      this.ctx.network.broadcast(BM_EVENTS.WINNER, { winnerId: winner.id, winnerName: winner.name })
      this.showWinner(winner.id, winner.name)
      return
    }

    this.broadcastState()
    this.renderDynamic()
  }

  private calcBlast(col: number, row: number): { col: number; row: number }[] {
    const cells: { col: number; row: number }[] = [{ col, row }]
    const dirs = [[0,-1],[0,1],[-1,0],[1,0]]
    for (const [dc, dr] of dirs as [number, number][]) {
      for (let i = 1; i <= BLAST_RADIUS; i++) {
        const nc = col + dc * i; const nr = row + dr * i
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) break
        const cell = this.grid[nr]?.[nc]
        if (cell === WALL) break
        cells.push({ col: nc, row: nr })
        if (cell === BLOCK) {
          this.grid[nr]![nc] = EMPTY  // destroy block
          break
        }
      }
    }
    return cells
  }

  private hasBombAt(c: number, r: number): boolean {
    return [...this.bombs.values()].some(b => b.col === c && b.row === r)
  }

  private broadcastState(): void {
    this.ctx.network.broadcast(BM_EVENTS.STATE, {
      players: [...this.players.values()],
      bombs: [...this.bombs.values()],
      explosions: [...this.explosions.values()],
      grid: this.grid,
    })
  }

  // ── Scene ─────────────────────────────────────────────────────────────────

  private buildScene(): void {
    this.stage = new Graphics()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x111118)
    this.app.stage.addChild(this.stage)
    this.scaleStage()

    const title = new Text({ text: 'BOMBERMAN', style: new TextStyle({ fontFamily: 'monospace', fontSize: 20, fontWeight: '900', fill: '#ffd60a', letterSpacing: 6 }) })
    title.anchor.set(0.5, 0); title.position.set(LOGIC_W / 2, 8); this.stage.addChild(title)

    this.hudText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 12, fill: '#c0c0e0' }) })
    this.hudText.anchor.set(0.5, 1); this.hudText.position.set(LOGIC_W / 2, LOGIC_H - 4); this.stage.addChild(this.hudText)

    this.gridGfx = new Graphics()
    this.gridGfx.position.set(0, 36)
    this.stage.addChild(this.gridGfx)
  }

  private redrawGrid(): void {
    this.gridGfx.clear()
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = this.grid[r]?.[c] ?? EMPTY
        const x = c * CELL; const y = r * CELL
        if (t === WALL) {
          this.gridGfx.rect(x, y, CELL, CELL).fill(0x2a2a4a)
          this.gridGfx.rect(x + 2, y + 2, CELL - 4, CELL - 4).fill(0x3a3a6a)
        } else if (t === BLOCK) {
          this.gridGfx.rect(x, y, CELL, CELL).fill(0x1a1a2a)
          this.gridGfx.roundRect(x + 3, y + 3, CELL - 6, CELL - 6, 3).fill(0x4a3a2a)
          this.gridGfx.roundRect(x + 3, y + 3, CELL - 6, CELL - 6, 3).stroke({ width: 1, color: 0x6a5a3a })
        } else {
          this.gridGfx.rect(x, y, CELL, CELL).fill(0x1a1a2a)
        }
      }
    }
    // Grid lines (subtle)
    for (let c = 0; c <= COLS; c++) this.gridGfx.moveTo(c * CELL, 0).lineTo(c * CELL, ROWS * CELL)
    for (let r = 0; r <= ROWS; r++) this.gridGfx.moveTo(0, r * CELL).lineTo(COLS * CELL, r * CELL)
    this.gridGfx.stroke({ width: 0.5, color: 0x0a0a18 })
  }

  private renderDynamic(): void {
    // Explosions
    const seenE = new Set<number>()
    for (const ex of this.explosions.values()) {
      seenE.add(ex.id)
      if (!this.explosionGfx.has(ex.id)) { const g = new Graphics(); this.gridGfx.addChild(g); this.explosionGfx.set(ex.id, g) }
      const g = this.explosionGfx.get(ex.id)!; g.clear()
      for (const { col, row } of ex.cells) {
        g.roundRect(col * CELL + 2, row * CELL + 2, CELL - 4, CELL - 4, 4).fill({ color: 0xff6b00, alpha: 0.9 })
      }
    }
    for (const [id, g] of this.explosionGfx) { if (!seenE.has(id)) { g.clear(); this.explosionGfx.delete(id) } }

    // Bombs
    const seenB = new Set<number>()
    for (const bomb of this.bombs.values()) {
      seenB.add(bomb.id)
      if (!this.bombGfx.has(bomb.id)) { const g = new Graphics(); this.gridGfx.addChild(g); this.bombGfx.set(bomb.id, g) }
      const g = this.bombGfx.get(bomb.id)!; g.clear()
      const remaining = bomb.fuseEnd - Date.now()
      const pulse = remaining < 1000 ? Math.sin(Date.now() / 80) * 0.3 + 0.7 : 1
      g.circle(bomb.col * CELL + CELL / 2, bomb.row * CELL + CELL / 2, CELL * 0.38).fill({ color: 0x111111, alpha: pulse })
      g.circle(bomb.col * CELL + CELL / 2, bomb.row * CELL + CELL / 2, CELL * 0.2).fill({ color: 0xff4400, alpha: pulse })
    }
    for (const [id, g] of this.bombGfx) { if (!seenB.has(id)) { g.clear(); this.bombGfx.delete(id) } }

    // Players
    for (const p of this.players.values()) {
      if (!this.playerGfx.has(p.id)) {
        const g = new Graphics(); this.gridGfx.addChild(g); this.playerGfx.set(p.id, g)
        const lbl = new Text({ text: p.name.slice(0, 5), style: new TextStyle({ fontFamily: 'monospace', fontSize: 10, fill: `#${(PLAYER_COLORS[p.colorIdx] ?? 0xffffff).toString(16).padStart(6, '0')}` }) })
        lbl.anchor.set(0.5, 1); this.gridGfx.addChild(lbl); this.playerLabels.set(p.id, lbl)
      }
      const g = this.playerGfx.get(p.id)!; const lbl = this.playerLabels.get(p.id)!
      g.clear()
      if (!p.alive) { lbl.text = ''; continue }
      const color = PLAYER_COLORS[p.colorIdx] ?? 0xffffff
      const alpha = p.respawnAt ? 0.4 : 1
      const cx = p.col * CELL + CELL / 2; const cy = p.row * CELL + CELL / 2
      g.roundRect(p.col * CELL + 3, p.row * CELL + 3, CELL - 6, CELL - 6, 6).fill({ color, alpha })
      lbl.position.set(cx, p.row * CELL - 1)
    }

    this.hudText.text = [...this.players.values()].map(p =>
      `${p.alive ? '♥'.repeat(p.lives) : '✕'} ${p.name}`
    ).join('   ')

    // Redraw grid if blocks were destroyed
    this.redrawGrid()
    const controls = new Text({ text: 'WASD/arrows move  ·  Space = bomb', style: new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: '#30304a' }) })
    controls.anchor.set(0.5, 0); controls.position.set(LOGIC_W / 2, 20)
    // Only add once
    if (this.stage.children.length < 4) this.stage.addChild(controls)
  }

  private showWinner(winnerId: string, winnerName: string): void {
    this.gameOver = true
    const overlay = new Graphics()
    overlay.rect(0, 0, LOGIC_W, LOGIC_H).fill({ color: 0x000000, alpha: 0.75 })
    this.stage.addChild(overlay)
    const localId = this.ctx.players.getLocalPlayer().id
    const isWinner = winnerId === localId
    const t = new Text({ text: isWinner ? '🏆 YOU WIN!' : `${winnerName} wins!`, style: new TextStyle({ fontFamily: 'monospace', fontSize: 38, fontWeight: '900', fill: isWinner ? '#ffd60a' : '#00f5ff' }) })
    t.anchor.set(0.5); t.position.set(LOGIC_W / 2, LOGIC_H / 2)
    this.stage.addChild(t)
    if (this.ctx.network.isHost()) {
      this.ctx.stats.record('play'); if (isWinner) this.ctx.stats.record('win'); else this.ctx.stats.record('loss')
      this.ctx.events.emit('platform:game:ended', { gameId: this.ctx.gameId, winnerId, durationMs: 0, results: [] })
    }
  }

  private scaleStage(): void {
    const { width: cw, height: ch } = this.app.screen
    const scale = Math.min(cw / LOGIC_W, ch / LOGIC_H) * 0.97
    this.stage.scale.set(scale); this.stage.position.set((cw - LOGIC_W * scale) / 2, (ch - LOGIC_H * scale) / 2)
  }
}
