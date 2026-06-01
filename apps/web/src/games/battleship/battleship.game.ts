// Battleship — 1v1 naval combat on 8x8 grids
import { Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'

export const BS_EVENTS = {
  INIT: 'battleship:init',
  SHOT: 'battleship:shot',
  RESULT: 'battleship:result',
  WINNER: 'battleship:winner',
} as const

const LOGIC_W = 820, LOGIC_H = 520
const GRID = 8, CELL = 44
const SHIP_SIZES = [4, 3, 2, 2]

interface ShipDef { row: number; col: number; size: number; horizontal: boolean }
interface GridState { ships: ShipDef[]; hits: boolean[][]; misses: boolean[][] }

function emptyGrid(): GridState {
  return { ships: [], hits: Array.from({ length: GRID }, () => Array(GRID).fill(false)), misses: Array.from({ length: GRID }, () => Array(GRID).fill(false)) }
}

function placeShipsRandom(): ShipDef[] {
  const occupied = Array.from({ length: GRID }, () => Array(GRID).fill(false))
  const ships: ShipDef[] = []
  for (const size of SHIP_SIZES) {
    let placed = false
    while (!placed) {
      const h = Math.random() < 0.5
      const r = Math.floor(Math.random() * (h ? GRID : GRID - size + 1))
      const c = Math.floor(Math.random() * (h ? GRID - size + 1 : GRID))
      let ok = true
      for (let i = 0; i < size; i++) {
        const tr = h ? r : r + i; const tc = h ? c + i : c
        if (occupied[tr]![tc]) { ok = false; break }
      }
      if (ok) {
        for (let i = 0; i < size; i++) { const tr = h ? r : r + i; const tc = h ? c + i : c; occupied[tr]![tc] = true }
        ships.push({ row: r, col: c, size, horizontal: h })
        placed = true
      }
    }
  }
  return ships
}

function isHit(ships: ShipDef[], row: number, col: number): boolean {
  return ships.some(s => {
    for (let i = 0; i < s.size; i++) {
      const r = s.horizontal ? s.row : s.row + i; const c = s.horizontal ? s.col + i : s.col
      if (r === row && c === col) return true
    }
    return false
  })
}

function isSunk(s: ShipDef, hits: boolean[][]): boolean {
  for (let i = 0; i < s.size; i++) {
    const r = s.horizontal ? s.row : s.row + i; const c = s.horizontal ? s.col + i : s.col
    if (!hits[r]![c]) return false
  }
  return true
}

export class BattleshipGame implements GameInstance {
  private ctx: GameContext; private app: Application
  private stage!: Graphics
  private ownGrid!: Graphics; private enemyGrid!: Graphics
  private statusText!: Text; private scoreText!: Text
  private ownLabel!: Text; private enemyLabel!: Text

  private p1Id = ''; private p2Id = ''; private p1Name = ''; private p2Name = ''
  private myGrid: GridState = emptyGrid()
  private enemyKnown: GridState = emptyGrid()  // hits/misses on enemy (ships unknown)
  private currentTurn = 1  // 1 or 2
  private gameOver = false

  private readonly onInitMsg = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { p1Id, p2Id, p1Name, p2Name } = msg.payload as { p1Id: string; p2Id: string; p1Name: string; p2Name: string }
    this.p1Id = p1Id; this.p2Id = p2Id; this.p1Name = p1Name; this.p2Name = p2Name
    // place own ships
    this.myGrid = emptyGrid(); this.myGrid.ships = placeShipsRandom()
    this.updateStatus(); this.renderGrids()
  }

  private readonly onResult = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { shooterId, row, col, hit, sunk, nextTurn } = msg.payload as {
      shooterId: string; row: number; col: number; hit: boolean; sunk: boolean; nextTurn: 1 | 2
    }
    const localId = this.ctx.players.getLocalPlayer().id
    if (shooterId === localId) {
      this.enemyKnown.hits[row]![col] = hit
      if (!hit) this.enemyKnown.misses[row]![col] = true
    } else {
      this.myGrid.hits[row]![col] = hit
      if (!hit) this.myGrid.misses[row]![col] = true
    }
    this.currentTurn = nextTurn
    if (sunk) this.statusText.text = `Ship sunk!`
    this.updateStatus(); this.renderGrids()
  }

  private readonly onWinner = (msg: NetworkMessage) => {
    const { winnerId, winnerName } = msg.payload as { winnerId: string; winnerName: string }
    this.showWinner(winnerId, winnerName)
  }

  constructor(context: GameContext) { this.ctx = context; this.app = context.pixiApp as Application }

  async init(): Promise<void> {
    const players = this.ctx.players.getPlayers()
    this.p1Id = players[0]?.id ?? ''; this.p1Name = players[0]?.name ?? 'P1'
    this.p2Id = players[1]?.id ?? players[0]?.id ?? ''; this.p2Name = players[1]?.name ?? 'P2'
    this.myGrid = emptyGrid(); this.myGrid.ships = placeShipsRandom()
    this.enemyKnown = emptyGrid()
    this.buildScene()
    this.ctx.network.on(BS_EVENTS.INIT, this.onInitMsg as never)
    this.ctx.network.on(BS_EVENTS.RESULT, this.onResult as never)
    this.ctx.network.on(BS_EVENTS.WINNER, this.onWinner as never)
    if (this.ctx.network.isHost()) {
      this.ctx.network.broadcast(BS_EVENTS.INIT, { p1Id: this.p1Id, p2Id: this.p2Id, p1Name: this.p1Name, p2Name: this.p2Name })
    }
    this.updateStatus(); this.renderGrids()
  }

  update(_dt: number): void {}

  destroy(): void {
    this.ctx.network.off(BS_EVENTS.INIT, this.onInitMsg as never)
    this.ctx.network.off(BS_EVENTS.RESULT, this.onResult as never)
    this.ctx.network.off(BS_EVENTS.WINNER, this.onWinner as never)
    this.app.stage.removeChildren()
  }

  private handleShot(row: number, col: number): void {
    if (this.gameOver) return
    const localId = this.ctx.players.getLocalPlayer().id
    const myNum = localId === this.p1Id ? 1 : localId === this.p2Id ? 2 : 0
    if (myNum !== this.currentTurn) return
    if (this.enemyKnown.hits[row]![col] || this.enemyKnown.misses[row]![col]) return
    if (this.ctx.network.isHost()) {
      this.processShot(localId, row, col)
    } else {
      this.ctx.network.send(BS_EVENTS.SHOT, { playerId: localId, row, col })
    }
  }

  private readonly onShot = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { playerId, row, col } = msg.payload as { playerId: string; row: number; col: number }
    this.processShot(playerId, row, col)
  }

  private processShot(shooterId: string, row: number, col: number): void {
    if (this.gameOver) return
    const shooterNum = shooterId === this.p1Id ? 1 : 2
    if (shooterNum !== this.currentTurn) return
    const targetId = shooterNum === 1 ? this.p2Id : this.p1Id
    // We need to know target's ships. Host knows p1 ships. But we need both players' ships.
    // In this simplified model, hits are determined by the shooter knowing the target grid
    // Since ships are placed locally by each client, host needs to receive ship data.
    // We'll use the host's myGrid as p1 ships, and trust the shot resolution.
    // Actually: if host is p1, host knows p1 ships. Clients know their own ships.
    // For simplicity, we track hits client-side and broadcast results.
    // Let's resolve on host using ships broadcast during init.
    // The host resolves shots against the target's ships (need to have them)
    // Simple approach: each player sends their ships during init, host stores both
    const targetShips = this.shipRegistry.get(targetId) ?? []
    const hit = isHit(targetShips, row, col)
    const grid = this.hitRegistry.get(targetId) ?? emptyGrid()
    grid.hits[row]![col] = hit
    if (!hit) grid.misses[row]![col] = true
    this.hitRegistry.set(targetId, grid)
    const sunk = hit && targetShips.some(s => {
      for (let i = 0; i < s.size; i++) {
        const r = s.horizontal ? s.row : s.row + i; const c = s.horizontal ? s.col + i : s.col
        if (r === row && c === col) return isSunk(s, grid.hits)
      }
      return false
    })
    const nextTurn: 1 | 2 = this.currentTurn === 1 ? 2 : 1
    this.currentTurn = nextTurn
    this.ctx.network.broadcast(BS_EVENTS.RESULT, { shooterId, row, col, hit, sunk, nextTurn })
    // apply locally
    if (shooterId === this.ctx.players.getLocalPlayer().id) {
      this.enemyKnown.hits[row]![col] = hit
      if (!hit) this.enemyKnown.misses[row]![col] = true
    } else {
      this.myGrid.hits[row]![col] = hit
      if (!hit) this.myGrid.misses[row]![col] = true
    }
    this.updateStatus(); this.renderGrids()
    // Check win
    const allSunk = targetShips.every(s => isSunk(s, grid.hits))
    if (allSunk) {
      const winnerId = shooterId; const winnerName = winnerId === this.p1Id ? this.p1Name : this.p2Name
      this.ctx.network.broadcast(BS_EVENTS.WINNER, { winnerId, winnerName })
      this.showWinner(winnerId, winnerName)
    }
  }

  private shipRegistry = new Map<string, ShipDef[]>()
  private hitRegistry = new Map<string, GridState>()

  private readonly onShips = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { playerId, ships } = msg.payload as { playerId: string; ships: ShipDef[] }
    this.shipRegistry.set(playerId, ships)
    this.hitRegistry.set(playerId, emptyGrid())
  }

  private buildScene(): void {
    this.stage = new Graphics()
    this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    this.app.stage.addChild(this.stage); this.scaleStage()

    const title = new Text({ text: 'BATTLESHIP', style: new TextStyle({ fontFamily: 'monospace', fontSize: 22, fontWeight: '900', fill: '#00f5ff', letterSpacing: 5 }) })
    title.anchor.set(0.5, 0); title.position.set(LOGIC_W / 2, 12); this.stage.addChild(title)

    this.statusText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 15, fill: '#ffd60a' }) })
    this.statusText.anchor.set(0.5, 0); this.statusText.position.set(LOGIC_W / 2, 44); this.stage.addChild(this.statusText)

    // Own fleet (left grid)
    const lx = 30, gy = 90
    this.ownLabel = new Text({ text: 'YOUR FLEET', style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#30d158' }) })
    this.ownLabel.position.set(lx, gy - 20); this.stage.addChild(this.ownLabel)
    this.ownGrid = new Graphics(); this.ownGrid.position.set(lx, gy); this.stage.addChild(this.ownGrid)

    // Enemy grid (right)
    const rx = LOGIC_W / 2 + 20
    this.enemyLabel = new Text({ text: 'ENEMY WATERS', style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#ff2d78' }) })
    this.enemyLabel.position.set(rx, gy - 20); this.stage.addChild(this.enemyLabel)
    this.enemyGrid = new Graphics(); this.enemyGrid.position.set(rx, gy); this.stage.addChild(this.enemyGrid)

    // Click zones on enemy grid
    for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
      const zone = new Graphics()
      zone.rect(0, 0, CELL, CELL).fill({ color: 0xffffff, alpha: 0.001 })
      zone.position.set(rx + c * CELL, gy + r * CELL)
      zone.eventMode = 'static'; zone.cursor = 'pointer'
      zone.on('pointerdown', () => this.handleShot(r, c))
      this.stage.addChild(zone)
    }

    this.scoreText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#606080' }) })
    this.scoreText.anchor.set(0.5, 1); this.scoreText.position.set(LOGIC_W / 2, LOGIC_H - 8); this.stage.addChild(this.scoreText)

    // Register this client's ships to host
    const localId = this.ctx.players.getLocalPlayer().id
    if (this.ctx.network.isHost()) {
      this.shipRegistry.set(localId, this.myGrid.ships)
      this.hitRegistry.set(localId, emptyGrid())
    } else {
      this.ctx.network.send(BS_EVENTS.INIT, { playerId: localId, ships: this.myGrid.ships })
    }
    this.ctx.network.on(BS_EVENTS.SHOT, this.onShot as never)
    this.ctx.network.on('battleship:ships' as never, this.onShips as never)
    // Send ships to host
    if (!this.ctx.network.isHost()) {
      this.ctx.network.send('battleship:ships' as never, { playerId: localId, ships: this.myGrid.ships })
    }
  }

  private renderGrids(): void {
    // Own fleet grid
    const og = this.ownGrid; og.clear()
    for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
      const x = c * CELL, y = r * CELL
      og.rect(x, y, CELL - 1, CELL - 1).fill(0x0a1a2a)
      og.rect(x, y, CELL - 1, CELL - 1).stroke({ width: 1, color: 0x204060 })
    }
    for (const s of this.myGrid.ships) {
      for (let i = 0; i < s.size; i++) {
        const r = s.horizontal ? s.row : s.row + i; const c = s.horizontal ? s.col + i : s.col
        const hit = this.myGrid.hits[r]![c]
        og.rect(c * CELL + 2, r * CELL + 2, CELL - 5, CELL - 5).fill(hit ? 0xff4444 : 0x30d158)
      }
    }
    for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
      if (this.myGrid.misses[r]![c]) og.circle(c * CELL + CELL / 2, r * CELL + CELL / 2, 4).fill(0x4080c0)
    }

    // Enemy grid
    const eg = this.enemyGrid; eg.clear()
    for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
      const x = c * CELL, y = r * CELL
      eg.rect(x, y, CELL - 1, CELL - 1).fill(0x0a1a2a)
      eg.rect(x, y, CELL - 1, CELL - 1).stroke({ width: 1, color: 0x204060 })
      if (this.enemyKnown.hits[r]![c]) eg.rect(x + 2, y + 2, CELL - 5, CELL - 5).fill(0xff4444)
      else if (this.enemyKnown.misses[r]![c]) eg.circle(x + CELL / 2, y + CELL / 2, 4).fill(0x4080c0)
    }
  }

  private updateStatus(): void {
    const localId = this.ctx.players.getLocalPlayer().id
    const myNum = localId === this.p1Id ? 1 : 2
    const myTurn = myNum === this.currentTurn
    const turnName = this.currentTurn === 1 ? this.p1Name : this.p2Name
    this.statusText.text = this.gameOver ? '' : myTurn ? 'Your turn! Click enemy waters.' : `${turnName}'s turn...`
    ;(this.statusText.style as TextStyle).fill = myTurn ? '#30d158' : '#ffd60a'
  }

  private showWinner(winnerId: string, winnerName: string): void {
    this.gameOver = true
    const localId = this.ctx.players.getLocalPlayer().id
    const won = winnerId === localId
    this.statusText.text = won ? '🏆 You sunk all ships! You win!' : `${winnerName} sunk all your ships!`
    ;(this.statusText.style as TextStyle).fill = won ? '#30d158' : '#ff2d78'
    if (this.ctx.network.isHost()) {
      this.ctx.stats.record('play')
      if (won) this.ctx.stats.record('win'); else this.ctx.stats.record('loss')
      const players = this.ctx.players.getPlayers()
      this.ctx.events.emit('platform:game:ended', { gameId: this.ctx.gameId, winnerId, durationMs: 0, results: players.map((p) => ({ playerId: p.id, playerName: p.name, rank: winnerId === p.id ? 1 : 2, score: 0 })) })
    }
  }

  private scaleStage(): void {
    const { width: cw, height: ch } = this.app.screen
    const scale = Math.min(cw / LOGIC_W, ch / LOGIC_H) * 0.97
    this.stage.scale.set(scale); this.stage.position.set((cw - LOGIC_W * scale) / 2, (ch - LOGIC_H * scale) / 2)
  }
}
