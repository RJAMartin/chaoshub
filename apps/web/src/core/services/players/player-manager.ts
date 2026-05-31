// ─────────────────────────────────────────────────────────────────────────────
// Player Manager — manages the local player identity and room player list
// ─────────────────────────────────────────────────────────────────────────────
import { uniqueNamesGenerator, adjectives, animals } from 'unique-names-generator'
import type { Player, PlayerManager as IPlayerManager } from '@chaoshub/game-sdk'
import { createStorage } from '@/core/services/storage/index'

const storage = createStorage('platform')

const PLAYER_COLORS = [
  '#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF',
  '#FF922B', '#CC5DE8', '#20C997', '#F06595',
]

function generatePlayerId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

function generatePlayerName(): string {
  return uniqueNamesGenerator({
    dictionaries: [adjectives, animals],
    separator: '',
    style: 'capital',
    length: 2,
  })
}

function getOrCreateLocalPlayer(): Player {
  const saved = storage.get<Player>('local-player')
  if (saved) return saved

  const player: Player = {
    id: generatePlayerId(),
    name: generatePlayerName(),
    color: PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)]!,
    isHost: false,
    isReady: false,
    role: 'player',
  }

  storage.set('local-player', player)
  return player
}

class PlayerManagerImpl implements IPlayerManager {
  private localPlayer: Player = getOrCreateLocalPlayer()
  private players = new Map<string, Player>()

  constructor() {
    // Always include local player
    this.players.set(this.localPlayer.id, this.localPlayer)
  }

  getLocalPlayer(): Player {
    return { ...this.localPlayer }
  }

  getPlayers(): Player[] {
    return [...this.players.values()]
  }

  getPlayer(id: string): Player | undefined {
    return this.players.get(id)
  }

  isHost(): boolean {
    return this.localPlayer.isHost
  }

  // ── Mutation methods (used by platform, not exposed via SDK) ──────────────

  setLocalPlayerName(name: string): void {
    this.localPlayer = { ...this.localPlayer, name }
    this.players.set(this.localPlayer.id, this.localPlayer)
    storage.set('local-player', this.localPlayer)
  }

  setLocalPlayerColor(color: string): void {
    this.localPlayer = { ...this.localPlayer, color }
    this.players.set(this.localPlayer.id, this.localPlayer)
    storage.set('local-player', this.localPlayer)
  }

  setLocalPlayerReady(isReady: boolean): void {
    this.localPlayer = { ...this.localPlayer, isReady }
    this.players.set(this.localPlayer.id, this.localPlayer)
  }

  promoteToHost(): void {
    this.localPlayer = { ...this.localPlayer, isHost: true }
    this.players.set(this.localPlayer.id, this.localPlayer)
  }

  demoteFromHost(): void {
    this.localPlayer = { ...this.localPlayer, isHost: false }
    this.players.set(this.localPlayer.id, this.localPlayer)
  }

  addPlayer(player: Player): void {
    this.players.set(player.id, player)
  }

  removePlayer(id: string): void {
    if (id === this.localPlayer.id) return // never remove self
    this.players.delete(id)
  }

  updatePlayer(id: string, partial: Partial<Player>): void {
    const existing = this.players.get(id)
    if (!existing) return
    this.players.set(id, { ...existing, ...partial })
    if (id === this.localPlayer.id) {
      this.localPlayer = { ...this.localPlayer, ...partial }
    }
  }

  clearRoom(): void {
    const localId = this.localPlayer.id
    this.players.clear()
    this.localPlayer = { ...this.localPlayer, isHost: false, isReady: false }
    this.players.set(localId, this.localPlayer)
  }
}

// Global singleton
export const playerManager = new PlayerManagerImpl()
export type { PlayerManagerImpl }
