import { describe, expect, it } from "vitest"
import { matchInternal } from "../internal-pages"
import { reportSchema } from "../report-form"
import { decodeReport, hoursToSolve, newReport, phoneKey, relatedOpen, repeatClients, reportCode, reportStats, setStatus } from "./model"

const H = 36e5
const at = (h: number) => new Date(Date.parse("2026-11-18T12:00:00Z") + h * H).toISOString()

describe("client problem reports", () => {
  it("no internet is high priority by default; short code from the id", () => {
    expect(newReport({ category: "sin-servicio" }).priority).toBe("alta")
    expect(newReport({ category: "wifi" }).priority).toBe("normal")
    expect(reportCode({ id: "1a2b3c4d-0000" })).toBe("R-1A2B3C")
  })
  it("status changes leave a note; resolving stamps the time, reopening clears it", () => {
    const label = (s: string) => s
    const r = newReport({ createdAt: at(0) })
    const done = setStatus(r, "resuelto", "Ana", label, at(5))
    expect([done.status, done.resolvedAt, done.notes[0].text, done.notes[0].by]).toEqual(["resuelto", at(5), "nuevo → resuelto", "Ana"])
    expect(hoursToSolve(done)).toBe(5)
    expect(setStatus(done, "en-proceso", "Luis", label, at(6)).resolvedAt).toBe("")
    expect(setStatus(r, "nuevo", "Ana", label)).toBe(r)
  })
  it("stats: open, urgent, new from the site, solved in 30 days with the average time", () => {
    const now = Date.parse(at(10))
    const list = [
      newReport({ priority: "urgente", createdAt: at(0) }),
      newReport({ source: "web", createdAt: at(1) }),
      { ...newReport({ createdAt: at(0) }), status: "resuelto" as const, resolvedAt: at(4) },
      { ...newReport({ createdAt: at(0) }), status: "resuelto" as const, resolvedAt: at(8) },
    ]
    expect(reportStats(list, now)).toEqual({ open: 2, urgent: 1, fresh: 2, web: 1, solved30: 2, avgHours: 6 })
  })
  it("possible outage: other open reports of the same location within 24 h, same OLT port first", () => {
    const port = (id: string) => ({ "cli-aaaaaa": "0/1/0", "cli-bbbbbb": "0/1/0", "cli-cccccc": "0/1/2" })[id] ?? ""
    const me = newReport({ siteId: "site-uno-1", clientId: "cli-aaaaaa", createdAt: at(0) })
    const samePort = newReport({ siteId: "site-uno-1", clientId: "cli-bbbbbb", createdAt: at(-2) })
    const otherPort = newReport({ siteId: "site-uno-1", clientId: "cli-cccccc", createdAt: at(1) })
    const old = newReport({ siteId: "site-uno-1", createdAt: at(-30) })
    const elsewhere = newReport({ siteId: "site-dos-1", createdAt: at(0) })
    const closed = { ...newReport({ siteId: "site-uno-1", createdAt: at(0) }), status: "resuelto" as const }
    expect(relatedOpen(me, [me, samePort, otherPort, old, elsewhere, closed], port).map((r) => r.id)).toEqual([samePort.id, otherPort.id])
    expect(relatedOpen(newReport(), [me], port)).toEqual([])
  })
  it("clients that report again and again (3 in 90 days)", () => {
    const now = Date.parse(at(0))
    const list = [at(-1), at(-24 * 30), at(-24 * 80), at(-24 * 100)].map((c) => newReport({ clientId: "cli-aaaaaa", createdAt: c }))
    expect(repeatClients(list, 3, 90, now)).toEqual([{ clientId: "cli-aaaaaa", n: 3 }])
    expect(repeatClients(list.slice(1), 3, 90, now)).toEqual([])
  })
  it("public form: Mexican phone, a category from the list, consent; phone key ignores the country code", () => {
    const ok = reportSchema.safeParse({ name: "Ana López", phone: "+52 55 1234 5678", address: "Torre B 1204", category: "lento", description: "", consent: true })
    expect(ok.success && ok.data.phone).toBe("+525512345678")
    const bad = reportSchema.safeParse({ name: "A", phone: "123", address: "", category: "hack", description: "x".repeat(1001), consent: false })
    expect(bad.success ? [] : bad.error.issues.map((i) => i.path[0])).toEqual(["name", "phone", "address", "category", "description", "consent"])
    expect(phoneKey("+52 (55) 1234-5678")).toBe("5512345678")
  })
  it("reads stored values leniently; routes", () => {
    expect(decodeReport({ category: "nave", status: "x", priority: "y", cause: "z", notes: [{ text: 5 }, "n"], clientId: "../x" })).toMatchObject({ category: "otro", status: "nuevo", priority: "normal", cause: "", clientId: "" })
    expect(decodeReport(null)).toBeNull()
    expect(matchInternal("/interno/admin/Reportes_Clientes")?.rewriteTo).toBe("/es/interno/admin/reportes_clientes")
    expect(matchInternal("/interno/admin/reportes-clientes")?.rewriteTo).toBe("/es/interno/admin/reportes_clientes")
  })
})
