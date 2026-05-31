# ChaosHub — Networking Reference

## Model: Host Authority

One player is the **Host**. Their peer ID is the room code.

```
Host Peer ID = Room Code = URL parameter /room/:id
```

### Roles

**Host:**
- Calls `networkAdapter.initAsHost()` → gets peer ID
- Accepts incoming client connections
- Owns authoritative game state
- Validates all player actions
- Broadcasts state updates to all clients

**Client:**
- Calls `networkAdapter.initAsClient(hostPeerId)`
- Sends actions to host via `network.send()`
- Receives state from host via `network.on()`

---

## NetworkAPI

```ts
interface NetworkAPI {
  send(event: string, payload: unknown): void
  broadcast(event: string, payload: unknown): void
  on(event: string, callback: (msg: NetworkMessage) => void): void
  off(event: string, callback): void
  isHost(): boolean
  getPeerId(): string
}
```

### `send()` behavior
- **If host:** equivalent to broadcast (sends to all + dispatches locally)
- **If client:** sends to host only

### `broadcast()` behavior
- **Host only.** Sends to all connected clients AND dispatches locally.
- If called by client: warning logged, no-op.

### Message Envelope

```ts
interface NetworkMessage {
  event: string
  payload: unknown
  from: string      // sender peer ID
  timestamp: number // Date.now() on sender
}
```

---

## PeerJS Cloud

ChaosHub uses the free PeerJS Cloud signaling server (`0.peerjs.com`). No configuration required. The peer ID is randomly assigned by PeerJS Cloud.

**Limitations:**
- ~50 concurrent rooms per app (free tier)
- Signaling server is third-party (PeerJS cloud)
- No room persistence (ephemeral)

**Future:** Can swap to a self-hosted PeerJS server or completely different transport by replacing `PeerJSAdapter` with a new class implementing `NetworkAPI`.

---

## Room Lifecycle

```
Host:
  initAsHost() → peer ID assigned → roomCode = peerId → share code

Client:
  initAsClient(code) → connects to host peer
  → sends PLAYER_JOINED { player } to host
  → host receives, adds to playerManager, broadcasts PLAYER_JOINED
  → all clients update player list

During game:
  client.send('game:action', data) → host receives
  host validates → host.broadcast('game:state', newState)
  all clients receive → render

Leave/Disconnect:
  host tab closes → all clients receive 'close' event → ROOM_CLOSED emitted
  client disconnects → host removes from connections → PLAYER_LEFT emitted
```

---

## Platform Events Over Network

Some platform events are sent over the network by the room/player stores:

| Event | Sender | Recipients | When |
|-------|--------|-----------|------|
| `PLAYER_JOINED` | Client (on connect) | Host → broadcasts to all | New player connects |
| `PLAYER_READY` | Any player | Host → broadcasts to all | Player toggles ready |
| `GAME_SELECTED` | Host | All clients | Host picks a game |
| `GAME_STARTED` | Host | All clients | Host starts game |

---

## Future-Proofing

The `NetworkAPI` interface is designed so the underlying transport is fully swappable:

| Future transport | What changes |
|-----------------|-------------|
| Dedicated PeerJS server | `new Peer({ host, port, path })` in `peer-adapter.ts` only |
| WebSocket server | New `WebSocketAdapter implements NetworkAPI` |
| Colyseus | New `ColyseusAdapter implements NetworkAPI` |
| Supabase Realtime | New `SupabaseAdapter implements NetworkAPI` |

**Zero game code changes required** for any transport swap.

### Host Migration (Future)
The `PlayerManager` tracks all players. When designed:
1. Host disconnects
2. Platform detects (connection close event)
3. Remaining client with lowest peer ID becomes new host
4. `networkAdapter.initAsHost()` called on new host
5. `HOST_CHANGED` event emitted
6. Game state synced from previous host's last known state

Not implemented yet. Design points exist in `PeerJSAdapter` and `PlayerManager`.
