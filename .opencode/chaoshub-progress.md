# ChaosHub — Progress Log

## Status: Live at https://rjamartin.github.io/chaoshub/

Last updated: Session 2

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
- [ ] PWA support (vite-plugin-pwa)
- [ ] Self-hosted PeerJS server option
- [ ] Supabase adapter for cross-device profiles
- [ ] Tournament brackets
- [ ] AI player support

---

## Known Issues

1. **Pixi double-init:** `ReactionTestGame.init()` creates its own `PixiApp` AND `<GameCanvas>` creates one. Need to pass the canvas app from `<GameCanvas>` down to the game instance, or have games receive it via `GameContext`.
2. **Network listener timing:** Stores register `networkAdapter.on()` at module import time but `networkAdapter` only has connections after `initAsHost/Client`. Works because listeners are stored in a Map before connections open, but should document this clearly.
3. **TypeScript strict issues:** `exactOptionalPropertyTypes` may cause minor friction with Pixi's TextStyle. Loosen per-file with `// @ts-expect-error` if needed rather than disabling globally.

---

## Deferred Decisions

- Whether to pass `PixiApp` instance via `GameContext` (cleaner) vs. letting each game create its own (simpler for isolation)
- Font loading strategy (currently relies on system fonts; add Google Fonts link in `index.html` for `Space Grotesk`)
