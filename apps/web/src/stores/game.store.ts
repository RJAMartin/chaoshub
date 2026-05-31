// ─────────────────────────────────────────────────────────────────────────────
// Game Store — manages the active game session lifecycle
// ─────────────────────────────────────────────────────────────────────────────
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { GameInstance } from '@chaoshub/game-sdk'
import { gameRegistry } from '@/core/registry/index.js'
import { gameLoop } from '@/core/engine/index.js'
import { createGameContext } from '@/core/services/game-context.js'
import { eventBus } from '@/core/events/event-bus.js'
import { PlatformEvents } from '@/core/events/platform-events.js'
import { achievementEngine } from '@/core/services/achievements/index.js'

export type GameSessionPhase = 'idle' | 'loading' | 'playing' | 'ended'

export const useGameStore = defineStore('game', () => {
  const activeGameId = ref<string | null>(null)
  const sessionPhase = ref<GameSessionPhase>('idle')
  const gameStartedAt = ref<number | null>(null)
  let activeInstance: GameInstance | null = null

  async function startGame(gameId: string): Promise<void> {
    if (sessionPhase.value !== 'idle') return

    sessionPhase.value = 'loading'
    activeGameId.value = gameId

    try {
      const module = gameRegistry.get(gameId)
      const context = createGameContext(gameId)
      activeInstance = module.create(context)

      await activeInstance.init()

      sessionPhase.value = 'playing'
      gameStartedAt.value = Date.now()
      gameLoop.start(activeInstance)

      eventBus.emit(PlatformEvents.GAME_STARTED, {
        gameId,
        startedAt: gameStartedAt.value,
      })
    } catch (e) {
      sessionPhase.value = 'idle'
      activeGameId.value = null
      throw e
    }
  }

  function endGame(winnerId?: string): void {
    if (sessionPhase.value !== 'playing') return

    const durationMs = gameStartedAt.value ? Date.now() - gameStartedAt.value : 0
    gameLoop.stop()
    activeInstance?.destroy()
    activeInstance = null

    const gameId = activeGameId.value ?? 'unknown'
    sessionPhase.value = 'ended'

    eventBus.emit(PlatformEvents.GAME_ENDED, { gameId, winnerId, durationMs })

    // Evaluate achievements after each game
    achievementEngine.evaluate()
  }

  function resetToLobby(): void {
    sessionPhase.value = 'idle'
    activeGameId.value = null
    gameStartedAt.value = null
  }

  return {
    activeGameId,
    sessionPhase,
    gameStartedAt,
    startGame,
    endGame,
    resetToLobby,
  }
})
