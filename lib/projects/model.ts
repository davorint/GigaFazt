/**
 * Nuevos proyectos (/interno/nuevos_proyectos, owner 2026-11-26: "all the necessary equipment for a new deployment";
 * answers: a standard kit plus projects; the tools are the minimum equipment of one technician; router and OLT are
 * deployment material; 1 technician by default).
 *
 * One record is a kit (the standard list a new project starts from) or a project (a copy of a kit with its own
 * quantities, technicians, deployment and progress). A line points to the record that knows the product and its
 * prices: a buying option in Compras de herramientas (`ref` "herramienta", a toolbuys id) or an item of the materials
 * list (`ref` "material"). Prices are never kept here; they come from that record's chosen or cheapest offer, so a
 * new quote there updates every kit and project. Technician lines count once per technician; deployment lines once.
 *
 * Synced through the database (kind "proyectos"). `decodeProject` reads stored or synced values field by field and
 * never throws.
 */
import { effectiveOffer, type Item } from "../materials/catalog"
import { newId } from "../survey/id"
import { bestOffer, newToolBuy, type ToolBuy } from "../toolbuys/model"

export const PROJECT_KINDS = ["kit", "proyecto"] as const
export type ProjectKind = (typeof PROJECT_KINDS)[number]
export const PROJECT_STATUSES = ["planeacion", "compras", "listo", "cerrado"] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]
/** Who a line is counted for: each technician (their tools) or the deployment once (router, OLT, fiber). */
export const LINE_SCOPES = ["tecnico", "despliegue"] as const
export type LineScope = (typeof LINE_SCOPES)[number]
export const LINE_REFS = ["herramienta", "material"] as const
export type LineRef = (typeof LINE_REFS)[number]

export type ProjectLine = {
  id: string
  scope: LineScope
  ref: LineRef
  /** The toolbuys id (herramienta) or materials id (material). */
  refId: string
  /** Per technician (tecnico) or for the deployment (despliegue). */
  qty: number
  /** How many this project already has in hand (projects only). */
  have: number
  notes: string
}

export type Project = {
  id: string
  kind: ProjectKind
  name: string
  status: ProjectStatus
  technicians: number
  /** The deployment from Despliegues, "" = none yet. */
  siteId: string
  /** When work should start (yyyy-mm-dd), "" = not set. */
  start: string
  /** The kit it was copied from (projects). */
  kitId: string
  lines: ProjectLine[]
  notes: string
  by: string
  updatedAt: string
}

export const newLine = (p: Partial<ProjectLine> = {}): ProjectLine => ({ id: newId(), scope: "tecnico", ref: "herramienta", refId: "", qty: 1, have: 0, notes: "", ...p })
export const newProject = (p: Partial<Project> = {}): Project => ({ id: newId(), kind: "proyecto", name: "", status: "planeacion", technicians: 1, siteId: "", start: "", kitId: "", lines: [], notes: "", by: "", updatedAt: "", ...p })

/** A new project from a kit: its lines copied (new ids, nothing in hand yet). */
export const fromKit = (kit: Project, p: Partial<Project> = {}): Project =>
  newProject({ technicians: kit.technicians, kitId: kit.id, lines: kit.lines.map((l) => ({ ...l, id: newId(), have: 0 })), ...p })

// ── Prices and totals ───────────────────────────────────────────────────────

export type Refs = { buys: ToolBuy[]; items: Item[] }

export type Resolved = {
  line: ProjectLine
  /** What it is (the option's brand and model, or the item's name); "" when the record is gone. */
  name: string
  /** The need (tools) or category (materials) it belongs to. */
  group: string
  store: string
  url: string
  /** MXN per piece with IVA (null = no price). */
  unit: number | null
  /** Pieces this project needs (per technician × technicians for technician lines). */
  need: number
  missing: number
  /** need × unit, missing × unit (null without a price). */
  total: number | null
  toBuy: number | null
  found: boolean
  buy?: ToolBuy
  item?: Item
}

export const lineNeed = (l: ProjectLine, technicians: number) => (l.scope === "tecnico" ? l.qty * Math.max(1, technicians) : l.qty)

export function resolveLine(l: ProjectLine, technicians: number, refs: Refs, storeName: (supplierId: string, fallback: string) => string = (_, f) => f): Resolved {
  const need = lineNeed(l, technicians)
  const missing = Math.max(0, need - l.have)
  const base = { line: l, need, missing }
  if (l.ref === "herramienta") {
    const b = refs.buys.find((x) => x.id === l.refId)
    if (!b) return { ...base, name: "", group: "", store: "", url: "", unit: null, total: null, toBuy: null, found: false }
    const o = bestOffer(b)
    const unit = o?.price ?? null
    const name = [b.brand, b.model].filter(Boolean).join(" ") || b.need
    return { ...base, name, group: b.need, store: o ? storeName(o.supplierId, o.store) : "", url: o?.url ?? "", unit, total: unit === null ? null : unit * need, toBuy: unit === null ? null : unit * missing, found: true, buy: b }
  }
  const it = refs.items.find((x) => x.id === l.refId)
  if (!it) return { ...base, name: "", group: "", store: "", url: "", unit: null, total: null, toBuy: null, found: false }
  const o = effectiveOffer(it)
  const unit = o?.price ?? null
  return { ...base, name: it.name, group: it.category, store: o ? storeName(o.supplierId, o.supplier) : "", url: o?.url ?? "", unit, total: unit === null ? null : unit * need, toBuy: unit === null ? null : unit * missing, found: true, item: it }
}

