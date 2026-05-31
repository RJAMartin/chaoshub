<template>
  <Transition name="toast-slide">
    <div v-if="current" class="achievement-toast" @click="store.dismissToast()">
      <div class="toast-icon">{{ current.icon }}</div>
      <div class="toast-content">
        <div class="toast-title">Achievement Unlocked!</div>
        <div class="toast-name">{{ current.name }}</div>
        <div class="toast-desc">{{ current.description }}</div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useAchievementStore } from '@/stores/index.js'

const store = useAchievementStore()
const current = computed(() => store.toastQueue[0] ?? null)

// Auto-dismiss after 4 seconds
watch(current, (val) => {
  if (val) setTimeout(() => store.dismissToast(), 4000)
})
</script>

<style scoped>
.achievement-toast {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 1rem 1.25rem;
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-neon-yellow);
  border-radius: var(--radius-card);
  box-shadow: 0 0 24px rgba(255, 214, 10, 0.25), 0 8px 32px rgba(0,0,0,0.4);
  cursor: pointer;
  max-width: 320px;
}

.toast-icon { font-size: 2rem; flex-shrink: 0; }
.toast-title { font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-neon-yellow); margin-bottom: 2px; }
.toast-name { font-weight: 700; font-size: 0.9375rem; color: var(--color-text-primary); }
.toast-desc { font-size: 0.75rem; color: var(--color-text-secondary); margin-top: 2px; }

.toast-slide-enter-active { transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
.toast-slide-leave-active { transition: all 0.2s ease; }
.toast-slide-enter-from { opacity: 0; transform: translateX(100%) scale(0.9); }
.toast-slide-leave-to { opacity: 0; transform: translateX(20px); }
</style>
