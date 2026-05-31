# ChaosHub — Game Development Guide

## Adding a New Game

### Option 1: CLI (recommended)
```bash
pnpm create-game
```
Follow the prompts. It creates:
- `apps/web/src/games/<id>/module.ts`
- `apps/web/src/games/<id>/<id>.game.ts`

### Option 2: Manual

1. Create directory: `apps/web/src/games/<your-id>/`
2. Create `module.ts` with a default export implementing `GameModule`
3. Create `<your-id>.game.ts` with a class implementing `GameInstance`

The game auto-registers. No platform code to modify.

---

## GameModule Interface

```ts
interface GameModule {
  id: string               // kebab-case, unique
  name: string             // Display name
  description: string
  thumbnail?: string       // Optional image path
  minPlayers: number
  maxPlayers: number
  supportsSinglePlayer: boolean
  supportsMultiplayer: boolean
  tags: string[]
  create(context: GameContext): GameInstance
}
```

## GameInstance Lifecycle

```ts
interface GameInstance {
  init(): Promise<void>     // Called once. Set up Pixi, register listeners.
  update(dt: number): void  // Called every frame. dt = seconds since last frame.
  destroy(): void           // Called on game end. Remove ALL listeners, destroy Pixi.
}
```

**Important:** `destroy()` MUST clean up everything:
- Cancel timeouts/intervals
- Remove network listeners with `network.off()`
- Call `pixiApp.destroy(true, { children: true })`

---

## GameContext API Reference

The `context` object is the ONLY way games interact with the platform.

### `context.network` (NetworkAPI)

```ts
// Send to host (if client) or broadcast (if host)
context.network.send(event: string, payload: unknown): void

// Broadcast to all peers. HOST ONLY.
context.network.broadcast(event: string, payload: unknown): void

// Listen for incoming network messages
context.network.on(event: string, callback: (msg: NetworkMessage) => void): void
context.network.off(event: string, callback): void

// Role detection
context.network.isHost(): boolean
context.network.getPeerId(): string
```

### `context.players` (PlayerManager)

```ts
context.players.getLocalPlayer(): Player   // { id, name, color, isHost, isReady }
context.players.getPlayers(): Player[]     // All players in room
context.players.getPlayer(id): Player | undefined
context.players.isHost(): boolean
```

### `context.storage` (StorageAPI) — namespaced per game

```ts
context.storage.get<T>(key: string): T | null
context.storage.set<T>(key: string, value: T): void
context.storage.remove(key: string): void
context.storage.clear(): void
```

### `context.stats` (StatisticsAPI)

```ts
context.stats.record('win' | 'loss' | 'play', playtimeMs?: number): void
context.stats.getStats(): GameStats  // { gamesPlayed, wins, losses, totalPlaytimeMs }
```

### `context.achievements` (AchievementAPI)

```ts
context.achievements.unlock(achievementId: string): void
context.achievements.isUnlocked(achievementId: string): boolean
```

### `context.events` (IEventBus)

```ts
// For listening to platform events from within a game
context.events.on(PlatformEvents.GAME_ENDED, callback)
context.events.emit('my-game:custom-event', payload)
```

---

## Multiplayer Pattern (Host Authority)

```
Client clicks → context.network.send('my-game:action', { ... })
                         ↓
               Host receives via network.on('my-game:action', msg => {
                 // validate action
                 // update authoritative state
                 context.network.broadcast('my-game:state', newState)
               })
                         ↓
               All clients receive via network.on('my-game:state', msg => {
                 // update local render state
               })
```

Name your game events: `<game-id>:<event-name>` (e.g. `reaction-test:player-clicked`).

---

## PixiJS Setup Pattern

```ts
async init(): Promise<void> {
  this.app = new Application()
  await this.app.init({
    backgroundColor: 0x0a0a0f,
    resizeTo: document.querySelector('.game-canvas-container') as HTMLElement ?? window,
    antialias: true,
  })
  const container = document.querySelector('.game-canvas-container')
  if (container) container.appendChild(this.app.canvas)
  // ... build scene
}
```

The `.game-canvas-container` div is created by `<GameCanvas>` in `RoomView`.

---

## Reference Implementation

See `apps/web/src/games/reaction-test/` for a complete working example covering:
- Host/client state machine
- Network send/broadcast/on pattern
- Pixi scene setup
- Cleanup in destroy()
- Stats recording on game end

---

## Rules for Game Code

| ALLOWED | FORBIDDEN |
|---------|-----------|
| `context.network.*` | `import Peer from 'peerjs'` |
| `context.players.*` | `import { usePlayerStore } from '@/stores'` |
| `context.storage.*` | `localStorage.*` directly |
| `context.events.*` | `import { useRouter }` |
| `context.stats.*` | Modifying DOM outside canvas container |
| `context.achievements.*` | Cross-game network events |
| PixiJS (rendering) | Vue components inside game |
| Matter.js (physics) | Direct fetch/network calls |
