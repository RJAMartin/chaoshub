<template>
  <nav class="app-nav">
    <div class="nav-inner">
      <!-- Logo -->
      <RouterLink to="/" class="nav-logo">
        <span class="logo-icon">⚡</span>
        <span class="logo-text glow-cyan">ChaosHub</span>
      </RouterLink>

      <!-- Links -->
      <div class="nav-links">
        <RouterLink to="/games" class="nav-link">Games</RouterLink>
        <RouterLink to="/profile" class="nav-link">Profile</RouterLink>
        <RouterLink to="/settings" class="nav-link">Settings</RouterLink>
      </div>

      <!-- Room indicator -->
      <div v-if="roomStore.isInRoom" class="nav-room-badge">
        <span class="room-dot" />
        <span class="font-mono text-xs neon-green">{{ roomStore.roomCode }}</span>
        <button class="btn btn-ghost btn-sm" @click="roomStore.leaveRoom()">Leave</button>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { useRoomStore } from '@/stores/index.js'

const roomStore = useRoomStore()
</script>

<style scoped>
.app-nav {
  position: sticky;
  top: 0;
  z-index: 50;
  background-color: rgba(10, 10, 15, 0.85);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--color-border);
}

.nav-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1.5rem;
  height: 56px;
  display: flex;
  align-items: center;
  gap: 2rem;
}

.nav-logo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  text-decoration: none;
  font-weight: 700;
  font-size: 1.125rem;
  letter-spacing: -0.02em;
}
.logo-icon { font-size: 1.25rem; }
.logo-text { color: var(--color-neon-cyan); }

.nav-links {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex: 1;
}

.nav-link {
  padding: 0.375rem 0.75rem;
  border-radius: 6px;
  color: var(--color-text-secondary);
  text-decoration: none;
  font-size: 0.875rem;
  font-weight: 500;
  transition: all 0.15s ease;
}
.nav-link:hover { color: var(--color-text-primary); background-color: var(--color-bg-elevated); }
.nav-link.router-link-active { color: var(--color-neon-cyan); }

.nav-room-badge {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.75rem;
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-neon-green);
  border-radius: 100px;
  box-shadow: 0 0 8px rgba(48, 209, 88, 0.2);
}
.room-dot {
  width: 6px;
  height: 6px;
  background-color: var(--color-neon-green);
  border-radius: 50%;
  box-shadow: 0 0 6px var(--color-neon-green);
  animation: pulse 2s infinite;
}

.btn-sm {
  padding: 0.2rem 0.5rem;
  font-size: 0.75rem;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

@media (max-width: 640px) {
  .nav-links { display: none; }
}
</style>
