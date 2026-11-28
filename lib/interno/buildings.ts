/**
 * Mapa de ingresos as towers (owner 2026-11-28: "a 2D tower view", replacing the Voronoi map). Each deployment's towers
 * are built floor by floor from what Despliegues knows, one apartment per unit, and every live client sits in their
 * apartment:
 *
 * - Floors: the survey the deployment came from (its `siteId`), when it counted the units floor by floor (tower matched
 *   by name, else by order when both have the same number of towers) and its total still matches the deployment's
 *   apartments (Despliegues wins once edited): its levels 0 and up are floors 1 and up, and its levels below 0 are
 *   basements. Otherwise the deployment's tower: `floors` and `apartments` spread evenly (the extra
 *   ones on the top floors). Without floors, an estimate (√(apartments × 1.6), as the skyline did), flagged.
 * - Numbers: floor f (1 = ground floor, as "floorsAbove" counts it), unit u → f·100 + u (101, 102 … 1203).
 * - Clients: those with a service live today (the revenue tree's leaves: value and Cobranza status). Their apartment
 *   is read as written ("302", "3-02", "Depto 3B", "PB 2", "PH") and the client sits there when that apartment exists
 *   and is free; otherwise on their floor when it has room, else in the first free apartment (marked "por ubicar":
 *   not their real place). With several towers, a client without a known tower goes to a free apartment too. Clients
 *   beyond the apartments are counted (`overflow`).
 * - Each apartment also carries what the tooltip shows: name, plans, the ONT light and the open reports.
 */
import { clientLabel, type Client } from "../clients/model"
import { lightStatus, type LightStatus } from "../clients/optics"
import type { Report } from "../reports/model"
import { siteLabel, type Site } from "../sites/model"
import type { Survey } from "../survey/model"
import { liveOn, type Tone } from "./tablero2"
import type { Leaf } from "./tablero2-x"

export type Resident = {
  id: string
  name: string
  tone: Tone
  value: number
  plans: string[]
  /** ONT light (dBm) of the internet service, and how it stands. */
  rx: number | null
  light: LightStatus | null
  /** Open reports (not resolved or discarded) and the newest one's category. */
  reports: number
  lastReport: string
  /** The apartment as written in Clientes. */
  written: string
  /** False when the client couldn't be put in their own apartment (not written, unknown, taken, no tower). */
  exact: boolean
}

export type Apartment = { floor: number; unit: number; label: string; resident: Resident | null }
export type BuiltFloor = { floor: number; units: Apartment[] }
export type BuiltTower = {
  id: string
  name: string
  /** Floors from the ground up (index 0 = floor 1). */
  floors: BuiltFloor[]
  basements: number
  /** Where the floors came from. */
  source: "levantamiento" | "despliegue" | "estimado"
  apartments: number
  residents: number
}
export type BuiltSite = { id: string; name: string; towers: BuiltTower[]; apartments: number; residents: number; overflow: number; misplaced: number }

const OPEN = new Set(["nuevo", "en-proceso", "visita"])
const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase()

