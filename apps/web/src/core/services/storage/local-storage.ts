// ─────────────────────────────────────────────────────────────────────────────
// LocalStorage Adapter — implements StorageAPI using browser localStorage
// All keys are namespaced: "chaoshub:<namespace>:<key>"
// ─────────────────────────────────────────────────────────────────────────────
import type { StorageAPI } from '@chaoshub/game-sdk'

export class LocalStorageAdapter implements StorageAPI {
  private readonly prefix: string

  constructor(namespace: string) {
    this.prefix = `chaoshub:${namespace}`
  }

  private fullKey(key: string): string {
    return `${this.prefix}:${key}`
  }

  get<T = unknown>(key: string): T | null {
    try {
      const raw = localStorage.getItem(this.fullKey(key))
      if (raw === null) return null
      return JSON.parse(raw) as T
    } catch {
      console.warn(`[Storage] Failed to read key "${key}"`)
      return null
    }
  }

  set<T = unknown>(key: string, value: T): void {
    try {
      localStorage.setItem(this.fullKey(key), JSON.stringify(value))
    } catch {
      console.warn(`[Storage] Failed to write key "${key}" — storage may be full.`)
    }
  }

  remove(key: string): void {
    localStorage.removeItem(this.fullKey(key))
  }

  clear(): void {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(this.prefix)) keysToRemove.push(k)
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k))
  }
}

/** Create a namespaced storage instance for a game or system service. */
export function createStorage(namespace: string): StorageAPI {
  return new LocalStorageAdapter(namespace)
}
