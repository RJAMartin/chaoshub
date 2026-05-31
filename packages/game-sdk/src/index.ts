// ─────────────────────────────────────────────────────────────────────────────
// ChaosHub Game SDK — Public interfaces
// Games must ONLY interact with the platform through these types.
// ─────────────────────────────────────────────────────────────────────────────

// ---------------------------------------------------------------------------
// Event Bus
// ---------------------------------------------------------------------------
export type EventCallback<T = unknown> = (payload: T) => void

export interface IEventBus {
  on<T = unknown>(event: string, callback: EventCallback<T>): void
  off<T = unknown>(event: string, callback: EventCallback<T>): void
  emit<T = unknown>(event: string, payload?: T): void
  once<T = unknown>(event: string, callback: EventCallback<T>): void
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------
export interface NetworkMessage {
  event: string
  payload: unknown
  from: string
  timestamp: number
}

export interface NetworkAPI {
  /** Send a message to the host only (if client) or to all peers (if host). */
  send(event: string, payload: unknown): void
  /** Broadcast a message to all connected peers. Host-only. */
  broadcast(event: string, payload: unknown): void
  /** Listen for incoming network events. */
  on(event: string, callback: (msg: NetworkMessage) => void): void
  /** Remove a network event listener. */
  off(event: string, callback: (msg: NetworkMessage) => void): void
  /** Whether the local player is the host. */
  isHost(): boolean
  /** The local peer ID (= room code when host). */
  getPeerId(): string
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------
export type PlayerRole = 'player' | 'spectator' // spectator: future use

export interface Player {
  id: string
  name: string
  color: string
  isHost: boolean
  isReady: boolean
  role: PlayerRole
}

export interface PlayerManager {
  getLocalPlayer(): Player
  getPlayers(): Player[]
  getPlayer(id: string): Player | undefined
  isHost(): boolean
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------
export interface StorageAPI {
  get<T = unknown>(key: string): T | null
  set<T = unknown>(key: string, value: T): void
  remove(key: string): void
  clear(): void
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------
export interface GameStats {
  gamesPlayed: number
  wins: number
  losses: number
  totalPlaytimeMs: number
}

export interface StatisticsAPI {
  record(event: 'win' | 'loss' | 'play', playtimeMs?: number): void
  getStats(): GameStats
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------
export interface AchievementAPI {
  unlock(achievementId: string): void
  isUnlocked(achievementId: string): boolean
}

// ---------------------------------------------------------------------------
// Game Context — the single object games receive to interact with the platform
// ---------------------------------------------------------------------------
export interface GameContext {
  gameId: string
  network: NetworkAPI
  players: PlayerManager
  storage: StorageAPI
  achievements: AchievementAPI
  stats: StatisticsAPI
  events: IEventBus
}

// ---------------------------------------------------------------------------
// Game Module — the plugin contract every game must implement
// ---------------------------------------------------------------------------
export interface GameModule {
  /** Unique kebab-case identifier. e.g. "reaction-test" */
  id: string
  name: string
  description: string
  /** Path to a thumbnail image (relative to game folder). */
  thumbnail?: string
  /** Minimum number of players required. */
  minPlayers: number
  /** Maximum number of players supported. */
  maxPlayers: number
  supportsSinglePlayer: boolean
  supportsMultiplayer: boolean
  /** Tags for filtering in the game library. */
  tags: string[]
  /** Factory — creates a fresh game instance. */
  create(context: GameContext): GameInstance
}

// ---------------------------------------------------------------------------
// Game Instance — the lifecycle every game must implement
// ---------------------------------------------------------------------------
export interface GameInstance {
  /** Called once after the canvas is ready. Async allowed for asset loading. */
  init(): Promise<void>
  /** Called every frame by the platform GameLoop. deltaTime is in seconds. */
  update(deltaTime: number): void
  /** Called when the game ends or room navigates away. Must clean up all resources. */
  destroy(): void
}
