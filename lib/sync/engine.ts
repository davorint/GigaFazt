/**
 * The phone side of syncing (owner, 2026-11-17: keep working offline, sync later; newest edit wins): sends the records
 * this browser changed and takes in what changed elsewhere, one kind at a time, for surveys, the master materials
 * list and providers. The stores keep saving locally exactly as before; this only moves changes.
 *
 * When: on start, 2 s after a local edit, every 30 s, when the signal comes back and when the tab comes to the front.
 * One sync at a time across tabs (Web Locks when the browser has them). Nothing is sent until the phone has a name
 * ("¿Quién eres?"), which goes with every change.
 */
import { decodeItem, type Item } from "../materials/catalog"
import { applyRemoteItems, catalogSnapshot, remapItem } from "../materials/store"
import { decodeProvider, type Provider } from "../providers/model"
import { applyRemoteProviders, providersSnapshot } from "../providers/store"
import { decodeSurvey, type Survey } from "../survey/model"
import { decodeClient, type Client } from "../clients/model"
import { applyRemoteClients, clientsSnapshot } from "../clients/store"
import { decodeSite, type Site } from "../sites/model"
import { applyRemoteSites, sitesSnapshot } from "../sites/store"
import { decodeTool, untouchedStarter as untouchedTool, type Tool } from "../tools/model"
import { applyRemoteTools, toolsSnapshot } from "../tools/store"
import { applyRemoteSurveys, surveysSnapshot } from "../survey/store"
import { MAX_CHANGES, REV_OVERLAP, SYNC_KINDS, type Change, type SyncKind, type SyncResponse } from "./protocol"
import { onSyncChange, pendingCount, readState, updateState } from "./state"

type Adapter = {
  /** The local record to send, or undefined when it's gone. */
  get: (id: string) => unknown
  ids: () => string[]
  apply: (upserts: unknown[], deletes: string[]) => void
}

const ADAPTERS: Record<SyncKind, Adapter> = {
  surveys: {
    get: (id) => surveysSnapshot().list.find((x) => x.id === id),
    ids: () => surveysSnapshot().list.map((x) => x.id),
    apply: (u, d) => applyRemoteSurveys(u.map(decodeSurvey).filter((x): x is Survey => x !== null), d),
  },
  materials: {
    get: (id) => catalogSnapshot().items.find((x) => x.id === id),
    ids: () => catalogSnapshot().items.filter((x) => !untouchedStarter(x)).map((x) => x.id),
    apply: (u, d) => applyRemoteItems(u.map(decodeItem).filter((x): x is Item => x !== null), d),
  },
  providers: {
    get: (id) => providersSnapshot().list.find((x) => x.id === id),
    ids: () => providersSnapshot().list.map((x) => x.id),
    apply: (u, d) => applyRemoteProviders(u.map(decodeProvider).filter((x): x is Provider => x !== null), d),
  },
  clients: {
    get: (id) => clientsSnapshot().list.find((x) => x.id === id),
    ids: () => clientsSnapshot().list.map((x) => x.id),
    apply: (u, d) => applyRemoteClients(u.map(decodeClient).filter((x): x is Client => x !== null), d),
  },
  sites: {
    get: (id) => sitesSnapshot().list.find((x) => x.id === id),
    ids: () => sitesSnapshot().list.map((x) => x.id),
    apply: (u, d) => applyRemoteSites(u.map(decodeSite).filter((x): x is Site => x !== null), d),
  },
  tools: {
    get: (id) => toolsSnapshot().list.find((x) => x.id === id),
    // Untouched starter tools are the same everywhere: nothing to upload.
    ids: () => toolsSnapshot().list.filter((x) => !untouchedTool(x)).map((x) => x.id),
    apply: (u, d) => applyRemoteTools(u.map(decodeTool).filter((x): x is Tool => x !== null), d),
  },
}

// ── Status for the screen ───────────────────────────────────────────────────

