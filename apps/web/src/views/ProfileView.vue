<template>
  <div class="profile-view">
    <div class="profile-inner">
      <h1 class="page-title">Profile</h1>

      <div class="profile-grid">
        <!-- Identity card -->
        <div class="card identity-card">
          <div class="avatar-large" :style="{ backgroundColor: profileStore.color }">
            {{ initials }}
          </div>
          <div class="identity-fields">
            <label class="field-label">Display Name</label>
            <input v-model="nameInput" class="input" maxlength="24" placeholder="Enter name…" @blur="saveName" @keydown.enter="saveName" />

            <label class="field-label" style="margin-top:1rem">Color</label>
            <div class="color-picker">
              <button
                v-for="color in playerColors"
                :key="color"
                class="color-swatch"
                :class="{ active: profileStore.color === color }"
                :style="{ backgroundColor: color }"
                @click="profileStore.saveColor(color)"
              />
            </div>
          </div>
        </div>

        <!-- Stats -->
        <div class="card stats-card">
          <div class="card-title">Statistics</div>
          <div class="stats-grid">
            <div class="stat-item" v-for="s in statItems" :key="s.label">
              <div class="stat-value neon-cyan">{{ s.value }}</div>
              <div class="stat-label">{{ s.label }}</div>
            </div>
          </div>
        </div>

        <!-- Achievements -->
        <div class="card achievements-card">
          <div class="card-title">Achievements ({{ achievementStore.unlocked.length }}/{{ achievementStore.all.length }})</div>
          <div class="achievements-grid">
            <div
              v-for="a in achievementStore.all"
              :key="a.id"
              class="achievement-badge"
              :class="{ unlocked: achievementStore.unlocked.find(u => u.id === a.id) }"
              :title="a.description"
            >
              <span class="ach-icon">{{ a.icon }}</span>
              <span class="ach-name">{{ a.name }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProfileStore, useAchievementStore, useStatisticsStore } from '@/stores/index.js'

const profileStore = useProfileStore()
const achievementStore = useAchievementStore()
const statsStore = useStatisticsStore()

const nameInput = ref(profileStore.name)

const initials = computed(() =>
  profileStore.name.split(/(?=[A-Z])/).map(w => w[0]).join('').slice(0,2).toUpperCase()
)

const playerColors = [
  '#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF',
  '#FF922B', '#CC5DE8', '#20C997', '#F06595',
]

const statItems = computed(() => [
  { label: 'Games Played', value: statsStore.globalStats.gamesPlayed },
  { label: 'Wins', value: statsStore.globalStats.wins },
  { label: 'Losses', value: statsStore.globalStats.losses },
  { label: 'Playtime', value: formatTime(statsStore.globalStats.totalPlaytimeMs) },
])

function formatTime(ms: number): string {
  const m = Math.floor(ms / 60000)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function saveName(): void {
  profileStore.saveName(nameInput.value)
}
</script>

<style scoped>
.profile-view { flex: 1; padding: 3rem 1.5rem; }
.profile-inner { max-width: 900px; margin: 0 auto; }
.page-title { font-size: 2rem; font-weight: 800; margin: 0 0 2rem; }

.profile-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
.achievements-card { grid-column: 1 / -1; }

.card-title { font-weight: 700; font-size: 0.875rem; letter-spacing: 0.05em; color: var(--color-text-secondary); text-transform: uppercase; margin-bottom: 1.25rem; }

.identity-card { display: flex; gap: 1.5rem; align-items: flex-start; }
.avatar-large { width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 800; color: #fff; flex-shrink: 0; }
.identity-fields { flex: 1; }
.field-label { font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-text-muted); display: block; margin-bottom: 0.375rem; }

.color-picker { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.color-swatch { width: 28px; height: 28px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; transition: all 0.15s ease; }
.color-swatch.active { border-color: #fff; box-shadow: 0 0 0 2px rgba(255,255,255,0.3); transform: scale(1.15); }

.stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; }
.stat-item { text-align: center; padding: 1rem; background-color: var(--color-bg-overlay); border-radius: 8px; }
.stat-value { font-size: 1.75rem; font-weight: 800; line-height: 1; margin-bottom: 0.25rem; }
.stat-label { font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--color-text-muted); }

.achievements-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0.75rem; }
.achievement-badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  padding: 1rem 0.5rem;
  background-color: var(--color-bg-overlay);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  opacity: 0.35;
  filter: grayscale(1);
  transition: all 0.2s ease;
  text-align: center;
}
.achievement-badge.unlocked { opacity: 1; filter: none; border-color: var(--color-neon-yellow); box-shadow: 0 0 10px rgba(255,214,10,0.2); }
.ach-icon { font-size: 1.75rem; }
.ach-name { font-size: 0.6875rem; font-weight: 600; color: var(--color-text-secondary); line-height: 1.3; }

@media (max-width: 640px) {
  .profile-grid { grid-template-columns: 1fr; }
  .achievements-card { grid-column: 1; }
  .identity-card { flex-direction: column; align-items: center; text-align: center; }
}
</style>
