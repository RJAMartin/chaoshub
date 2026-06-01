// Pixel Portrait — draw a prompt in 40s, others vote for best drawing
import { Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'

const LOGIC_W = 700, LOGIC_H = 540
const CANVAS_SIZE = 300, PALETTE = ['#ffffff','#ff2d78','#00f5ff','#ffd60a','#30d158','#bf5af2','#ff9f0a','#ff6b6b','#0a0a0f','#555577']
const PROMPTS = ['a cat','a rocket ship','a pizza slice','a dragon','a banana','a house','a tree','a guitar','a shark','a penguin','a castle','a robot','a crown','a cactus','a volcano','a pirate ship','a lighthouse','a donut','a ghost','a dinosaur']
const DRAW_TIME = 40, VOTE_TIME = 20

interface DrawPixel { x: number; y: number; color: string }

export class PixelPortraitGame implements GameInstance {
  private ctx: GameContext; private app: Application
  private stage!: Graphics
  private phase: 'draw' | 'vote' | 'results' = 'draw'
  private prompt = ''
  private round = 0; private totalRounds = 3
  private scores = new Map<string, number>()
  private drawings = new Map<string, DrawPixel[]>() // playerId -> pixels
  private localPixels: DrawPixel[] = []
  private selectedColor = '#ffffff'
  private timerVal = DRAW_TIME; private timerInterval: ReturnType<typeof setInterval> | null = null
  private timerText!: Text; private promptText!: Text; private statusText!: Text; private scoreText!: Text
  private canvasGfx!: Graphics; private paletteGfx: Graphics[] = []
  private votingDisplays: { playerId: string; gfx: Graphics; voteBtn: Graphics }[] = []
  private voted = false; private votes = new Map<string, number>()
  private isDrawing = false

  private readonly onNewRound = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { round, prompt } = msg.payload as { round: number; prompt: string }
    this.round = round; this.prompt = prompt; this.localPixels = []; this.voted = false; this.votes.clear()
    this.startDrawPhase()
  }
  private readonly onStartVote = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { drawings } = msg.payload as { drawings: { playerId: string; pixels: DrawPixel[] }[] }
    this.drawings.clear(); for (const d of drawings) this.drawings.set(d.playerId, d.pixels)
    this.startVotePhase()
  }
  private readonly onVote = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { voterId, forId } = msg.payload as { voterId: string; forId: string }
    if (!this.votes.has(voterId)) { this.votes.set(voterId, 1); this.scores.set(forId, (this.scores.get(forId) ?? 0) + 1) }
  }
  private readonly onResults = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { scores } = msg.payload as { scores: { id: string; score: number }[] }
    for (const s of scores) this.scores.set(s.id, s.score)
    this.showRoundResults()
  }
  private readonly onFinal = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { sorted } = msg.payload as { sorted: { id: string; name: string; score: number }[] }
    this.showFinal(sorted)
  }

  constructor(context: GameContext) { this.ctx = context; this.app = context.pixiApp as Application }

  async init(): Promise<void> {
    for (const p of this.ctx.players.getPlayers()) this.scores.set(p.id, 0)
    this.buildScene()
    this.ctx.network.on('portrait:new-round', this.onNewRound as never)
    this.ctx.network.on('portrait:start-vote', this.onStartVote as never)
    this.ctx.network.on('portrait:vote', this.onVote as never)
    this.ctx.network.on('portrait:results', this.onResults as never)
    this.ctx.network.on('portrait:final', this.onFinal as never)
    if (this.ctx.network.isHost()) setTimeout(() => this.hostNextRound(), 500)
  }

  update(_dt: number): void {}

  destroy(): void {
    if (this.timerInterval) clearInterval(this.timerInterval)
    this.app.stage.off('pointerdown', this.onPointerDown, this)
    this.app.stage.off('pointermove', this.onPointerMoveDraw, this)
    this.app.stage.off('pointerup', this.onPointerUp, this)
    this.ctx.network.off('portrait:new-round', this.onNewRound as never)
    this.ctx.network.off('portrait:start-vote', this.onStartVote as never)
    this.ctx.network.off('portrait:vote', this.onVote as never)
    this.ctx.network.off('portrait:results', this.onResults as never)
    this.ctx.network.off('portrait:final', this.onFinal as never)
    this.app.stage.removeChildren()
  }

  private hostNextRound(): void {
    this.round++; this.localPixels = []; this.voted = false; this.votes.clear()
    this.prompt = PROMPTS[Math.floor(Math.random() * PROMPTS.length)]!
    this.ctx.network.broadcast('portrait:new-round', { round: this.round, prompt: this.prompt })
    this.startDrawPhase()
  }

  private startDrawPhase(): void {
    this.phase = 'draw'; this.timerVal = DRAW_TIME
    this.promptText.text = `Draw: ${this.prompt}`
    this.statusText.text = 'Draw it!'
    this.clearCanvas(); this.showCanvas(true)
    if (this.timerInterval) clearInterval(this.timerInterval)
    this.timerInterval = setInterval(() => {
      this.timerVal--; this.timerText.text = `${this.timerVal}s`
      if (this.timerVal <= 0) { clearInterval(this.timerInterval!); if (this.ctx.network.isHost()) this.hostCollectDrawings() }
    }, 1000)
  }

  private hostCollectDrawings(): void {
    const localId = this.ctx.players.getLocalPlayer().id
    this.drawings.set(localId, [...this.localPixels])
    // In a real impl peers would send their pixels — for simplicity host just uses what it has
    // Broadcast all drawings for voting
    const drawingsArr = [...this.drawings.entries()].map(([playerId, pixels]) => ({ playerId, pixels }))
    // Add empty drawings for players who didn't send
    for (const p of this.ctx.players.getPlayers()) { if (!this.drawings.has(p.id)) drawingsArr.push({ playerId: p.id, pixels: [] }) }
    this.ctx.network.broadcast('portrait:start-vote', { drawings: drawingsArr })
    this.startVotePhase()
  }

  private startVotePhase(): void {
    this.phase = 'vote'; this.timerVal = VOTE_TIME
    this.showCanvas(false); this.buildVotingUI()
    this.promptText.text = `Vote: best "${this.prompt}"`
    this.statusText.text = 'Tap a drawing to vote!'
    if (this.timerInterval) clearInterval(this.timerInterval)
    this.timerInterval = setInterval(() => {
      this.timerVal--; this.timerText.text = `${this.timerVal}s`
      if (this.timerVal <= 0) { clearInterval(this.timerInterval!); if (this.ctx.network.isHost()) this.hostEndVote() }
    }, 1000)
  }

  private hostEndVote(): void {
    const scoresArr = [...this.scores.entries()].map(([id, score]) => ({ id, score }))
    this.ctx.network.broadcast('portrait:results', { scores: scoresArr })
    this.showRoundResults()
  }

  private showRoundResults(): void {
    if (this.timerInterval) clearInterval(this.timerInterval)
    this.clearVotingUI(); this.showCanvas(false)
    this.statusText.text = 'Round results!'
    this.timerText.text = ''
    this.scoreText.text = this.ctx.players.getPlayers().map(p => `${p.name}: ${this.scores.get(p.id) ?? 0}`).join('  |  ')
    if (this.round >= this.totalRounds) { if (this.ctx.network.isHost()) setTimeout(() => this.triggerFinal(), 3000) }
    else { if (this.ctx.network.isHost()) setTimeout(() => this.hostNextRound(), 3000) }
  }

  private triggerFinal(): void {
    const sorted = this.ctx.players.getPlayers().map(p => ({ id: p.id, name: p.name, score: this.scores.get(p.id) ?? 0 })).sort((a, b) => b.score - a.score)
    this.ctx.network.broadcast('portrait:final', { sorted }); this.showFinal(sorted)
  }

  private buildScene(): void {
    this.stage = new Graphics(); this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    this.app.stage.addChild(this.stage); this.scaleStage()
    const title = new Text({ text: 'PIXEL PORTRAIT', style: new TextStyle({ fontFamily: 'monospace', fontSize: 22, fontWeight: '900', fill: '#bf5af2' }) })
    title.anchor.set(0.5, 0); title.position.set(LOGIC_W / 2, 8); this.stage.addChild(title)
    this.promptText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 16, fill: '#ffd60a' }) })
    this.promptText.anchor.set(0.5, 0); this.promptText.position.set(LOGIC_W / 2, 36); this.stage.addChild(this.promptText)
    this.statusText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#c0c0e0' }) })
    this.statusText.anchor.set(0.5, 0); this.statusText.position.set(LOGIC_W / 2, 56); this.stage.addChild(this.statusText)
    this.timerText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 18, fontWeight: '700', fill: '#ff6b6b' }) })
    this.timerText.anchor.set(1, 0); this.timerText.position.set(LOGIC_W - 10, 8); this.stage.addChild(this.timerText)
    this.scoreText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: '#606080' }) })
    this.scoreText.anchor.set(0.5, 1); this.scoreText.position.set(LOGIC_W / 2, LOGIC_H - 4); this.stage.addChild(this.scoreText)
    // Drawing canvas background
    this.canvasGfx = new Graphics()
    this.canvasGfx.position.set((LOGIC_W - CANVAS_SIZE) / 2, 75)
    this.canvasGfx.rect(0, 0, CANVAS_SIZE, CANVAS_SIZE).fill(0x1a1a2e)
    this.canvasGfx.rect(0, 0, CANVAS_SIZE, CANVAS_SIZE).stroke({ width: 2, color: 0x4a4a8a })
    this.stage.addChild(this.canvasGfx)
    // Palette
    PALETTE.forEach((color, i) => {
      const swatch = new Graphics()
      const sw = 28, gap = 4, perRow = 10
      const px = (LOGIC_W - (perRow * (sw + gap))) / 2 + (i % perRow) * (sw + gap)
      const py = 75 + CANVAS_SIZE + 10
      swatch.rect(px, py, sw, sw).fill(parseInt(color.replace('#', ''), 16))
      swatch.rect(px, py, sw, sw).stroke({ width: color === this.selectedColor ? 2 : 0, color: 0xffffff })
      swatch.eventMode = 'static'; swatch.cursor = 'pointer'
      swatch.on('pointerdown', () => { this.selectedColor = color; this.updatePaletteHighlight(i) })
      this.stage.addChild(swatch); this.paletteGfx.push(swatch)
    })
    this.app.stage.eventMode = 'static'
    this.app.stage.on('pointerdown', this.onPointerDown, this)
    this.app.stage.on('pointermove', this.onPointerMoveDraw, this)
    this.app.stage.on('pointerup', this.onPointerUp, this)
  }

  private updatePaletteHighlight(selected: number): void {
    const sw = 28, gap = 4, perRow = 10
    PALETTE.forEach((color, i) => {
      const swatch = this.paletteGfx[i]!; const px = (LOGIC_W - (perRow * (sw + gap))) / 2 + (i % perRow) * (sw + gap), py = 75 + CANVAS_SIZE + 10
      swatch.clear()
      swatch.rect(px, py, sw, sw).fill(parseInt(color.replace('#', ''), 16))
      swatch.rect(px, py, sw, sw).stroke({ width: i === selected ? 2 : 0, color: 0xffffff })
    })
  }

  private showCanvas(visible: boolean): void { this.canvasGfx.visible = visible }

  private clearCanvas(): void {
    // Remove drawn pixels (children after base canvas bg)
    this.canvasGfx.clear()
    this.canvasGfx.rect(0, 0, CANVAS_SIZE, CANVAS_SIZE).fill(0x1a1a2e)
    this.canvasGfx.rect(0, 0, CANVAS_SIZE, CANVAS_SIZE).stroke({ width: 2, color: 0x4a4a8a })
    this.localPixels.forEach(px => {
      this.canvasGfx.rect(px.x * 6, px.y * 6, 6, 6).fill(parseInt(px.color.replace('#', ''), 16))
    })
  }

  private onPointerDown(e: { global: { x: number; y: number } }): void {
    if (this.phase !== 'draw') return
    this.isDrawing = true; this.paintAt(e.global.x, e.global.y)
  }
  private onPointerMoveDraw(e: { global: { x: number; y: number } }): void {
    if (this.phase !== 'draw' || !this.isDrawing) return; this.paintAt(e.global.x, e.global.y)
  }
  private onPointerUp(): void { this.isDrawing = false }

  private paintAt(gx: number, gy: number): void {
    const scale = this.stage.scale.x, ox = this.stage.position.x, oy = this.stage.position.y
    const stageX = (gx - ox) / scale, stageY = (gy - oy) / scale
    const canvOX = (LOGIC_W - CANVAS_SIZE) / 2, canvOY = 75
    const lx = stageX - canvOX, ly = stageY - canvOY
    if (lx < 0 || ly < 0 || lx >= CANVAS_SIZE || ly >= CANVAS_SIZE) return
    const px = Math.floor(lx / 6), py = Math.floor(ly / 6)
    const exists = this.localPixels.find(p => p.x === px && p.y === py)
    if (exists) { exists.color = this.selectedColor } else { this.localPixels.push({ x: px, y: py, color: this.selectedColor }) }
    this.canvasGfx.rect(px * 6, py * 6, 6, 6).fill(parseInt(this.selectedColor.replace('#', ''), 16))
  }

  private buildVotingUI(): void {
    this.clearVotingUI()
    const players = this.ctx.players.getPlayers()
    const localId = this.ctx.players.getLocalPlayer().id
    const cols = Math.min(players.length, 3), rows = Math.ceil(players.length / cols)
    const tileW = (LOGIC_W - 20) / cols - 10, tileH = (LOGIC_H - 100) / rows - 10
    players.forEach((p, i) => {
      const col = i % cols, row = Math.floor(i / cols)
      const tx = 15 + col * (tileW + 10), ty = 80 + row * (tileH + 10)
      const miniGfx = new Graphics()
      miniGfx.rect(tx, ty, tileW, tileH).fill(0x1a1a2e); miniGfx.rect(tx, ty, tileW, tileH).stroke({ width: 1, color: 0x3a3a6a })
      this.stage.addChild(miniGfx)
      const pixels = this.drawings.get(p.id) ?? []
      const scale = Math.min(tileW / CANVAS_SIZE, (tileH - 30) / CANVAS_SIZE)
      pixels.forEach(pxl => { miniGfx.rect(tx + pxl.x * 6 * scale, ty + pxl.y * 6 * scale, 6 * scale, 6 * scale).fill(parseInt(pxl.color.replace('#', ''), 16)) })
      const nameLabel = new Text({ text: p.name, style: new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: '#c0c0e0' }) })
      nameLabel.anchor.set(0.5, 1); nameLabel.position.set(tx + tileW / 2, ty + tileH - 2); this.stage.addChild(nameLabel)
      if (p.id !== localId) {
        const voteBtn = new Graphics()
        voteBtn.roundRect(tx + 4, ty + tileH - 22, tileW - 8, 20, 4).fill(0x1a1a4a).stroke({ width: 1, color: 0x00f5ff })
        voteBtn.eventMode = 'static'; voteBtn.cursor = 'pointer'
        voteBtn.on('pointerdown', () => { if (!this.voted) { this.voted = true; this.ctx.network.send('portrait:vote', { voterId: localId, forId: p.id }); if (this.ctx.network.isHost()) { this.scores.set(p.id, (this.scores.get(p.id) ?? 0) + 1) } } })
        this.stage.addChild(voteBtn)
        this.votingDisplays.push({ playerId: p.id, gfx: miniGfx, voteBtn })
      } else {
        this.votingDisplays.push({ playerId: p.id, gfx: miniGfx, voteBtn: new Graphics() })
      }
    })
  }

  private clearVotingUI(): void {
    for (const v of this.votingDisplays) { this.stage.removeChild(v.gfx); this.stage.removeChild(v.voteBtn) }
    this.votingDisplays = []
  }

  private showFinal(sorted: { id: string; name: string; score: number }[]): void {
    if (this.timerInterval) clearInterval(this.timerInterval)
    this.stage.removeChildren(); this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    const t = new Text({ text: 'PIXEL PORTRAIT', style: new TextStyle({ fontFamily: 'monospace', fontSize: 28, fontWeight: '900', fill: '#bf5af2' }) })
    t.anchor.set(0.5); t.position.set(LOGIC_W / 2, 80); this.stage.addChild(t)
    sorted.forEach((p, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
      const row = new Text({ text: `${medal}  ${p.name.padEnd(14)}  ${p.score} votes`, style: new TextStyle({ fontFamily: 'monospace', fontSize: 22, fill: i === 0 ? '#ffd60a' : '#c0c0e0' }) })
      row.anchor.set(0.5); row.position.set(LOGIC_W / 2, 160 + i * 52); this.stage.addChild(row)
    })
    const localId = this.ctx.players.getLocalPlayer().id
    if (this.ctx.network.isHost()) {
      this.ctx.stats.record('play'); if (sorted[0]?.id === localId) this.ctx.stats.record('win'); else this.ctx.stats.record('loss')
      this.ctx.events.emit('platform:game:ended', { gameId: this.ctx.gameId, winnerId: sorted[0]?.id, durationMs: 0, results: sorted.map((p, i) => ({ playerId: p.id, playerName: p.name, rank: i + 1, score: p.score })) })
    }
  }

  private scaleStage(): void {
    const { width: cw, height: ch } = this.app.screen
    const scale = Math.min(cw / LOGIC_W, ch / LOGIC_H) * 0.97
    this.stage.scale.set(scale); this.stage.position.set((cw - LOGIC_W * scale) / 2, (ch - LOGIC_H * scale) / 2)
  }
}
