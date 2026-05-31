# ChaosHub — Master TODO

> Exhaustive backlog for a lifetime project. Items are grouped by phase and priority.
> See `.opencode/chaoshub-progress.md` for session-by-session log.

---

## Legend

- `[DONE]` — Completed
- `[WIP]` — In progress
- `[BUG]` — Known bug / needs fix
- `[ARCH]` — Architecture decision
- `[ ]` — Pending
- `[FUTURE]` — Deferred, design point exists

---

## Phase 0 — Scaffold

- `[DONE]` pnpm workspace monorepo
- `[DONE]` Root tsconfig.base.json (strict TypeScript)
- `[DONE]` Vite + Vue 3 + TypeScript + Tailwind v4
- `[DONE]` GitHub Actions → GitHub Pages deploy workflow
- `[DONE]` `.opencode/` skill files for AI context
- `[DONE]` `.npmrc` with build script approvals

---

## Phase 1 — Core Systems

- `[DONE]` EventBus (typed, global singleton)
- `[DONE]` PlatformEvents enum + payload types
- `[DONE]` GameRegistry (auto-discovery via import.meta.glob)
- `[DONE]` Game SDK interfaces (`packages/game-sdk`)
- `[DONE]` GameLoop (RAF, delta time cap, dev FPS counter)
- `[DONE]` LocalStorage adapter (namespaced StorageAPI)
- `[DONE]` PeerJS network adapter (NetworkAPI, host-authority)
- `[DONE]` PlayerManager (auto-names, localStorage persistence)
- `[DONE]` StatisticsService (per-game + global)
- `[DONE]` AchievementEngine (condition-based, 6 built-ins)
- `[DONE]` GameContext factory

---

## Phase 2 — Platform UI

- `[DONE]` Pinia stores: room, players, game, profile, achievements, statistics
- `[DONE]` Vue Router (hash history, 5 routes + 404)
- `[DONE]` Views: Home, GameLibrary, Room, Profile, Settings, NotFound
- `[DONE]` Components: AppShell, AppNav, GameCanvas, PlayerCard, GameCard, RoomCode, AchievementToast
- `[DONE]` Lobby: create room, join room, player list, ready toggle, host controls, game picker
- `[DONE]` Design tokens: retro arcade / neon Tailwind v4 theme
- `[ ]` `<CountdownOverlay>` component (3, 2, 1, GO!)
- `[ ]` `<ScoreBoard>` component (post-game results table)
- `[ ]` Invite link: `?join=CODE` query param auto-triggers join
- `[ ]` Host: kick player from lobby
- `[ ]` Mobile nav menu (hamburger) for small screens
- `[ ]` Loading skeleton states for game library

---

## Phase 3 — PixiJS Integration

- `[DONE]` `<GameCanvas>` mounts/destroys PixiJS Application
- `[BUG]` Pixi double-init: GameCanvas + game both create app — need to pass app via context or emit
- `[ ]` Resize handler: canvas fills container on window resize
- `[ ]` Asset loader utility (wraps Pixi `Assets`)
- `[ ]` Sprite sheet helpers in `packages/engine`
- `[ ]` Particle system helper (basic, without library)

---

## Phase 4 — Games

### Reaction Test ✓
- `[DONE]` module.ts + GameModule registration
- `[DONE]` Host/client state machine (waiting → countdown → ready → signal → results)
- `[DONE]` Multi-round (3 rounds)
- `[DONE]` False-start detection
- `[DONE]` Stats recording
- `[DONE]` Pixi rendering
- `[ ]` Polish: animated countdown in Pixi
- `[ ]` Show per-player reaction times overlay
- `[ ]` Sound effect on signal (Web Audio API)

### Ball Push
- `[ ]` module.ts
- `[ ]` Matter.js physics world setup
- `[ ]` Ball and player paddle physics bodies
- `[ ]` Pixi rendering synced to Matter.js
- `[ ]` Host: advance physics simulation
- `[ ]` Host: broadcast body positions each frame
- `[ ]` Client: render received positions
- `[ ]` Goal detection + score tracking
- `[ ]` Reset on goal
- `[ ]` Win condition (first to 3)

### Pixel War
- `[ ]` module.ts
- `[ ]` Shared NxN pixel grid (host-authoritative)
- `[ ]` Player assigns color on join
- `[ ]` Click/tap claims pixel
- `[ ]` Host broadcasts full diff each tick (or per-click)
- `[ ]` Pixi renders grid
- `[ ]` Score = pixel count per player
- `[ ]` Timer-based round end
- `[ ]` Winner = most pixels

### Collaborative Music Toy
- `[ ]` module.ts
- `[ ]` Web Audio API oscillator/sampler setup
- `[ ]` Players place notes on a shared grid
- `[ ]` Host broadcasts note placements
- `[ ]` Looping playback engine
- `[ ]` Visual waveform in Pixi
- `[ ]` No win condition (sandbox mode)

---

## Phase 5 — DX Tooling

- `[DONE]` `pnpm create-game` CLI scaffold
- `[ ]` VSCode workspace settings (`.vscode/settings.json`)
- `[ ]` `.vscode/extensions.json` (Volar, ESLint, Tailwind CSS IntelliSense)
- `[ ]` `.editorconfig`
- `[ ]` ESLint config (flat config, Vue + TypeScript rules)
- `[ ]` Prettier config

---

## Phase 6 — Quality & Hardening

- `[ ]` Unit tests: EventBus (emit, on, off, once, no leaks)
- `[ ]` Unit tests: GameRegistry (load, dedup, missing gracefully)
- `[ ]` Unit tests: GameLoop (start, stop, deltaTime)
- `[ ]` Unit tests: AchievementEngine (conditions, no double-unlock)
- `[ ]` Unit tests: StatisticsService
- `[ ]` Integration test: create room → join → start game → end
- `[ ]` Network: disconnect mid-game UI (host gone → redirect home)
- `[ ]` Network: reconnection with exponential backoff
- `[ ]` Input validation: room codes, player names (XSS safe)
- `[ ]` Error boundary component (Vue `onErrorCaptured`)
- `[ ]` Graceful degradation: PeerJS Cloud unreachable message
- `[ ]` Accessibility: keyboard navigation in lobby
- `[ ]` Accessibility: ARIA labels on interactive elements
- `[ ]` Responsive: test all views at 320px, 768px, 1440px
- `[ ]` Performance: lazy-load Pixi only when entering a game

---

## Phase 7 — Future Extension Points

- `[FUTURE]` Spectator mode: `PlayerRole = 'player' | 'spectator'` (type exists, logic pending)
- `[FUTURE]` Host migration: promote new host on disconnect
- `[FUTURE]` AI players: bot PlayerManager injection via GameContext
- `[FUTURE]` PWA: `vite-plugin-pwa` — zero arch changes needed
- `[FUTURE]` Supabase adapter: `SupabaseStorageAdapter implements StorageAPI`
- `[FUTURE]` Cross-device profiles via Supabase Auth
- `[FUTURE]` Global leaderboards via Supabase DB
- `[FUTURE]` Public room discovery (requires any backend)
- `[FUTURE]` Tournament brackets
- `[FUTURE]` Self-hosted PeerJS server option
- `[FUTURE]` Mobile app (Capacitor wrapper)
- `[FUTURE]` Dedicated game server adapter (Colyseus / WebSocket)
- `[FUTURE]` Matchmaking queue

---

## Ongoing

- `[ ]` Update `.opencode/chaoshub-progress.md` at end of every session
- `[ ]` Add Google Fonts link for `Space Grotesk` in `index.html`
- `[ ]` Favicon SVG (`/public/favicon.svg`)
