/**
 * Materials and cost of a site survey (phase 3): what its fiber design needs, priced from the master list
 * (/interno/admin/materiales), plus extra items picked by hand, plus what each new client takes (drop, ONT, connector,
 * installation) times the expected clients. Prices include IVA (owner's choice), so totals are plain sums.
 *
 * Quantities from the design, per tower: each base splitter and floor splitter by ratio, each tap by ratio, one floor
 * box per floor splitter, one base box per tower with base splitters, two joints (splices or connectors, as the optics
 * say) per splitter or tap, one OLT patch cord per feed, the fiber from the telecom room to the base per feed and the
 * riser fiber per branch (base to its highest stop), both with the riser slack. Per client: the average drop of the
 * tower's apartments (farthest door + drop slack, weighted by apartments), one ONT, two connectors and one installation.
 */
import { CLIENT_ROLES, ROLES, type Item, type Role } from "../materials/catalog"
import { newId } from "./id"
import { riserM } from "./design"
import type { Survey } from "./model"

export type Extra = { id: string; itemId: string; qty: number; note: string }
export type SurveyMaterials = {
  /** The item chosen for each need (by role). */
  pick: Partial<Record<Role, string>>
  /** Quantities typed over the computed ones. */
  qty: Partial<Record<Role, number>>
  extras: Extra[]
}
export const EMPTY_MATERIALS: SurveyMaterials = { pick: {}, qty: {}, extras: [] }

/** What the design needs, by role (build) and per client. */
export function designNeeds(s: Survey): { build: Partial<Record<Role, number>>; client: Partial<Record<Role, number>> } {
  const o = s.optics
  const build: Partial<Record<Role, number>> = {}
  const add = (r: Role, n: number) => {
    if (n > 0) build[r] = (build[r] ?? 0) + n
  }
  const joint: Role = o.joint === "splice" ? "splice" : "connector"
  const toBase = (s.room.toDuctM ?? 0) * (1 + o.slackPct / 100)
  let dropSum = 0
  let units = 0
  for (const t of s.towers) {
    for (const f of t.floors) {
      dropSum += (f.units ?? 0) * ((f.farthestM ?? 0) + o.dropSlackM)
      units += f.units ?? 0
    }
    const d = t.design
    if (!d) continue
    if (d.feeds.some((f) => f.base > 1)) add("base-box", 1)
    for (const f of d.feeds) {
      add("olt-patch", 1)
      add("feeder-m", toBase)
      if (f.base > 1) {
        add(`splitter-${f.base}` as Role, 1)
        add(joint, 2)
      }
      for (const b of f.branches) {
        const top = b.stops.reduce((m, st) => Math.max(m, riserM(t, d, st.level, o)), 0)
        add("riser-m", top)
        for (const st of b.stops) {
          if (st.tap) {
            add(`tap-${st.tap}` as Role, 1)
            add(joint, 2)
          }
          if (st.split > 1) {
            add(`splitter-${st.split}` as Role, 1)
            add("floor-box", 1)
            add(joint, 2)
          }
        }
      }
    }
  }
  for (const r of ["riser-m", "feeder-m"] as Role[]) if (build[r]) build[r] = Math.ceil(build[r]!)
  return { build, client: { "drop-m": units ? Math.ceil(dropSum / units) : 0, ont: 1, "client-connector": 2, "client-labor": 1 } }
}

export type CostLine = { key: string; role?: Role; item: Item | null; qty: number; total: number | null }
export type Costs = {
  build: CostLine[]
  extras: CostLine[]
  client: CostLine[]
  buildTotal: number
  perClient: number
  clients: number
  clientsTotal: number
  total: number
  /** Lines without an item chosen, or whose item has no price. */
  missing: number
}

/** Every line priced from the master list. Lines without an item or price count as 0 and are reported. */
export function surveyCosts(s: Survey, catalog: Item[]): Costs {
  const m = s.materials
  const byId = new Map(catalog.map((x) => [x.id, x]))
  const itemFor = (r: Role) => {
    const chosen = m.pick[r] ? byId.get(m.pick[r]!) : undefined
    return chosen ?? catalog.find((x) => x.role === r) ?? null
  }
  const need = designNeeds(s)
  let missing = 0
  const line = (key: string, role: Role | undefined, it: Item | null, qty: number): CostLine => {
    const total = it && it.price !== null ? it.price * qty : null
    if (total === null && qty > 0) missing++
    return { key, role, item: it, qty, total }
  }
  const order = (xs: Partial<Record<Role, number>>) => ROLES.filter((r) => xs[r] !== undefined)
  const build = order(need.build).map((r) => line(r, r, itemFor(r), m.qty[r] ?? need.build[r] ?? 0))
  const extras = m.extras.map((x) => line(x.id, undefined, byId.get(x.itemId) ?? null, x.qty))
  const client = CLIENT_ROLES.map((r) => line(r, r, itemFor(r), m.qty[r] ?? need.client[r] ?? 0))
  const sum = (xs: CostLine[]) => xs.reduce((a, x) => a + (x.total ?? 0), 0)
  const buildTotal = sum(build) + sum(extras)
  const perClient = sum(client)
  const clients = s.commercial.expectedClients ?? 0
  return { build, extras, client, buildTotal, perClient, clients, clientsTotal: perClient * clients, total: buildTotal + perClient * clients, missing }
}

/** The master-list items this survey uses (exported with it, so the other phone can price it). */
export function usedItems(s: Survey, catalog: Item[]): Item[] {
  const c = surveyCosts(s, catalog)
  const ids = new Set([...c.build, ...c.extras, ...c.client].map((x) => x.item?.id).filter(Boolean) as string[])
  return catalog.filter((x) => ids.has(x.id))
}

// ── Reading stored values ───────────────────────────────────────────────────

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v)
const isRole = (k: string): k is Role => (ROLES as readonly string[]).includes(k)
const okId = (v: unknown) => typeof v === "string" && /^[\w-]{6,64}$/.test(v)

export function decodeMaterials(v: unknown): SurveyMaterials {
  if (!isObj(v)) return EMPTY_MATERIALS
  const pick: Partial<Record<Role, string>> = {}
  if (isObj(v.pick)) for (const [k, x] of Object.entries(v.pick)) if (isRole(k) && okId(x)) pick[k] = x as string
  const qty: Partial<Record<Role, number>> = {}
  if (isObj(v.qty)) for (const [k, x] of Object.entries(v.qty)) if (isRole(k) && typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1e7) qty[k] = x
  const extras = Array.isArray(v.extras)
    ? v.extras
        .filter(isObj)
        .slice(0, 200)
        .filter((x) => okId(x.itemId))
        .map((x) => ({
          id: okId(x.id) ? (x.id as string) : newId(),
          itemId: x.itemId as string,
          qty: typeof x.qty === "number" && Number.isFinite(x.qty) && x.qty >= 0 && x.qty <= 1e7 ? x.qty : 1,
          note: typeof x.note === "string" ? x.note.slice(0, 300) : "",
        }))
    : []
  return { pick, qty, extras }
}

/**
 * The survey with every line's item written down (for export): a line left on "the first item of its role" would
 * pick another phone's own item (different id, maybe no price) after import, so the file names the exact item.
 */
export function withPicks(s: Survey, catalog: Item[]): Survey {
  const c = surveyCosts(s, catalog)
  const pick = { ...s.materials.pick }
  for (const x of [...c.build, ...c.client]) if (x.role && x.item) pick[x.role] = x.item.id
  return { ...s, materials: { ...s.materials, pick } }
}
