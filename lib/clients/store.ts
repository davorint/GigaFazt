/** Subscribers saved in this browser (localStorage) and synced through the database (lib/sync), like the surveys. */
import { decodeClient, mergeClients, type Client } from "./model"
import { markChanged } from "../sync/state"

const KEY = "gigafazt-clientes"

export type ClientStore = { loaded: boolean; persisted: boolean; list: Client[] }

const SERVER: ClientStore = { loaded: false, persisted: true, list: [] }
let current: ClientStore | null = null
const listeners = new Set<() => void>()

function load(): ClientStore {
  try {
    const raw = window.localStorage.getItem(KEY)
    const v = raw ? (JSON.parse(raw) as { list?: unknown }) : null
    const list = Array.isArray(v?.list) ? v.list.map(decodeClient).filter((x): x is Client => x !== null) : []
    return { loaded: true, persisted: true, list }
  } catch {
    return { loaded: true, persisted: false, list: current?.list ?? [] }
  }
}

function write(list: Client[]) {
  let persisted = true
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ v: 1, list }))
  } catch {
    persisted = false
  }
  current = { loaded: true, persisted, list }
  listeners.forEach((l) => l())
}

export function subscribeClients(cb: () => void) {
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

export const clientsSnapshot = (): ClientStore => (current ??= load())
export const clientsServerSnapshot = (): ClientStore => SERVER

const list = () => clientsSnapshot().list

export function saveClient(c: Client) {
  const next = { ...c, updatedAt: new Date().toISOString() }
  const l = list()
  write(l.some((x) => x.id === c.id) ? l.map((x) => (x.id === c.id ? next : x)) : [next, ...l])
  markChanged("clients", [c.id])
}

/** Several clients changed at once (light readings from the OLT): one write, one sync mark. */
export function saveClients(changed: Client[]) {
  if (!changed.length) return
  const now = new Date().toISOString()
  const byId = new Map(changed.map((c) => [c.id, { ...c, updatedAt: now }]))
  write(list().map((x) => byId.get(x.id) ?? x))
  markChanged("clients", [...byId.keys()])
}

export function deleteClient(id: string) {
  write(list().filter((x) => x.id !== id))
  markChanged("clients", [id], true)
}

/** Imported clients: new ones added, known ones (same PPPoE user, or name + building + apartment) only filled. */
export function importClients(incoming: Client[]) {
  const now = new Date().toISOString()
  const r = mergeClients(list(), incoming)
  const touched = new Set([...r.added, ...r.filled].map((x) => x.id))
  write(r.list.map((x) => (touched.has(x.id) ? { ...x, updatedAt: now } : x)))
  markChanged("clients", [...touched])
  return { added: r.added.length, filled: r.filled.length, same: r.same }
}

/** Records from the database (sync): replaced or removed as they are, not marked as edits to send. */
export function applyRemoteClients(upserts: Client[], deletes: string[]) {
  if (!upserts.length && !deletes.length) return
  const byId = new Map(list().map((x) => [x.id, x]))
  for (const u of upserts) byId.set(u.id, u)
  for (const d of deletes) byId.delete(d)
  write([...byId.values()])
}
