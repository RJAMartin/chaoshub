import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventBus } from '@/core/events/event-bus'

// Fresh instance per test — avoids cross-test pollution with the global singleton
function makeBus() {
  return new EventBus()
}

describe('EventBus', () => {
  let bus: EventBus

  beforeEach(() => {
    bus = makeBus()
  })

  it('calls a registered listener when event is emitted', () => {
    const cb = vi.fn()
    bus.on('test', cb)
    bus.emit('test', { value: 42 })
    expect(cb).toHaveBeenCalledOnce()
    expect(cb).toHaveBeenCalledWith({ value: 42 })
  })

  it('calls multiple listeners for the same event', () => {
    const a = vi.fn(), b = vi.fn()
    bus.on('evt', a)
    bus.on('evt', b)
    bus.emit('evt', 'payload')
    expect(a).toHaveBeenCalledWith('payload')
    expect(b).toHaveBeenCalledWith('payload')
  })

  it('does not call listener after off()', () => {
    const cb = vi.fn()
    bus.on('evt', cb)
    bus.off('evt', cb)
    bus.emit('evt')
    expect(cb).not.toHaveBeenCalled()
  })

  it('does not throw when emitting an event with no listeners', () => {
    expect(() => bus.emit('no-listeners', 'data')).not.toThrow()
  })

  it('once() fires exactly one time', () => {
    const cb = vi.fn()
    bus.once('once-evt', cb)
    bus.emit('once-evt', 1)
    bus.emit('once-evt', 2)
    bus.emit('once-evt', 3)
    expect(cb).toHaveBeenCalledOnce()
    expect(cb).toHaveBeenCalledWith(1)
  })

  it('clear(event) removes all listeners for that event only', () => {
    const a = vi.fn(), b = vi.fn()
    bus.on('evtA', a)
    bus.on('evtB', b)
    bus.clear('evtA')
    bus.emit('evtA')
    bus.emit('evtB')
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledOnce()
  })

  it('clear() with no arg removes all listeners', () => {
    const a = vi.fn(), b = vi.fn()
    bus.on('evtA', a)
    bus.on('evtB', b)
    bus.clear()
    bus.emit('evtA')
    bus.emit('evtB')
    expect(a).not.toHaveBeenCalled()
    expect(b).not.toHaveBeenCalled()
  })

  it('adding the same callback twice only registers it once', () => {
    const cb = vi.fn()
    bus.on('evt', cb)
    bus.on('evt', cb) // duplicate
    bus.emit('evt')
    expect(cb).toHaveBeenCalledOnce()
  })

  it('does not call other event listeners when a different event fires', () => {
    const cb = vi.fn()
    bus.on('evtA', cb)
    bus.emit('evtB')
    expect(cb).not.toHaveBeenCalled()
  })

  it('payload is undefined when emitted without data', () => {
    const cb = vi.fn()
    bus.on('bare', cb)
    bus.emit('bare')
    expect(cb).toHaveBeenCalledWith(undefined)
  })
})