export type SyncStatus = {
  phase: "idle" | "syncing" | "offline" | "error" | "no-name" | "no-database"
  pending: number
  /** Local records never sent (before "Subir lo de este navegador"). */
  unsent: number
  name: string
  adopted: boolean
  lastOk: string | null
  error: string
}
let status: SyncStatus = { phase: "idle", pending: 0, unsent: 0, name: "", adopted: false, lastOk: null, error: "" }
const statusListeners = new Set<() => void>()
const setStatus = (p: Partial<SyncStatus>) => {
  status = { ...status, ...p }
  statusListeners.forEach((l) => l())
}
/** Re-reads what's pending and the name (after any local change). */
function refreshCounts() {
  if (typeof window === "undefined") return
  const s = readState()
  const unsent = s.adopted ? 0 : SYNC_KINDS.reduce((n, k) => n + ADAPTERS[k].ids().filter((id) => !s.meta[k][id]).length, 0)
  setStatus({ pending: pendingCount(s), unsent, name: s.name, adopted: s.adopted, ...(s.name ? (status.phase === "no-name" ? { phase: "idle" } : {}) : { phase: "no-name" }) })
}
export const subscribeSync = (cb: () => void) => {
  statusListeners.add(cb)
  return () => {
    statusListeners.delete(cb)
  }
}
export const syncSnapshot = () => status
const SERVER_STATUS: SyncStatus = { ...status }
export const syncServerSnapshot = () => SERVER_STATUS

// ── One sync ────────────────────────────────────────────────────────────────

/** A starter item nobody touched: the same fixed id and values in every browser, so there is nothing to upload. */
const untouchedStarter = (it: Item) => it.id.startsWith("starter-") && it.price === null && !it.supplierId && !it.sku && !it.notes

async function syncKind(kind: SyncKind, name: string): Promise<void> {
  const a = ADAPTERS[kind]
  for (let round = 0; round < 20; round++) {
    const s = readState()
    const dirty = Object.entries(s.meta[kind])
      .filter(([, m]) => m.dirty > 0)
      .slice(0, MAX_CHANGES)
    const sent = new Map(dirty.map(([id, m]) => [id, m.dirty]))
    const changes: Change[] = dirty.map(([id, m]) => {
      const data = m.del ? null : a.get(id)
      return { id, baseVersion: m.v, data: data ?? null, deleted: m.del === true || data === undefined, editedAt: m.at }
    })
    const res = await fetch("/api/interno/sync", {
      method: "POST",
      headers: { "content-type": "application/json", "x-interno-nombre": encodeURIComponent(name) },
      body: JSON.stringify({ kind, since: Math.max(0, s.rev[kind] - REV_OVERLAP), changes }),
    })
    if (res.status === 503) throw Object.assign(new Error("no-database"), { code: "no-database" })
    if (res.status === 401) throw Object.assign(new Error("unauthorized"), { code: "unauthorized" })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = (await res.json()) as SyncResponse

    // Outcomes of what was sent.
    const merged: [string, string][] = []
    updateState((st) => {
      for (const r of body.results) {
        const m = st.meta[kind][r.id]
        if (!m) continue
        const stillSame = m.dirty === sent.get(r.id)
        if (r.outcome === "saved" || r.outcome === "kept-server") {
          if (r.version === 0) delete st.meta[kind][r.id]
          // Saved: this copy is that version. Kept-server: the base stays, so the server's copy coming back is applied.
          else if (r.outcome === "saved") st.meta[kind][r.id] = { ...m, v: r.version, dirty: stillSame ? 0 : m.dirty }
          else st.meta[kind][r.id] = { ...m, dirty: 0 }
        } else if (r.outcome === "merged") {
          delete st.meta[kind][r.id]
          merged.push([r.id, r.into])
        }
      }
    })
    for (const [from, to] of merged) remapItem(from, to)

    // What changed elsewhere (and what was just saved, which comes back too).
    const upserts: unknown[] = []
    const deletes: string[] = []
    updateState((st) => {
      for (const r of body.records) {
        const m = st.meta[kind][r.id]
        if (m && m.dirty > 0) {
          // Edited here again while this ran: keep the local copy, send it next on top of this version.
          st.meta[kind][r.id] = { ...m, v: r.version }
          continue
        }
        if (m && m.v === r.version && !r.deleted) continue
        // Here before syncing (never uploaded) and in the database too: the newer copy wins, never silently lost.
        const local = !m ? (a.get(r.id) as { updatedAt?: string } | undefined) : undefined
        if (local && !r.deleted && typeof local.updatedAt === "string" && local.updatedAt > r.editedAt) {
          st.meta[kind][r.id] = { v: r.version, dirty: 1, at: local.updatedAt }
          continue
        }
        st.meta[kind][r.id] = { v: r.version, dirty: 0, at: r.editedAt, ...(r.deleted ? { del: true } : {}) }
        if (r.deleted) deletes.push(r.id)
        else upserts.push(r.data)
      }
      st.rev[kind] = Math.max(st.rev[kind], body.rev)
    })
    a.apply(upserts, deletes)
    const rejected = body.results.filter((r) => r.outcome === "rejected")
    if (rejected.length) setStatus({ error: `${rejected.length} rechazados` })
    const left = Object.values(readState().meta[kind]).filter((m) => m.dirty > 0).length
    if (!body.more && (left === 0 || dirty.length < MAX_CHANGES || rejected.length)) return
  }
}

