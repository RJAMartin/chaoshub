# ChaosHub — Architecture Reference

## Monorepo Structure

```
chaoshub/
├── apps/
│   └── web/                         # Main Vite + Vue 3 app
│       └── src/
│           ├── core/
│           │   ├── events/          # EventBus + PlatformEvents
│           │   ├── registry/        # GameRegistry (auto-discovery)
│           │   ├── engine/          # GameLoop (RAF)
│           │   ├── network/         # PeerJSAdapter (NetworkAPI impl)
│           │   └── services/
│           │       ├── storage/     # LocalStorageAdapter
│           │       ├── players/     # PlayerManager
│           │       ├── statistics/  # StatisticsService
│           │       ├── achievements/# AchievementEngine
│           │       └── game-context.ts  # GameContext factory
│           ├── games/               # One folder per game
│           │   └── <game-id>/
│           │       ├── module.ts    # GameModule export (auto-discovered)
│           │       └── <game>.game.ts  # GameInstance implementation
│           ├── stores/              # Pinia stores
│           ├── components/          # Shared Vue components
│           ├── views/               # Route views
│           ├── router/              # Vue Router setup
│           ├── assets/              # main.css (Tailwind + design tokens)
│           ├── main.ts              # App bootstrap
│           └── App.vue              # Root component
├── packages/
│   ├── game-sdk/   # GameModule, GameInstance, GameContext, NetworkAPI interfaces
│   ├── network/    # (stub — future extracted network adapters)
│   ├── engine/     # (stub — future extracted rendering utilities)
│   ├── shared/     # (stub — future shared utilities)
│   └── ui/         # (stub — future extracted component library)
├── scripts/
│   └── create-game.mjs  # CLI scaffold tool
└── .github/workflows/deploy.yml  # GH Pages CI/CD
```

## Data Flow

```
User Action
    ↓
Vue Component (click/event)
    ↓
Pinia Store (e.g. useRoomStore)
    ↓
Core Service (e.g. networkAdapter.send())
    ↓
PeerJS → Remote Peer
    ↓
NetworkAPI.on() callback
    ↓
EventBus.emit() (platform events)
    ↓
Pinia Store updates (reactive)
    ↓
Vue re-renders
```

## Core Systems Map

| System | File | Singleton | Role |
|--------|------|-----------|------|
| EventBus | `core/events/event-bus.ts` | `eventBus` | Global typed event pub/sub |
| PlatformEvents | `core/events/platform-events.ts` | const map | All platform event strings |
| GameRegistry | `core/registry/game-registry.ts` | `gameRegistry` | Plugin discovery & storage |
| GameLoop | `core/engine/game-loop.ts` | `gameLoop` | RAF update loop |
| NetworkAdapter | `core/network/peer-adapter.ts` | `networkAdapter` | PeerJS abstraction |
| PlayerManager | `core/services/players/player-manager.ts` | `playerManager` | Player list + local identity |
| StatisticsService | `core/services/statistics/` | Per-game instance | Stats tracking |
| AchievementEngine | `core/services/achievements/` | `achievementEngine` | Achievement eval + unlock |
| GameContext | `core/services/game-context.ts` | Factory fn | Sandboxed context per game |

## Pinia Stores

| Store | File | Owns |
|-------|------|------|
| `useRoomStore` | `stores/room.store.ts` | roomCode, phase, selectedGameId, create/join/leave |
| `usePlayerStore` | `stores/players.store.ts` | reactive player list, ready state |
| `useGameStore` | `stores/game.store.ts` | active game session, startGame/endGame |
| `useProfileStore` | `stores/profile.store.ts` | local player name/color prefs |
| `useAchievementStore` | `stores/achievements.store.ts` | unlocked list, toast queue |
| `useStatisticsStore` | `stores/statistics.store.ts` | reactive global stats |

## Routes

| Path | View | Notes |
|------|------|-------|
| `/` | HomeView | Create/join room, hero |
| `/games` | GameLibraryView | All registered games |
| `/room/:id` | RoomView | Lobby + active game (same route) |
| `/profile` | ProfileView | Name, color, stats, achievements |
| `/settings` | SettingsView | Placeholder for future settings |

Hash history is used (`createWebHashHistory`) for GH Pages compatibility.

## Component Inventory

| Component | Purpose |
|-----------|---------|
| `<AppShell>` | Layout wrapper (nav + main slot) |
| `<AppNav>` | Sticky top navbar with room indicator |
| `<GameCanvas>` | Mounts/destroys PixiJS Application |
| `<PlayerCard>` | Single player row (avatar, name, ready status) |
| `<GameCard>` | Game tile (thumbnail, name, tags, selection state) |
| `<RoomCode>` | Room code display + copy + share link |
| `<AchievementToast>` | Animated bottom-right achievement unlock notification |

## Naming Conventions

- Game IDs: `kebab-case` (e.g. `reaction-test`)
- Game events: `<game-id>:<event>` (e.g. `reaction-test:player-clicked`)
- Platform events: `platform:<domain>:<action>` (e.g. `platform:player:joined`)
- Store files: `<name>.store.ts`
- Game files: `<id>.game.ts` and `module.ts`
- Max file size target: ~200 lines
