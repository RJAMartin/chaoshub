// ─────────────────────────────────────────────────────────────────────────────
// Game Registry — discovers and manages all GameModule plugins
// Games register themselves by exporting a default GameModule from:
//   src/games/<game-id>/module.ts
// The registry auto-discovers them via Vite's import.meta.glob.
// ─────────────────────────────────────────────────────────────────────────────
import type { GameModule } from '@chaoshub/game-sdk'

class GameRegistry {
  private readonly modules = new Map<string, GameModule>()
  private initialized = false

  /**
   * Load all game modules via Vite glob import.
   * Called once at application bootstrap.
   */
  async init(): Promise<void> {
    if (this.initialized) return
    this.initialized = true

    // Eagerly import all module.ts files under src/games/
    const moduleFiles = import.meta.glob<{ default: GameModule }>(
      '../games/*/module.ts',
      { eager: true }
    )

    for (const [path, mod] of Object.entries(moduleFiles)) {
      const gameModule = mod.default
      if (!gameModule?.id) {
        console.warn(`[GameRegistry] Module at "${path}" missing default export or id — skipped.`)
        continue
      }
      this.register(gameModule)
    }

    console.info(`[GameRegistry] Loaded ${this.modules.size} game(s): ${[...this.modules.keys()].join(', ')}`)
  }

  register(module: GameModule): void {
    if (this.modules.has(module.id)) {
      console.warn(`[GameRegistry] Duplicate game id "${module.id}" — skipping re-registration.`)
      return
    }
    this.modules.set(module.id, module)
  }

  /** Get a specific game module by id. Throws if not found. */
  get(id: string): GameModule {
    const mod = this.modules.get(id)
    if (!mod) throw new Error(`[GameRegistry] Game "${id}" not found.`)
    return mod
  }

  /** Get all registered modules (for game library listing). */
  list(): GameModule[] {
    return [...this.modules.values()]
  }

  has(id: string): boolean {
    return this.modules.has(id)
  }
}

// Global singleton
export const gameRegistry = new GameRegistry()
