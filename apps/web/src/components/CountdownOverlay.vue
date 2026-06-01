<template>
  <Transition name="countdown-pop">
    <div v-if="visible" class="countdown-overlay">
      <div class="countdown-value" :class="valueClass">{{ displayText }}</div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  /** Pass a number (3,2,1) or 'GO' or '' to hide */
  value: number | 'GO' | ''
}>()

const visible = computed(() => props.value !== '')

const displayText = computed(() => {
  if (props.value === 'GO') return 'GO!'
  return String(props.value)
})

const valueClass = computed(() => ({
  'is-go': props.value === 'GO',
  'is-number': typeof props.value === 'number',
}))
</script>

<style scoped>
.countdown-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 20;
}

.countdown-value {
  font-family: var(--font-display, 'Space Grotesk', sans-serif);
  font-size: clamp(5rem, 20vw, 10rem);
  font-weight: 900;
  line-height: 1;
  text-align: center;
  user-select: none;
}

.countdown-value.is-number {
  color: #ffffff;
  text-shadow:
    0 0 20px rgba(0, 245, 255, 0.9),
    0 0 60px rgba(0, 245, 255, 0.5);
}

.countdown-value.is-go {
  color: #30d158;
  text-shadow:
    0 0 20px rgba(48, 209, 88, 0.9),
    0 0 60px rgba(48, 209, 88, 0.5);
}

/* Pop animation */
.countdown-pop-enter-active {
  animation: pop-in 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.countdown-pop-leave-active {
  animation: pop-out 0.2s ease-in forwards;
}

@keyframes pop-in {
  from { opacity: 0; transform: scale(0.4); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes pop-out {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(1.4); }
}
</style>