/** The floor and unit an apartment as written points to (null = can't tell). `top` = the tower's floors, for "PH". */
export function parseApartment(raw: string, top: number): { floor: number | null; unit: number | null } | null {
  const s = norm(raw).replace(/^(depto|dpto|departamento|depa|int|interior|no|num|#)\.?\s*/, "")
  if (!s) return null
  const unitOf = (x: string) => (/^\d+$/.test(x) ? Number(x) : /^[a-z]$/.test(x) ? x.charCodeAt(0) - 96 : null)
  // Ground floor and penthouse, with or without a unit.
  let m = s.match(/^(pb|planta baja)[\s\-./]*([a-z]|\d{1,2})?$/)
  if (m) return { floor: 1, unit: m[2] ? unitOf(m[2]) : null }
  m = s.match(/^(ph|penthouse)[\s\-./]*([a-z]|\d{1,2})?$/)
  if (m) return { floor: top, unit: m[2] ? unitOf(m[2]) : null }
  // "3-02", "3 2", "3/2", "3B", "3-B", "12a".
  m = s.match(/^(\d{1,2})\s*[\-./ ]\s*(\d{1,2}|[a-z])$/) ?? s.match(/^(\d{1,2})([a-z])$/)
  if (m) return { floor: Number(m[1]), unit: unitOf(m[2]) }
  // "302", "1203", "0302": the last two digits are the unit.
  m = s.match(/^0*(\d{3,4})$/)
  if (m) {
    const n = Number(m[1])
    return { floor: Math.floor(n / 100), unit: n % 100 || null }
  }
  return null
}

/** Units per floor: n apartments over f floors, the extra ones on the top floors. */
export function spread(n: number, f: number): number[] {
  if (f <= 0) return []
  const base = Math.floor(n / f)
  const extra = n - base * f
  return Array.from({ length: f }, (_, i) => base + (i >= f - extra ? 1 : 0))
}

/** A tower's floors (units per floor, ground first), basements and where they came from. */
export function towerShape(t: Site["towers"][number], sv: Survey["towers"][number] | undefined): { perFloor: number[]; basements: number; source: BuiltTower["source"] } {
  const counted = sv?.floors.filter((f) => f.level >= 0 && (f.units ?? 0) > 0) ?? []
  const surveyed = counted.reduce((a, f) => a + (f.units ?? 0), 0)
  // Despliegues is the record once the survey became a deployment: its floor counts only while the totals agree.
  if (sv && counted.length && (!t.apartments || t.apartments === surveyed)) {
    const top = Math.max(sv.floorsAbove ?? 0, ...counted.map((f) => f.level + 1))
    const by = new Map(sv.floors.map((f) => [f.level, f.units ?? 0]))
    return { perFloor: Array.from({ length: top }, (_, i) => by.get(i) ?? 0), basements: Math.max(sv.floorsBelow ?? 0, ...sv.floors.filter((f) => f.level < 0).map((f) => -f.level)), source: "levantamiento" }
  }
  const n = t.apartments ?? 0
  if (n <= 0) return { perFloor: [], basements: 0, source: "despliegue" }
  if (t.floors && t.floors > 0) return { perFloor: spread(n, Math.min(t.floors, n)), basements: 0, source: "despliegue" }
  return { perFloor: spread(n, Math.max(1, Math.round(Math.sqrt(n * 1.6)))), basements: 0, source: "estimado" }
}

/** The survey's tower for a deployment's tower: same name, else the same place when both count the same towers. */
function surveyTower(site: Site, i: number, sv: Survey | undefined) {
  if (!sv) return undefined
  const name = norm(site.towers[i].name)
  return (name && sv.towers.find((t) => norm(t.name) === name)) || (sv.towers.length === site.towers.length ? sv.towers[i] : undefined)
}

export const aptLabel = (floor: number, unit: number) => String(floor * 100 + unit)

/** Every deployment with apartments (or clients), its towers built and its live clients in their apartments. */
export function buildSites(sites: Site[], surveys: Survey[], clients: Client[], leaves: Map<string, Leaf>, reports: Report[], today: string): BuiltSite[] {
  const open = new Map<string, Report[]>()
  for (const r of reports) if (r.clientId && OPEN.has(r.status)) open.set(r.clientId, [...(open.get(r.clientId) ?? []), r])
  return sites
    .map((site) => {
      const sv = surveys.find((s) => s.siteId === site.id)
      const towers: BuiltTower[] = site.towers
        .map((t, i) => {
          const shape = towerShape(t, surveyTower(site, i, sv))
          return {
            id: t.id,
            name: t.name.trim(),
            floors: shape.perFloor.map((n, f) => ({ floor: f + 1, units: Array.from({ length: n }, (_, u) => ({ floor: f + 1, unit: u + 1, label: aptLabel(f + 1, u + 1), resident: null as Resident | null })) })),
            basements: shape.basements,
            source: shape.source,
            apartments: shape.perFloor.reduce((a, b) => a + b, 0),
            residents: 0,
          }
        })
        .filter((t) => t.apartments > 0)
      const mine = clients.filter((c) => c.siteId === site.id && leaves.has(c.id) && c.services.some((s) => liveOn(s, today)))
      const resident = (c: Client, exact: boolean): Resident => {
        const leaf = leaves.get(c.id) as Leaf
        const live = c.services.filter((s) => liveOn(s, today))
        const net = live.find((s) => s.type === "internet")
        const rs = (open.get(c.id) ?? []).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        return { id: c.id, name: clientLabel(c), tone: leaf.tone, value: leaf.value, plans: live.map((s) => s.plan.trim()).filter(Boolean), rx: net?.rxDbm ?? null, light: lightStatus(net?.rxDbm ?? null), reports: rs.length, lastReport: rs[0]?.category ?? "", written: c.apartment.trim(), exact }
      }
      // First everyone into their own apartment; then the rest into their floor, then anywhere free.
      const later: { c: Client; tower: BuiltTower | null; floor: number | null }[] = []
      const towerOf = (c: Client) => (towers.length === 1 ? towers[0] : (towers.find((t) => t.id === c.towerId) ?? null))
      for (const c of [...mine].sort((a, b) => a.id.localeCompare(b.id))) {
        const t = towerOf(c)
        const at = t ? parseApartment(c.apartment, t.floors.length) : null
        const apt = t && at?.floor && at.unit ? t.floors[at.floor - 1]?.units[at.unit - 1] : undefined
        if (t && apt && !apt.resident) {
          apt.resident = resident(c, true)
          t.residents++
        } else later.push({ c, tower: t, floor: at?.floor ?? null })
      }
      let overflow = 0
      // Those who wrote a floor first, so the rest don't take the free apartments on it.
      later.sort((a, b) => Number(b.floor !== null) - Number(a.floor !== null))
      for (const { c, tower, floor } of later) {
        const pool = tower ? [tower, ...towers.filter((x) => x !== tower)] : towers
        const onFloor = tower && floor ? tower.floors[floor - 1]?.units.find((u) => !u.resident) : undefined
        const free = onFloor ?? pool.flatMap((t) => t.floors.flatMap((f) => f.units)).find((u) => !u.resident)
        if (!free) {
          overflow++
          continue
        }
        free.resident = resident(c, false)
        const owner = towers.find((t) => t.floors.some((f) => f.units.includes(free)))
        if (owner) owner.residents++
      }
      return { id: site.id, name: siteLabel(site), towers, apartments: towers.reduce((a, t) => a + t.apartments, 0), residents: mine.length - overflow, overflow, misplaced: later.length - overflow }
    })
    .filter((s) => s.apartments > 0)
}

/** A tower's (or floor's) money and status counts, from the apartments in it. */
export type Tally = { apartments: number; residents: number; value: number; paid: number; owed: number; byTone: Record<Tone, { n: number; value: number }> }

export function tally(units: Apartment[]): Tally {
  const byTone = { "al-corriente": { n: 0, value: 0 }, "por-vencer": { n: 0, value: 0 }, atrasado: { n: 0, value: 0 }, suspendido: { n: 0, value: 0 }, "sin-cobro": { n: 0, value: 0 } } as Tally["byTone"]
  let value = 0
  for (const u of units) {
    if (!u.resident) continue
    byTone[u.resident.tone].n++
    byTone[u.resident.tone].value += u.resident.value
    value += u.resident.value
  }
  const owed = value - byTone["sin-cobro"].value
  return { apartments: units.length, residents: units.filter((u) => u.resident).length, value, paid: byTone["al-corriente"].value, owed, byTone }
}

export const unitsOf = (t: BuiltTower) => t.floors.flatMap((f) => f.units)
export const siteUnits = (s: BuiltSite) => s.towers.flatMap(unitsOf)
