// ─────────────────────────────────────────────────────────────────────────────
// GameContext Factory — creates the sandboxed context given to each game
// Games receive this object as their ONLY interface to the platform.
// ─────────────────────────────────────────────────────────────────────────────
import type { GameContext } from '@chaoshub/game-sdk'
import type { Application } from 'pixi.js'
import { networkAdapter } from '@/core/network/index'
import { playerManager } from '@/core/services/players/index'
import { createStorage } from '@/core/services/storage/index'
import { StatisticsService } from '@/core/services/statistics/statistics-service'
import { GameAchievementAPI } from '@/core/services/achievements/achievement-engine'
import { eventBus } from '@/core/events/event-bus'

export function createGameContext(gameId: string, pixiApp: Application): GameContext {
  return {
    gameId,
    pixiApp,
    network: networkAdapter,
    players: playerManager,
    storage: createStorage(`game:${gameId}`),
    stats: new StatisticsService(gameId),
    achievements: new GameAchievementAPI(),
    events: eventBus,
  }
}
