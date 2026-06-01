import { describe, it, expect, beforeEach, vi } from 'vitest'
import { StatisticsService } from '@/core/services/statistics/statistics-service'

// In-memory localStorage mock — jsdom's localStorage.clear() may not be available
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

describe('StatisticsService', () => {
  it('returns default stats for a new game', () => {
    const svc = new StatisticsService('test-game')
    expect(svc.getStats()).toEqual({ gamesPlayed: 0, wins: 0, losses: 0, totalPlaytimeMs: 0 })
  })

  it('record("play") increments gamesPlayed', () => {
    const svc = new StatisticsService('test-game')
    svc.record('play')
    expect(svc.getStats().gamesPlayed).toBe(1)
  })

  it('record("play", ms) adds playtime', () => {
    const svc = new StatisticsService('test-game')
    svc.record('play', 5000)
    expect(svc.getStats().totalPlaytimeMs).toBe(5000)
  })

  it('record("win") increments wins', () => {
    const svc = new StatisticsService('test-game')
    svc.record('win')
    expect(svc.getStats().wins).toBe(1)
  })

  it('record("loss") increments losses', () => {
    const svc = new StatisticsService('test-game')
    svc.record('loss')
    expect(svc.getStats().losses).toBe(1)
  })

  it('accumulates multiple events', () => {
    const svc = new StatisticsService('test-game')
    svc.record('play'); svc.record('win')
    svc.record('play'); svc.record('loss')
    const stats = svc.getStats()
    expect(stats.gamesPlayed).toBe(2)
    expect(stats.wins).toBe(1)
    expect(stats.losses).toBe(1)
  })

  it('getGlobalStats() reflects recorded events', () => {
    const svc = new StatisticsService('game-a')
    svc.record('play'); svc.record('win')
    const global = StatisticsService.getGlobalStats()
    expect(global.gamesPlayed).toBe(1)
    expect(global.wins).toBe(1)
  })

  it('global stats aggregate across different game instances', () => {
    const a = new StatisticsService('game-a')
    const b = new StatisticsService('game-b')
    a.record('play'); a.record('win')
    b.record('play'); b.record('loss')
    const global = StatisticsService.getGlobalStats()
    expect(global.gamesPlayed).toBe(2)
    expect(global.wins).toBe(1)
    expect(global.losses).toBe(1)
  })

  it('per-game stats are isolated from other games', () => {
    const a = new StatisticsService('game-a')
    const b = new StatisticsService('game-b')
    a.record('play'); a.record('win')
    b.record('play'); b.record('loss')
    expect(a.getStats().gamesPlayed).toBe(1)
    expect(a.getStats().wins).toBe(1)
    expect(b.getStats().gamesPlayed).toBe(1)
    expect(b.getStats().losses).toBe(1)
  })

  it('getStatsForGame() returns correct stats', () => {
    const svc = new StatisticsService('my-game')
    svc.record('play'); svc.record('win')
    const s = StatisticsService.getStatsForGame('my-game')
    expect(s.gamesPlayed).toBe(1)
    expect(s.wins).toBe(1)
  })

  it('stats persist across new service instances (same gameId)', () => {
    const svc1 = new StatisticsService('persistent-game')
    svc1.record('play'); svc1.record('win')
    const svc2 = new StatisticsService('persistent-game')
    expect(svc2.getStats().wins).toBe(1)
  })
})
