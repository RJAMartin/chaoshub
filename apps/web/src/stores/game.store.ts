// ─────────────────────────────────────────────────────────────────────────────
// Game Store — manages the active game session lifecycle
// ─────────────────────────────────────────────────────────────────────────────
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { GameInstance } from '@chaoshub/game-sdk'
import type { Application } from 'pixi.js'
import { gameRegistry } from '@/core/registry/index'
import { gameLoop } from '@/core/engine/index'
import { createGameContext } from '@/core/services/game-context'
import { eventBus } from '@/core/events/event-bus'
import { PlatformEvents } from '@/core/events/platform-events'
import { achievementEngine } from '@/core/services/achievements/index'

export type GameSessionPhase = 'idle' | 'loading' | 'playing' | 'ended'

export const useGameStore = defineStore('game', () => {
  const activeGameId = ref<string | null>(null)
  const sessionPhase = ref<GameSessionPhase>('idle')
  const gameStartedAt = ref<number | null>(null)
  // Store the last round results for the ScoreBoard
  const lastResults = ref<{ playerId: string; playerName: string; reactionMs: number | null; rank: number }[]>([])
  let activeInstance: GameInstance | null = null

  async function startGame(gameId: string, pixiApp: Application): Promise<void> {
    if (sessionPhase.value !== 'idle' && sessionPhase.value !== 'loading') return

    sessionPhase.value = 'loading'
    activeGameId.value = gameId
    lastResults.value = []

    try {
      const module = gameRegistry.get(gameId)
      const context = createGameContext(gameId, pixiApp)
      activeInstance = module.create(context)

      // Listen for game-initiated end (game calls ctx.events.emit('platform:game:ended'))
      eventBus.once<{ gameId: string; winnerId?: string; results?: typeof lastResults.value }>(
        PlatformEvents.GAME_ENDED,
        (payload) => {
          if (payload?.results) lastResults.value = payload.results
          endGame(payload?.winnerId)
        }
      )

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
    if (sessionPhase.value !== 'playing' && sessionPhase.value !== 'loading') return

    const durationMs = gameStartedAt.value ? Date.now() - gameStartedAt.value : 0
    gameLoop.stop()
    activeInstance?.destroy()
    activeInstance = null

    const gameId = activeGameId.value ?? 'unknown'
    sessionPhase.value = 'ended'

    // Only emit if the store triggered the end (not the game itself)
    if (winnerId === undefined && lastResults.value.length === 0) {
      eventBus.emit(PlatformEvents.GAME_ENDED, { gameId, durationMs })
    }

    // Evaluate achievements after each game
    achievementEngine.evaluate()
  }

  function setLoading(gameId: string): void {
    sessionPhase.value = 'loading'
    activeGameId.value = gameId
    lastResults.value = []
  }

  function resetToLobby(): void {
    sessionPhase.value = 'idle'
    activeGameId.value = null
    gameStartedAt.value = null
    lastResults.value = []
  }

  return {
    activeGameId,
    sessionPhase,
    gameStartedAt,
    lastResults,
    setLoading,
    startGame,
    endGame,
    resetToLobby,
  }
})
