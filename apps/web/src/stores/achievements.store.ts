// ─────────────────────────────────────────────────────────────────────────────
// Achievements Store — reactive list of unlocked achievements + toast queue
// ─────────────────────────────────────────────────────────────────────────────
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { achievementEngine } from '@/core/services/achievements/index.js'
import type { AchievementDefinition } from '@/core/services/achievements/index.js'
import { eventBus } from '@/core/events/event-bus.js'
import { PlatformEvents } from '@/core/events/platform-events.js'
import type { AchievementUnlockedPayload } from '@/core/events/platform-events.js'

export const useAchievementStore = defineStore('achievements', () => {
  const all = ref<AchievementDefinition[]>(achievementEngine.getAll())
  const unlocked = ref<AchievementDefinition[]>(achievementEngine.getUnlocked())
  const toastQueue = ref<AchievementDefinition[]>([])

  // Reactively update when something is unlocked
  eventBus.on<AchievementUnlockedPayload>(PlatformEvents.ACHIEVEMENT_UNLOCKED, (payload) => {
    unlocked.value = achievementEngine.getUnlocked()
    const def = all.value.find((a) => a.id === payload.achievementId)
    if (def) toastQueue.value.push(def)
  })

  function dismissToast(): void {
    toastQueue.value.shift()
  }

  return { all, unlocked, toastQueue, dismissToast }
})
