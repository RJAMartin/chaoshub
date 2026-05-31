<template>
  <div class="room-view">
    <!-- Loading / joining -->
    <div v-if="roomStore.isConnecting" class="room-loading">
      <div class="loading-spinner" />
      <div class="loading-text">Connecting to room…</div>
    </div>

    <!-- Not in a room but arrived via URL: attempt auto-join -->
    <div v-else-if="!roomStore.isInRoom && !autoJoinAttempted" class="room-loading">
      <div class="loading-spinner" />
      <div class="loading-text">Joining room {{ route.params.id }}…</div>
    </div>

    <!-- Error -->
    <div v-else-if="roomStore.error" class="room-error">
      <div class="error-icon">⚠️</div>
      <div class="error-msg">{{ roomStore.error }}</div>
      <RouterLink to="/" class="btn btn-secondary">Back to Home</RouterLink>
    </div>

    <!-- Active game -->
    <div v-else-if="gameStore.sessionPhase === 'playing'" class="game-session">
      <GameCanvas @ready="onCanvasReady" @destroyed="onCanvasDestroyed" />
      <button class="leave-game-btn btn btn-danger" @click="gameStore.endGame()">End Game</button>
    </div>

    <!-- Post-game -->
    <div v-else-if="gameStore.sessionPhase === 'ended'" class="post-game">
      <div class="post-game-card card">
        <div class="post-icon">🏆</div>
        <h2>Game Over!</h2>
        <button class="btn btn-primary" @click="gameStore.resetToLobby()">Back to Lobby</button>
      </div>
    </div>

    <!-- Lobby -->
    <div v-else-if="roomStore.isInRoom" class="lobby">
      <div class="lobby-inner">
        <!-- Left: Players + Room Code -->
        <div class="lobby-left">
          <RoomCode :code="roomStore.roomCode!" />

          <div class="section-label">Players ({{ playerStore.players.length }})</div>
          <TransitionGroup name="slide-up" tag="div" class="players-list">
            <PlayerCard
              v-for="player in playerStore.players"
              :key="player.id"
              :player="player"
              :isLocal="player.id === playerStore.localPlayer.id"
            />
          </TransitionGroup>

          <!-- Ready button (non-host) -->
          <button
            v-if="!roomStore.isHost"
            class="btn ready-btn"
            :class="playerStore.localPlayer.isReady ? 'btn-danger' : 'btn-secondary'"
            @click="toggleReady"
          >
            {{ playerStore.localPlayer.isReady ? '✗ Unready' : '✓ Ready' }}
          </button>
        </div>

        <!-- Right: Game picker + host controls -->
        <div class="lobby-right">
          <div class="section-label">Select Game</div>
          <div class="game-picker-grid">
            <GameCard
              v-for="game in availableGames"
              :key="game.id"
              :game="game"
              :selected="roomStore.selectedGameId === game.id"
              @select="roomStore.isHost ? roomStore.selectGame($event) : null"
            />
          </div>

          <div v-if="availableGames.length === 0" class="no-games">
            No games available yet.
          </div>

          <!-- Host controls -->
          <div v-if="roomStore.isHost" class="host-controls">
            <div class="host-badge">👑 You are the host</div>
            <button
              class="btn btn-primary start-btn"
              :disabled="!canStart"
              @click="startGame"
            >
              {{ startButtonLabel }}
            </button>
          </div>
          <div v-else class="waiting-for-host">
            Waiting for host to start the game…
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import type { Application } from 'pixi.js'
import { useRoomStore, usePlayerStore, useGameStore } from '@/stores/index.js'
import { gameRegistry } from '@/core/registry/index.js'
import { networkAdapter } from '@/core/network/index.js'
import { PlatformEvents } from '@/core/events/platform-events.js'
import GameCanvas from '@/components/GameCanvas.vue'
import PlayerCard from '@/components/PlayerCard.vue'
import GameCard from '@/components/GameCard.vue'
import RoomCode from '@/components/RoomCode.vue'

const route = useRoute()
const roomStore = useRoomStore()
const playerStore = usePlayerStore()
const gameStore = useGameStore()

