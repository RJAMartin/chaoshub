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

    // Only relay when the message originated from a remote peer (not from a
    // local broadcast echo), to prevent infinite recursion.
    if (networkAdapter.isHost() && msg.from !== networkAdapter.getPeerId()) {
      // Send the full current player list to the newcomer so they see
      // everyone who was already in the room.
      const existingPlayers = playerManager.getPlayers()
      for (const existing of existingPlayers) {
        if (existing.id !== payload.player.id) {
          networkAdapter.sendToPeer(msg.from, PlatformEvents.PLAYER_JOINED, { player: existing })
        }
      }

      // Register the new player locally first so broadcast includes them
      playerManager.addPlayer(payload.player)

      // Broadcast the newcomer to all already-connected clients.
      networkAdapter.broadcast(PlatformEvents.PLAYER_JOINED, payload)
    } else {
      // Client path: just record the player.
      playerManager.addPlayer(payload.player)
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
    // Relay to all clients only when the message came from a remote peer,
    // to prevent infinite recursion from broadcast's local echo.
    if (networkAdapter.isHost() && msg.from !== networkAdapter.getPeerId()) {
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
