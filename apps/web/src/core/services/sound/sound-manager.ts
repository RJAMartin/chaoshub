// ─────────────────────────────────────────────────────────────────────────────
// SoundManager — Web Audio API helper for games
// Provides simple beep/tone generation. All methods are no-ops if the
// AudioContext cannot be created (e.g. in test environments).
// Must call resume() inside a user gesture before sounds will play.
// ─────────────────────────────────────────────────────────────────────────────

export interface SoundAPI {
  /** Play a short beep at the given frequency (Hz) and duration (s). */
  beep(frequency: number, duration: number, volume?: number): void
  /** Play a success chime (ascending notes). */
  success(): void
  /** Play a failure buzz. */
  fail(): void
  /** Resume AudioContext if it was suspended (call inside a user gesture). */
  resume(): Promise<void>
}

class SoundManager implements SoundAPI {
  private ctx: AudioContext | null = null

  private getCtx(): AudioContext | null {
    if (this.ctx) return this.ctx
    try {
      this.ctx = new AudioContext()
    } catch {
      // AudioContext not available (e.g., SSR or restricted env)
    }
    return this.ctx
  }

  async resume(): Promise<void> {
    const ctx = this.getCtx()
    if (ctx && ctx.state === 'suspended') await ctx.resume()
  }

  beep(frequency = 440, duration = 0.1, volume = 0.2): void {
    const ctx = this.getCtx()
    if (!ctx) return
    try {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = frequency
      gain.gain.setValueAtTime(volume, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + duration)
    } catch { /* ignore audio errors */ }
  }

  success(): void {
    // Ascending three-note chime
    this.beep(523, 0.08, 0.15)  // C5
    setTimeout(() => this.beep(659, 0.08, 0.15), 90)   // E5
    setTimeout(() => this.beep(784, 0.12, 0.15), 180)  // G5
  }

  fail(): void {
    this.beep(220, 0.15, 0.2)
    setTimeout(() => this.beep(180, 0.2, 0.15), 100)
  }
}

// Singleton — shared across all games via GameContext
export const soundManager = new SoundManager()
export { SoundManager }
