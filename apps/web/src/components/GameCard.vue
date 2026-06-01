<template>
  <div
    class="game-card"
    :class="{ selected }"
    role="button"
    tabindex="0"
    :aria-pressed="selected"
    :aria-label="`${game.name} — ${game.description}. ${game.minPlayers}–${game.maxPlayers} players.`"
    @click="$emit('select', game.id)"
    @keydown.enter.space.prevent="$emit('select', game.id)"
  >
    <div class="game-thumbnail">
      <span class="game-thumb-emoji">{{ thumbEmoji }}</span>
    </div>
    <div class="game-info">
      <div class="game-name">{{ game.name }}</div>
      <div class="game-description">{{ game.description }}</div>
      <div class="game-meta">
        <span class="meta-badge" v-if="game.supportsMultiplayer">👥 Multi</span>
        <span class="meta-badge" v-if="game.supportsSinglePlayer">👤 Solo</span>
        <span class="meta-badge players">{{ game.minPlayers }}–{{ game.maxPlayers }}p</span>
      </div>
    </div>
    <div v-if="selected" class="selected-indicator">✓</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { GameModule } from '@chaoshub/game-sdk'

const props = defineProps<{
  game: GameModule
  selected?: boolean
}>()

defineEmits<{ select: [id: string] }>()

const thumbEmoji = computed(() => {
  const map: Record<string, string> = {
    'reaction-test': '⚡',
    'ball-push': '⚽',
    'pixel-war': '🎨',
    'music-toy': '🎵',
  }
  return map[props.game.id] ?? '🎮'
})
</script>

<style scoped>
.game-card {
  background-color: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  cursor: pointer;
  overflow: hidden;
  transition: all 0.15s ease;
  display: flex;
  flex-direction: column;
  position: relative;
}
.game-card:focus-visible {
  outline: 2px solid var(--color-neon-cyan);
  outline-offset: 2px;
}
.game-card:hover {
  border-color: var(--color-neon-cyan);
  box-shadow: 0 0 16px rgba(0, 245, 255, 0.15);
  transform: translateY(-2px);
}
.game-card.selected {
  border-color: var(--color-neon-pink);
  box-shadow: 0 0 20px rgba(255, 45, 120, 0.3);
}

.game-thumbnail {
  height: 100px;
  background: linear-gradient(135deg, var(--color-bg-elevated), var(--color-bg-overlay));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 3rem;
}

.game-info { padding: 1rem; }
.game-name { font-weight: 700; font-size: 0.9375rem; color: var(--color-text-primary); }
.game-description {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin-top: 0.25rem;
  line-height: 1.4;
}
.game-meta {
  display: flex;
  gap: 0.375rem;
  flex-wrap: wrap;
  margin-top: 0.5rem;
}
.meta-badge {
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  background-color: var(--color-bg-overlay);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}

.selected-indicator {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 22px;
  height: 22px;
  background-color: var(--color-neon-pink);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
  color: white;
  box-shadow: 0 0 8px var(--color-neon-pink);
}
</style>
