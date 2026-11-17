/**
 * Site surveys saved in this browser (localStorage), like the saved deployments: nothing goes to a server until the
 * Postgres database exists. A small external store for useSyncExternalStore; other tabs follow through the storage
 * event. If the browser blocks storage, the page works for the visit and says so (`persisted: false`).
 */
import { decodeSurvey, mergeSurveys, type Survey } from "./model"

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
}

export function deleteSurvey(id: string) {
  write(list().filter((x) => x.id !== id))
}

/** Surveys from a shared file: added, or replaced when the file's copy is as new or newer. */
export function importSurveys(incoming: Survey[]) {
  const r = mergeSurveys(list(), incoming)
  write([...r.list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
  return r
}
