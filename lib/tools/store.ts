/**
 * Tools saved in this browser (localStorage) and synced through the database (lib/sync), like the materials list: the
 * first time, the starter list is saved so its fixed ids stay put. Other tabs follow through the storage event.
 */
import { decodeTool, starterTools, type Tool } from "./model"
import { markChanged } from "../sync/state"

const KEY = "gigafazt-herramientas"

export type ToolStore = { loaded: boolean; persisted: boolean; list: Tool[] }

const SERVER: ToolStore = { loaded: false, persisted: true, list: [] }
let current: ToolStore | null = null
const listeners = new Set<() => void>()

function load(): ToolStore {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw === null) {
      const list = starterTools()
      window.localStorage.setItem(KEY, JSON.stringify({ v: 1, list }))
      return { loaded: true, persisted: true, list }
    }
    const v = JSON.parse(raw) as { list?: unknown }
    const list = Array.isArray(v?.list) ? v.list.map(decodeTool).filter((x): x is Tool => x !== null) : []
    return { loaded: true, persisted: true, list }
  } catch {
    return { loaded: true, persisted: false, list: current?.list ?? starterTools() }
  }
}

function write(list: Tool[]) {
  let persisted = true
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ v: 1, list }))
  } catch {
    persisted = false
  }
  current = { loaded: true, persisted, list }
  listeners.forEach((l) => l())
}

export function subscribeTools(cb: () => void) {
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

export const toolsSnapshot = (): ToolStore => (current ??= load())
export const toolsServerSnapshot = (): ToolStore => SERVER

const list = () => toolsSnapshot().list

export function saveTool(x: Tool) {
  const next = { ...x, updatedAt: new Date().toISOString() }
  const l = list()
  write(l.some((y) => y.id === x.id) ? l.map((y) => (y.id === x.id ? next : y)) : [next, ...l])
  markChanged("tools", [x.id])
}

export function deleteTool(id: string) {
  write(list().filter((x) => x.id !== id))
  markChanged("tools", [id], true)
}

/** Records from the database (sync): replaced or removed as they are, not marked as edits to send. */
export function applyRemoteTools(upserts: Tool[], deletes: string[]) {
  if (!upserts.length && !deletes.length) return
  const byId = new Map(list().map((x) => [x.id, x]))
  for (const u of upserts) byId.set(u.id, u)
  for (const d of deletes) byId.delete(d)
  write([...byId.values()])
}
