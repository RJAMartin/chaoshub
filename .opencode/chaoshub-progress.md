# ChaosHub — Progress Log

## Status: Live at https://rjamartin.github.io/chaoshub/

Last updated: Session 5

---

## Completed

### Session 1 — Foundation (Phases 0–5)
- [x] pnpm monorepo, Vite + Vue 3 + TypeScript + Tailwind v4
- [x] Full core systems: EventBus, GameRegistry, GameLoop, NetworkAPI (PeerJS), StorageAPI, PlayerManager, StatisticsService, AchievementEngine, GameContext factory
- [x] Pinia stores: room, players, game, profile, achievements, statistics
- [x] Vue Router (hash history, 5 routes)
- [x] All views + components (lobby, game session, profile, etc.)
- [x] Reaction Test game (first playable)
- [x] pnpm create-game CLI scaffold
- [x] .opencode/ skill files

### Session 2 — Fix, Polish, Deploy
- [x] Fixed Pixi double-init: GameCanvas owns Application, passes via context.pixiApp
- [x] ScoreBoard component (post-game results with medals)
- [x] CountdownOverlay component
- [x] Invite link: ?join=CODE auto-triggers join
- [x] Input validation (room codes, player names, XSS safe)
- [x] Google Fonts (Space Grotesk + JetBrains Mono)
- [x] Favicon SVG (neon lightning bolt)
- [x] Ball Push game (Matter.js physics, host-authority, keyboard input)
- [x] Pixel War game
- [x] Music Toy game
- [x] ESLint flat config, Prettier, .editorconfig, VSCode settings
- [x] Disconnect mid-game overlay (host gone → countdown → redirect home)
- [x] GitHub repo created: https://github.com/RJAMartin/chaoshub
- [x] GitHub Pages live: https://rjamartin.github.io/chaoshub/

### Session 3 — 36 Games
- [x] 21 games shipped (commit e17ee03): Type Racer, Color Flood, Simon Says, Asteroid Duel, Word Scramble, Snake Battle, Trivia Quiz, Pong Duel, Dodge Blitz, Coin Grab, Memory Match, Number Crunch, Drawing Guesser, Wordle Race, Sumo Shove, Maze Race, Bomberman, Connect Four, Battleship, Emoji Decode, Minesweeper Race, Hot or Cold, Spelling bee
- [x] 13 more games (commit 632d1f1): Whack-a-Mole, Button Mash, Hangman, Air Hockey, Breakout Blitz, Pixel Portrait, Platform Runner, Rhythm Tap, Story Chain
- [x] All TS strict-mode errors fixed, build passes cleanly

### Session 4 — Platform Polish
- [x] Mobile nav hamburger menu (screens <640px)
- [x] Host kick player button in lobby (with PeerJS close + playerManager.removePlayer)
- [x] Loading skeleton shimmer animation for game library
- [x] ErrorBoundary.vue component (wraps router-view in App.vue, onErrorCaptured)
- [x] PeerJS unreachable banner: ROOM_ERROR event → dismissible banner in HomeView
- [x] TODO.md fully updated to reflect reality (36 games shipped, all Phase 2/5 done)
- [x] peer-adapter.ts: emit ROOM_ERROR on all error paths (init, connect, data)

---

## Pending / Next Session

### High Priority
- [ ] Unit tests: EventBus, GameRegistry, GameLoop, AchievementEngine, StatisticsService
- [ ] Integration test: create room → join → start game → end

### Medium Priority
- [ ] Accessibility: keyboard navigation in lobby, ARIA labels
- [ ] Performance: lazy-load Pixi only when entering a game
- [ ] Network: reconnection with exponential backoff

### Low Priority / Future
- [ ] Spectator mode, host migration, PWA, Supabase, tournaments...
- [ ] Asset loader utility, sprite sheet helpers, particle system helper
- [ ] Reaction Test polish: animated countdown, per-player times overlay, sound effect

---

## Known Issues
- Ball Push: no touch/mobile input (keyboard only)
- Node.js 20 deprecation warnings in CI (harmless until Sept 2026)


---

## Completed

### Session 1 — Foundation (Phases 0–5)
- [x] pnpm monorepo, Vite + Vue 3 + TypeScript + Tailwind v4
- [x] Full core systems: EventBus, GameRegistry, GameLoop, NetworkAPI (PeerJS), StorageAPI, PlayerManager, StatisticsService, AchievementEngine, GameContext factory
- [x] Pinia stores: room, players, game, profile, achievements, statistics
- [x] Vue Router (hash history, 5 routes)
- [x] All views + components (lobby, game session, profile, etc.)
- [x] Reaction Test game (first playable)
- [x] pnpm create-game CLI scaffold
- [x] .opencode/ skill files

