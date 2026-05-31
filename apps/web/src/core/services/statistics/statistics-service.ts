// ─────────────────────────────────────────────────────────────────────────────
// Statistics Service — aggregates game stats, persisted via StorageAPI
// ─────────────────────────────────────────────────────────────────────────────
import type { StatisticsAPI, GameStats } from '@chaoshub/game-sdk'
import { createStorage } from '@/core/services/storage/index'
import { eventBus } from '@/core/events/event-bus'
import { PlatformEvents } from '@/core/events/platform-events'

const storage = createStorage('stats')

const DEFAULT_STATS: GameStats = {
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  totalPlaytimeMs: 0,
}

export class StatisticsService implements StatisticsAPI {
  private readonly gameId: string

  constructor(gameId: string) {
    this.gameId = gameId
  }

  record(event: 'win' | 'loss' | 'play', playtimeMs = 0): void {
    // Update per-game stats
    const gameStats = storage.get<GameStats>(this.gameId) ?? { ...DEFAULT_STATS }
    const globalStats = storage.get<GameStats>('global') ?? { ...DEFAULT_STATS }

    if (event === 'play') {
      gameStats.gamesPlayed++
      gameStats.totalPlaytimeMs += playtimeMs
      globalStats.gamesPlayed++
      globalStats.totalPlaytimeMs += playtimeMs
    } else if (event === 'win') {
      gameStats.wins++
      globalStats.wins++
    } else if (event === 'loss') {
      gameStats.losses++
      globalStats.losses++
    }

    storage.set(this.gameId, gameStats)
    storage.set('global', globalStats)

    eventBus.emit(PlatformEvents.STAT_RECORDED, { gameId: this.gameId, event })
  }

  getStats(): GameStats {
    return storage.get<GameStats>(this.gameId) ?? { ...DEFAULT_STATS }
  }

  static getGlobalStats(): GameStats {
    return storage.get<GameStats>('global') ?? { ...DEFAULT_STATS }
  }

  static getStatsForGame(gameId: string): GameStats {
    return storage.get<GameStats>(gameId) ?? { ...DEFAULT_STATS }
  }
}
