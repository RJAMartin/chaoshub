// ─────────────────────────────────────────────────────────────────────────────
// Platform Events — typed event map for the global EventBus
// All platform-level events live here. Games may define their own event
// strings but should prefix them with their game ID to avoid collisions.
// ─────────────────────────────────────────────────────────────────────────────

export const PlatformEvents = {
  // Players
  PLAYER_JOINED: 'platform:player:joined',
  PLAYER_LEFT: 'platform:player:left',
  PLAYER_READY: 'platform:player:ready',
  PLAYER_UNREADY: 'platform:player:unready',
  LOCAL_PLAYER_READY: 'platform:player:local-ready',

  // Room
  ROOM_CREATED: 'platform:room:created',
  ROOM_JOINED: 'platform:room:joined',
  ROOM_CLOSED: 'platform:room:closed',
  ROOM_ERROR: 'platform:room:error',

  // Game
  GAME_SELECTED: 'platform:game:selected',
  GAME_STARTED: 'platform:game:started',
  GAME_ENDED: 'platform:game:ended',
  GAME_PAUSED: 'platform:game:paused',
  GAME_RESUMED: 'platform:game:resumed',

  // Host
  HOST_CHANGED: 'platform:host:changed',

  // Achievements & Stats
  ACHIEVEMENT_UNLOCKED: 'platform:achievement:unlocked',
  STAT_RECORDED: 'platform:stat:recorded',
} as const

export type PlatformEventKey = (typeof PlatformEvents)[keyof typeof PlatformEvents]

// ---------------------------------------------------------------------------
// Payload types per event
// ---------------------------------------------------------------------------
import type { Player } from '@chaoshub/game-sdk'

export interface PlayerJoinedPayload { player: Player }
export interface PlayerLeftPayload { playerId: string }
export interface PlayerReadyPayload { playerId: string; isReady: boolean }

export interface RoomCreatedPayload { roomCode: string }
export interface RoomJoinedPayload { roomCode: string }
export interface RoomErrorPayload { message: string }

export interface GameSelectedPayload { gameId: string }
export interface GameStartedPayload { gameId: string; startedAt: number }
export interface GameEndedPayload { gameId: string; winnerId?: string; durationMs: number }

export interface HostChangedPayload { previousHostId: string; newHostId: string }

export interface AchievementUnlockedPayload { achievementId: string; name: string }
export interface StatRecordedPayload { gameId: string; event: string }
