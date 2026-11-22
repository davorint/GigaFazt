import { describe, expect, it } from "vitest"
import { churnRate, lastMonths, monthNumbers, siteNumbers } from "./numbers"
import { demoSet } from "./dashboard-demo"
import { planMix } from "./dashboard"

describe("Tablero simulated data", () => {
  const today = "2026-11-22"
  const a = demoSet(today)
  it("is the same every time (fixed seed)", () => {
    const b = demoSet(today)
    expect(b.clients.length).toBe(a.clients.length)
    expect(b.payments.reduce((x, p) => x + p.amount, 0)).toBe(a.payments.reduce((x, p) => x + p.amount, 0))
  })
  it("looks like a working operator: growth, most bills paid, a little churn, every chart has data", () => {
    const rows = monthNumbers(a.clients, a.payments, a.reports, lastMonths("2026-11", 12))
    expect(rows.at(-2)!.activeClients).toBeGreaterThan(rows[0].activeClients)
    const paidShare = rows.at(-2)!.collected / rows.at(-2)!.expected
    expect(paidShare).toBeGreaterThan(0.7)
    const churn = rows.slice(1, -1).map((_, i) => churnRate(rows, i + 1) ?? 0)
    expect(Math.max(...churn)).toBeLessThan(0.08)
    expect(planMix(a.clients).plans.map((p) => p.plan)).toEqual(["200M", "500M", "1G"])
    expect(siteNumbers(a.sites, a.clients)).toHaveLength(5)
    expect(a.surveys.every((s) => s.ident.lat !== null)).toBe(true)
    expect(a.network.sites.some((s) => (s.use ?? 0) >= 0.8)).toBe(true)
    expect(a.clients.every((c) => c.id.startsWith("demo-"))).toBe(true)
  })
})
