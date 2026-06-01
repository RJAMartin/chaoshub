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
- `[DONE]` `<CountdownOverlay>` component (3, 2, 1, GO!)
- `[DONE]` `<ScoreBoard>` component (post-game results table)
- `[DONE]` Invite link: `?join=CODE` query param auto-triggers join
- `[DONE]` Host: kick player from lobby
- `[DONE]` Mobile nav menu (hamburger) for small screens
- `[DONE]` Loading skeleton states for game library

---

## Phase 3 — PixiJS Integration

- `[DONE]` `<GameCanvas>` mounts/destroys PixiJS Application
- `[DONE]` Resize handler: canvas fills container on window resize
- `[DONE]` Pixi double-init fixed: app passed via GameContext, not created in game
- `[ ]` Asset loader utility (wraps Pixi `Assets`)
- `[ ]` Sprite sheet helpers in `packages/engine`
- `[ ]` Particle system helper (basic, without library)

---

## Phase 4 — Games

### Shipped (36 games)
- `[DONE]` Reaction Test, Ball Push, Pixel War, Music Toy, Type Racer, Color Flood, Simon Says
- `[DONE]` Asteroid Duel, Word Scramble, Snake Battle, Trivia Quiz, Pong Duel, Dodge Blitz
- `[DONE]` Coin Grab, Memory Match, Number Crunch, Drawing Guesser, Wordle Race, Sumo Shove
- `[DONE]` Maze Race, Bomberman, Whack-a-Mole, Button Mash, Battleship, Connect Four
- `[DONE]` Emoji Decode, Hot or Cold, Minesweeper Race, Spelling Bee, Hangman
- `[DONE]` Air Hockey, Breakout Blitz, Pixel Portrait, Platform Runner, Rhythm Tap, Story Chain

### Polish
- `[ ]` Reaction Test: animated countdown in Pixi
- `[ ]` Reaction Test: per-player reaction times overlay
- `[ ]` Reaction Test: sound effect on signal (Web Audio API)

---

## Phase 5 — DX Tooling

- `[DONE]` `pnpm create-game` CLI scaffold
- `[DONE]` VSCode workspace settings (`.vscode/settings.json`)
- `[DONE]` `.vscode/extensions.json` (Volar, ESLint, Tailwind CSS IntelliSense)
- `[DONE]` `.editorconfig`
- `[DONE]` ESLint config (flat config, Vue + TypeScript rules)
- `[DONE]` Prettier config

---

## Phase 6 — Quality & Hardening

- `[ ]` Unit tests: EventBus (emit, on, off, once, no leaks)
- `[ ]` Unit tests: GameRegistry (load, dedup, missing gracefully)
- `[ ]` Unit tests: GameLoop (start, stop, deltaTime)
- `[ ]` Unit tests: AchievementEngine (conditions, no double-unlock)
- `[ ]` Unit tests: StatisticsService
- `[ ]` Integration test: create room → join → start game → end
- `[DONE]` Network: disconnect mid-game UI (host gone → redirect home)
- `[ ]` Network: reconnection with exponential backoff
- `[DONE]` Input validation: room codes, player names (XSS safe)
- `[DONE]` Error boundary component (Vue `onErrorCaptured`)
- `[DONE]` Graceful degradation: PeerJS Cloud unreachable message
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

- `[DONE]` Add Google Fonts link for `Space Grotesk` + `JetBrains Mono` in `index.html`
- `[DONE]` Favicon SVG (`/public/favicon.svg`)
- `[ ]` Update `.opencode/chaoshub-progress.md` at end of every session
