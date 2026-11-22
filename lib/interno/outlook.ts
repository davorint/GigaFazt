/**
 * Business outlook (WispDavor phase 10, owner 2026-11-22: "do them all"): what the next months should bill and the
 * weekly summary sent to the team's chat on Mondays. Pure; Números shows the forecast, the daily job sends the summary.
 *
 * - Forecast: what the current clients' services will charge each coming month (dated prices and holds as Cobranza
 *   does), and the same with the average churn of the last 3 months applied month after month. New clients aren't
 *   guessed. An estimate, labelled as such.
 * - Weekly summary: the 7 days before today against the 7 before those.
 */
import { clientLabel, type Client } from "../clients/model"
import { addMonths, chargeFor, ledger, type Payment } from "../payments/model"
import type { Report } from "../reports/model"
import { churnRate, type MonthNumbers } from "./numbers"

export const FORECAST_MONTHS = 3
const CHURN_MONTHS = 3

export type ForecastRow = { month: string; scheduled: number; withChurn: number }
export type Forecast = { rows: ForecastRow[]; churn: number | null }

/** Average churn of the last CHURN_MONTHS complete months (null without any). `rows` ends with the current month. */
export function averageChurn(rows: MonthNumbers[]): number | null {
  const vals: number[] = []
  for (let i = rows.length - 2; i >= 1 && vals.length < CHURN_MONTHS; i--) {
    const r = churnRate(rows, i)
    if (r !== null) vals.push(r)
  }
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
}

export function forecast(clients: Client[], rows: MonthNumbers[], currentMonth: string): Forecast {
  const churn = averageChurn(rows)
  const out: ForecastRow[] = []
  for (let k = 1; k <= FORECAST_MONTHS; k++) {
    const month = addMonths(currentMonth, k)
    const scheduled = Math.round(clients.reduce((a, c) => a + chargeFor(c, month), 0) * 100) / 100
    out.push({ month, scheduled, withChurn: Math.round(scheduled * Math.pow(1 - (churn ?? 0), k) * 100) / 100 })
  }
  return { rows: out, churn }
}

// ── Weekly summary ──────────────────────────────────────────────────────────

export type Week = { from: string; to: string }
/** The 7 days before `today` (to = yesterday) and the 7 before those. */
export function weeks(today: string): { now: Week; before: Week } {
  const d = (n: number) => new Date(Date.parse(`${today}T12:00:00Z`) - n * 864e5).toISOString().slice(0, 10)
  return { now: { from: d(7), to: d(1) }, before: { from: d(14), to: d(8) } }
}
const inWeek = (w: Week) => (date: string) => !!date && date.slice(0, 10) >= w.from && date.slice(0, 10) <= w.to

export type WeekFigures = { collected: number; payments: number; newServices: number; cancelled: number; reportsOpened: number; reportsResolved: number }

export function weekFigures(clients: Client[], payments: Payment[], reports: Report[], w: Week): WeekFigures {
  const at = inWeek(w)
  const services = clients.flatMap((c) => c.services)
  const paid = payments.filter((p) => at(p.date))
  return {
    collected: Math.round(paid.reduce((a, p) => a + p.amount, 0) * 100) / 100,
    payments: paid.length,
    newServices: services.filter((s) => at(s.start)).length,
    cancelled: services.filter((s) => s.status === "cancelado" && at(s.cancelledAt)).length,
    reportsOpened: reports.filter((r) => at(r.createdAt.slice(0, 10))).length,
    reportsResolved: reports.filter((r) => r.status === "resuelto" && at(r.resolvedAt.slice(0, 10))).length,
  }
}

const money = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" })
const vs = (a: number, b: number, m = false) => (Math.abs(a - b) < 0.005 ? "igual" : `${a > b ? "+" : "−"}${m ? money(Math.abs(a - b)) : Math.abs(a - b)}`)
const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("es-MX", { timeZone: "UTC", day: "numeric", month: "short" })

/** The Monday message (plain text for Telegram / the webhook). */
export function weeklyText(p: { clients: Client[]; payments: Payment[]; reports: Report[]; today: string; outages: number; expectedMonth: number; collectedMonth: number; link: string }): string {
  const { now, before } = weeks(p.today)
  const a = weekFigures(p.clients, p.payments, p.reports, now)
  const b = weekFigures(p.clients, p.payments, p.reports, before)
  const late = p.clients
    .map((c) => ({ c, l: ledger(c, p.payments.filter((x) => x.clientId === c.id), p.today) }))
    .filter((x) => x.l.status === "atrasado")
  const owed = late.reduce((s, x) => s + x.l.owed, 0)
  const active = p.clients.filter((c) => c.services.some((s) => s.status === "activo")).length
  const open = p.reports.filter((r) => r.status !== "resuelto" && r.status !== "descartado").length
  const lines = [
    `📊 Semana GigaFazt · ${day(now.from)} – ${day(now.to)}`,
    "",
    `💰 Cobrado: ${money(a.collected)} en ${a.payments} pagos (${vs(a.collected, b.collected, true)} vs semana anterior)`,
    `📈 Mes: ${money(p.collectedMonth)} cobrado de ${money(p.expectedMonth)} esperado`,
    `👥 Clientes activos: ${active} · altas ${a.newServices} · bajas ${a.cancelled} (antes: ${b.newServices} / ${b.cancelled})`,
    `⏰ Atrasados: ${late.length}${late.length ? ` · deben ${money(owed)}` : ""}`,
    ...late
      .sort((x, y) => y.l.owed - x.l.owed)
      .slice(0, 5)
      .map((x) => `   · ${clientLabel(x.c)}: ${money(x.l.owed)}`),
    `🛠️ Reportes: ${a.reportsOpened} nuevos, ${a.reportsResolved} resueltos, ${open} abiertos`,
    `📡 Caídas detectadas: ${p.outages}`,
    "",
    p.link,
  ]
  return lines.join("\n")
}
