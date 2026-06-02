<template>
  <div class="room-code-widget">
    <div class="code-label">Room Code</div>
    <div class="code-display">
      <span class="code-text font-mono">{{ code }}</span>
      <button
        class="btn btn-ghost btn-sm copy-btn"
        :class="{ copied }"
        :aria-label="copied ? 'Copied!' : 'Copy room code'"
        @click="copyCode"
      >
        {{ copied ? '✓ Copied' : 'Copy' }}
      </button>
    </div>
    <div class="share-link">
      <span class="link-text" :title="shareUrl">{{ shareUrl }}</span>
      <button
        class="btn btn-ghost btn-sm"
        aria-label="Copy share link to clipboard"
        @click="copyLink"
      >Share Link</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{ code: string }>()

const copied = ref(false)
const linkCopied = ref(false)

const shareUrl = computed(() => {
  // With createWebHashHistory the router reads query params from the hash portion,
  // so the link must be  …/#/?join=CODE  (not  …/?join=CODE  on the path).
  const base = window.location.origin + window.location.pathname
  return `${base}#/?join=${props.code}`
})

async function copyCode(): Promise<void> {
  await navigator.clipboard.writeText(props.code)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

async function copyLink(): Promise<void> {
  await navigator.clipboard.writeText(shareUrl.value)
  linkCopied.value = true
  setTimeout(() => { linkCopied.value = false }, 2000)
}
</script>

<style scoped>
.room-code-widget {
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-neon-cyan);
  border-radius: var(--radius-card);
  padding: 1rem 1.25rem;
  box-shadow: 0 0 16px rgba(0, 245, 255, 0.1);
}
.code-label { font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.1em; color: var(--color-text-muted); text-transform: uppercase; margin-bottom: 0.5rem; }
.code-display { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; }
.code-text { font-size: 1.25rem; font-weight: 700; color: var(--color-neon-cyan); letter-spacing: 0.05em; }
.share-link { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.link-text { font-size: 0.6875rem; color: var(--color-text-muted); font-family: var(--font-mono); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.btn-sm { padding: 0.25rem 0.625rem; font-size: 0.75rem; }
.copy-btn.copied { color: var(--color-neon-green); border-color: var(--color-neon-green); }
</style>
