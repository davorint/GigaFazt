/**
 * What this browser knows about syncing (localStorage, read fresh on every use so several tabs agree): the name the
 * phone gave ("¿Quién eres?"), the last `rev` pulled per kind, and per record the server version it was based on and
 * whether it has edits not sent yet. The stores call `markChanged` on every local save, delete and import; the engine
 * (engine.ts) listens and sends.
 *
 * Records this browser had before syncing existed have no entry here and aren't sent until "Subir lo de este
 * navegador" (`adoptLocal`), so a phone never pushes old data by surprise.
 */
import type { SyncKind } from "./protocol"
import { SYNC_KINDS } from "./protocol"

const KEY = "gigafazt-sync"

export type Meta = {
  /** Server version this copy is based on; null = never synced. */
  v: number | null
  /** Edits not sent yet (a counter: an edit made while a send is in flight keeps it dirty). */
  dirty: number
  del?: boolean
  /** When it was last edited here (ISO). */
  at: string
}
export type SyncState = {
  name: string
  adopted: boolean
  rev: Record<SyncKind, number>
  meta: Record<SyncKind, Record<string, Meta>>
}

const empty = (): SyncState => ({
  name: "",
  adopted: false,
  rev: { surveys: 0, materials: 0, providers: 0, clients: 0, sites: 0, tools: 0, stock: 0, units: 0, reports: 0 },
  meta: { surveys: {}, materials: {}, providers: {}, clients: {}, sites: {}, tools: {}, stock: {}, units: {}, reports: {} },
})

export function readState(): SyncState {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return empty()
    const v = JSON.parse(raw) as Partial<SyncState>
    const s = empty()
    if (typeof v.name === "string") s.name = v.name.slice(0, 40)
    s.adopted = v.adopted === true
    for (const k of SYNC_KINDS) {
      const r = v.rev?.[k]
      if (typeof r === "number" && Number.isFinite(r) && r >= 0) s.rev[k] = r
      const m = v.meta?.[k]
      if (m && typeof m === "object") s.meta[k] = m
    }
    return s
  } catch {
    return empty()
  }
}

const listeners = new Set<() => void>()
/** Called after every change to the sync state (UI) and every local edit (engine). */
export function onSyncChange(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
const emit = () => listeners.forEach((l) => l())

export function writeState(s: SyncState) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // Storage blocked: the stores already say so; sync just won't remember between visits.
  }
  emit()
}

/** Changes the state read fresh from storage (several tabs share it). */
export function updateState(fn: (s: SyncState) => void) {
  const s = readState()
  fn(s)
  writeState(s)
}

/** A local save, delete or import: these records have edits to send. */
export function markChanged(kind: SyncKind, ids: string[], deleted = false) {
  if (typeof window === "undefined" || !ids.length) return
  const at = new Date().toISOString()
  updateState((s) => {
    for (const id of ids) {
      const m = s.meta[kind][id]
      s.meta[kind][id] = { v: m?.v ?? null, dirty: (m?.dirty ?? 0) + 1, del: deleted || undefined, at }
    }
  })
}

export function setName(name: string) {
  updateState((s) => {
    s.name = name.trim().slice(0, 40)
  })
}

/** "Subir lo de este navegador": every local record not known to sync becomes a change to send. */
export function adoptLocal(local: Record<SyncKind, string[]>) {
  const at = new Date().toISOString()
  updateState((s) => {
    for (const k of SYNC_KINDS) for (const id of local[k]) if (!s.meta[k][id]) s.meta[k][id] = { v: null, dirty: 1, at }
    s.adopted = true
  })
}

/** How many records have edits not sent yet. */
export const pendingCount = (s: SyncState) => SYNC_KINDS.reduce((n, k) => n + Object.values(s.meta[k]).filter((m) => m.dirty > 0).length, 0)
