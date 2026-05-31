// ─────────────────────────────────────────────────────────────────────────────
// EventBus — typed global event bus
// ─────────────────────────────────────────────────────────────────────────────
import type { IEventBus, EventCallback } from '@chaoshub/game-sdk'

class EventBus implements IEventBus {
  private readonly listeners = new Map<string, Set<EventCallback>>()

  on<T = unknown>(event: string, callback: EventCallback<T>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback as EventCallback)
  }

  off<T = unknown>(event: string, callback: EventCallback<T>): void {
    this.listeners.get(event)?.delete(callback as EventCallback)
  }

  emit<T = unknown>(event: string, payload?: T): void {
    this.listeners.get(event)?.forEach((cb) => cb(payload))
  }

  once<T = unknown>(event: string, callback: EventCallback<T>): void {
    const wrapper: EventCallback<T> = (payload) => {
      callback(payload)
      this.off(event, wrapper)
    }
    this.on(event, wrapper)
  }

  /** Remove all listeners for an event. Used during cleanup. */
  clear(event?: string): void {
    if (event) {
      this.listeners.delete(event)
    } else {
      this.listeners.clear()
    }
  }
}

// Global singleton — the platform's single event bus instance
export const eventBus = new EventBus()
export type { EventBus }
