import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AchievementEngine, type AchievementDefinition } from '@/core/services/achievements/achievement-engine'
import { StatisticsService } from '@/core/services/statistics/statistics-service'
import { eventBus } from '@/core/events/event-bus'
import { PlatformEvents } from '@/core/events/platform-events'

function makeLocalStorageMock() {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
    get length() { return Object.keys(store).length },
    key: (i: number) => Object.keys(store)[i] ?? null,
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', makeLocalStorageMock())
})

function makeEngine(extra: AchievementDefinition[] = []) {
  const engine = new AchievementEngine()
  // Clear built-ins and use only test definitions for isolation
  ;(engine as unknown as { definitions: Map<string, AchievementDefinition> }).definitions.clear()
  for (const def of extra) {
    ;(engine as unknown as { definitions: Map<string, AchievementDefinition> }).definitions.set(def.id, def)
  }
  return engine
}

const winOneAch: AchievementDefinition = {
  id: 'win-one',
  name: 'First Win',
  description: 'Win a game',
  icon: '🏆',
  condition: (s) => s.wins >= 1,
}

const play10Ach: AchievementDefinition = {
  id: 'play-10',
  name: 'Veteran',
  description: 'Play 10 games',
  icon: '🎮',
  condition: (s) => s.gamesPlayed >= 10,
}

describe('AchievementEngine', () => {
  it('starts with no unlocked achievements', () => {
    const engine = makeEngine([winOneAch])
    expect(engine.getUnlocked()).toHaveLength(0)
  })

  it('isUnlocked() returns false before unlock', () => {
    const engine = makeEngine([winOneAch])
    expect(engine.isUnlocked('win-one')).toBe(false)
  })

  it('unlock() marks achievement as unlocked', () => {
    const engine = makeEngine([winOneAch])
    engine.unlock('win-one')
    expect(engine.isUnlocked('win-one')).toBe(true)
  })

  it('unlock() emits ACHIEVEMENT_UNLOCKED event', () => {
    const engine = makeEngine([winOneAch])
    const cb = vi.fn()
    eventBus.on(PlatformEvents.ACHIEVEMENT_UNLOCKED, cb)
    engine.unlock('win-one')
    eventBus.off(PlatformEvents.ACHIEVEMENT_UNLOCKED, cb)
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ achievementId: 'win-one', name: 'First Win' }))
  })

  it('does not double-unlock: unlock() is idempotent', () => {
    const engine = makeEngine([winOneAch])
    const cb = vi.fn()
    eventBus.on(PlatformEvents.ACHIEVEMENT_UNLOCKED, cb)
    engine.unlock('win-one')
    engine.unlock('win-one')
    eventBus.off(PlatformEvents.ACHIEVEMENT_UNLOCKED, cb)
    expect(cb).toHaveBeenCalledOnce()
  })

  it('unlock() warns and does nothing for unknown id', () => {
    const engine = makeEngine([])
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    engine.unlock('nonexistent')
    expect(engine.isUnlocked('nonexistent')).toBe(false)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('getUnlocked() returns unlocked achievement definitions', () => {
    const engine = makeEngine([winOneAch, play10Ach])
    engine.unlock('win-one')
    const unlocked = engine.getUnlocked()
    expect(unlocked).toHaveLength(1)
    expect(unlocked[0]!.id).toBe('win-one')
  })

  it('getAll() returns all registered definitions', () => {
    const engine = makeEngine([winOneAch, play10Ach])
    expect(engine.getAll()).toHaveLength(2)
  })

  it('evaluate() unlocks achievement when condition is met', () => {
    const engine = makeEngine([winOneAch])
    const svc = new StatisticsService('eval-game')
    svc.record('win')
    engine.evaluate()
    expect(engine.isUnlocked('win-one')).toBe(true)
  })

  it('evaluate() does not unlock when condition is not met', () => {
    const engine = makeEngine([play10Ach])
    const svc = new StatisticsService('eval-game')
    svc.record('play') // only 1, need 10
    engine.evaluate()
    expect(engine.isUnlocked('play-10')).toBe(false)
  })

  it('evaluate() does not re-unlock already-unlocked achievement', () => {
    const engine = makeEngine([winOneAch])
    const cb = vi.fn()
    eventBus.on(PlatformEvents.ACHIEVEMENT_UNLOCKED, cb)
    const svc = new StatisticsService('eval-game')
    svc.record('win')
    engine.evaluate()
    engine.evaluate() // second call — already unlocked
    eventBus.off(PlatformEvents.ACHIEVEMENT_UNLOCKED, cb)
    expect(cb).toHaveBeenCalledOnce()
  })

  it('unlocks persist across new engine instances (same localStorage)', () => {
    const engine1 = makeEngine([winOneAch])
    engine1.unlock('win-one')
    const engine2 = makeEngine([winOneAch])
    expect(engine2.isUnlocked('win-one')).toBe(true)
  })
})
