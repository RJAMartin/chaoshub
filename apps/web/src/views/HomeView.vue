<template>
  <div class="home-view">
    <!-- Hero -->
    <section class="hero">
      <div class="hero-content">
        <div class="hero-eyebrow">⚡ BROWSER MULTIPLAYER PLATFORM</div>
        <h1 class="hero-title">
          <span class="glow-pink neon-pink">Chaos</span><span class="glow-cyan neon-cyan">Hub</span>
        </h1>
        <p class="hero-subtitle">
          Create a room. Invite friends. Pick a game. Play instantly.<br />
          No accounts. No downloads. Pure chaos.
        </p>

        <!-- Actions -->
        <div class="hero-actions">
          <button class="btn btn-primary btn-lg" @click="handleCreateRoom" :disabled="roomStore.isConnecting">
            {{ roomStore.isConnecting ? 'Creating…' : '⚡ Create Room' }}
          </button>

          <div class="join-form">
            <input
              v-model="joinCode"
              class="input join-input"
              placeholder="Enter room code…"
              maxlength="32"
              @keydown.enter="handleJoinRoom"
            />
            <button class="btn btn-secondary" @click="handleJoinRoom" :disabled="!joinCode || roomStore.isConnecting">
              Join
            </button>
          </div>
        </div>

        <div v-if="joinError" class="error-msg">{{ joinError }}</div>
        <div v-else-if="roomStore.error" class="error-msg">{{ roomStore.error }}</div>
      </div>

      <div class="hero-visual">
        <div class="floating-game" v-for="g in featuredGames" :key="g.id" :style="g.style">
          {{ g.emoji }}
        </div>
      </div>
    </section>

    <!-- Feature grid -->
    <section class="features">
      <div class="features-grid">
        <div class="feature-card" v-for="f in features" :key="f.title">
          <div class="feature-icon">{{ f.icon }}</div>
          <div class="feature-title">{{ f.title }}</div>
          <div class="feature-desc">{{ f.desc }}</div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useRoomStore } from '@/stores/index.js'
import { validateRoomCode } from '@/core/utils/validation'

const router = useRouter()
const route = useRoute()
const roomStore = useRoomStore()
const joinCode = ref('')
const joinError = ref('')

// Auto-join if ?join=CODE is present in the URL
onMounted(async () => {
  const code = route.query['join'] as string | undefined
  if (code) {
    joinCode.value = code
    await roomStore.joinRoom(code.trim())
    router.push(`/room/${code.trim()}`)
  }
})

async function handleCreateRoom(): Promise<void> {
  const code = await roomStore.createRoom()
  router.push(`/room/${code}`)
}

async function handleJoinRoom(): Promise<void> {
  joinError.value = ''
  const result = validateRoomCode(joinCode.value)
  if (!result.ok) { joinError.value = result.error; return }
  await roomStore.joinRoom(result.code)
  router.push(`/room/${result.code}`)
}

const featuredGames = [
  { id: 'r', emoji: '⚡', style: 'top: 10%; left: 20%; animation-delay: 0s;' },
  { id: 'b', emoji: '⚽', style: 'top: 30%; right: 15%; animation-delay: 0.5s;' },
  { id: 'p', emoji: '🎨', style: 'bottom: 20%; left: 10%; animation-delay: 1s;' },
  { id: 'm', emoji: '🎵', style: 'bottom: 30%; right: 25%; animation-delay: 1.5s;' },
]

const features = [
  { icon: '🚀', title: 'Instant Play', desc: 'No install, no sign-up. Open a link and play in seconds.' },
  { icon: '🌐', title: 'P2P Multiplayer', desc: 'WebRTC-powered. Direct peer connections, zero server cost.' },
  { icon: '🎮', title: 'Game Library', desc: 'Growing collection of unique multiplayer and solo experiences.' },
  { icon: '🏆', title: 'Achievements', desc: 'Unlock achievements and track your stats across all games.' },
]
</script>

<style scoped>
.home-view { flex: 1; }

.hero {
  max-width: 1200px;
  margin: 0 auto;
  padding: 5rem 1.5rem 4rem;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4rem;
  align-items: center;
  min-height: calc(100vh - 56px);
}

.hero-eyebrow {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  color: var(--color-text-muted);
  text-transform: uppercase;
  margin-bottom: 1rem;
}

.hero-title {
  font-size: clamp(3.5rem, 8vw, 6rem);
  font-weight: 900;
  letter-spacing: -0.03em;
  line-height: 0.9;
  margin: 0 0 1.5rem;
}

.hero-subtitle {
  font-size: 1.0625rem;
  color: var(--color-text-secondary);
  line-height: 1.6;
  margin-bottom: 2.5rem;
}

.hero-actions {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 480px;
}

.join-form {
  display: flex;
  gap: 0.5rem;
}
.join-input { flex: 1; font-family: var(--font-mono); }

.btn-lg { padding: 0.875rem 2rem; font-size: 1rem; }

.error-msg {
  margin-top: 0.75rem;
  font-size: 0.8125rem;
  color: #ff6b6b;
}

.hero-visual {
  position: relative;
  height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.floating-game {
  position: absolute;
  font-size: 3.5rem;
  animation: float 3s ease-in-out infinite;
  filter: drop-shadow(0 0 20px rgba(0, 245, 255, 0.4));
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-16px); }
}

.features {
  background-color: var(--color-bg-surface);
  border-top: 1px solid var(--color-border);
  padding: 4rem 1.5rem;
}

.features-grid {
  max-width: 1200px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1.5rem;
}

.feature-card {
  padding: 1.5rem;
  background-color: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  transition: border-color 0.2s ease;
}
.feature-card:hover { border-color: var(--color-border-bright); }

.feature-icon { font-size: 2rem; margin-bottom: 0.75rem; }
.feature-title { font-weight: 700; font-size: 0.9375rem; margin-bottom: 0.375rem; }
.feature-desc { font-size: 0.8125rem; color: var(--color-text-secondary); line-height: 1.5; }

@media (max-width: 768px) {
  .hero { grid-template-columns: 1fr; gap: 2rem; padding: 3rem 1.25rem; min-height: auto; }
  .hero-visual { display: none; }
}
</style>
