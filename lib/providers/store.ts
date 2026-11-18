/** Providers saved in this browser (localStorage), like the surveys and the materials list. */
import { decodeProvider, mergeProviders, type Provider } from "./model"
import { markChanged } from "../sync/state"

const KEY = "gigafazt-proveedores"

export type ProviderStore = { loaded: boolean; persisted: boolean; list: Provider[] }

const SERVER: ProviderStore = { loaded: false, persisted: true, list: [] }
let current: ProviderStore | null = null
const listeners = new Set<() => void>()

function load(): ProviderStore {
  try {
    const raw = window.localStorage.getItem(KEY)
    const v = raw ? (JSON.parse(raw) as { list?: unknown }) : null
    const list = Array.isArray(v?.list) ? v.list.map(decodeProvider).filter((x): x is Provider => x !== null) : []
    return { loaded: true, persisted: true, list }
  } catch {
    return { loaded: true, persisted: false, list: current?.list ?? [] }
  }
}

function write(list: Provider[]) {
  let persisted = true
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ v: 1, list }))
  } catch {
    persisted = false
  }
  current = { loaded: true, persisted, list }
  listeners.forEach((l) => l())
}

export function subscribeProviders(cb: () => void) {
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

export const providersSnapshot = (): ProviderStore => (current ??= load())
export const providersServerSnapshot = (): ProviderStore => SERVER

const list = () => providersSnapshot().list

export function saveProvider(p: Provider) {
  const next = { ...p, updatedAt: new Date().toISOString() }
  const l = list()
  write(l.some((x) => x.id === p.id) ? l.map((x) => (x.id === p.id ? next : x)) : [...l, next])
  markChanged("providers", [p.id])
}
export function deleteProvider(id: string) {
  write(list().filter((x) => x.id !== id))
  markChanged("providers", [id], true)
}
export function importProviders(incoming: Provider[]) {
  const r = mergeProviders(list(), incoming)
  write(r.list)
  markChanged("providers", incoming.filter((x) => r.list.some((y) => y.id === x.id && y.updatedAt === x.updatedAt)).map((x) => x.id))
  return r
}

/** Records from the database (sync): replaced or removed as they are, not marked as edits to send. */
export function applyRemoteProviders(upserts: Provider[], deletes: string[]) {
  if (!upserts.length && !deletes.length) return
  const byId = new Map(list().map((x) => [x.id, x]))
  for (const u of upserts) byId.set(u.id, u)
  for (const d of deletes) byId.delete(d)
  write([...byId.values()])
}
