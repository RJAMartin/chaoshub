// ─────────────────────────────────────────────────────────────────────────────
// Color Flood — Game Implementation
//
// A 14×14 grid of random colours. Each player starts anchored to one corner
// and tries to flood-fill the board with their colour to claim territory.
// On each turn a player picks a colour; all cells touching their region that
// match that colour are absorbed. Players alternate turns (host-authority).
// The player who controls the most cells when the board is covered wins.
//
// Supports 2–4 players. Corners: TL, TR, BR, BL.
// ─────────────────────────────────────────────────────────────────────────────
import { Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'

// ── Constants ─────────────────────────────────────────────────────────────────

export const CF_EVENTS = {
  INIT:   'color-flood:init',
  MOVE:   'color-flood:move',
  STATE:  'color-flood:state',
} as const

const GRID_SIZE  = 14
const CELL_PX    = 38
const PALETTE    = [0xe74c3c, 0xe67e22, 0xf1c40f, 0x2ecc71, 0x3498db, 0x9b59b6] // 6 colours
const LOGIC_W    = 800
const LOGIC_H    = 620

// Player corner starting positions [row, col]
const CORNERS: [number, number][] = [
  [0, 0],
  [0, GRID_SIZE - 1],
  [GRID_SIZE - 1, GRID_SIZE - 1],
  [GRID_SIZE - 1, 0],
]

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlayerInfo {
  id: string
  name: string
  colorIdx: number  // current flood colour (index into PALETTE)
  cells: Set<string>  // "r,c" keys of owned cells
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function key(r: number, c: number) { return `${r},${c}` }

function floodFill(grid: number[][], region: Set<string>, newColor: number): Set<string> {
  // Expand region: add all orthogonal neighbours whose grid colour === newColor
  const added = new Set<string>()
  const queue = [...region]
  while (queue.length) {
    const cell = queue.pop()!
    const [r, c] = cell.split(',').map(Number) as [number, number]
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as [number, number][]) {
      const nr = r + dr
      const nc = c + dc
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue
      const nk = key(nr, nc)
      if (region.has(nk) || added.has(nk)) continue
      if (grid[nr]?.[nc] === newColor) {
        added.add(nk)
        queue.push(nk)
      }
    }
  }
  return added
}

// ── Game class ────────────────────────────────────────────────────────────────

export class ColorFloodGame implements GameInstance {
  private ctx: GameContext
  private app: Application

  // State (host-authority; clients get full state each move)
  private grid: number[][] = []   // each cell: index into PALETTE
  private players: PlayerInfo[] = []
  private turnIndex = 0
  private totalCells = GRID_SIZE * GRID_SIZE
  private gameOver = false

  // Pixi
  private stage!: Graphics
  private cellGraphics: Graphics[][] = []
  private ownerOverlay: Graphics[][] = []
  private statusText!: Text
  private turnText!: Text
  private paletteButtons: Graphics[] = []

  // ── Network ───────────────────────────────────────────────────────────────

  private readonly onInit = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const d = msg.payload as { grid: number[][]; players: { id: string; name: string; colorIdx: number; cells: string[] }[]; turnIndex: number }
    this.grid = d.grid
    this.players = d.players.map(p => ({ ...p, cells: new Set(p.cells) }))
    this.turnIndex = d.turnIndex
    this.redraw()
    this.updateUI()
  }

  private readonly onMove = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { playerId, colorIdx } = msg.payload as { playerId: string; colorIdx: number }
    this.applyMove(playerId, colorIdx)
  }

  private readonly onState = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const d = msg.payload as { grid: number[][]; players: { id: string; name: string; colorIdx: number; cells: string[] }[]; turnIndex: number }
    this.grid = d.grid
    this.players = d.players.map(p => ({ ...p, cells: new Set(p.cells) }))
    this.turnIndex = d.turnIndex
    this.redraw()
    this.updateUI()
  }

  constructor(context: GameContext) {
    this.ctx = context
    this.app = context.pixiApp as Application
  }

  async init(): Promise<void> {
    this.buildScene()
    this.ctx.network.on(CF_EVENTS.INIT,  this.onInit as never)
    this.ctx.network.on(CF_EVENTS.MOVE,  this.onMove as never)
    this.ctx.network.on(CF_EVENTS.STATE, this.onState as never)

    if (this.ctx.network.isHost()) {
      this.initGame()
      setTimeout(() => {
        this.ctx.network.broadcast(CF_EVENTS.INIT, this.serialise())
        this.redraw()
        this.updateUI()
      }, 500)
    }
  }

  update(_dt: number): void {}

  destroy(): void {
    this.ctx.network.off(CF_EVENTS.INIT,  this.onInit as never)
    this.ctx.network.off(CF_EVENTS.MOVE,  this.onMove as never)
    this.ctx.network.off(CF_EVENTS.STATE, this.onState as never)
    this.app.stage.removeChildren()
  }

  // ── Initialise ────────────────────────────────────────────────────────────

  private initGame(): void {
    // Random grid (no two adjacent corners share same colour to avoid instant dominance)
    do {
      this.grid = Array.from({ length: GRID_SIZE }, () =>
        Array.from({ length: GRID_SIZE }, () => Math.floor(Math.random() * PALETTE.length)),
      )
    } while (this.cornersConflict())

    const ps = this.ctx.players.getPlayers().slice(0, 4)
    this.players = ps.map((p, i) => {
      const [r, c] = CORNERS[i]!
      const cells = new Set([key(r, c)])
      return { id: p.id, name: p.name, colorIdx: this.grid[r]![c]!, cells }
    })

    this.turnIndex = 0
  }

  private cornersConflict(): boolean {
    const cornerColors = CORNERS.map(([r, c]) => this.grid[r]?.[c])
    return new Set(cornerColors).size < cornerColors.length
  }

  // ── Move logic ────────────────────────────────────────────────────────────

  private applyMove(playerId: string, colorIdx: number): void {
    if (this.gameOver) return
    const p = this.players[this.turnIndex]
    if (!p || p.id !== playerId) return
    if (colorIdx === p.colorIdx) return  // no-op: picking same colour is wasted move

    // Update colour on all owned cells
    for (const k of p.cells) {
      const [r, c] = k.split(',').map(Number) as [number, number]
      this.grid[r]![c] = colorIdx
    }
    p.colorIdx = colorIdx

    // Flood-fill: absorb matching neighbours
    const added = floodFill(this.grid, p.cells, colorIdx)
    // Remove added cells from other players
    for (const other of this.players) {
      if (other.id === p.id) continue
      for (const k of added) other.cells.delete(k)
    }
    for (const k of added) p.cells.add(k)

    // Update the added cells colour in grid (they were already that colour, just mark ownership)
    // (grid already reflects colourIdx on p.cells after loop above + flood match)

    // Advance turn
    this.turnIndex = (this.turnIndex + 1) % this.players.length

    const state = this.serialise()
    this.ctx.network.broadcast(CF_EVENTS.STATE, state)

    this.grid = state.grid
    this.players = state.players.map(pl => ({ ...pl, cells: new Set(pl.cells) }))
    this.turnIndex = state.turnIndex

    this.redraw()
    this.updateUI()
    this.checkWin()
  }

  private serialise() {
    return {
      grid: this.grid.map(row => [...row]),
      players: this.players.map(p => ({ id: p.id, name: p.name, colorIdx: p.colorIdx, cells: [...p.cells] })),
      turnIndex: this.turnIndex,
    }
  }

  private checkWin(): void {
    const covered = this.players.reduce((s, p) => s + p.cells.size, 0)
    if (covered < this.totalCells) return  // board not full yet

    this.gameOver = true
    const sorted = [...this.players].sort((a, b) => b.cells.size - a.cells.size)
    this.showResults(sorted)
  }

  // ── Scene ─────────────────────────────────────────────────────────────────

  private buildScene(): void {
    this.stage = new Graphics()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    this.app.stage.addChild(this.stage)
    this.scaleStage()

    const title = new Text({
      text: 'COLOR FLOOD',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 26, fontWeight: '900', fill: '#00f5ff', letterSpacing: 5 }),
    })
    title.anchor.set(0.5, 0)
    title.position.set(LOGIC_W / 2, 14)
    this.stage.addChild(title)

    this.turnText = new Text({
      text: '',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 15, fill: '#c0c0e0' }),
    })
    this.turnText.anchor.set(0.5, 0)
    this.turnText.position.set(LOGIC_W / 2, 52)
    this.stage.addChild(this.turnText)

    this.statusText = new Text({
      text: 'Waiting…',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#606080' }),
    })
    this.statusText.anchor.set(0.5, 0)
    this.statusText.position.set(LOGIC_W / 2, 76)
    this.stage.addChild(this.statusText)

    // Grid cells (built once, recoloured on redraw)
    const gridOffsetX = (LOGIC_W - GRID_SIZE * CELL_PX) / 2
    const gridOffsetY = 105

    this.cellGraphics = []
    this.ownerOverlay = []
    for (let r = 0; r < GRID_SIZE; r++) {
      this.cellGraphics[r] = []
      this.ownerOverlay[r] = []
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = new Graphics()
        cell.position.set(gridOffsetX + c * CELL_PX, gridOffsetY + r * CELL_PX)
        this.stage.addChild(cell)
        this.cellGraphics[r]![c] = cell

        const ov = new Graphics()
        ov.position.set(gridOffsetX + c * CELL_PX, gridOffsetY + r * CELL_PX)
        this.stage.addChild(ov)
        this.ownerOverlay[r]![c] = ov
      }
    }

    // Palette buttons (for local player's turn)
    const btnY = gridOffsetY + GRID_SIZE * CELL_PX + 20
    const btnW = 52
    const btnGap = 10
    const totalW = PALETTE.length * (btnW + btnGap) - btnGap
    const btnStartX = (LOGIC_W - totalW) / 2

    PALETTE.forEach((color, i) => {
      const btn = new Graphics()
      btn.roundRect(btnStartX + i * (btnW + btnGap), btnY, btnW, 36, 8).fill(color)
      btn.eventMode = 'static'
      btn.cursor = 'pointer'
      btn.on('pointerdown', () => this.handlePaletteClick(i))
      this.stage.addChild(btn)
      this.paletteButtons.push(btn)
    })
  }

  private redraw(): void {
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const color = PALETTE[this.grid[r]?.[c] ?? 0] ?? 0x333333
        const cell = this.cellGraphics[r]?.[c]
        if (!cell) continue
        cell.clear()
        cell.rect(1, 1, CELL_PX - 2, CELL_PX - 2).fill(color)
      }
    }
    // Owner overlay: draw a small dot or border on owned cells
    // Clear all first
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        this.ownerOverlay[r]?.[c]?.clear()
      }
    }
    this.players.forEach((p, idx) => {
      const ownerColor = [0xffffff, 0x000000, 0xffffff, 0x000000][idx] ?? 0xffffff
      const alpha = 0.25
      for (const k of p.cells) {
        const [r, c] = k.split(',').map(Number) as [number, number]
        const ov = this.ownerOverlay[r]?.[c]
        if (!ov) continue
        ov.rect(1, 1, CELL_PX - 2, CELL_PX - 2).stroke({ width: 3, color: ownerColor, alpha })
      }
    })
  }

  private updateUI(): void {
    const current = this.players[this.turnIndex]
    const localId = this.ctx.players.getLocalPlayer().id
    const isMyTurn = current?.id === localId

    this.turnText.text = current ? `${current.name}'s turn` : ''
    ;(this.turnText.style as TextStyle).fill = isMyTurn ? '#30d158' : '#c0c0e0'

    const scores = this.players.map(p => `${p.name}: ${p.cells.size}`).join('  |  ')
    this.statusText.text = scores

    // Dim palette if not our turn
    this.paletteButtons.forEach((btn, i) => {
      btn.alpha = isMyTurn && !this.gameOver ? 1 : 0.35
      // Highlight current player colour
      const current = this.players.find(p => p.id === localId)
      btn.scale.set(current && i === current.colorIdx ? 1.15 : 1)
    })
  }

  private handlePaletteClick(colorIdx: number): void {
    if (this.gameOver) return
    const current = this.players[this.turnIndex]
    const localId = this.ctx.players.getLocalPlayer().id
    if (current?.id !== localId) return

    if (this.ctx.network.isHost()) {
      this.applyMove(localId, colorIdx)
    } else {
      this.ctx.network.send(CF_EVENTS.MOVE, { playerId: localId, colorIdx })
    }
  }

  private showResults(sorted: PlayerInfo[]): void {
    this.stage.clear()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)

    new Array(this.stage.children.length).fill(null).forEach(() => this.stage.removeChildAt(0))
    this.stage.removeChildren()

    const title = new Text({
      text: 'GAME OVER',
      style: new TextStyle({ fontFamily: 'monospace', fontSize: 36, fontWeight: '900', fill: '#00f5ff', letterSpacing: 4 }),
    })
    title.anchor.set(0.5)
    title.position.set(LOGIC_W / 2, 100)
    this.stage.addChild(title)

    sorted.forEach((p, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
      const color = PALETTE[p.colorIdx] ?? 0xffffff
      const t = new Text({
        text: `${medal}  ${p.name.padEnd(14)}  ${p.cells.size} cells`,
        style: new TextStyle({ fontFamily: 'monospace', fontSize: 22, fill: `#${color.toString(16).padStart(6, '0')}` }),
      })
      t.anchor.set(0.5)
      t.position.set(LOGIC_W / 2, 190 + i * 56)
      this.stage.addChild(t)
    })

    const localId = this.ctx.players.getLocalPlayer().id
    if (this.ctx.network.isHost()) {
      this.ctx.stats.record('play')
      if (sorted[0]?.id === localId) this.ctx.stats.record('win')
      else this.ctx.stats.record('loss')
      this.ctx.events.emit('platform:game:ended', {
        gameId: this.ctx.gameId,
        winnerId: sorted[0]?.id,
        durationMs: 0,
        results: sorted.map((p, i) => ({ playerId: p.id, playerName: p.name, rank: i + 1, cells: p.cells.size })),
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
