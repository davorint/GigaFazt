/** Deployment locations saved in this browser (localStorage) and synced through the database (lib/sync), like the surveys. */
import { decodeSite, type Site } from "./model"
import { markChanged } from "../sync/state"

const KEY = "gigafazt-despliegues"

export type SiteStore = { loaded: boolean; persisted: boolean; list: Site[] }

const SERVER: SiteStore = { loaded: false, persisted: true, list: [] }
let current: SiteStore | null = null
const listeners = new Set<() => void>()

function load(): SiteStore {
  try {
    const raw = window.localStorage.getItem(KEY)
    const v = raw ? (JSON.parse(raw) as { list?: unknown }) : null
    const list = Array.isArray(v?.list) ? v.list.map(decodeSite).filter((x): x is Site => x !== null) : []
    return { loaded: true, persisted: true, list }
  } catch {
    return { loaded: true, persisted: false, list: current?.list ?? [] }
  }
}

function write(list: Site[]) {
  let persisted = true
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ v: 1, list }))
  } catch {
    persisted = false
  }
  current = { loaded: true, persisted, list }
  listeners.forEach((l) => l())
}

export function subscribeSites(cb: () => void) {
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

export const sitesSnapshot = (): SiteStore => (current ??= load())
export const sitesServerSnapshot = (): SiteStore => SERVER

const list = () => sitesSnapshot().list

export function saveSite(c: Site) {
  const next = { ...c, updatedAt: new Date().toISOString() }
  const l = list()
  write(l.some((x) => x.id === c.id) ? l.map((x) => (x.id === c.id ? next : x)) : [next, ...l])
  markChanged("sites", [c.id])
}

export function deleteSite(id: string) {
  write(list().filter((x) => x.id !== id))
  markChanged("sites", [id], true)
}

/** Records from the database (sync): replaced or removed as they are, not marked as edits to send. */
export function applyRemoteSites(upserts: Site[], deletes: string[]) {
  if (!upserts.length && !deletes.length) return
  const byId = new Map(list().map((x) => [x.id, x]))
  for (const u of upserts) byId.set(u.id, u)
  for (const d of deletes) byId.delete(d)
  write([...byId.values()])
}
