/**
 * Simulated data for the Tablero (owner, 2026-11-22: "a toggle switch for simulated data, so we can see how the
 * dashboard would look once it is working"). A made-up operator with five deployments, ~18 months of growth, plans,
 * TV, payments (mostly on time, some late), cancellations with reasons, reports, installations, ONT light, traffic and
 * outages. Generated from a fixed seed, so it looks the same each time; it goes through the same calculations as the
 * real records. Never stored, never sent anywhere; the page labels it SIMULACIÓN everywhere (project rule 2).
 * Deployments sit at municipality level only (rule 6: no exact locations).
 */
import { newAppointment, type Appointment } from "../agenda/model"
import { CANCEL_REASONS, newClient, newService, type CancelReason, type Client } from "../clients/model"
import { addMonths, type Payment } from "../payments/model"
import { newReport, type Report, type ReportCategory } from "../reports/model"
import { newRoom, newRoomCarrier, newSite, newTower, type Site } from "../sites/model"
import { newSurvey, type Survey } from "../survey/model"
import type { FunnelEvent } from "../wispdavor/funnel"
import type { NetworkFigures } from "./dashboard-server"

/** A small fixed-seed generator (mulberry32): the same demo every time. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type DemoSet = { clients: Client[]; payments: Payment[]; reports: Report[]; sites: Site[]; surveys: Survey[]; agenda: Appointment[]; network: NetworkFigures; events: FunnelEvent[] }

/** Municipality-level points only (rule 6), with each deployment's size and links. */
const SITES = [
  { name: "Edificio Demo Norte", municipality: "Benito Juárez", lat: 19.37, lng: -99.16, apartments: 120, links: [1000, 500], rent: 3500, clients: 70 },
  { name: "Edificio Demo Sur", municipality: "Coyoacán", lat: 19.33, lng: -99.16, apartments: 80, links: [500], rent: 2500, clients: 46 },
  { name: "Torre Demo Poniente", municipality: "Álvaro Obregón", lat: 19.36, lng: -99.2, apartments: 64, links: [300], rent: 2000, clients: 38 },
  { name: "Residencial Demo Morelos", municipality: "Cuernavaca", lat: 18.92, lng: -99.23, apartments: 48, links: [500], rent: 1500, clients: 24 },
  { name: "Condominio Demo Tepoz", municipality: "Tepoztlán", lat: 18.98, lng: -99.1, apartments: 30, links: [200], rent: 1200, clients: 10 },
] as const

const PLANS: [string, number, number][] = [
  ["200M", 396, 0.55],
  ["500M", 496, 0.3],
  ["1G", 596, 0.15],
]

const day = (month: string, d: number) => `${month}-${String(Math.min(28, Math.max(1, d))).padStart(2, "0")}`

