// ─────────────────────────────────────────────────────────────────────────────
// GameLoop — manages the requestAnimationFrame loop for active games
// ─────────────────────────────────────────────────────────────────────────────
import type { GameInstance } from '@chaoshub/game-sdk'

const MAX_DELTA_TIME = 1 / 10 // cap at 100ms to prevent spiral of death

export type GameLoopState = 'idle' | 'running' | 'paused'

class GameLoop {
  private instance: GameInstance | null = null
  private rafId: number | null = null
  private lastTimestamp: number | null = null
  private _state: GameLoopState = 'idle'

  // Dev-mode FPS tracking
  private frameCount = 0
  private fpsAccumulator = 0
  private _fps = 0

  get state(): GameLoopState {
    return this._state
  }

  get fps(): number {
    return this._fps
  }

  start(instance: GameInstance): void {
    if (this._state !== 'idle') {
      console.warn('[GameLoop] Already running. Call stop() first.')
      return
    }
    this.instance = instance
    this._state = 'running'
    this.lastTimestamp = null
    this.rafId = requestAnimationFrame(this.tick)
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.instance = null
    this.lastTimestamp = null
    this._state = 'idle'
    this.frameCount = 0
    this.fpsAccumulator = 0
    this._fps = 0
  }

  pause(): void {
    if (this._state !== 'running') return
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this._state = 'paused'
    this.lastTimestamp = null
  }

  resume(): void {
    if (this._state !== 'paused') return
    this._state = 'running'
    this.rafId = requestAnimationFrame(this.tick)
  }

  private readonly tick = (timestamp: number): void => {
    if (this._state !== 'running' || !this.instance) return

    // Calculate delta time in seconds
    const lastTs = this.lastTimestamp ?? timestamp
    const rawDelta = (timestamp - lastTs) / 1000
    const deltaTime = Math.min(rawDelta, MAX_DELTA_TIME)
    this.lastTimestamp = timestamp

    // FPS counter (dev)
    if (import.meta.env.DEV) {
      this.frameCount++
      this.fpsAccumulator += deltaTime
      if (this.fpsAccumulator >= 1) {
        this._fps = Math.round(this.frameCount / this.fpsAccumulator)
        this.frameCount = 0
        this.fpsAccumulator = 0
      }
    }

    this.instance.update(deltaTime)
    this.rafId = requestAnimationFrame(this.tick)
  }
}

// Global singleton
export const gameLoop = new GameLoop()
