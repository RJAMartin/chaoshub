<template>
  <!-- GameCanvas: owns the PixiJS Application. Vue never touches the canvas node directly. -->
  <div ref="containerRef" class="game-canvas-container" />
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Application } from 'pixi.js'
import { eventBus } from '@/core/events/event-bus'

const containerRef = ref<HTMLDivElement | null>(null)
let app: Application | null = null

const emit = defineEmits<{
  ready: [app: Application]
  destroyed: []
}>()

const handleResize = () => {
  if (!app) return
  // Pixi's resizeTo/ResizeObserver handles the renderer resize automatically.
  // We emit an event so active games can re-layout their stage.
  eventBus.emit('platform:canvas:resized', {
    width: app.screen.width,
    height: app.screen.height,
  })
}

onMounted(async () => {
  if (!containerRef.value) return

  app = new Application()
  await app.init({
    resizeTo: containerRef.value,
    background: 0x0a0a0f,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  })

  containerRef.value.appendChild(app.canvas)
  window.addEventListener('resize', handleResize)
  emit('ready', app)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (app) {
    app.destroy(true, { children: true, texture: true })
    app = null
    emit('destroyed')
  }
})
</script>

<style scoped>
.game-canvas-container {
  width: 100%;
  height: 100%;
  flex: 1;
  display: block;
  overflow: hidden;
  background-color: #0a0a0f;
  min-height: 0;
}

.game-canvas-container :deep(canvas) {
  display: block;
  width: 100% !important;
  height: 100% !important;
}
</style>
