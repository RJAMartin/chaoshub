import { describe, it, expect, beforeEach } from 'vitest'
import { GameRegistry } from '@/core/registry/game-registry'
import type { GameModule, GameContext } from '@chaoshub/game-sdk'

function makeModule(id: string, overrides: Partial<GameModule> = {}): GameModule {
  return {
    id,
    name: `Game ${id}`,
    description: 'Test game',
    minPlayers: 1,
    maxPlayers: 4,
    supportsSinglePlayer: true,
    supportsMultiplayer: true,
    tags: ['test'],
    create: (_ctx: GameContext) => ({ init: async () => {}, update: () => {}, destroy: () => {} }),
    ...overrides,
  }
}

describe('GameRegistry', () => {
  let registry: GameRegistry

  beforeEach(() => {
    registry = new GameRegistry()
  })

  it('starts empty', () => {
    expect(registry.list()).toHaveLength(0)
  })

  it('registers a module and lists it', () => {
    registry.register(makeModule('foo'))
    const list = registry.list()
    expect(list).toHaveLength(1)
    expect(list[0]!.id).toBe('foo')
  })

  it('get() returns the registered module', () => {
    registry.register(makeModule('bar'))
    const mod = registry.get('bar')
    expect(mod.id).toBe('bar')
    expect(mod.name).toBe('Game bar')
  })

  it('get() throws for unknown id', () => {
    expect(() => registry.get('unknown')).toThrowError(/not found/)
  })

  it('has() returns true for registered id', () => {
    registry.register(makeModule('baz'))
    expect(registry.has('baz')).toBe(true)
  })

  it('has() returns false for unknown id', () => {
    expect(registry.has('nope')).toBe(false)
  })

  it('does not register duplicate ids (first registration wins)', () => {
    const first = makeModule('dup', { name: 'First' })
    const second = makeModule('dup', { name: 'Second' })
    registry.register(first)
    registry.register(second) // should be ignored
    expect(registry.list()).toHaveLength(1)
    expect(registry.get('dup').name).toBe('First')
  })

  it('registers multiple distinct modules', () => {
    registry.register(makeModule('a'))
    registry.register(makeModule('b'))
    registry.register(makeModule('c'))
    expect(registry.list()).toHaveLength(3)
  })

  it('list() returns all modules as an array', () => {
    registry.register(makeModule('x'))
    registry.register(makeModule('y'))
    const ids = registry.list().map((m) => m.id)
    expect(ids).toContain('x')
    expect(ids).toContain('y')
  })
})
