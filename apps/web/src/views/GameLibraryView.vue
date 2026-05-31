<template>
  <div class="library-view">
    <div class="library-inner">
      <div class="library-header">
        <h1 class="library-title">Game Library</h1>
        <p class="library-subtitle">{{ games.length }} game{{ games.length !== 1 ? 's' : '' }} available</p>
      </div>

      <div v-if="games.length === 0" class="empty-state">
        <div class="empty-icon">🎮</div>
        <div class="empty-text">No games registered yet.</div>
      </div>

      <div v-else class="games-grid">
        <GameCard
          v-for="game in games"
          :key="game.id"
          :game="game"
          @select="handleSelect"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { gameRegistry } from '@/core/registry/index.js'
import { useRoomStore } from '@/stores/index.js'
import GameCard from '@/components/GameCard.vue'

const router = useRouter()
const roomStore = useRoomStore()
const games = computed(() => gameRegistry.list())

function handleSelect(gameId: string): void {
  if (roomStore.isInRoom && roomStore.isHost) {
    roomStore.selectGame(gameId)
    router.push(`/room/${roomStore.roomCode}`)
  }
}
</script>

<style scoped>
.library-view { flex: 1; padding: 3rem 1.5rem; }
.library-inner { max-width: 1200px; margin: 0 auto; }
.library-header { margin-bottom: 2.5rem; }
.library-title { font-size: 2rem; font-weight: 800; margin: 0 0 0.375rem; }
.library-subtitle { color: var(--color-text-muted); font-size: 0.875rem; }
.games-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1.25rem; }
.empty-state { text-align: center; padding: 4rem; color: var(--color-text-muted); }
.empty-icon { font-size: 3rem; margin-bottom: 1rem; }
.empty-text { font-size: 1rem; }
</style>
