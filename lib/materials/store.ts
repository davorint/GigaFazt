/**
 * The master materials list in this browser (localStorage), like the surveys: the first time, the starting list is
 * saved so its ids stay put (surveys point to items by id). Other tabs follow through the storage event.
 */
import { decodeItem, mergeItems, starterCatalog, type Item } from "./catalog"
import { markChanged } from "../sync/state"
import { remapMaterialRefs } from "../survey/store"

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
  markChanged("materials", [it.id])
}
export function deleteItem(id: string) {
  write(items().filter((x) => x.id !== id))
  markChanged("materials", [id], true)
}
/** A list from a file (replaces items with the same id) or the items a survey carries (only adds missing ones). */
export function importItems(incoming: Item[], replace: boolean) {
  const before = new Map(items().map((x) => [x.id, x]))
  const r = mergeItems(items(), incoming, replace)
  write(r.list)
  // What actually changed here (added, or replaced on purpose) is sent.
  markChanged("materials", incoming.filter((x) => !before.has(x.id) || (replace && JSON.stringify(before.get(x.id)) !== JSON.stringify(x))).map((x) => x.id))
  return r
}

/** Records from the database (sync): replaced or removed as they are, not marked as edits to send. */
export function applyRemoteItems(upserts: Item[], deletes: string[]) {
  if (!upserts.length && !deletes.length) return
  const byId = new Map(items().map((x) => [x.id, x]))
  for (const u of upserts) byId.set(u.id, u)
  for (const d of deletes) byId.delete(d)
  write([...byId.values()])
}

/** The database already has this untouched starter item under another id: use that one (surveys follow). */
export function remapItem(from: string, to: string) {
  const list = items()
  const has = list.some((x) => x.id === to)
  write(has ? list.filter((x) => x.id !== from) : list.map((x) => (x.id === from ? { ...x, id: to } : x)))
  remapMaterialRefs(from, to)
}

