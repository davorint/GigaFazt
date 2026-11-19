/**
 * The daily summary for the team's chat (owner, 2026-11-18: alerts for more than web reports): the same "Hoy" as the
 * /interno screen (lib/interno/today.ts), as plain text. Nothing is sent when there is nothing to look at.
 */
import { mxn } from "../materials/catalog"
import type { Alert } from "../tools/model"
import { SERIOUS, allClear, type Today } from "./today"

const ALERT: Record<Alert, string> = {
  "service-overdue": "mantenimiento vencido",
  "service-soon": "mantenimiento pronto",
  "service-unknown": "falta fecha de servicio",
  "counter-limit": "contador al límite",
  "counter-near": "contador cerca del límite",
  condition: "dañada, en reparación o perdida",
  "warranty-soon": "garantía por terminar",
}

const list = <T>(xs: T[], line: (x: T) => string, max = 6) => [...xs.slice(0, max).map((x) => `• ${line(x)}`), ...(xs.length > max ? [`  y ${xs.length - max} más`] : [])]

/** null when everything is in order (no message). */
export function digestText(s: Today, today: string, link: string): string | null {
  if (allClear(s)) return null
  const out = [`📋 Resumen GigaFazt · ${today}`]
  if (s.reports.open) {
    out.push("", `🔧 Reportes abiertos: ${s.reports.open} (${s.reports.fresh.length} nuevos sin atender, ${s.reports.urgent} urgentes o alta, ${s.reports.stale} con más de 2 días)`)
    out.push(...list(s.reports.fresh, (r) => r.label))
  }
  if (s.payments.late.length) {
    out.push("", `💸 Clientes atrasados: ${s.payments.late.length} · deben ${mxn(s.payments.lateAmount)}`)
    out.push(...list(s.payments.late, (c) => `${c.label} · ${mxn(c.owed)}`))
  }
  const tools = s.tools.filter((x) => x.alerts.some((a) => SERIOUS.includes(a) || a === "service-soon"))
  if (tools.length) {
    out.push("", `🧰 Herramientas por atender: ${tools.length}`)
    out.push(...list(tools, (x) => `${x.label}: ${x.alerts.map((a) => ALERT[a]).join(", ")}`))
  }
  if (s.lowStock.length) {
    out.push("", `📦 Existencias bajas en bodega: ${s.lowStock.length}`)
    out.push(...list(s.lowStock, (x) => `${x.name}: ${x.has} de ${x.min} ${x.unit}`))
  }
  if (s.bills.length) {
    const late = s.bills.filter((b) => b.late)
    out.push("", `🧾 Por pagar: ${late.length} vencidas, ${s.bills.length - late.length} por vencer en 3 días`)
    out.push(...list(s.bills, (b) => `${b.label} · ${mxn(b.balance)} · ${b.late ? "venció" : "vence"} ${b.due}`))
  }
  if (s.charges.length) {
    out.push("", `📄 Cargos vencidos por cobrar: ${s.charges.length}`)
    out.push(...list(s.charges, (c) => `${c.label} · ${mxn(c.balance)} · venció ${c.due}`))
  }
  if (s.complements.length) {
    out.push("", `🧾 Complementos de pago pendientes: ${s.complements.length}`)
    out.push(...list(s.complements, (c) => `${c.side === "cobrar" ? "emitir" : "pedir al proveedor"}: ${c.label} · a más tardar ${c.deadline}`))
  }
  if (s.pinned.length) {
    out.push("", `📌 Notas fijadas: ${s.pinned.length}`)
    out.push(...list(s.pinned, (n) => n.title))
  }
  // Only minor tool reminders (not listed here): nothing worth a message.
  if (out.length === 1) return null
  out.push("", link)
  return out.join("\n")
}