### Session 2 — Fix, Polish, Deploy
- [x] Fixed Pixi double-init: GameCanvas owns Application, passes via context.pixiApp
- [x] ScoreBoard component (post-game results with medals)
- [x] Google Fonts (Space Grotesk + JetBrains Mono)
- [x] Favicon SVG (neon lightning bolt)
- [x] Ball Push game (Matter.js physics, host-authority, keyboard input)
- [x] GitHub repo created: https://github.com/RJAMartin/chaoshub
- [x] GitHub Pages live: https://rjamartin.github.io/chaoshub/
- [x] CI/CD: push to main → live in ~40 seconds

---

## Pending / Next Session

### High Priority
- [ ] Pixel War game (shared canvas, realtime territory claiming)
- [ ] Collaborative Music Toy game (Web Audio API, no win condition)
- [ ] Mobile touch controls for Ball Push (on-screen up/down buttons)
- [ ] `<CountdownOverlay>` Vue component for pre-game (currently done in Pixi per-game)
- [ ] Invite link: /?join=CODE query param auto-triggers join flow

### Medium Priority
- [ ] VSCode workspace settings + recommended extensions
- [ ] ESLint flat config
- [ ] Unit tests (EventBus, GameRegistry, AchievementEngine)
- [ ] Error boundary: host disconnects mid-game → UI feedback + redirect

### Low Priority / Future
- [ ] Spectator mode, host migration, PWA, Supabase, tournaments...

---

## Known Issues
- Ball Push: no touch/mobile input yet (keyboard only)
- Node.js 20 deprecation warnings in CI (harmless until Sept 2026)


---

## Completed

### Phase 0 — Scaffold
- [x] pnpm workspace monorepo (`apps/web`, `packages/*`)
- [x] Root `tsconfig.base.json` (strict TypeScript)
- [x] Vite + Vue 3 + TypeScript + Tailwind v4 configured
- [x] GitHub Actions deploy workflow (→ GitHub Pages)
- [x] `.opencode/` skill files (overview, architecture, game-sdk, networking, progress)

### Phase 1 — Core Systems
- [x] EventBus (typed, global singleton `eventBus`)
- [x] PlatformEvents (all platform event strings + payload types)
- [x] GameRegistry (auto-discovery via `import.meta.glob`)
- [x] Game SDK interfaces (`GameModule`, `GameInstance`, `GameContext`, `NetworkAPI`, etc.) in `packages/game-sdk`
- [x] GameLoop (RAF, delta time cap, FPS counter in dev mode)
- [x] LocalStorage adapter (`StorageAPI`, namespaced keys)
- [x] PeerJS network adapter (`NetworkAPI`, host-authority relay)
- [x] PlayerManager (auto-generated names via `unique-names-generator`, localStorage persistence)
- [x] StatisticsService (per-game + global, event-driven)
- [x] AchievementEngine (condition-based, 6 built-in achievements)
- [x] GameContext factory (`createGameContext`)

### Phase 2 — Platform UI
- [x] Pinia stores: room, players, game, profile, achievements, statistics
- [x] Vue Router (hash history, lazy-loaded views, 5 routes)
- [x] Views: Home, GameLibrary, Room (lobby + game session), Profile, Settings, NotFound
- [x] Components: AppShell, AppNav, GameCanvas, PlayerCard, GameCard, RoomCode, AchievementToast
- [x] Lobby system: create room, join room, player list, ready toggle, host controls, game picker
- [x] Design tokens: retro arcade / neon theme (Tailwind v4 `@theme`)

### Phase 3 — PixiJS
- [x] `<GameCanvas>` mounts/destroys PixiJS Application
- [x] Canvas lifecycle emits `ready` / `destroyed` events

### Phase 4 — First Game: Reaction Test
- [x] `module.ts` auto-registers via GameRegistry
- [x] Full host/client state machine (waiting → countdown → ready → signal → results)
- [x] Multi-round support (3 rounds)
- [x] False-start detection
- [x] Stats recording on game end
- [x] Pixi rendering of game states

### Phase 5 — DX Tooling
- [x] `pnpm create-game` CLI scaffold

---

## Pending / Next Session

