#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// pnpm create-game — scaffolds a new ChaosHub game from a template
// Usage: pnpm create-game
// ─────────────────────────────────────────────────────────────────────────────
import { createInterface } from 'readline'
import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const gamesDir = resolve(__dirname, '../apps/web/src/games')

const rl = createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => new Promise((res) => rl.question(q, res))

console.log('\n⚡ ChaosHub Game Generator\n')

const id = (await ask('  Game ID (kebab-case, e.g. "ball-push"): ')).trim()
if (!id || !/^[a-z][a-z0-9-]+$/.test(id)) {
  console.error('  ✗ Invalid ID. Use lowercase letters, numbers, and hyphens.')
  process.exit(1)
}

const name = (await ask(`  Display name (e.g. "Ball Push"): `)).trim()
const description = (await ask(`  Short description: `)).trim()
const multiStr = (await ask(`  Supports multiplayer? (y/n): `)).trim().toLowerCase()
const soloStr = (await ask(`  Supports single player? (y/n): `)).trim().toLowerCase()
const minPlayers = parseInt((await ask(`  Min players (default 1): `)).trim() || '1', 10)
const maxPlayers = parseInt((await ask(`  Max players (default 8): `)).trim() || '8', 10)

rl.close()

const supportsMultiplayer = multiStr !== 'n'
const supportsSinglePlayer = soloStr !== 'n'
const gameDir = resolve(gamesDir, id)

if (existsSync(gameDir)) {
  console.error(`\n  ✗ Game "${id}" already exists at ${gameDir}`)
  process.exit(1)
}

mkdirSync(gameDir, { recursive: true })

// module.ts
writeFileSync(resolve(gameDir, 'module.ts'), `import type { GameModule, GameContext } from '@chaoshub/game-sdk'
import { ${toPascalCase(id)}Game } from './${id}.game.js'

const module: GameModule = {
  id: '${id}',
  name: '${name}',
  description: '${description}',
  minPlayers: ${minPlayers},
  maxPlayers: ${maxPlayers},
  supportsSinglePlayer: ${supportsSinglePlayer},
  supportsMultiplayer: ${supportsMultiplayer},
  tags: [],
  create: (context: GameContext) => new ${toPascalCase(id)}Game(context),
}

export default module
`)

// game.ts
writeFileSync(resolve(gameDir, `${id}.game.ts`), `import type { GameContext, GameInstance } from '@chaoshub/game-sdk'
import { Application as PixiApp } from 'pixi.js'

export class ${toPascalCase(id)}Game implements GameInstance {
  private ctx: GameContext
  private app: PixiApp | null = null

  constructor(context: GameContext) {
    this.ctx = context
  }

  async init(): Promise<void> {
    this.app = new PixiApp()
    await this.app.init({
      backgroundColor: 0x0a0a0f,
      resizeTo: document.querySelector('.game-canvas-container') as HTMLElement ?? window,
    })
    const container = document.querySelector('.game-canvas-container')
    if (container) container.appendChild(this.app.canvas)

    // TODO: build your scene here
  }

  update(_deltaTime: number): void {
    // TODO: per-frame game logic
  }

  destroy(): void {
    this.app?.destroy(true, { children: true })
    this.app = null
  }
}
`)

console.log(`\n  ✓ Game "${id}" created at apps/web/src/games/${id}/`)
console.log(`  → Edit module.ts and ${id}.game.ts to implement your game.`)
console.log(`  → It will auto-register when the app starts.\n`)

function toPascalCase(str) {
  return str.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join('')
}
