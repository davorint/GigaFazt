import { describe, expect, it } from "vitest"
import { newClient, newService } from "../clients/model"
import { newSite } from "../sites/model"
import { dayProfile, hourly, linkSpeed, mbps, siteCapacity, type Bucket } from "./capacity"

/** 12 buckets (one hour) of a constant rate in Mbps. */
const hourOf = (iso: string, downMbps: number, upMbps: number): Bucket[] =>
  Array.from({ length: 12 }, (_, i) => ({ at: new Date(Date.parse(iso) + i * 300000).toISOString(), down: (downMbps * 1e6 * 300) / 8, up: (upMbps * 1e6 * 300) / 8 }))

describe("Phase 13: link capacity", () => {
  const site = { ...newSite(), id: "s1", name: "Torre" }
  site.rooms = [{ ...site.rooms[0], carriers: [{ id: "c1", providerId: "", name: "A", downMbps: 500, upMbps: 500, ip: "", account: "", monthly: null, notes: "" }, { id: "c2", providerId: "", name: "B", downMbps: 500, upMbps: null, ip: "", account: "", monthly: null, notes: "" }] }]
  const clients = Array.from({ length: 20 }, (_, i) => ({ ...newClient(), id: `c${i}`, siteId: "s1", services: [{ ...newService("internet"), status: "activo" as const }] }))
  it("speeds and units", () => {
    expect(linkSpeed(site)).toEqual({ down: 1000, up: 500, links: 2 })
    expect(mbps(37.5e6)).toBe(1)
    expect(hourly(hourOf("2026-11-20T02:00:00.000Z", 100, 10))).toEqual([{ hour: "2026-11-20T02:00:00.000Z", down: 100, up: 10 }])
  })
  it("busy hour, use, room for more clients", () => {
    const b = [...hourOf("2026-11-20T02:00:00.000Z", 850, 50), ...hourOf("2026-11-20T15:00:00.000Z", 200, 20)]
    const c = siteCapacity(site, "Torre", b, clients)
    expect(c.busy?.hour).toBe("2026-11-20T02:00:00.000Z")
    expect(c.use).toBeCloseTo(0.85)
    expect(c.full).toBe(true)
    expect(c.perClient).toBeCloseTo(42.5)
    expect(c.roomFor).toBe(0)
    const light = siteCapacity(site, "Torre", hourOf("2026-11-20T02:00:00.000Z", 400, 50), clients)
    expect(light.full).toBe(false)
    expect(light.roomFor).toBe(20)
  })
  it("the hour-of-day profile is in Mexico City time", () => {
    const p = dayProfile(hourly(hourOf("2026-11-20T02:00:00.000Z", 100, 10)))
    expect(p[20].down).toBe(100)
    expect(p[2].down).toBe(0)
  })
})