### High Priority
- [ ] Fix: `<GameCanvas>` and `ReactionTestGame` both create a Pixi app — consolidate so RoomView passes the app instance to the game
- [ ] Test: full create room → join → game start → click → results flow in browser
- [ ] Fix: network event listeners in `room.store.ts` and `players.store.ts` are registered before PeerJS is initialized — need lazy registration or move to `onMounted`
- [ ] Add `<CountdownOverlay>` Vue component (3, 2, 1, GO!) for pre-game
- [ ] Add `<ScoreBoard>` Vue component for post-game results display
- [ ] Add router guard: redirect `/room/:id` with `?join=CODE` query param to auto-join

### Medium Priority
- [ ] Ball Push game (Matter.js + Pixi)
- [ ] Pixel War game (shared canvas, realtime sync)
- [ ] Collaborative Music Toy game
- [ ] VSCode workspace settings + recommended extensions
- [ ] `.editorconfig`

### Low Priority / Future
- [ ] Spectator mode (PlayerRole = 'spectator')
- [ ] Host migration on disconnect
- [x] PWA support — vite-plugin-pwa added (Session 5)
- [ ] Self-hosted PeerJS server option
- [ ] Supabase adapter for cross-device profiles
- [ ] Tournament brackets
- [ ] AI player support

---

## Session 5 — Polish, PWA, Reconnection, Responsive

### Completed
- [x] **SoundManager** (`apps/web/src/core/services/sound/sound-manager.ts`) — Web Audio API helper
  - `beep(freq, dur, vol)`, `success()`, `fail()`, `resume()`
  - Added `SoundAPI` interface to game SDK (`packages/game-sdk/src/index.ts`)
  - Wired into `GameContext` via `createGameContext()` — all games can use `ctx.sound`
- [x] **Reaction Test polish**
  - Animated Pixi countdown: numbers scale-pulse from large → normal over 800ms using `requestAnimationFrame`
  - Web Audio beep on each countdown tick (440 Hz) and GO! signal (880 Hz)
- [x] **Network reconnection with exponential backoff** (`peer-adapter.ts`)
  - Client-side: on unexpected `conn.close`, schedules retry at 1s/2s/4s/8s (4 attempts max)
  - Emits `ROOM_ERROR` with attempt progress; `ROOM_CLOSED` only after all attempts fail
  - `_intentionalDisconnect` flag prevents retry on explicit `disconnect()` or kick
  - Reuses existing `Peer` object if still alive; creates new one if destroyed
- [x] **Responsive audit** — fixed layout breakages at 320px
  - `GameLibraryView`: `minmax(min(160px, 100%), 1fr)` prevents overflow, `clamp()` title font
  - `RoomView`: game-picker-grid `minmax(min(140px, 100%), 1fr)`, lobby padding reduced
  - `HomeView`: at 400px join-form stacks vertically
  - disconnect-box gets `width: calc(100% - 2rem)` so it never overflows
- [x] **PWA** — `vite-plugin-pwa` added to `vite.config.ts`
  - Service worker in `generateSW` mode with `autoUpdate`
  - Web app manifest (name, icons, theme_color, display: standalone)
  - Workbox excludes large vendor chunks from precache; runtime caches Google Fonts
  - PWA icons (`public/icons/pwa-192.png`, `pwa-512.png`) generated
- [x] **TODO.md** fully updated; all newly done items marked `[DONE]`

### Still Pending
- [ ] Asset loader utility (Pixi `Assets`)
- [ ] Performance: lazy-load Pixi only when entering a game
- [ ] Unit test for GameLoop
- [ ] Integration test: full create/join/start/end flow

---

## Known Issues

1. **Pixi double-init:** `ReactionTestGame.init()` creates its own `PixiApp` AND `<GameCanvas>` creates one. Need to pass the canvas app from `<GameCanvas>` down to the game instance, or have games receive it via `GameContext`.
2. **Network listener timing:** Stores register `networkAdapter.on()` at module import time but `networkAdapter` only has connections after `initAsHost/Client`. Works because listeners are stored in a Map before connections open, but should document this clearly.
3. **TypeScript strict issues:** `exactOptionalPropertyTypes` may cause minor friction with Pixi's TextStyle. Loosen per-file with `// @ts-expect-error` if needed rather than disabling globally.

---

## Deferred Decisions

- Whether to pass `PixiApp` instance via `GameContext` (cleaner) vs. letting each game create its own (simpler for isolation)
- Font loading strategy (currently relies on system fonts; add Google Fonts link in `index.html` for `Space Grotesk`)
