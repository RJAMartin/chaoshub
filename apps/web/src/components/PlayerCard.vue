<template>
  <div class="player-card" :class="{ 'is-host': player.isHost, 'is-ready': player.isReady, 'is-local': isLocal }">
    <!-- Avatar -->
    <div class="player-avatar" :style="{ backgroundColor: player.color }">
      {{ initials }}
    </div>

    <!-- Info -->
    <div class="player-info">
      <div class="player-name">
        {{ player.name }}
        <span v-if="isLocal" class="local-badge">you</span>
      </div>
      <div class="player-status">
        <span v-if="player.isHost" class="status-host">👑 Host</span>
        <span v-else-if="player.isReady" class="status-ready">✓ Ready</span>
        <span v-else class="status-waiting">Waiting…</span>
      </div>
    </div>

    <!-- Ready indicator dot -->
    <div class="ready-dot" :class="{ active: player.isReady || player.isHost }" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Player } from '@chaoshub/game-sdk'

const props = defineProps<{
  player: Player
  isLocal?: boolean
}>()

const initials = computed(() =>
  props.player.name
    .split(/(?=[A-Z])/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
)
</script>

<style scoped>
.player-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  transition: border-color 0.2s ease;
}
.player-card.is-local { border-color: var(--color-border-bright); }
.player-card.is-ready { border-color: rgba(48, 209, 88, 0.4); }
.player-card.is-host { border-color: rgba(255, 214, 10, 0.4); }

.player-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 0.75rem;
  color: #fff;
  flex-shrink: 0;
  letter-spacing: 0.05em;
}

.player-info { flex: 1; min-width: 0; }
.player-name {
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--color-text-primary);
  display: flex;
  align-items: center;
  gap: 0.375rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.local-badge {
  font-size: 0.625rem;
  font-weight: 600;
  color: var(--color-neon-cyan);
  border: 1px solid var(--color-neon-cyan);
  border-radius: 4px;
  padding: 0 4px;
  letter-spacing: 0.05em;
}

.player-status { font-size: 0.75rem; margin-top: 2px; }
.status-host { color: var(--color-neon-yellow); }
.status-ready { color: var(--color-neon-green); }
.status-waiting { color: var(--color-text-muted); }

.ready-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--color-text-muted);
  flex-shrink: 0;
  transition: background-color 0.2s ease, box-shadow 0.2s ease;
}
.ready-dot.active {
  background-color: var(--color-neon-green);
  box-shadow: 0 0 6px var(--color-neon-green);
}
</style>
