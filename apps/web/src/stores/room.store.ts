// ─────────────────────────────────────────────────────────────────────────────
// Room Store — manages room state: creation, joining, phase transitions
// ─────────────────────────────────────────────────────────────────────────────
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { networkAdapter } from '@/core/network/index.js'
import { eventBus } from '@/core/events/event-bus.js'
import { PlatformEvents } from '@/core/events/platform-events.js'
import { playerManager } from '@/core/services/players/index.js'

export type RoomPhase = 'idle' | 'lobby' | 'in-game' | 'post-game'

export const useRoomStore = defineStore('room', () => {
  const roomCode = ref<string | null>(null)
  const phase = ref<RoomPhase>('idle')
  const selectedGameId = ref<string | null>(null)
  const error = ref<string | null>(null)
  const isConnecting = ref(false)

  const isInRoom = computed(() => phase.value !== 'idle')
  const isHost = computed(() => playerManager.isHost())

  async function createRoom(): Promise<string> {
    isConnecting.value = true
    error.value = null
    try {
      const code = await networkAdapter.initAsHost()
      roomCode.value = code
      phase.value = 'lobby'
      eventBus.emit(PlatformEvents.ROOM_CREATED, { roomCode: code })
      return code
    } catch (e) {
      error.value = 'Failed to create room. Please try again.'
      throw e
    } finally {
      isConnecting.value = false
    }
  }

  async function joinRoom(code: string): Promise<void> {
    isConnecting.value = true
    error.value = null
    try {
      await networkAdapter.initAsClient(code)
      roomCode.value = code
      phase.value = 'lobby'
      eventBus.emit(PlatformEvents.ROOM_JOINED, { roomCode: code })
    } catch (e) {
      error.value = 'Could not connect to room. Check the code and try again.'
      throw e
    } finally {
      isConnecting.value = false
    }
  }

  function leaveRoom(): void {
    networkAdapter.disconnect()
    roomCode.value = null
    phase.value = 'idle'
    selectedGameId.value = null
    error.value = null
  }

  function selectGame(gameId: string): void {
    if (!isHost.value) return
    selectedGameId.value = gameId
    networkAdapter.broadcast(PlatformEvents.GAME_SELECTED, { gameId })
    eventBus.emit(PlatformEvents.GAME_SELECTED, { gameId })
  }

  function setPhase(newPhase: RoomPhase): void {
    phase.value = newPhase
  }

  // Listen for host-broadcast game selection (client side)
  networkAdapter.on(PlatformEvents.GAME_SELECTED, (msg) => {
    const payload = msg.payload as { gameId: string }
    selectedGameId.value = payload.gameId
  })

  // Room closed by host disconnect
  eventBus.on(PlatformEvents.ROOM_CLOSED, () => {
    leaveRoom()
  })

  return {
    roomCode,
    phase,
    selectedGameId,
    error,
    isConnecting,
    isInRoom,
    isHost,
    createRoom,
    joinRoom,
    leaveRoom,
    selectGame,
    setPhase,
  }
})
