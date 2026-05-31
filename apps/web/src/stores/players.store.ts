// ─────────────────────────────────────────────────────────────────────────────
// Player Store — syncs player list with network events
// ─────────────────────────────────────────────────────────────────────────────
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Player } from '@chaoshub/game-sdk'
import { playerManager } from '@/core/services/players/index.js'
import { networkAdapter } from '@/core/network/index.js'
import { eventBus } from '@/core/events/event-bus.js'
import { PlatformEvents } from '@/core/events/platform-events.js'

export const usePlayerStore = defineStore('players', () => {
  const players = ref<Player[]>([playerManager.getLocalPlayer()])

  const localPlayer = computed(() => playerManager.getLocalPlayer())
  const allReady = computed(() =>
    players.value.length >= 2 && players.value.every((p) => p.isReady)
  )

  function refresh(): void {
    players.value = playerManager.getPlayers()
  }

  // Host: a new client connected and sent PLAYER_JOINED
  networkAdapter.on(PlatformEvents.PLAYER_JOINED, (msg) => {
    const payload = msg.payload as { player: Player }
    playerManager.addPlayer(payload.player)
    // Relay to all clients if we are host
    if (networkAdapter.isHost()) {
      // Send current player list back to the new joiner
      networkAdapter.broadcast(PlatformEvents.PLAYER_JOINED, payload)
    }
    refresh()
    eventBus.emit(PlatformEvents.PLAYER_JOINED, payload)
  })

  // Client: receives player list updates from host
  networkAdapter.on(PlatformEvents.PLAYER_LEFT, (msg) => {
    const payload = msg.payload as { playerId: string }
    playerManager.removePlayer(payload.playerId)
    refresh()
    eventBus.emit(PlatformEvents.PLAYER_LEFT, payload)
  })

  networkAdapter.on(PlatformEvents.PLAYER_READY, (msg) => {
    const payload = msg.payload as { playerId: string; isReady: boolean }
    playerManager.updatePlayer(payload.playerId, { isReady: payload.isReady })
    if (networkAdapter.isHost()) {
      networkAdapter.broadcast(PlatformEvents.PLAYER_READY, payload)
    }
    refresh()
  })

  function setReady(isReady: boolean): void {
    playerManager.setLocalPlayerReady(isReady)
    networkAdapter.send(PlatformEvents.PLAYER_READY, {
      playerId: localPlayer.value.id,
      isReady,
    })
    refresh()
  }

  function updateLocalName(name: string): void {
    playerManager.setLocalPlayerName(name)
    refresh()
  }

  function updateLocalColor(color: string): void {
    playerManager.setLocalPlayerColor(color)
    refresh()
  }

  return {
    players,
    localPlayer,
    allReady,
    refresh,
    setReady,
    updateLocalName,
    updateLocalColor,
  }
})
