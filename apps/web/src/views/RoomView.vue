<template>
  <div class="room-view">
    <!-- Host disconnected overlay -->
    <Transition name="fade">
      <div v-if="disconnected" class="disconnect-overlay">
        <div class="disconnect-box">
          <div class="disconnect-icon">🔌</div>
          <div class="disconnect-title">Host Disconnected</div>
          <div class="disconnect-msg">The host left the room. Returning to home in {{ redirectCountdown }}s…</div>
          <RouterLink to="/" class="btn btn-primary" @click="disconnected = false">Go Home Now</RouterLink>
        </div>
      </div>
    </Transition>

    <!--
      GameCanvas is ALWAYS mounted once we are in a room so that pixiApp is
      available before startGame() is called. Visibility is toggled via CSS.
    -->
    <div
      v-if="roomStore.isInRoom"
      class="game-session"
      :class="{ 'game-session--hidden': !isPlaying }"
    >
      <GameCanvas @ready="onCanvasReady" @destroyed="onCanvasDestroyed" />
      <button v-if="isPlaying" class="leave-game-btn btn btn-danger" @click="gameStore.endGame()">End Game</button>
    </div>

    <!-- Loading / joining -->
    <div v-if="roomStore.isConnecting" class="room-loading">
      <div class="loading-spinner" />
      <div class="loading-text">Connecting to room…</div>
    </div>

    <!-- Not in a room yet: attempt auto-join via URL -->
    <div v-else-if="!roomStore.isInRoom && !autoJoinAttempted" class="room-loading">
      <div class="loading-spinner" />
      <div class="loading-text">Joining room {{ route.params['id'] }}…</div>
    </div>

    <!-- Error -->
    <div v-else-if="roomStore.error" class="room-error">
      <div class="error-icon">⚠️</div>
      <div class="error-msg">{{ roomStore.error }}</div>
      <RouterLink to="/" class="btn btn-secondary">Back to Home</RouterLink>
    </div>

    <!-- Post-game results -->
    <div v-else-if="gameStore.sessionPhase === 'ended'" class="post-game">
      <ScoreBoard :results="gameStore.lastResults" @play-again="restartGame" @back-to-lobby="gameStore.resetToLobby()" />
    </div>

    <!-- Lobby -->
    <div v-else-if="roomStore.isInRoom && !isPlaying" class="lobby">
      <div class="lobby-inner">
        <!-- Left: Room info + player list -->
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
          <div class="section-label">Select a Game</div>

          <div v-if="availableGames.length === 0" class="no-games">
            No games available.
          </div>
          <div v-else class="game-picker-grid">
            <GameCard
              v-for="game in availableGames"
              :key="game.id"
              :game="game"
              :selected="roomStore.selectedGameId === game.id"
              @select="(id) => roomStore.isHost && roomStore.selectGame(id)"
            />
          </div>

          <div v-if="roomStore.isHost" class="host-controls">
            <div class="host-badge">👑 You are the host</div>
            <button
              class="btn btn-primary start-btn"
              :disabled="!canStart || !pixiApp"
              @click="handleStartGame"
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
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRoomStore, usePlayerStore, useGameStore } from '@/stores/index'
import { gameRegistry } from '@/core/registry/index'
import { networkAdapter } from '@/core/network/index'
import { eventBus } from '@/core/events/event-bus'
import { PlatformEvents } from '@/core/events/platform-events'
import GameCanvas from '@/components/GameCanvas.vue'
import PlayerCard from '@/components/PlayerCard.vue'
import GameCard from '@/components/GameCard.vue'
import RoomCode from '@/components/RoomCode.vue'
import ScoreBoard from '@/components/ScoreBoard.vue'

const route = useRoute()
const router = useRouter()
const roomStore = useRoomStore()
const playerStore = usePlayerStore()
const gameStore = useGameStore()

const autoJoinAttempted = ref(false)
// Holds the Pixi Application created by <GameCanvas>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pixiApp = ref<any>(null)

// Host-disconnect state
const disconnected = ref(false)
const redirectCountdown = ref(5)
let redirectTimer: ReturnType<typeof setInterval> | null = null

const handleRoomClosed = () => {
  if (roomStore.isHost) return // host left intentionally — no overlay needed
  disconnected.value = true
  redirectCountdown.value = 5
  redirectTimer = setInterval(() => {
    redirectCountdown.value--
    if (redirectCountdown.value <= 0) {
      clearInterval(redirectTimer!)
      redirectTimer = null
      roomStore.leaveRoom()
      router.push('/')
    }
  }, 1000)
}

// ── Auto-join if arrived via direct URL ──────────────────────────────────────
onMounted(async () => {
  eventBus.on(PlatformEvents.ROOM_CLOSED, handleRoomClosed)

  if (!roomStore.isInRoom) {
    const code = route.params['id'] as string
    try {
      await roomStore.joinRoom(code)
    } catch {
      // error is set on the store
    } finally {
      autoJoinAttempted.value = true
    }
  }

  // Host: listen for client-triggered game start
  networkAdapter.on(PlatformEvents.GAME_STARTED, async (msg) => {
    if (!networkAdapter.isHost()) return
    const payload = msg.payload as { gameId: string }
    if (pixiApp.value) {
      await gameStore.startGame(payload.gameId, pixiApp.value)
    }
  })
})

