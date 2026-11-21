/**
 * Cut-offs and reconnections (WispDavor → Cortes, owner 2026-11-21): from Cobranza's ledger, who to suspend and who to
 * reconnect, per deployment (each deployment has its own MikroTik), and the MikroTik commands. Generator now, live
 * control later (owner: "Generator now, live later").
 *
 * - Cut: an internet service that's active, of a client late on a month (Cobranza: due day 1, late on the 11th) with
 *   no payment promise still standing (promise day today or later).
 * - Reconnect: a suspended internet service of a client no longer late.
 * The commands are the "morosos" ones of /interno/equipos-telecom/mikrotik/scripts (lib/mikrotik/advanced.ts): suspend =
 * profile DSX-suspendido (only the payment notice), reconnect = the client's plan profile; the session is dropped so
 * it applies in seconds. Services without a PPPoE user can't be cut by command and are listed apart.
 */
import { clientLabel, type Client, type Service } from "../clients/model"
import { clientCommands, type ClientCommands } from "../mikrotik/advanced"
import { ledger, type Payment } from "../payments/model"

export type CutRow = { clientId: string; serviceId: string; name: string; siteId: string; user: string; plan: string; owed: number; lateMonths: string[]; promise: string }
export type CutLists = { cut: CutRow[]; restore: CutRow[]; promised: CutRow[]; noUser: CutRow[] }

const internet = (c: Client, status: Service["status"]) => c.services.filter((s) => s.type === "internet" && s.status === status)

export function cutLists(clients: Client[], payments: Payment[], today: string): CutLists {
  const out: CutLists = { cut: [], restore: [], promised: [], noUser: [] }
  for (const c of clients) {
    const l = ledger(c, payments, today)
    const row = (s: Service): CutRow => ({ clientId: c.id, serviceId: s.id, name: clientLabel(c), siteId: c.siteId, user: s.pppoeUser.trim(), plan: s.plan.trim(), owed: Math.round(l.owed * 100) / 100, lateMonths: l.lateMonths, promise: c.promiseDate })
    if (l.status === "atrasado") {
      for (const s of internet(c, "activo")) {
        const r = row(s)
        if (c.promiseDate && c.promiseDate >= today) out.promised.push(r)
        else if (!r.user) out.noUser.push(r)
        else out.cut.push(r)
      }
    } else {
      for (const s of internet(c, "suspendido")) {
        const r = row(s)
        if (!r.user) out.noUser.push(r)
        else out.restore.push(r)
      }
    }
  }
  const byName = (a: CutRow, b: CutRow) => a.siteId.localeCompare(b.siteId) || a.name.localeCompare(b.name, "es")
  for (const k of ["cut", "restore", "promised", "noUser"] as const) out[k].sort(byName)
  return out
}

/** Rows per deployment ("" = no deployment set). */
export function bySite(rows: CutRow[]): Map<string, CutRow[]> {
  const m = new Map<string, CutRow[]>()
  for (const r of rows) m.set(r.siteId, [...(m.get(r.siteId) ?? []), r])
  return m
}

/** The MikroTik commands for some rows: suspend, or back to each one's plan profile. */
export function cutCommands(action: "suspend" | "restore", rows: CutRow[]): ClientCommands {
  const text = rows.map((r) => (action === "restore" ? `${r.user},${r.plan}` : r.user)).join("\n")
  return clientCommands(action, text, [...new Set(rows.map((r) => r.plan).filter(Boolean))])
}

/** The clients after marking these services suspended or active again (to save in Clientes). */
export function markServices(clients: Client[], rows: CutRow[], status: "suspendido" | "activo"): Client[] {
  const ids = new Set(rows.map((r) => r.serviceId))
  const now = new Date().toISOString()
  return clients
    .filter((c) => c.services.some((s) => ids.has(s.id)))
    .map((c) => ({ ...c, services: c.services.map((s) => (ids.has(s.id) ? { ...s, status } : s)), updatedAt: now }))
}
