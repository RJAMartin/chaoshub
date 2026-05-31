// ─────────────────────────────────────────────────────────────────────────────
// Statistics Store — reactive global and per-game stats
// ─────────────────────────────────────────────────────────────────────────────
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { GameStats } from '@chaoshub/game-sdk'
import { StatisticsService } from '@/core/services/statistics/index.js'
import { eventBus } from '@/core/events/event-bus.js'
import { PlatformEvents } from '@/core/events/platform-events.js'

export const useStatisticsStore = defineStore('statistics', () => {
  const globalStats = ref<GameStats>(StatisticsService.getGlobalStats())

  // Refresh on every recorded stat
  eventBus.on(PlatformEvents.STAT_RECORDED, () => {
    globalStats.value = StatisticsService.getGlobalStats()
  })

  function getGameStats(gameId: string): GameStats {
    return StatisticsService.getStatsForGame(gameId)
  }

  return { globalStats, getGameStats }
})
