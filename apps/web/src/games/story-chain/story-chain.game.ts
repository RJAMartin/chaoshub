// Story Chain — each player adds one sentence to a story; vote on the funniest chain
import { Graphics, Text, TextStyle, type Application } from 'pixi.js'
import type { GameContext, GameInstance, NetworkMessage } from '@chaoshub/game-sdk'

const LOGIC_W = 700, LOGIC_H = 520, WRITE_TIME = 30, VOTE_TIME = 20
const STARTERS = [
  'One dark and stormy night,','The last robot on Earth','A confused wizard accidentally','Deep inside the volcano,','The world\'s greatest chef discovered','Three penguins walked into a library','Nobody expected the spaceship to','The ancient dragon finally decided','At exactly midnight, the president','When the internet disappeared,',
]

export class StoryChainGame implements GameInstance {
  private ctx: GameContext; private app: Application
  private stage!: Graphics
  private phase: 'write' | 'vote' | 'results' = 'write'
  private round = 0; private totalRounds = 0
  private starter = ''
  private sentences: { playerId: string; text: string }[] = []
  private currentWriterId = ''
  private inputText = ''
  private timerVal = WRITE_TIME; private timerInterval: ReturnType<typeof setInterval> | null = null
  private votes = new Map<string, string>() // voterId -> sentencePlayerId
  private scores = new Map<string, number>()
  private storyLines: Text[] = []
  private inputBox!: Graphics; private inputLabel!: Text; private inputCursor = 0
  private timerText!: Text; private statusText!: Text; private scoreText!: Text; private promptText!: Text
  private voteBtns: { gfx: Graphics; playerId: string }[] = []
  private inputActive = false

