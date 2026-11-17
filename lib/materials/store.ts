/**
 * The master materials list in this browser (localStorage), like the surveys: the first time, the starting list is
 * saved so its ids stay put (surveys point to items by id). Other tabs follow through the storage event.
 */
import { decodeItem, mergeItems, starterCatalog, type Item } from "./catalog"

const KEY = "gigafazt-materiales"

export type CatalogStore = { loaded: boolean; persisted: boolean; items: Item[] }

const SERVER: CatalogStore = { loaded: false, persisted: true, items: [] }
let current: CatalogStore | null = null
const listeners = new Set<() => void>()

function load(): CatalogStore {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw === null) {
      const items = starterCatalog()
      window.localStorage.setItem(KEY, JSON.stringify({ v: 1, items }))
      return { loaded: true, persisted: true, items }
    }
    const v = JSON.parse(raw) as { items?: unknown }
    const items = Array.isArray(v?.items) ? v.items.map(decodeItem).filter((x): x is Item => x !== null) : []
    return { loaded: true, persisted: true, items }
  } catch {
    return { loaded: true, persisted: false, items: current?.items ?? starterCatalog() }
  }
}

function write(items: Item[]) {
  let persisted = true
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ v: 1, items }))
  } catch {
    persisted = false
  }
  current = { loaded: true, persisted, items }
  listeners.forEach((l) => l())
}

export function subscribeCatalog(cb: () => void) {
  listeners.add(cb)
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return
    current = load()
    cb()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(cb)
    window.removeEventListener("storage", onStorage)
  }
}

export const catalogSnapshot = (): CatalogStore => (current ??= load())
export const catalogServerSnapshot = (): CatalogStore => SERVER

const items = () => catalogSnapshot().items

export function saveItem(it: Item) {
  const list = items()
  write(list.some((x) => x.id === it.id) ? list.map((x) => (x.id === it.id ? it : x)) : [...list, it])
}
export function deleteItem(id: string) {
  write(items().filter((x) => x.id !== id))
}
/** A list from a file (replaces items with the same id) or the items a survey carries (only adds missing ones). */
export function importItems(incoming: Item[], replace: boolean) {
  const r = mergeItems(items(), incoming, replace)
  write(r.list)
  return r
}
