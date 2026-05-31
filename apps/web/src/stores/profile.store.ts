// ─────────────────────────────────────────────────────────────────────────────
// Profile Store — local player preferences, persisted via localStorage
// ─────────────────────────────────────────────────────────────────────────────
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { playerManager } from '@/core/services/players/index.js'
import { usePlayerStore } from './players.store'

export const useProfileStore = defineStore('profile', () => {
  const player = playerManager.getLocalPlayer()
  const name = ref(player.name)
  const color = ref(player.color)

  function saveName(newName: string): void {
    const trimmed = newName.trim().slice(0, 24)
    if (!trimmed) return
    name.value = trimmed
    const playerStore = usePlayerStore()
    playerStore.updateLocalName(trimmed)
  }

  function saveColor(newColor: string): void {
    color.value = newColor
    const playerStore = usePlayerStore()
    playerStore.updateLocalColor(newColor)
  }

  return { name, color, saveName, saveColor }
})
