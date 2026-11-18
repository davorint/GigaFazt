/**
 * Site surveys saved in this browser (localStorage), like the saved deployments: nothing goes to a server until the
 * Postgres database exists. A small external store for useSyncExternalStore; other tabs follow through the storage
 * event. If the browser blocks storage, the page works for the visit and says so (`persisted: false`).
 */
import { decodeSurvey, mergeSurveys, type Survey } from "./model"
import { markChanged } from "../sync/state"

const KEY = "gigafazt-levantamientos"

export type SurveyStore = { loaded: boolean; persisted: boolean; list: Survey[] }

const SERVER: SurveyStore = { loaded: false, persisted: true, list: [] }
let current: SurveyStore | null = null
const listeners = new Set<() => void>()

function load(): SurveyStore {
  try {
    const raw = window.localStorage.getItem(KEY)
    const v = raw ? (JSON.parse(raw) as { list?: unknown }) : null
    const list = Array.isArray(v?.list) ? v.list.map(decodeSurvey).filter((s): s is Survey => s !== null) : []
    return { loaded: true, persisted: true, list }
  } catch {
    return { loaded: true, persisted: false, list: current?.list ?? [] }
  }
}

function write(list: Survey[]) {
  let persisted = true
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ v: 1, list }))
  } catch {
    persisted = false
  }
  current = { loaded: true, persisted, list }
  listeners.forEach((l) => l())
}

export function subscribeSurveys(cb: () => void) {
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

export const surveysSnapshot = (): SurveyStore => (current ??= load())
export const surveysServerSnapshot = (): SurveyStore => SERVER

const list = () => surveysSnapshot().list

/** Saves a survey (new or edited), stamping when it changed. Newest first. */
export function saveSurvey(s: Survey) {
  const next = { ...s, updatedAt: new Date().toISOString() }
  write([next, ...list().filter((x) => x.id !== s.id)])
  markChanged("surveys", [s.id])
}

export function deleteSurvey(id: string) {
  write(list().filter((x) => x.id !== id))
  markChanged("surveys", [id], true)
}

/** Surveys from a shared file: added, or replaced when the file's copy is as new or newer. */
export function importSurveys(incoming: Survey[]) {
  const r = mergeSurveys(list(), incoming)
  write([...r.list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
  // The copies that came in (new, or newer than ours) are edits to send.
  markChanged("surveys", incoming.filter((x) => r.list.some((y) => y.id === x.id && y.updatedAt === x.updatedAt)).map((x) => x.id))
  return r
}

/** Records from the database (sync): replaced or removed as they are, not marked as edits to send. */
export function applyRemoteSurveys(upserts: Survey[], deletes: string[]) {
  if (!upserts.length && !deletes.length) return
  const byId = new Map(list().map((x) => [x.id, x]))
  for (const u of upserts) byId.set(u.id, u)
  for (const d of deletes) byId.delete(d)
  write([...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
}

/** A material's id changed (merged with the database's copy): the surveys that pick it follow, and are sent. */
export function remapMaterialRefs(from: string, to: string) {
  const changed: string[] = []
  const next = list().map((s) => {
    const m = s.materials
    const uses = Object.values(m.pick).includes(from) || m.extras.some((x) => x.itemId === from)
    if (!uses) return s
    changed.push(s.id)
    const pick = Object.fromEntries(Object.entries(m.pick).map(([k, v]) => [k, v === from ? to : v]))
    return { ...s, materials: { ...m, pick, extras: m.extras.map((x) => (x.itemId === from ? { ...x, itemId: to } : x)) } }
  })
  if (!changed.length) return
  write(next)
  markChanged("surveys", changed)
}