export function demoSet(today: string): DemoSet {
  const r = rng(20261122)
  const now = new Date().toISOString()
  const month = today.slice(0, 7)
  const sites: Site[] = []
  const surveys: Survey[] = []
  const clients: Client[] = []
  const payments: Payment[] = []
  const reports: Report[] = []
  const agenda: Appointment[] = []
  const events: FunnelEvent[] = []
  const reasons = CANCEL_REASONS.filter((x) => x !== "") as CancelReason[]

  SITES.forEach((d, si) => {
    const site = newSite({
      id: `demo-site-${si}`,
      name: d.name,
      municipality: d.municipality,
      rentMonthly: d.rent,
      towers: [newTower({ name: "A", apartments: d.apartments })],
      rooms: [newRoom({ name: "Cuarto de telecom", carriers: d.links.map((mbps, li) => newRoomCarrier({ name: `Enlace ${li + 1}`, downMbps: mbps, upMbps: mbps, monthly: Math.round(mbps * 3.2) })) })],
    })
    sites.push(site)
    const sv = newSurvey()
    surveys.push({ ...sv, id: `demo-survey-${si}`, siteId: site.id, ident: { ...sv.ident, name: d.name, municipality: d.municipality, lat: d.lat, lng: d.lng } })
    // Clients joined over the last 18 months, more in the bigger, older deployments.
    for (let i = 0; i < d.clients; i++) {
      const id = `demo-c${si}-${i}`
      const startBack = Math.floor(Math.pow(r(), 0.8) * (18 - si * 2))
      const start = day(addMonths(month, -startBack), 1 + Math.floor(r() * 26))
      const x = r()
      const [plan, price] = x < PLANS[0][2] ? PLANS[0] : x < PLANS[0][2] + PLANS[1][2] ? PLANS[1] : PLANS[2]
      // About 1.5 % a month leave.
      const leaves = startBack > 2 && r() < startBack * 0.012
      const cancelledAt = leaves ? day(addMonths(month, -Math.floor(r() * (startBack - 1))), 1 + Math.floor(r() * 26)) : ""
      const rx = Math.round((-19.5 + (r() + r() + r() - 1.5) * 4 - (r() < 0.06 ? 6 : 0)) * 10) / 10
      const services = [
        newService("internet", { id: `${id}-i`, plan, monthly: price, start, status: leaves ? "cancelado" : "activo", cancelledAt, cancelReason: leaves ? reasons[Math.floor(Math.pow(r(), 1.6) * reasons.length)] : "", pppoeUser: `demo.${si}.${i}`, rxDbm: leaves ? null : rx, rxDate: today, rxHistory: [] }),
        ...(r() < 0.25 ? [newService("iptv", { id: `${id}-t`, plan: "TV", monthly: 250, start, status: leaves ? "cancelado" : "activo", cancelledAt })] : []),
      ]
      const c = newClient({ id, name: `Cliente demo ${si + 1}-${i + 1}`, siteId: site.id, services, createdAt: now, updatedAt: now })
      clients.push(c)
      // Pays every month from the one after joining: most by the 5th, some by the 10th, a few late or not yet.
      const monthly = services.reduce((a, s) => a + (s.monthly ?? 0), 0)
      const habit = r()
      for (let m = 1; m <= startBack; m++) {
        const mo = addMonths(month, -startBack + m)
        if (cancelledAt && `${mo}-01` > cancelledAt) break
        const late = habit > 0.85
        const todayDay = Number(today.slice(8, 10))
        // This month: a few haven't paid yet; the rest paid by today (the late payers after the 11th, once it has come).
        const skip = mo === month ? r() < 0.08 || (late && todayDay <= 11) : habit > 0.95 && m === startBack
        if (skip) {
          if (late) events.push({ clientId: id, kind: "aviso", day: day(mo, 9) })
          continue
        }
        const d2 = mo === month ? (late ? 12 + Math.floor(r() * Math.max(1, todayDay - 11)) : Math.min(todayDay, 1 + Math.floor(r() * 9))) : late ? 11 + Math.floor(r() * 10) : 1 + Math.floor(r() * 9)
        if (late) events.push({ clientId: id, kind: "aviso", day: day(mo, 9) })
        if (late && d2 > 14) events.push({ clientId: id, kind: "suspension", day: day(mo, 11) }, { clientId: id, kind: "activo", day: day(mo, d2) })
        payments.push({ id: `demo-p-${id}-${m}`, clientId: id, date: day(mo, d2), amount: monthly, method: r() < 0.7 ? "transferencia" : "efectivo", reference: "", notes: "", by: "Demo", createdAt: now, updatedAt: now })
      }
    }
  })

  // Reports: about 8 a month over the last 12, solved in hours to days; a few still open.
  const cats: ReportCategory[] = ["sin-servicio", "lento", "intermitente", "wifi", "tv", "equipo"]
  const active = clients.filter((c) => c.services.some((s) => s.status === "activo"))
  for (let m = 11; m >= 0; m--) {
    const mo = addMonths(month, -m)
    const n = 5 + Math.floor(r() * 7)
    for (let i = 0; i < n; i++) {
      const c = active[Math.floor(r() * active.length)]
      const created = new Date(`${day(mo, 1 + Math.floor(r() * (m === 0 ? Math.max(1, Number(today.slice(8, 10)) - 1) : 27)))}T${String(8 + Math.floor(r() * 10)).padStart(2, "0")}:00:00-06:00`)
      const open = (m === 0 && r() < 0.6) || (m === 1 && r() < 0.08)
      // Open ones are recent (hours to days old; now and then one older than a week).
      const openedAt = open ? new Date(Date.parse(`${today}T18:00:00Z`) - Math.pow(r(), 1.8) * 10 * 864e5) : created
      const hours = 2 + Math.pow(r(), 2) * 70
      reports.push(newReport({ id: `demo-r-${mo}-${i}`, clientId: c.id, siteId: c.siteId, name: c.name, category: cats[Math.floor(r() * cats.length)], createdAt: openedAt.toISOString(), status: open ? "nuevo" : "resuelto", resolvedAt: open ? "" : new Date(created.getTime() + hours * 3600000).toISOString(), by: "Demo" }))
    }
  }

  // Installations: the next two weeks, a couple a day on weekdays.
  for (let i = 0; i < 14; i++) {
    const dd = new Date(Date.parse(`${today}T12:00:00Z`) + i * 864e5)
    const dow = dd.getUTCDay()
    const n = dow === 0 ? 0 : dow === 6 ? Math.floor(r() * 2) : Math.floor(r() * 4)
    for (let j = 0; j < n; j++) agenda.push(newAppointment({ id: `demo-a-${i}-${j}`, kind: "instalacion", date: dd.toISOString().slice(0, 10), time: `${10 + j * 2}:00`, status: "pendiente", siteId: sites[Math.floor(r() * sites.length)].id, name: "Instalación demo" }))
  }

  // Network: evenings fullest, weekends a bit more; one deployment close to full.
  const heat = Array.from({ length: 7 }, (_, d) =>
    Array.from({ length: 24 }, (_, h) => {
      const curve = h >= 19 && h <= 23 ? 1 : h >= 8 && h <= 18 ? 0.45 + (h - 8) * 0.03 : h <= 1 ? 0.6 : 0.12
      return Math.round(1350 * curve * (d >= 5 ? 1.12 : 1) * (0.92 + r() * 0.16))
    })
  )
  const network: NetworkFigures = {
    heat,
    outages7: 2,
    openOutages: 0,
    sites: SITES.map((d, i) => {
      const speed = d.links.reduce((a, b) => a + b, 0)
      const use = [0.62, 0.71, 0.86, 0.44, 0.33][i]
      return { name: d.name, use, busyDown: Math.round(speed * use), speedDown: speed }
    }),
    hasTraffic: true,
  }
  return { clients, payments, reports, sites, surveys, agenda, network, events }
}
