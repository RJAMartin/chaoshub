// ─────────────────────────────────────────────────────────────────────────────
// Tower Stack — Timing game: stack falling blocks as high as possible
//
// A platform swings left/right. Press the button to drop it and try to land
// perfectly on the previous block. Overhanging parts are cut off.
// Each player plays simultaneously in their own column.
// Game ends when someone misses entirely or reaches 15 blocks.
// Most blocks (or highest score) wins.
// ─────────────────────────────────────────────────────────────────────────────
import { Container, Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'
import { createGameUI } from '@/core/services/game-ui/game-ui'

export const TS_EVENTS = {
  DROP:   'tower-stack:drop',
  STATE:  'tower-stack:state',
  FINAL:  'tower-stack:final',
} as const

const PLAYER_COLORS = [0x00f5ff, 0xff2d78, 0xffd60a, 0x30d158, 0xbf5af2, 0xff9f0a]
const BLOCK_H     = 24
const SWING_SPEED = 120   // px/s, increases each level
const TARGET_BLOCKS = 15

interface Block { x: number; w: number }
interface PlayerTower {
  id: string; name: string
  blocks: Block[]
  currentX: number   // current swing position
  currentW: number   // current block width
  swingDir: 1 | -1
  alive: boolean
  colorIdx: number
  colX: number       // x offset of this player's column
  colW: number       // width of column
}

export class TowerStackGame implements GameInstance {
  private ctx: GameContext
  private app: Application
  private ui = createGameUI()

  private stage!: Container
  private towersGfx = new Map<string, Graphics>()
  private scoreHud!: Text
  private towers = new Map<string, PlayerTower>()
  private gameOver = false
  private localId = ''

  private readonly onDrop = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { playerId, x, w } = msg.payload as { playerId: string; x: number; w: number }
    this.applyDrop(playerId, x, w)
  }

  private readonly onState = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { towers } = msg.payload as { towers: {id:string;blocks:Block[];currentX:number;currentW:number;alive:boolean}[] }
    for (const t of towers) {
      const tower = this.towers.get(t.id)
      if (tower) { tower.blocks = t.blocks; tower.currentX = t.currentX; tower.currentW = t.currentW; tower.alive = t.alive }
    }
  }

  private readonly onFinal = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { sorted } = msg.payload as { sorted: {id:string;name:string;score:number}[] }
    this.showFinal(sorted)
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); this.performDrop() }
  }

  constructor(context: GameContext) {
    this.ctx = context
    this.app = context.pixiApp as Application
  }

  async init(): Promise<void> {
    this.localId = this.ctx.players.getLocalPlayer().id
    const players = this.ctx.players.getPlayers()
    const { width: W, height: H } = this.app.screen
    const colW = Math.floor(W / players.length)

    players.forEach((p, i) => {
      const colX = i * colW
      const startW = Math.min(colW * 0.7, 100)
      const baseBlock: Block = { x: colX + (colW - startW) / 2, w: startW }
      this.towers.set(p.id, {
        id: p.id, name: p.name,
        blocks: [baseBlock],
        currentX: colX + (colW - startW) / 2,
        currentW: startW,
        swingDir: 1,
        alive: true,
        colorIdx: i % PLAYER_COLORS.length,
        colX, colW,
      })
    })

    this.buildScene()
    this.ctx.network.on(TS_EVENTS.DROP,  this.onDrop  as never)
    this.ctx.network.on(TS_EVENTS.STATE, this.onState as never)
    this.ctx.network.on(TS_EVENTS.FINAL, this.onFinal as never)
    this.app.canvas.addEventListener('click', this.handleClick)
    window.addEventListener('keydown', this.onKeyDown)

    await this.ui.showInstructions(this.ctx, {
      title: '🏗️ Tower Stack',
      subtitle: `Stack ${TARGET_BLOCKS} blocks — precision beats speed`,
      lines: [
        '🧱 A block swings back and forth above your tower',
        '🎯 Click / press Space at the right moment to drop it',
        '✂️ Any overhanging part is trimmed off — the block shrinks!',
        `🏆 Reach ${TARGET_BLOCKS} blocks or have the tallest tower when time is up`,
        '⚠️ Miss completely (block doesn\'t overlap) = eliminated!',
      ],
      controls: 'Click / Tap / Space to drop the block',
      accentColor: 0xff9f0a,
    })
    await this.ui.countdown(this.ctx)
    this.ui.clear()
  }

  update(dt: number): void {
    if (this.gameOver) return
    // Animate the local player's swinging block
    const tower = this.towers.get(this.localId)
    if (!tower || !tower.alive) return

    const level = tower.blocks.length
    const speed = SWING_SPEED + level * 15
    tower.currentX += speed * tower.swingDir * dt

    // Bounce off column walls
    if (tower.currentX + tower.currentW > tower.colX + tower.colW) {
      tower.currentX = tower.colX + tower.colW - tower.currentW
      tower.swingDir = -1
    }
    if (tower.currentX < tower.colX) {
      tower.currentX = tower.colX
      tower.swingDir = 1
    }

    this.renderAll()
  }

  destroy(): void {
    this.app.canvas.removeEventListener('click', this.handleClick)
    window.removeEventListener('keydown', this.onKeyDown)
    this.ctx.network.off(TS_EVENTS.DROP,  this.onDrop  as never)
    this.ctx.network.off(TS_EVENTS.STATE, this.onState as never)
    this.ctx.network.off(TS_EVENTS.FINAL, this.onFinal as never)
    this.ui.destroy()
    this.app.stage.removeChildren()
  }

  private readonly handleClick = (): void => { this.performDrop() }

  private performDrop(): void {
    if (this.gameOver) return
    const tower = this.towers.get(this.localId)
    if (!tower || !tower.alive) return

    if (this.ctx.network.isHost()) {
      this.applyDrop(this.localId, tower.currentX, tower.currentW)
    } else {
      this.ctx.network.send(TS_EVENTS.DROP, { playerId: this.localId, x: tower.currentX, w: tower.currentW })
    }
  }

  private applyDrop(playerId: string, dropX: number, dropW: number): void {
    const tower = this.towers.get(playerId)
    if (!tower || !tower.alive) return

    const prevBlock = tower.blocks[tower.blocks.length - 1]!

    // Calculate overlap
    const left  = Math.max(dropX, prevBlock.x)
    const right = Math.min(dropX + dropW, prevBlock.x + prevBlock.w)
    const overlap = right - left

    if (overlap <= 0) {
      // Complete miss — eliminated
      tower.alive = false
      this.ctx.sound.fail()
    } else {
      const newBlock: Block = { x: left, w: overlap }
      tower.blocks.push(newBlock)
      tower.currentW = overlap

      const accuracy = overlap / prevBlock.w
      if (accuracy > 0.95) this.ctx.sound.success()
      else this.ctx.sound.beep(440, 0.06)

      // Check win
      if (tower.blocks.length >= TARGET_BLOCKS + 1) {
        this.hostCheckWinner()
        return
      }
    }

    const towersArr = [...this.towers.values()].map(t => ({ id: t.id, blocks: t.blocks, currentX: t.currentX, currentW: t.currentW, alive: t.alive }))
    this.ctx.network.broadcast(TS_EVENTS.STATE, { towers: towersArr })
    this.checkAllEliminated()
  }

  private checkAllEliminated(): void {
    const alive = [...this.towers.values()].filter(t => t.alive)
    if (alive.length <= 1) this.hostCheckWinner()
  }

  private hostCheckWinner(): void {
    if (this.gameOver) return
    this.gameOver = true
    const sorted = [...this.towers.values()]
      .map(t => ({ id: t.id, name: t.name, score: t.blocks.length - 1 }))
      .sort((a, b) => b.score - a.score)
    this.ctx.network.broadcast(TS_EVENTS.FINAL, { sorted })
    this.showFinal(sorted)
  }

  private showFinal(sorted: {id:string;name:string;score:number}[]): void {
    this.gameOver = true
    const winner = sorted[0]!
    const scoreStr = sorted.map((s, i) => `${['🥇','🥈','🥉'][i] ?? `${i+1}.`} ${s.name}: ${s.score} blocks`).join('  ')
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

  private renderAll(): void {
    const { height: H } = this.app.screen

    for (const [id, tower] of this.towers) {
      let g = this.towersGfx.get(id)
      if (!g) { g = new Graphics(); this.stage.addChildAt(g, 1); this.towersGfx.set(id, g) }
      g.clear()

      if (!tower.alive) {
        g.rect(tower.colX, 0, tower.colW, H).fill({ color: 0x100808, alpha: 0.5 })
        const t = new Text({ text: '💀', style: new TextStyle({ fontSize: 28 }) })
        g.addChild(t)
        t.anchor.set(0.5); t.position.set(tower.colX + tower.colW / 2, H / 2)
        continue
      }

      const color = PLAYER_COLORS[tower.colorIdx]!

      // Placed blocks (from bottom)
      tower.blocks.forEach((block, i) => {
        if (i === 0) return  // skip base
        const by = H - 60 - i * BLOCK_H
        g!.roundRect(block.x + 2, by, block.w - 4, BLOCK_H - 2, 3)
          .fill({ color, alpha: 0.6 + i * 0.025 })
      })

      // Base block
      const base = tower.blocks[0]!
      g.roundRect(base.x + 2, H - 60 - BLOCK_H, base.w - 4, BLOCK_H - 2, 3).fill({ color, alpha: 0.3 })

      // Swinging block (if alive)
      const swingY = H - 60 - tower.blocks.length * BLOCK_H - BLOCK_H
      g.roundRect(tower.currentX + 2, swingY, tower.currentW - 4, BLOCK_H - 2, 3).fill({ color, alpha: 1 })

      // Score
      const scoreT = new Text({ text: `${tower.name}\n${tower.blocks.length - 1}`, style: new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: `#${color.toString(16).padStart(6,'0')}`, align: 'center' }) })
      scoreT.anchor.set(0.5, 1)
      scoreT.position.set(tower.colX + tower.colW / 2, H - 8)
      g.addChild(scoreT)
    }
  }

  private buildScene(): void {
    const { width: W, height: H } = this.app.screen
    this.stage = new Container()
    this.app.stage.addChild(this.stage)

    const bg = new Graphics()
    bg.rect(0, 0, W, H).fill(0x08080f)
    this.stage.addChild(bg)

    // Column dividers
    const dividers = new Graphics()
    const players = this.ctx.players.getPlayers()
    const colW = Math.floor(W / players.length)
    for (let i = 1; i < players.length; i++) {
      dividers.moveTo(i * colW, 0).lineTo(i * colW, H)
    }
    dividers.stroke({ width: 1, color: 0x1a1a30 })
    this.stage.addChild(dividers)

    this.scoreHud = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 12, fill: '#30306a' }) })
    this.stage.addChild(this.scoreHud)
  }
}