  private readonly onNewTurn = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { round, writerId, starter, sentences } = msg.payload as { round: number; writerId: string; starter: string; sentences: { playerId: string; text: string }[] }
    this.round = round; this.currentWriterId = writerId; this.starter = starter; this.sentences = sentences
    this.startWritePhase()
  }
  private readonly onSentence = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { playerId, text } = msg.payload as { playerId: string; text: string }
    this.sentences.push({ playerId, text: text.slice(0, 120) }); this.hostAdvanceTurn()
  }
  private readonly onStartVote = (msg: NetworkMessage) => {
    if (this.ctx.network.isHost()) return
    const { sentences, starter } = msg.payload as { sentences: { playerId: string; text: string }[]; starter: string }
    this.sentences = sentences; this.starter = starter; this.startVotePhase()
  }
  private readonly onVote = (msg: NetworkMessage) => {
    if (!this.ctx.network.isHost()) return
    const { voterId, forId } = msg.payload as { voterId: string; forId: string }
    if (!this.votes.has(voterId)) { this.votes.set(voterId, forId); this.scores.set(forId, (this.scores.get(forId) ?? 0) + 1) }
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
    const ps = this.ctx.players.getPlayers()
    this.totalRounds = ps.length; this.round = 0
    for (const p of ps) this.scores.set(p.id, 0)
    this.buildScene()
    this.ctx.network.on('story:new-turn', this.onNewTurn as never)
    this.ctx.network.on('story:sentence', this.onSentence as never)
    this.ctx.network.on('story:start-vote', this.onStartVote as never)
    this.ctx.network.on('story:vote', this.onVote as never)
    this.ctx.network.on('story:results', this.onResults as never)
    this.ctx.network.on('story:final', this.onFinal as never)
    document.addEventListener('keydown', this.onKeyDown)
    if (this.ctx.network.isHost()) setTimeout(() => this.hostNextTurn(), 500)
  }

  update(_dt: number): void {}

  destroy(): void {
    if (this.timerInterval) clearInterval(this.timerInterval)
    document.removeEventListener('keydown', this.onKeyDown)
    this.ctx.network.off('story:new-turn', this.onNewTurn as never)
    this.ctx.network.off('story:sentence', this.onSentence as never)
    this.ctx.network.off('story:start-vote', this.onStartVote as never)
    this.ctx.network.off('story:vote', this.onVote as never)
    this.ctx.network.off('story:results', this.onResults as never)
    this.ctx.network.off('story:final', this.onFinal as never)
    this.app.stage.removeChildren()
  }

  private hostNextTurn(): void {
    const ps = this.ctx.players.getPlayers()
    this.round++
    if (this.round === 1) { this.starter = STARTERS[Math.floor(Math.random() * STARTERS.length)]!; this.sentences = [] }
    const writerIndex = (this.round - 1) % ps.length
    this.currentWriterId = ps[writerIndex]!.id
    this.ctx.network.broadcast('story:new-turn', { round: this.round, writerId: this.currentWriterId, starter: this.starter, sentences: this.sentences })
    this.startWritePhase()
  }

  private startWritePhase(): void {
    this.phase = 'write'; this.timerVal = WRITE_TIME; this.inputText = ''; this.inputActive = false
    this.clearVoteBtns(); this.updateStoryDisplay(); this.showInputBox(true)
    const localId = this.ctx.players.getLocalPlayer().id
    const isWriter = localId === this.currentWriterId
    const writerName = this.ctx.players.getPlayers().find(p => p.id === this.currentWriterId)?.name ?? '?'
    this.statusText.text = isWriter ? 'Your turn — type a sentence!' : `${writerName} is writing...`
    this.inputActive = isWriter
    if (this.timerInterval) clearInterval(this.timerInterval)
    this.timerInterval = setInterval(() => {
      this.timerVal--; this.timerText.text = `${this.timerVal}s`
      if (this.timerVal <= 0) { clearInterval(this.timerInterval!); this.submitSentence() }
    }, 1000)
  }

  private submitSentence(): void {
    const localId = this.ctx.players.getLocalPlayer().id
    if (localId !== this.currentWriterId) return
    const text = this.inputText.trim() || '...'
    if (this.ctx.network.isHost()) { this.sentences.push({ playerId: localId, text }); this.hostAdvanceTurn() }
    else this.ctx.network.send('story:sentence', { playerId: localId, text })
    this.showInputBox(false)
  }

  private hostAdvanceTurn(): void {
    if (this.round >= this.totalRounds) {
      this.ctx.network.broadcast('story:start-vote', { sentences: this.sentences, starter: this.starter })
      this.startVotePhase()
    } else {
      this.hostNextTurn()
    }
  }

  private startVotePhase(): void {
    this.phase = 'vote'; this.timerVal = VOTE_TIME; this.votes.clear()
    this.showInputBox(false); this.updateStoryDisplay(); this.buildVoteBtns()
    this.statusText.text = 'Vote for the funniest sentence!'
    if (this.timerInterval) clearInterval(this.timerInterval)
    this.timerInterval = setInterval(() => {
      this.timerVal--; this.timerText.text = `${this.timerVal}s`
      if (this.timerVal <= 0) { clearInterval(this.timerInterval!); if (this.ctx.network.isHost()) this.hostEndVote() }
    }, 1000)
  }

  private hostEndVote(): void {
    const scoresArr = [...this.scores.entries()].map(([id, score]) => ({ id, score }))
    this.ctx.network.broadcast('story:results', { scores: scoresArr }); this.showRoundResults()
  }

  private showRoundResults(): void {
    if (this.timerInterval) clearInterval(this.timerInterval)
    this.clearVoteBtns(); this.timerText.text = ''
    this.statusText.text = 'Round over!'
    this.scoreText.text = this.ctx.players.getPlayers().map(p => `${p.name}: ${this.scores.get(p.id) ?? 0}`).join('  |  ')
    if (this.ctx.network.isHost()) setTimeout(() => this.triggerFinal(), 3500)
  }

  private triggerFinal(): void {
    const sorted = this.ctx.players.getPlayers().map(p => ({ id: p.id, name: p.name, score: this.scores.get(p.id) ?? 0 })).sort((a, b) => b.score - a.score)
    this.ctx.network.broadcast('story:final', { sorted }); this.showFinal(sorted)
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (!this.inputActive) return
    if (e.key === 'Enter') { e.preventDefault(); this.submitSentence() }
    else if (e.key === 'Backspace') { this.inputText = this.inputText.slice(0, -1); this.updateInputLabel() }
    else if (e.key.length === 1 && this.inputText.length < 100) { this.inputText += e.key; this.updateInputLabel() }
  }

  private buildScene(): void {
    this.stage = new Graphics(); this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    this.app.stage.addChild(this.stage); this.scaleStage()
    const title = new Text({ text: 'STORY CHAIN', style: new TextStyle({ fontFamily: 'monospace', fontSize: 22, fontWeight: '900', fill: '#ffd60a' }) })
    title.anchor.set(0.5, 0); title.position.set(LOGIC_W / 2, 8); this.stage.addChild(title)
    this.timerText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 16, fontWeight: '700', fill: '#ff6b6b' }) })
    this.timerText.anchor.set(1, 0); this.timerText.position.set(LOGIC_W - 8, 8); this.stage.addChild(this.timerText)
    this.statusText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#c0c0e0' }) })
    this.statusText.anchor.set(0.5, 0); this.statusText.position.set(LOGIC_W / 2, 34); this.stage.addChild(this.statusText)
    this.promptText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 14, fill: '#ffd60a', wordWrap: true, wordWrapWidth: LOGIC_W - 40 }) })
    this.promptText.position.set(20, 56); this.stage.addChild(this.promptText)
    // Story area (lines will be populated)
    for (let i = 0; i < 8; i++) {
      const sl = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 13, fill: '#c0c0e0', wordWrap: true, wordWrapWidth: LOGIC_W - 40 }) })
      sl.position.set(20, 80 + i * 30); this.stage.addChild(sl); this.storyLines.push(sl)
    }
    // Input box
    this.inputBox = new Graphics()
    this.inputBox.roundRect(20, LOGIC_H - 60, LOGIC_W - 40, 38, 6).fill(0x1a1a2e).stroke({ width: 2, color: 0xffd60a })
    this.stage.addChild(this.inputBox)
    this.inputLabel = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 14, fill: '#ffffff' }) })
    this.inputLabel.position.set(28, LOGIC_H - 50); this.stage.addChild(this.inputLabel)
    this.scoreText = new Text({ text: '', style: new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: '#606080' }) })
    this.scoreText.anchor.set(0.5, 1); this.scoreText.position.set(LOGIC_W / 2, LOGIC_H - 4); this.stage.addChild(this.scoreText)
    this.showInputBox(false)
  }

  private updateStoryDisplay(): void {
    this.promptText.text = `"${this.starter}"`
    this.sentences.forEach((s, i) => {
      const sl = this.storyLines[i]; if (!sl) return
      const pname = this.ctx.players.getPlayers().find(p => p.id === s.playerId)?.name ?? '?'
      sl.text = `[${pname}] ${s.text}`
    })
    for (let i = this.sentences.length; i < this.storyLines.length; i++) { const sl = this.storyLines[i]; if (sl) sl.text = '' }
  }

  private showInputBox(visible: boolean): void { this.inputBox.visible = visible; this.inputLabel.visible = visible }
  private updateInputLabel(): void { this.inputLabel.text = this.inputText + (this.inputActive ? '|' : '') }

  private buildVoteBtns(): void {
    const localId = this.ctx.players.getLocalPlayer().id
    this.sentences.forEach((s, i) => {
      if (s.playerId === localId) return
      const btn = new Graphics()
      const y = 80 + i * 30
      btn.roundRect(LOGIC_W - 80, y, 60, 22, 4).fill(0x1a1a4a).stroke({ width: 1, color: 0x00f5ff })
      btn.eventMode = 'static'; btn.cursor = 'pointer'
      btn.on('pointerdown', () => {
        if (this.votes.has(localId)) return
        this.votes.set(localId, s.playerId)
        if (this.ctx.network.isHost()) { this.scores.set(s.playerId, (this.scores.get(s.playerId) ?? 0) + 1) }
        else this.ctx.network.send('story:vote', { voterId: localId, forId: s.playerId })
        btn.clear(); btn.roundRect(LOGIC_W - 80, y, 60, 22, 4).fill(0x0d3a0d).stroke({ width: 1, color: 0x30d158 })
      })
      this.stage.addChild(btn)
      const vl = new Text({ text: 'VOTE', style: new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: '#00f5ff' }) })
      vl.anchor.set(0.5); vl.position.set(LOGIC_W - 50, y + 11); this.stage.addChild(vl)
      this.voteBtns.push({ gfx: btn, playerId: s.playerId })
    })
  }

  private clearVoteBtns(): void {
    for (const v of this.voteBtns) this.stage.removeChild(v.gfx); this.voteBtns = []
  }

  private showFinal(sorted: { id: string; name: string; score: number }[]): void {
    if (this.timerInterval) clearInterval(this.timerInterval)
    this.stage.removeChildren(); this.stage.rect(0, 0, LOGIC_W, LOGIC_H).fill(0x0a0a0f)
    const t = new Text({ text: 'STORY CHAIN', style: new TextStyle({ fontFamily: 'monospace', fontSize: 28, fontWeight: '900', fill: '#ffd60a' }) })
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
