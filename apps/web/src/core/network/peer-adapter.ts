// ─────────────────────────────────────────────────────────────────────────────
// PeerJS Network Adapter — implements NetworkAPI using PeerJS WebRTC
//
// Host-Authority Model:
//   - Host: accepts incoming connections, relays state to all peers
//   - Client: connects to host peer ID (= room code), sends actions to host
//
// Message envelope: { event, payload, from, timestamp }
//
// Room codes: 6-char alphanumeric (e.g. "ABC123").
// Internally the PeerJS peer ID is prefixed: "csh-ABC123".
// Users only see/type the short 6-char code.
// ─────────────────────────────────────────────────────────────────────────────
import Peer, { type DataConnection } from 'peerjs'
import type { NetworkAPI, NetworkMessage } from '@chaoshub/game-sdk'
import { eventBus } from '@/core/events/event-bus'
import { PlatformEvents } from '@/core/events/platform-events'
import { playerManager } from '@/core/services/players/player-manager'

type NetworkCallback = (msg: NetworkMessage) => void

const MAX_RECONNECT_ATTEMPTS = 4
const RECONNECT_BASE_MS = 1000
const PEER_ID_PREFIX = 'csh-'

// Unambiguous characters — no 0/O, 1/I/L confusion
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Generate a random 6-char room code. */
function generateRoomCode(): string {
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  }
  return code
}

/** Short code (user-facing) → full PeerJS peer ID. */
export function codeToPeerId(code: string): string {
  return `${PEER_ID_PREFIX}${code.toUpperCase()}`
}

/** Full PeerJS peer ID → short code (user-facing). */
export function peerIdToCode(peerId: string): string {
  return peerId.startsWith(PEER_ID_PREFIX)
    ? peerId.slice(PEER_ID_PREFIX.length).toUpperCase()
    : peerId.toUpperCase()
}

class PeerJSAdapter implements NetworkAPI {
  private peer: Peer | null = null
  private connections = new Map<string, DataConnection>()
  private hostConnection: DataConnection | null = null
  private _peerId: string = ''
  private _isHost: boolean = false
  private listeners = new Map<string, Set<NetworkCallback>>()

  // Reconnection state (client only)
  private _hostId: string = ''
  private _reconnectAttempt = 0
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private _intentionalDisconnect = false

  // ── Setup ────────────────────────────────────────────────────────────────

  async initAsHost(): Promise<string> {
    return this._tryInitAsHost(generateRoomCode(), 0)
  }

  private _tryInitAsHost(code: string, attempt: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const peerId = codeToPeerId(code)
      this.peer = new Peer(peerId)

      this.peer.on('open', () => {
        this._peerId = peerId
        this._isHost = true
        playerManager.promoteToHost()

        this.peer!.on('connection', (conn) => {
          this.handleIncomingConnection(conn)
        })

        resolve(code) // ← return the short code, not the full peer ID
      })

      this.peer.on('error', (err) => {
        // 'unavailable-id' means the code is already taken — retry with a fresh code
        const errType = (err as { type?: string }).type
        if (errType === 'unavailable-id' && attempt < 5) {
          this.peer?.destroy()
          this.peer = null
          this._tryInitAsHost(generateRoomCode(), attempt + 1).then(resolve).catch(reject)
          return
        }
        const msg = (err as Error).message ?? String(err)
        eventBus.emit(PlatformEvents.ROOM_ERROR, { message: msg })
        reject(err)
      })
    })
  }

  async initAsClient(code: string): Promise<void> {
    this._hostId = codeToPeerId(code) // convert short code to full peer ID
    this._reconnectAttempt = 0
    this._intentionalDisconnect = false
    return this._connectToHost()
  }

  private _connectToHost(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Reuse existing Peer object if still alive, otherwise create fresh
      if (!this.peer || this.peer.destroyed) {
        this.peer = new Peer()
      }

      const doConnect = (id: string) => {
        this._peerId = id
        this._isHost = false

        const conn = this.peer!.connect(this._hostId, { reliable: true })
        this.hostConnection = conn

        conn.on('open', () => {
          this._reconnectAttempt = 0
          this.send(PlatformEvents.PLAYER_JOINED, {
            player: playerManager.getLocalPlayer(),
          })
          resolve()
        })

        conn.on('data', (data) => {
          this.handleIncomingData(data)
        })

        conn.on('close', () => {
          if (this._intentionalDisconnect) {
            eventBus.emit(PlatformEvents.ROOM_CLOSED, { message: 'Host disconnected' })
            return
          }
          this._scheduleReconnect()
        })

        conn.on('error', (err) => {
          const msg = (err as Error).message ?? String(err)
          eventBus.emit(PlatformEvents.ROOM_ERROR, { message: msg })
          reject(err)
        })
      }

      // If peer already open, connect immediately
      if (this.peer.id) {
        doConnect(this.peer.id)
      } else {
        this.peer.on('open', doConnect)
      }

      this.peer.on('error', (err) => {
        const msg = (err as Error).message ?? String(err)
        eventBus.emit(PlatformEvents.ROOM_ERROR, { message: msg })
        reject(err)
      })
    })
  }

  private _scheduleReconnect(): void {
    if (this._reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      eventBus.emit(PlatformEvents.ROOM_CLOSED, { message: 'Lost connection to host' })
      return
    }

    const delay = RECONNECT_BASE_MS * Math.pow(2, this._reconnectAttempt)
    this._reconnectAttempt++

    eventBus.emit(PlatformEvents.ROOM_ERROR, {
      message: `Connection lost — reconnecting (attempt ${this._reconnectAttempt}/${MAX_RECONNECT_ATTEMPTS})…`,
    })

    this._reconnectTimer = setTimeout(async () => {
      try {
        await this._connectToHost()
      } catch {
        // error already emitted inside _connectToHost
      }
    }, delay)
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

  /**
   * Send a message to a specific connected peer. Host-only.
   * Used to unicast information (e.g. the full player list) to a single client.
   */
  sendToPeer(peerId: string, event: string, payload: unknown): void {
    if (!this._isHost) return
    const conn = this.connections.get(peerId)
    if (!conn) return
    const msg: NetworkMessage = {
      event,
      payload,
      from: this._peerId,
      timestamp: Date.now(),
    }
    conn.send(msg)
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  disconnect(): void {
    this._intentionalDisconnect = true
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = null
    }
    this.connections.forEach((conn) => conn.close())
    this.connections.clear()
    this.hostConnection?.close()
    this.hostConnection = null
    this.peer?.destroy()
    this.peer = null
    this._peerId = ''
    this._isHost = false
    this._hostId = ''
    this._reconnectAttempt = 0
    // Do NOT clear listeners — stores register them once and must survive room sessions.
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
