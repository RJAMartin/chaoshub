<template>
  <slot v-if="!error" />
  <div v-else class="error-boundary">
    <div class="eb-inner card">
      <div class="eb-icon">💥</div>
      <h2 class="eb-title">Something went wrong</h2>
      <p class="eb-msg">{{ errorMessage }}</p>
      <div class="eb-actions">
        <button class="btn btn-primary" @click="reset">Try Again</button>
        <RouterLink to="/" class="btn btn-secondary" @click="reset">Go Home</RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'

const error = ref<unknown>(null)
const errorMessage = ref('An unexpected error occurred.')

onErrorCaptured((err) => {
  error.value = err
  errorMessage.value = err instanceof Error ? err.message : String(err)
  console.error('[ErrorBoundary]', err)
  return false // prevent propagation
})

function reset(): void {
  error.value = null
  errorMessage.value = 'An unexpected error occurred.'
}
</script>

<style scoped>
.error-boundary {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}
.eb-inner {
  max-width: 480px;
  width: 100%;
  text-align: center;
  padding: 3rem 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}
.eb-icon { font-size: 3rem; }
.eb-title { font-size: 1.5rem; font-weight: 800; color: var(--color-neon-pink); margin: 0; }
.eb-msg { color: var(--color-text-secondary); font-size: 0.9rem; max-width: 320px; line-height: 1.5; margin: 0; }
.eb-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; justify-content: center; }
</style>