export type Totals = { total: number; toBuy: number; unpriced: number; missingPieces: number; perTechnician: number; deployment: number }

export function totals(rows: Resolved[]): Totals {
  const sum = (f: (r: Resolved) => number | null, only?: (r: Resolved) => boolean) => rows.filter((r) => !only || only(r)).reduce((s, r) => s + (f(r) ?? 0), 0)
  return {
    total: sum((r) => r.total),
    toBuy: sum((r) => r.toBuy),
    unpriced: rows.filter((r) => r.unit === null).length,
    missingPieces: rows.reduce((s, r) => s + r.missing, 0),
    perTechnician: sum((r) => (r.unit === null ? null : r.unit * r.line.qty), (r) => r.line.scope === "tecnico"),
    deployment: sum((r) => r.total, (r) => r.line.scope === "despliegue"),
  }
}

/**
 * "Pasar a compras": what the project still lacks in tools goes to Compras de herramientas. An option still open
 * (not bought or discarded) gets its quantity raised to cover what's missing (never lowered) and moves from idea to
 * cotizado when it has a priced offer; a bought one gets a new open copy (same need, model and offers) for the
 * missing pieces. Several lines on one option add up. Returns the options to save.
 */
export function pushToBuys(p: Project, buys: ToolBuy[], by: string): ToolBuy[] {
  const want = new Map<string, number>()
  for (const l of p.lines) {
    if (l.ref !== "herramienta") continue
    const missing = Math.max(0, lineNeed(l, p.technicians) - l.have)
    if (missing) want.set(l.refId, (want.get(l.refId) ?? 0) + missing)
  }
  const out: ToolBuy[] = []
  for (const [id, n] of want) {
    const b = buys.find((x) => x.id === id)
    if (!b || b.status === "descartado") continue
    const priced = b.offers.some((o) => o.price !== null)
    if (b.status === "comprado") {
      out.push(newToolBuy({ ...b, id: newId(), quantity: n, status: priced ? "cotizado" : "idea", toolId: "", webKey: "", offers: b.offers.map((o) => ({ ...o, id: newId() })), offerId: "", notes: [b.notes, `Para el proyecto ${p.name || "sin nombre"}.`].filter(Boolean).join("\n").slice(0, 2000), by, updatedAt: "" }))
      continue
    }
    const quantity = Math.max(b.quantity, n)
    const status = b.status === "idea" && priced ? "cotizado" : b.status
    if (quantity !== b.quantity || status !== b.status) out.push({ ...b, quantity, status })
  }
  return out
}

export const projectLabel = (p: Pick<Project, "name" | "kind">) => p.name.trim() || (p.kind === "kit" ? "Kit sin nombre" : "Proyecto sin nombre")

// ── Reading stored or synced values ─────────────────────────────────────────

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v)
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "")
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "")
const id = (v: unknown) => (typeof v === "string" && /^[\w-]{6,64}$/.test(v) ? v : "")
const int = (v: unknown, min: number, max: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : fallback)
const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => ((list as readonly unknown[]).includes(v) ? (v as T) : fallback)

function decodeLine(v: unknown): ProjectLine | null {
  if (!isObj(v)) return null
  const refId = id(v.refId)
  if (!refId) return null
  return { id: id(v.id) || newId(), scope: pick(LINE_SCOPES, v.scope, "tecnico"), ref: pick(LINE_REFS, v.ref, "herramienta"), refId, qty: int(v.qty, 0, 100000, 1), have: int(v.have, 0, 100000, 0), notes: str(v.notes, 500) }
}

export function decodeProject(v: unknown): Project | null {
  if (!isObj(v)) return null
  const lines = Array.isArray(v.lines) ? v.lines.slice(0, 300).map(decodeLine).filter((x): x is ProjectLine => x !== null) : []
  return {
    id: id(v.id) || newId(),
    kind: pick(PROJECT_KINDS, v.kind, "proyecto"),
    name: str(v.name, 200),
    status: pick(PROJECT_STATUSES, v.status, "planeacion"),
    technicians: int(v.technicians, 1, 50, 1),
    siteId: id(v.siteId),
    start: date(v.start),
    kitId: id(v.kitId),
    lines,
    notes: str(v.notes, 2000),
    by: str(v.by, 100),
    updatedAt: typeof v.updatedAt === "string" ? v.updatedAt.slice(0, 40) : "",
  }
}
