// ─────────────────────────────────────────────────────────────────────────────
// Achievement Engine — evaluates conditions, persists unlocks, fires events
// ─────────────────────────────────────────────────────────────────────────────
import type { AchievementAPI, GameStats } from '@chaoshub/game-sdk'
import { createStorage } from '@/core/services/storage/index'
import { eventBus } from '@/core/events/event-bus'
import { PlatformEvents } from '@/core/events/platform-events'
import { StatisticsService } from '@/core/services/statistics/statistics-service'

export interface AchievementDefinition {
  id: string
  name: string
  description: string
  icon: string
  /** Return true when the achievement should unlock. */
  condition: (globalStats: GameStats) => boolean
}

const storage = createStorage('achievements')

// ── Built-in platform achievements ───────────────────────────────────────────
export const PLATFORM_ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: 'first-victory',
    name: 'First Victory',
    description: 'Win your first game.',
    icon: '🏆',
    condition: (s) => s.wins >= 1,
  },
  {
    id: 'played-10',
    name: 'Getting Hooked',
    description: 'Play 10 games.',
    icon: '🎮',
    condition: (s) => s.gamesPlayed >= 10,
  },
  {
    id: 'played-100',
    name: 'Dedicated Chaos Agent',
    description: 'Play 100 games.',
    icon: '💯',
    condition: (s) => s.gamesPlayed >= 100,
  },
  {
    id: 'multiplayer-beginner',
    name: 'Multiplayer Beginner',
    description: 'Play 5 multiplayer games.',
    icon: '👥',
    condition: (s) => s.gamesPlayed >= 5,
  },
  {
    id: 'multiplayer-veteran',
    name: 'Multiplayer Veteran',
    description: 'Play 50 multiplayer games.',
    icon: '⚔️',
    condition: (s) => s.gamesPlayed >= 50,
  },
  {
    id: 'chaos-master',
    name: 'Chaos Master',
    description: 'Win 25 games.',
    icon: '🌀',
    condition: (s) => s.wins >= 25,
  },
]

class AchievementEngine {
  private definitions = new Map<string, AchievementDefinition>()

  constructor() {
    PLATFORM_ACHIEVEMENTS.forEach((a) => this.definitions.set(a.id, a))
  }

  /** Evaluate all achievement conditions against current global stats. */
  evaluate(): void {
    const globalStats = StatisticsService.getGlobalStats()
    this.definitions.forEach((def) => {
      if (!this.isUnlocked(def.id) && def.condition(globalStats)) {
        this.unlock(def.id)
      }
    })
  }

  unlock(achievementId: string): void {
    if (this.isUnlocked(achievementId)) return
    const def = this.definitions.get(achievementId)
    if (!def) {
      console.warn(`[Achievements] Unknown achievement: "${achievementId}"`)
      return
    }

    const unlocked = storage.get<string[]>('unlocked') ?? []
    unlocked.push(achievementId)
    storage.set('unlocked', unlocked)

    eventBus.emit(PlatformEvents.ACHIEVEMENT_UNLOCKED, {
      achievementId,
      name: def.name,
    })
  }

  isUnlocked(achievementId: string): boolean {
    const unlocked = storage.get<string[]>('unlocked') ?? []
    return unlocked.includes(achievementId)
  }

  getUnlocked(): AchievementDefinition[] {
    const unlocked = storage.get<string[]>('unlocked') ?? []
    return unlocked
      .map((id) => this.definitions.get(id))
      .filter((d): d is AchievementDefinition => d !== undefined)
  }

  getAll(): AchievementDefinition[] {
    return [...this.definitions.values()]
  }
}

// Global singleton
export const achievementEngine = new AchievementEngine()

// ── Per-game AchievementAPI adapter ──────────────────────────────────────────
export class GameAchievementAPI implements AchievementAPI {
  unlock(achievementId: string): void {
    achievementEngine.unlock(achievementId)
  }

  isUnlocked(achievementId: string): boolean {
    return achievementEngine.isUnlocked(achievementId)
  }
}
