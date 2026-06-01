// ─────────────────────────────────────────────────────────────────────────────
// PeerJS Network Adapter — implements NetworkAPI using PeerJS WebRTC
//
// Host-Authority Model:
//   - Host: accepts incoming connections, relays state to all peers
//   - Client: connects to host peer ID (= room code), sends actions to host
//
// Message envelope: { event, payload, from, timestamp }
// ─────────────────────────────────────────────────────────────────────────────
import Peer, { type DataConnection } from 'peerjs'
import type { NetworkAPI, NetworkMessage } from '@chaoshub/game-sdk'
import { eventBus } from '@/core/events/event-bus'
import { PlatformEvents } from '@/core/events/platform-events'
import { playerManager } from '@/core/services/players/player-manager'

type NetworkCallback = (msg: NetworkMessage) => void

class PeerJSAdapter implements NetworkAPI {
  private peer: Peer | null = null
  private connections = new Map<string, DataConnection>()
  private hostConnection: DataConnection | null = null
  private _peerId: string = ''
  private _isHost: boolean = false
  private listeners = new Map<string, Set<NetworkCallback>>()

  // ── Setup ────────────────────────────────────────────────────────────────

  async initAsHost(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.peer = new Peer()

      this.peer.on('open', (id) => {
        this._peerId = id
        this._isHost = true
        playerManager.promoteToHost()

        // Accept incoming connections
        this.peer!.on('connection', (conn) => {
          this.handleIncomingConnection(conn)
        })

        resolve(id)
      })

      this.peer.on('error', (err) => {
        const msg = (err as Error).message ?? String(err)
        eventBus.emit(PlatformEvents.ROOM_ERROR, { message: msg })
        reject(err)
      })
    })
  }

  async initAsClient(hostId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.peer = new Peer()

      this.peer.on('open', (id) => {
        this._peerId = id
        this._isHost = false

        const conn = this.peer!.connect(hostId, { reliable: true })
        this.hostConnection = conn

        conn.on('open', () => {
          // Announce ourselves to host
          this.send(PlatformEvents.PLAYER_JOINED, {
            player: playerManager.getLocalPlayer(),
          })
          resolve()
        })

        conn.on('data', (data) => {
          this.handleIncomingData(data)
        })

        conn.on('close', () => {
          eventBus.emit(PlatformEvents.ROOM_CLOSED, { message: 'Host disconnected' })
        })

        conn.on('error', (err) => {
          const msg = (err as Error).message ?? String(err)
          eventBus.emit(PlatformEvents.ROOM_ERROR, { message: msg })
          reject(err)
        })
      })

      this.peer.on('error', (err) => {
        const msg = (err as Error).message ?? String(err)
        eventBus.emit(PlatformEvents.ROOM_ERROR, { message: msg })
        reject(err)
      })
    })
  }

  private handleIncomingConnection(conn: DataConnection): void {
    conn.on('open', () => {
      this.connections.set(conn.peer, conn)
    })

    conn.on('data', (data) => {
      // Host receives data from a client — process it and potentially relay
      this.handleIncomingData(data)
    })

    conn.on('close', () => {
      this.connections.delete(conn.peer)
      const player = playerManager.getPlayer(conn.peer)
      if (player) {
        playerManager.removePlayer(conn.peer)
        eventBus.emit(PlatformEvents.PLAYER_LEFT, { playerId: conn.peer })
      }
    })
  }

  private handleIncomingData(data: unknown): void {
    if (!isNetworkMessage(data)) return
    const listeners = this.listeners.get(data.event)
    listeners?.forEach((cb) => cb(data))
  }

  // ── NetworkAPI implementation ─────────────────────────────────────────────

  send(event: string, payload: unknown): void {
    const msg: NetworkMessage = {
      event,
      payload,
      from: this._peerId,
      timestamp: Date.now(),
    }

    if (this._isHost) {
      // Host sending = broadcast to all clients
      this.broadcastRaw(msg)
      // Also dispatch locally
      this.handleIncomingData(msg)
    } else {
      // Client sending = send to host only
      this.hostConnection?.send(msg)
    }
  }

  broadcast(event: string, payload: unknown): void {
    if (!this._isHost) {
      console.warn('[Network] Only the host can broadcast.')
      return
    }
    const msg: NetworkMessage = {
      event,
      payload,
      from: this._peerId,
      timestamp: Date.now(),
    }
    this.broadcastRaw(msg)
    // Also dispatch locally on host
    this.handleIncomingData(msg)
  }

  private broadcastRaw(msg: NetworkMessage): void {
    this.connections.forEach((conn) => conn.send(msg))
  }

  on(event: string, callback: NetworkCallback): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(callback)
  }

  off(event: string, callback: NetworkCallback): void {
    this.listeners.get(event)?.delete(callback)
  }

  isHost(): boolean {
    return this._isHost
  }

  getPeerId(): string {
    return this._peerId
  }

  getConnectedPeerIds(): string[] {
    return [...this.connections.keys()]
  }

  kickPlayer(peerId: string): void {
    if (!this._isHost) return
    const conn = this.connections.get(peerId)
    if (conn) {
      // Notify the kicked peer before closing
      conn.send({ event: PlatformEvents.ROOM_CLOSED, payload: { message: 'You were kicked by the host' }, senderId: this._peerId })
      setTimeout(() => { conn.close() }, 200)
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  disconnect(): void {
    this.connections.forEach((conn) => conn.close())
    this.connections.clear()
    this.hostConnection?.close()
    this.hostConnection = null
    this.peer?.destroy()
    this.peer = null
    this._peerId = ''
    this._isHost = false
    this.listeners.clear()
    playerManager.clearRoom()
  }
}

function isNetworkMessage(data: unknown): data is NetworkMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    'event' in data &&
    'payload' in data &&
    'from' in data &&
    'timestamp' in data
  )
}

// Global singleton
export const networkAdapter = new PeerJSAdapter()
