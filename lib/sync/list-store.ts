/**
 * A list of records saved in this browser (localStorage) and synced through the database (lib/sync), the same way
 * the clients or locations are, for the lists added later (stock movements, units, client reports). Other tabs follow
 * through the storage event; every local save or delete is marked for the sync engine.
 */
import { markChanged } from "./state"
import type { SyncKind } from "./protocol"

export type ListStore<T> = { loaded: boolean; persisted: boolean; list: T[] }

export function createListStore<T extends { id: string; updatedAt: string }>(key: string, kind: SyncKind, decode: (v: unknown) => T | null) {
  const SERVER: ListStore<T> = { loaded: false, persisted: true, list: [] }
  let current: ListStore<T> | null = null
  const listeners = new Set<() => void>()

  function load(): ListStore<T> {
    try {
      const raw = window.localStorage.getItem(key)
      const v = raw ? (JSON.parse(raw) as { list?: unknown }) : null
      const list = Array.isArray(v?.list) ? v.list.map(decode).filter((x): x is T => x !== null) : []
      return { loaded: true, persisted: true, list }
    } catch {
      return { loaded: true, persisted: false, list: current?.list ?? [] }
    }
  }
  function write(list: T[]) {
    let persisted = true
    try {
      window.localStorage.setItem(key, JSON.stringify({ v: 1, list }))
    } catch {
      persisted = false
    }
    current = { loaded: true, persisted, list }
    listeners.forEach((l) => l())
  }
  const snapshot = (): ListStore<T> => (current ??= load())
  const list = () => snapshot().list

  return {
    subscribe(cb: () => void) {
      listeners.add(cb)
      const onStorage = (e: StorageEvent) => {
        if (e.key !== key) return
        current = load()
        cb()
      }
      window.addEventListener("storage", onStorage)
      return () => {
        listeners.delete(cb)
        window.removeEventListener("storage", onStorage)
      }
    },
    snapshot,
    serverSnapshot: (): ListStore<T> => SERVER,
    list,
    /** Saves several records at once (one movement with its units, an installation's lines). */
    save(...items: T[]) {
      if (!items.length) return
      const now = new Date().toISOString()
      const byId = new Map(list().map((x) => [x.id, x]))
      const fresh: T[] = []
      for (const it of items) {
        const next = { ...it, updatedAt: now }
        if (byId.has(it.id)) byId.set(it.id, next)
        else fresh.push(next)
      }
      const merged = list().map((x) => byId.get(x.id) ?? x)
      write([...fresh, ...merged])
      markChanged(kind, items.map((x) => x.id))
    },
    remove(...ids: string[]) {
      if (!ids.length) return
      write(list().filter((x) => !ids.includes(x.id)))
      markChanged(kind, ids, true)
    },
    /** Records from the database (sync): replaced or removed as they are, not marked as edits to send. */
    applyRemote(upserts: T[], deletes: string[]) {
      if (!upserts.length && !deletes.length) return
      const byId = new Map(list().map((x) => [x.id, x]))
      for (const u of upserts) byId.set(u.id, u)
      for (const d of deletes) byId.delete(d)
      write([...byId.values()])
    },
  }
}
