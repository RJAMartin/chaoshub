<template>
  <div class="scoreboard">
    <div class="scoreboard-inner card">
      <div class="sb-header">
        <div class="sb-trophy">🏆</div>
        <h2 class="sb-title">Game Over</h2>
      <div v-if="winner" class="sb-winner">
        {{ winner.playerName }} wins!
      </div>
      </div>

      <div v-if="results.length > 0" class="sb-results">
        <div
          v-for="result in results"
          :key="result.playerId"
          class="sb-row"
          :class="`rank-${result.rank}`"
        >
          <div class="sb-rank">{{ rankEmoji(result.rank) }}</div>
          <div class="sb-name">{{ result.playerName }}</div>
          <div class="sb-time" :class="{ dnf: result.reactionMs === null }">
            {{ result.reactionMs !== null ? `${result.reactionMs}ms` : 'DNF' }}
          </div>
        </div>
      </div>

      <div class="sb-actions">
        <button class="btn btn-primary" @click="$emit('play-again')">▶ Play Again</button>
        <button class="btn btn-ghost" @click="$emit('back-to-lobby')">← Back to Lobby</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Result {
  playerId: string
  playerName: string
  reactionMs: number | null
  rank: number
}

const props = defineProps<{
  results: Result[]
}>()

defineEmits<{
  'play-again': []
  'back-to-lobby': []
}>()

const winner = computed(() => props.results.find((r) => r.rank === 1 && r.reactionMs !== null))

function rankEmoji(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `${rank}.`
}
</script>

<style scoped>
.scoreboard {
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  padding: 0 0.5rem;
}
.scoreboard-inner {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 2rem;
}

@media (max-width: 480px) {
  .scoreboard-inner { padding: 1.25rem 1rem; gap: 1rem; }
  .sb-trophy { font-size: 2rem; }
  .sb-title { font-size: 1.375rem; }
}

.sb-header { text-align: center; }
.sb-trophy { font-size: 3rem; line-height: 1; margin-bottom: 0.5rem; }
.sb-title { font-size: 1.75rem; font-weight: 800; margin: 0 0 0.5rem; }
.sb-winner { font-size: 1rem; color: var(--color-text-secondary); }
.sb-winner span { font-weight: 700; }

.sb-results { display: flex; flex-direction: column; gap: 0.5rem; }

.sb-row {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
}
.sb-row.rank-1 {
  border-color: rgba(255, 214, 10, 0.4);
  background-color: rgba(255, 214, 10, 0.05);
}

.sb-rank { font-size: 1.25rem; width: 2rem; text-align: center; flex-shrink: 0; }
.sb-name { flex: 1; font-weight: 600; font-size: 0.9375rem; }
.sb-time {
  font-family: var(--font-mono);
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--color-neon-cyan);
}
.sb-time.dnf { color: var(--color-text-muted); }

.sb-actions {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}
.sb-actions .btn { width: 100%; }
</style>
