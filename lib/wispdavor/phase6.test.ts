import { describe, expect, it } from "vitest"
import { newClient, newService } from "../clients/model"
import { newPayment } from "../payments/model"
import { funnelMonth, funnelMonths } from "./funnel"

const TODAY = "2026-11-21"
const client = (id: string, p = {}) => newClient({ id: `cli-${id}`, name: id, siteId: "site-001", billingFrom: "2026-10", services: [newService("internet", { id: `${id}-s`, monthly: 396, plan: "200M", start: "2026-09-01", pppoeUser: id })], ...p })
const pay = (id: string, date: string) => newPayment({ clientId: `cli-${id}`, date, amount: 396, method: "efectivo" })

describe("WispDavor phase 6: collections funnel", () => {
  it("October: who went late on the 11th and how each one paid", () => {
    const clients = [client("ana"), client("beto"), client("caro"), client("dani"), client("eva")]
    const payments = [
      pay("ana", "2026-10-05"), // paid on time: not late
      pay("beto", "2026-10-13"), // paid on their own
      pay("caro", "2026-10-20"), // after a notice
      pay("dani", "2026-11-02"), // after being suspended
      // eva never paid
    ]
    const events = [
      { clientId: "cli-caro", kind: "aviso" as const, day: "2026-10-12" },
      { clientId: "cli-dani", kind: "aviso" as const, day: "2026-10-12" },
      { clientId: "cli-dani", kind: "suspension" as const, day: "2026-10-15" },
      { clientId: "cli-eva", kind: "suspension" as const, day: "2026-10-15" },
    ]
    const f = funnelMonth(clients, payments, events, "2026-10", TODAY)
    expect(f.lateDay).toBe("2026-10-11")
    expect(f.late).toBe(4)
    expect(f.paid).toEqual({ solo: 1, aviso: 1, suspension: 1 })
    expect(f.owing).toBe(1)
    expect(f.notified).toBe(2)
    expect(f.suspended).toBe(2)
    expect(Object.fromEntries(f.rows.map((r) => [r.clientId, [r.outcome, r.days]]))).toEqual({ "cli-beto": ["solo", 2], "cli-caro": ["aviso", 9], "cli-dani": ["suspension", 22], "cli-eva": ["debe", null] })
    expect(f.medianDays).toBe(9)
  })
  it("months whose 11th has come, newest first", () => {
    expect(funnelMonths("2026-11-21", 3)).toEqual(["2026-11", "2026-10", "2026-09"])
    expect(funnelMonths("2026-11-05", 2)).toEqual(["2026-10", "2026-09"])
  })
})
