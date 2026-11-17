/**
 * Saved deployments in this browser (localStorage): nothing is sent to a
 * server. A small external store for useSyncExternalStore; other tabs stay in
 * step through the storage event. If the browser blocks storage, it works
 * for the visit and says so (`persisted: false`).
 */

import { isSaved, MAX_SAVED, type SavedDeployment } from "./deployments"

const KEY = "gigafazt-mikrotik-deployments"

export type DeploymentStore = {
  /** false until read in the browser (the server and hydration see an empty list). */
  loaded: boolean
  persisted: boolean
  list: SavedDeployment[]
  /** The deployment open last time, opened again on the next visit. */
  lastOpen: string | null
  /** Goes up each time another tab changes the list (that tab's edits to the open deployment are taken here). */
  external: number
}

const SERVER: DeploymentStore = { loaded: false, persisted: true, list: [], lastOpen: null, external: 0 }
let current: DeploymentStore | null = null
const listeners = new Set<() => void>()

function load(): DeploymentStore {
  try {
    const raw = window.localStorage.getItem(KEY)
    const v = raw ? (JSON.parse(raw) as { list?: unknown; lastOpen?: unknown }) : null
    const list = Array.isArray(v?.list) ? v.list.filter(isSaved).slice(0, MAX_SAVED) : []
    return { loaded: true, persisted: true, list, lastOpen: typeof v?.lastOpen === "string" ? v.lastOpen : null, external: current?.external ?? 0 }
  } catch {
    return { loaded: true, persisted: false, list: [], lastOpen: null, external: current?.external ?? 0 }
  }
}

function write(next: Omit<DeploymentStore, "loaded" | "persisted" | "external">) {
  let persisted = true
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ v: 1, list: next.list, lastOpen: next.lastOpen }))
  } catch {
    persisted = false
  }
  current = { ...next, loaded: true, persisted, external: current?.external ?? 0 }
  listeners.forEach((l) => l())
}

export function subscribeDeployments(cb: () => void) {
  listeners.add(cb)
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return
    const external = (current?.external ?? 0) + 1
    current = { ...load(), external }
    cb()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(cb)
    window.removeEventListener("storage", onStorage)
  }
}

export const readDeployments = (): DeploymentStore => (current ??= load())
export const serverDeployments = (): DeploymentStore => SERVER

/** Adds a deployment or updates its data (nothing happens when it didn't change). */
export function putDeployment(id: string, data: string) {
  const s = readDeployments()
  const i = s.list.findIndex((d) => d.id === id)
  if (i >= 0 && s.list[i].data === data) return
  if (i < 0 && s.list.length >= MAX_SAVED) return
  const item = { id, updatedAt: Date.now(), data }
  write({ ...s, list: i >= 0 ? s.list.map((d, k) => (k === i ? item : d)) : [...s.list, item] })
}

export function removeDeployment(id: string) {
  const s = readDeployments()
  write({ list: s.list.filter((d) => d.id !== id), lastOpen: s.lastOpen === id ? null : s.lastOpen })
}

export function setLastOpen(id: string) {
  const s = readDeployments()
  if (s.lastOpen !== id) write({ ...s, lastOpen: id })
}

/** Adds the deployments of a backup file; one with the same id is replaced. Returns how many came in. */
export function importDeployments(items: SavedDeployment[]): number {
  const s = readDeployments()
  const byId = new Map(s.list.map((d) => [d.id, d]))
  let added = 0
  for (const d of items) {
    if (!byId.has(d.id) && byId.size >= MAX_SAVED) continue
    byId.set(d.id, d)
    added++
  }
  write({ ...s, list: [...byId.values()] })
  return added
}
