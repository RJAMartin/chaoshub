# ChaosHub — Project Overview

## What Is ChaosHub

ChaosHub is a browser-based platform for rapid creation and deployment of small multiplayer and single-player games. It is NOT a single game — it is an extensible game portal inspired by Flash game portals, party games, and browser multiplayer experiments.

**Hosting:** GitHub Pages (static, free). No backend server.  
**P2P:** PeerJS Cloud (free WebRTC signaling). No server cost.  
**Storage:** localStorage (all data is local-first, per-browser).

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vue 3 + TypeScript + Vite |
| Routing | Vue Router 4 (hash history for GH Pages) |
| State | Pinia |
| Styling | TailwindCSS v4 |
| Game Rendering | PixiJS v8 |
| Physics | Matter.js |
| Networking | PeerJS (WebRTC) |
| Package Manager | pnpm workspaces |

**Do NOT use:** Next.js, Nuxt, Redux, Vuex, any backend.

## Key Architectural Decisions

### 1. Games as Plugins
Every game implements `GameModule` and `GameInstance` from `@chaoshub/game-sdk`. Games are auto-discovered via Vite's `import.meta.glob`. Adding a new game = creating `src/games/<id>/module.ts`. Zero platform code modifications required.

### 2. Games are sandboxed
Games MUST ONLY interact with the platform through `GameContext`. Games must NEVER:
- Import PeerJS directly
- Import Pinia stores directly
- Access localStorage directly
- Import Vue Router directly

### 3. Host Authority Networking
One player is Host. Host owns authoritative state, validates actions, distributes state. Clients send actions → Host validates → Host broadcasts. PeerJS peer ID = room code.

### 4. All data is local
Profiles, stats, achievements = localStorage via `StorageAPI`. No cross-device sync unless Supabase is added later (abstraction is ready).

### 5. Pixi/Vue separation
Vue manages all UI chrome (menus, lobby, stats). PixiJS manages gameplay rendering. `<GameCanvas>` component is the boundary — it mounts Pixi into a div, Vue never touches the canvas DOM node directly.

## Visual Design

Retro arcade / neon theme. Dark background (`#0a0a0f`) with cyan (`#00f5ff`), pink (`#ff2d78`), purple (`#bf5af2`), yellow (`#ffd60a`), green (`#30d158`) neon accents. Grid texture on body background.

## Glossary

- **GameModule** — the plugin contract (id, name, description, minPlayers, maxPlayers, create())
- **GameInstance** — the lifecycle contract (init, update, destroy)
- **GameContext** — the single object games receive (network, players, storage, stats, achievements, events)
- **NetworkAPI** — abstracted P2P interface (send, broadcast, on, off, isHost, getPeerId)
- **EventBus** — global typed event bus (on, off, emit, once)
- **PlatformEvents** — enum of all platform-level event strings
- **GameRegistry** — discovers and stores all GameModules
- **GameLoop** — RAF-based update loop (start, stop, pause, resume)
- **StorageAPI** — namespaced key-value storage abstraction
- **PlayerManager** — manages player list and local player identity