let running = false
let again = false

/** Syncs every kind now (or right after the one in progress). */
export async function syncNow(): Promise<void> {
  if (typeof window === "undefined") return
  if (running) {
    again = true
    return
  }
  const s = readState()
  if (!s.name) {
    refreshCounts()
    return
  }
  if (!navigator.onLine) {
    setStatus({ phase: "offline" })
    return
  }
  running = true
  setStatus({ phase: "syncing", error: "" })
  const work = async () => {
    for (const k of SYNC_KINDS) await syncKind(k, s.name)
  }
  try {
    const locks = (navigator as Navigator & { locks?: { request: (n: string, f: () => Promise<void>) => Promise<void> } }).locks
    if (locks) await locks.request("gigafazt-sync", work)
    else await work()
    setStatus({ phase: "idle", lastOk: new Date().toISOString() })
  } catch (e) {
    const code = (e as { code?: string }).code
    setStatus({ phase: code === "no-database" ? "no-database" : navigator.onLine ? "error" : "offline", error: e instanceof Error ? e.message : "error" })
  } finally {
    running = false
    refreshCounts()
    if (again) {
      again = false
      void syncNow()
    }
  }
}

let timer: ReturnType<typeof setTimeout> | null = null

/** Starts syncing on this page (each page that shows the sync bar calls it); returns a stop function. */
export function startSync(): () => void {
  refreshCounts()
  const soon = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void syncNow(), 2000)
  }
  const offChange = onSyncChange(() => {
    refreshCounts()
    if (readState().name && pendingCount(readState()) > 0) soon()
  })
  const every = setInterval(() => void syncNow(), 30_000)
  const online = () => void syncNow()
  const offline = () => setStatus({ phase: "offline" })
  const visible = () => document.visibilityState === "visible" && void syncNow()
  window.addEventListener("online", online)
  window.addEventListener("offline", offline)
  document.addEventListener("visibilitychange", visible)
  void syncNow()
  return () => {
    offChange()
    clearInterval(every)
    window.removeEventListener("online", online)
    window.removeEventListener("offline", offline)
    document.removeEventListener("visibilitychange", visible)
    if (timer) clearTimeout(timer)
  }
}

/** The local ids of every kind (for "Subir lo de este navegador"). */
export const localIds = (): Record<SyncKind, string[]> => ({ surveys: ADAPTERS.surveys.ids(), materials: ADAPTERS.materials.ids(), providers: ADAPTERS.providers.ids(), clients: ADAPTERS.clients.ids(), sites: ADAPTERS.sites.ids(), tools: ADAPTERS.tools.ids() })