const autoJoinAttempted = ref(false)

// Auto-join if arrived via direct URL
onMounted(async () => {
  if (!roomStore.isInRoom) {
    const code = route.params['id'] as string
    try {
      await roomStore.joinRoom(code)
    } catch {
      // error is set on store
    }
    autoJoinAttempted.value = true
  }

  // Host listens for clients requesting game start
  if (networkAdapter.isHost()) {
    networkAdapter.on(PlatformEvents.GAME_STARTED, (msg) => {
      const payload = msg.payload as { gameId: string }
      gameStore.startGame(payload.gameId)
    })
  }
})

const availableGames = computed(() => gameRegistry.list())

const canStart = computed(() =>
  !!roomStore.selectedGameId &&
  (playerStore.players.length >= 1) &&
  (playerStore.players.length <= 1 || playerStore.allReady || roomStore.isHost)
)

const startButtonLabel = computed(() => {
  if (!roomStore.selectedGameId) return 'Select a game first'
  if (!playerStore.allReady && playerStore.players.length > 1) return 'Waiting for players…'
  return '▶ Start Game'
})

function toggleReady(): void {
  playerStore.setReady(!playerStore.localPlayer.isReady)
}

async function startGame(): Promise<void> {
  if (!roomStore.selectedGameId) return
  const gameId = roomStore.selectedGameId
  // Broadcast to clients, then start locally
  networkAdapter.broadcast(PlatformEvents.GAME_STARTED, { gameId })
  await gameStore.startGame(gameId)
}

// Pixi canvas lifecycle
function onCanvasReady(_app: Application): void {
  // canvas is ready — game loop is already running via gameStore.startGame
}
function onCanvasDestroyed(): void {
  // cleanup if needed
}
</script>

<style scoped>
.room-view { flex: 1; display: flex; flex-direction: column; }

.room-loading, .room-error {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  color: var(--color-text-secondary);
}
.loading-spinner {
  width: 40px; height: 40px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-neon-cyan);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.loading-text { font-size: 0.9375rem; }
.error-icon { font-size: 2.5rem; }
.error-msg { font-size: 0.9375rem; color: #ff6b6b; }

/* Active game */
.game-session { flex: 1; position: relative; display: flex; flex-direction: column; }
.leave-game-btn {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 10;
}

/* Post game */
.post-game { flex: 1; display: flex; align-items: center; justify-content: center; }
.post-game-card { text-align: center; max-width: 400px; width: 100%; }
.post-icon { font-size: 3rem; margin-bottom: 1rem; }
.post-game-card h2 { font-size: 1.75rem; font-weight: 800; margin: 0 0 1.5rem; }

/* Lobby */
.lobby { flex: 1; padding: 2rem 1.5rem; }
.lobby-inner { max-width: 1100px; margin: 0 auto; display: grid; grid-template-columns: 320px 1fr; gap: 2rem; }

.lobby-left { display: flex; flex-direction: column; gap: 1rem; }
.lobby-right { display: flex; flex-direction: column; gap: 1rem; }

.section-label { font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-text-muted); }

.players-list { display: flex; flex-direction: column; gap: 0.5rem; }

.ready-btn { width: 100%; margin-top: 0.5rem; }

.game-picker-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 0.875rem; }

.no-games { color: var(--color-text-muted); font-size: 0.875rem; padding: 1rem 0; }

.host-controls { margin-top: auto; display: flex; flex-direction: column; gap: 0.75rem; }
.host-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-neon-yellow);
  background-color: rgba(255, 214, 10, 0.08);
  border: 1px solid rgba(255, 214, 10, 0.2);
  border-radius: 6px;
  padding: 0.375rem 0.75rem;
  width: fit-content;
}
.start-btn { padding: 0.875rem; font-size: 1rem; }
.waiting-for-host { font-size: 0.8125rem; color: var(--color-text-muted); margin-top: auto; }

@media (max-width: 768px) {
  .lobby-inner { grid-template-columns: 1fr; }
}
</style>
