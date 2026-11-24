import { describe, expect, it } from "vitest"
import { newPayment } from "../payments/model"
import { newReport } from "../reports/model"
import { channelOf, paymentsByDay, ticketFigures } from "./tablero2-today"

describe("Tablero 2 · Hoy", () => {
  it("channels: the portal's payments are online (card, OXXO, SPEI), never counted again as transfers", () => {
    const stripe = (method: "tarjeta" | "efectivo" | "transferencia") => ({ id: "stripe-pi_1", reference: "Stripe pi_1", method })
    expect([channelOf(stripe("tarjeta")), channelOf(stripe("efectivo")), channelOf(stripe("transferencia"))]).toEqual([
      { channel: "linea", online: "tarjeta" },
      { channel: "linea", online: "oxxo" },
      { channel: "linea", online: "spei" },
    ])
    expect(channelOf({ id: "pay-1", reference: "", method: "transferencia" })).toEqual({ channel: "transferencia", online: null })
    expect(channelOf({ id: "pay-2", reference: "", method: "deposito" })).toEqual({ channel: "otros", online: null })
  })

  it("payments per day and channel, today's online kinds", () => {
    const today = "2026-11-24"
    const pays = [
      newPayment({ id: "stripe-a", reference: "Stripe a", method: "tarjeta", date: today, amount: 396 }),
      newPayment({ id: "stripe-b", reference: "Stripe b", method: "transferencia", date: today, amount: 496 }),
      newPayment({ method: "transferencia", date: today, amount: 596 }),
      newPayment({ method: "efectivo", date: "2026-11-23", amount: 396 }),
      newPayment({ method: "transferencia", date: "2026-11-01", amount: 1 }),
    ]
    const p = paymentsByDay(pays, today, 14)
    expect(p.days).toHaveLength(14)
    expect(p.days[0].day).toBe("2026-11-11")
    const t = p.days[13]
    expect(t.day).toBe(today)
    expect(t.by.linea).toEqual({ n: 2, amount: 892 })
    expect(t.by.transferencia).toEqual({ n: 1, amount: 596 })
    expect(t.total).toEqual({ n: 3, amount: 1488 })
    expect(p.days[12].by.otros.n).toBe(1)
    expect(p.online).toEqual({ tarjeta: { n: 1, amount: 396 }, oxxo: { n: 0, amount: 0 }, spei: { n: 1, amount: 496 } })
  })

  it("tickets: open by stage, the oldest, the month by day and how each stands, last month so far", () => {
    const now = Date.parse("2026-11-24T18:00:00Z")
    const r = (createdAt: string, status: "nuevo" | "en-proceso" | "visita" | "resuelto" | "descartado") => newReport({ createdAt, status })
    const f = ticketFigures(
      [
        r("2026-11-24T15:00:00Z", "nuevo"),
        r("2026-11-20T15:00:00Z", "en-proceso"),
        r("2026-11-02T15:00:00Z", "visita"),
        r("2026-11-02T16:00:00Z", "resuelto"),
        r("2026-11-03T16:00:00Z", "descartado"),
        // 9 p.m. on Oct 31 in Mexico City is already Nov 1 in UTC: it belongs to October.
        r("2026-11-01T03:00:00Z", "resuelto"),
        r("2026-10-26T15:00:00Z", "resuelto"),
        r("", "en-proceso"),
      ],
      "2026-11-24",
      now
    )
    expect(f.open).toEqual({ nuevo: 1, "en-proceso": 2, visita: 1, total: 4 })
    expect(f.oldestHours).toBe(22 * 24 + 3)
    expect(f.stale).toBe(2)
    expect(f.month).toEqual({ abierto: 3, resuelto: 1, descartado: 1, total: 5 })
    expect(f.days).toHaveLength(30)
    expect(f.days[1].by).toEqual({ abierto: 1, resuelto: 1, descartado: 0 })
    expect(f.days[24].future).toBe(true)
    expect(f.days[23].future).toBe(false)
    // October up to the 24th: the one on the 31st (Mexico time) doesn't count yet.
    expect(f.lastMonthSoFar).toBe(0)
  })
})