onUnmounted(() => {
  eventBus.off(PlatformEvents.ROOM_CLOSED, handleRoomClosed)
  if (redirectTimer) clearInterval(redirectTimer)
})

// ── Computed ─────────────────────────────────────────────────────────────────
const availableGames = computed(() => gameRegistry.list())

const isPlaying = computed(() =>
  gameStore.sessionPhase === 'playing' || gameStore.sessionPhase === 'loading'
)

const canStart = computed(() => {
  if (!roomStore.selectedGameId) return false
  if (playerStore.players.length <= 1) return true // solo play allowed
  return playerStore.allReady
})

const startButtonLabel = computed(() => {
  if (!pixiApp.value) return 'Initializing…'
  if (!roomStore.selectedGameId) return 'Select a game first'
  if (!canStart.value && playerStore.players.length > 1) return 'Waiting for players…'
  return '▶ Start Game'
})

// ── Actions ──────────────────────────────────────────────────────────────────
function toggleReady(): void {
  playerStore.setReady(!playerStore.localPlayer.isReady)
}

async function handleStartGame(): Promise<void> {
  if (!roomStore.selectedGameId || !pixiApp.value) return
  const gameId = roomStore.selectedGameId
  // Tell clients to start too
  networkAdapter.broadcast(PlatformEvents.GAME_STARTED, { gameId })
  // Set phase to 'loading' first so the canvas becomes visible (removes --hidden),
  // then wait a tick for the browser to resize the canvas before init() reads app.screen
  gameStore.setLoading(gameId)
  await nextTick()
  // Small extra delay lets ResizeObserver / Pixi's resizeTo settle
  await new Promise(r => setTimeout(r, 50))
  await gameStore.startGame(gameId, pixiApp.value)
}

async function restartGame(): Promise<void> {
  if (!roomStore.selectedGameId || !pixiApp.value) return
  const gameId = roomStore.selectedGameId
  gameStore.resetToLobby()
  networkAdapter.broadcast(PlatformEvents.GAME_STARTED, { gameId })
  gameStore.setLoading(gameId)
  await nextTick()
  await new Promise(r => setTimeout(r, 50))
  await gameStore.startGame(gameId, pixiApp.value)
}

// ── Canvas lifecycle ─────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function onCanvasReady(app: any): void {
  pixiApp.value = app
}

function onCanvasDestroyed(): void {
  pixiApp.value = null
}
</script>

<style scoped>
.room-view { flex: 1; display: flex; flex-direction: column; position: relative; min-height: 0; }

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

/* Active game — fills the room-view absolutely so canvas always gets full dimensions */
.game-session {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
}
/* Hidden when in lobby — still position:fixed at full viewport so app.screen is correct */
.game-session--hidden {
  position: fixed !important;
  top: 0; left: 0; right: 0; bottom: 0;
  visibility: hidden;
  pointer-events: none;
  z-index: -1;
}
.leave-game-btn {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 10;
}

/* Post game */
.post-game { flex: 1; display: flex; align-items: center; justify-content: center; padding: 2rem; }

/* Lobby */
.lobby { flex: 1; padding: 2rem 1.5rem; overflow-y: auto; }
.lobby-inner {
  max-width: 1100px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 2rem;
  align-items: start;
}

.lobby-left { display: flex; flex-direction: column; gap: 1rem; position: sticky; top: 0; }
.lobby-right { display: flex; flex-direction: column; gap: 1.25rem; }

.section-label {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.players-list { display: flex; flex-direction: column; gap: 0.5rem; }
.ready-btn { width: 100%; }

.game-picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 0.875rem;
}
.no-games { color: var(--color-text-muted); font-size: 0.875rem; }

.host-controls { display: flex; flex-direction: column; gap: 0.75rem; }
.host-badge {
  display: inline-flex;
  align-items: center;
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
.waiting-for-host { font-size: 0.8125rem; color: var(--color-text-muted); }

@media (max-width: 768px) {
  .lobby-inner { grid-template-columns: 1fr; }
  .lobby-left { position: static; }
}

/* Disconnect overlay */
.disconnect-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 10, 15, 0.85);
  backdrop-filter: blur(6px);
}
.disconnect-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 2.5rem 3rem;
  background: var(--color-surface);
  border: 1px solid rgba(255, 107, 107, 0.4);
  border-radius: 16px;
  box-shadow: 0 0 40px rgba(255, 45, 120, 0.2);
  text-align: center;
  max-width: 380px;
}
.disconnect-icon { font-size: 3rem; }
.disconnect-title { font-size: 1.25rem; font-weight: 800; color: #ff6b6b; }
.disconnect-msg { font-size: 0.875rem; color: var(--color-text-secondary); }

.fade-enter-active, .fade-leave-active { transition: opacity 0.25s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
