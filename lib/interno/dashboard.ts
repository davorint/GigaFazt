/**
 * The Tablero's figures computed from the synced records (owner, 2026-11-22: all five sections). Pure; the network
 * figures come from the server (dashboard-server.ts), the money and client series from lib/interno/numbers + outlook.
 */
import type { Appointment } from "../agenda/model"
import { isOpenAppt } from "../agenda/model"
import { addDays } from "../agenda/model"
import type { Client } from "../clients/model"
import { lightStatus, ONT_OVERLOAD, ONT_SENSITIVITY } from "../clients/optics"
import { isOpen as reportOpen, type Report } from "../reports/model"

/** Active internet services by plan (as Clientes names them: 200M, 500M, 1G…) and active TV services. */
export function planMix(clients: Client[]): { plans: { plan: string; n: number }[]; tv: number } {
  const m = new Map<string, number>()
  let tv = 0
  for (const c of clients)
    for (const s of c.services) {
      if (s.status !== "activo") continue
      if (s.type === "internet") m.set(s.plan.trim() || "Sin plan", (m.get(s.plan.trim() || "Sin plan") ?? 0) + 1)
      else if (s.type === "iptv") tv++
    }
  const speed = (p: string) => Number(/\d+/.exec(p)?.[0] ?? 0) * (/g/i.test(p) ? 1000 : 1)
  return { plans: [...m.entries()].map(([plan, n]) => ({ plan, n })).sort((a, b) => speed(a.plan) - speed(b.plan) || a.plan.localeCompare(b.plan)), tv }
}

export const AGE_BUCKETS = ["d1", "d3", "d7", "more"] as const
export type AgeBucket = (typeof AGE_BUCKETS)[number]

/** Open reports by how long they've been open: under a day, 1–3 days, 3–7 days, more than a week. */
export function reportAges(reports: Report[], now = Date.now()): Record<AgeBucket, number> {
  const out: Record<AgeBucket, number> = { d1: 0, d3: 0, d7: 0, more: 0 }
  for (const r of reports) {
    if (!reportOpen(r)) continue
    const days = (now - Date.parse(r.createdAt)) / 864e5
    out[days < 1 ? "d1" : days < 3 ? "d3" : days < 7 ? "d7" : "more"]++
  }
  return out
}

/** Installations still to do on each of the next `days` days (from today), and the ones already overdue. */
export function installBacklog(agenda: Appointment[], today: string, days = 14): { overdue: number; days: { day: string; n: number }[] } {
  const open = agenda.filter((a) => a.kind === "instalacion" && isOpenAppt(a))
  return {
    overdue: open.filter((a) => a.date && a.date < today).length,
    days: Array.from({ length: days }, (_, i) => {
      const day = addDays(today, i)
      return { day, n: open.filter((a) => a.date === day).length }
    }),
  }
}

/** The light at the ONTs in 1 dB bins (every active internet service with a reading), with the healthy band's edges. */
export function lightHistogram(clients: Client[]): { bins: { dbm: number; n: number; zone: "baja" | "justo" | "bien" | "satura" }[]; readings: number; low: number; high: number } {
  const counts = new Map<number, number>()
  let readings = 0
  for (const c of clients)
    for (const s of c.services) {
      if (s.type !== "internet" || s.status === "cancelado" || s.rxDbm === null) continue
      readings++
      const b = Math.floor(s.rxDbm)
      counts.set(b, (counts.get(b) ?? 0) + 1)
    }
  const keys = [...counts.keys()]
  const lo = Math.min(ONT_SENSITIVITY - 4, ...keys)
  const hi = Math.max(ONT_OVERLOAD + 2, ...keys)
  const bins = []
  for (let d = lo; d <= hi; d++) bins.push({ dbm: d, n: counts.get(d) ?? 0, zone: lightStatus(d + 0.5) ?? "bien" })
  return { bins, readings, low: ONT_SENSITIVITY, high: ONT_OVERLOAD }
}
