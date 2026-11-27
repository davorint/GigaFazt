import { describe, expect, it } from "vitest"
import { newClient, newService } from "../clients/model"
import { newRoom, newRoomCarrier, newSite, newTower } from "../sites/model"
import { demoSet } from "./dashboard-demo"
import { demoLive, hubKey, liveLayout, liveNet, NO_LINK, readGateways, strandWidth, type LiveFigures } from "./tablero2-live"

const TODAY = "2026-11-27"
const NOW = Date.parse("2026-11-27T20:00:00Z")
const ago = (min: number) => new Date(NOW - min * 60000).toISOString()
const net = (user: string, p: Partial<ReturnType<typeof newService>> = {}) => newService("internet", { plan: "500M", monthly: 496, status: "activo", start: "2026-01-10", pppoeUser: user, ...p })

const a = newTower({ name: "A" })
const b = newTower({ name: "B" })
const norte = newSite({ name: "Norte", towers: [a, b], rooms: [newRoom({ carriers: [newRoomCarrier({ name: "Totalplay", downMbps: 1000, ip: "189.1.1.34" }), newRoomCarrier({ name: "Telmex ", downMbps: 500, ip: "200.2.2.10" })] })] })
const sur = newSite({ name: "Sur", towers: [newTower({ name: "Única" })], rooms: [newRoom({ carriers: [newRoomCarrier({ name: "totalplay", downMbps: 300, ip: "10.0.0.2" })] })] })
const lejos = newSite({ name: "Lejos", towers: [] })
const clients = [
  newClient({ siteId: norte.id, towerId: a.id, services: [net("n1", { rxDbm: -19 })] }),
  newClient({ siteId: norte.id, towerId: a.id, services: [net("n2", { rxDbm: -25.5 })] }),
  newClient({ siteId: norte.id, towerId: b.id, services: [net("n3", { rxDbm: -29 })] }),
  newClient({ siteId: norte.id, towerId: b.id, services: [net("n4", { status: "suspendido" })] }),
  newClient({ siteId: norte.id, towerId: b.id, services: [net("n5", { status: "cancelado", cancelledAt: "2026-10-01" })] }),
  newClient({ siteId: sur.id, towerId: "otra", services: [net("s1")] }),
  newClient({ siteId: sur.id, services: [newService("iptv", { monthly: 250, status: "activo" })] }),
]
const figures: LiveFigures = {
  now: new Date(NOW).toISOString(),
  routers: [
    { id: "r1", name: "R Norte", siteId: norte.id, lastSeen: ago(1), pollMinutes: 2, online: 3, gateways: [{ ip: "189.1.1.1", rtt: 4, loss: 0 }, { ip: "200.2.2.1", rtt: 9, loss: 0.2 }], active: ["n1", "n3", "n4"] },
    { id: "r2", name: "R Sur", siteId: sur.id, lastSeen: ago(30), pollMinutes: 5, online: 1, gateways: [{ ip: "10.0.0.1", rtt: 2, loss: 0 }], active: ["s1"] },
  ],
  traffic: [
    { siteId: norte.id, down: 1290, up: 200, at: ago(6) },
    { siteId: sur.id, down: 100, up: 20, at: ago(40) },
  ],
  outages: [],
}

describe("La red viva", () => {
  it("reads stored gateway reports field by field (loss = lost ÷ sent)", () => {
    expect(readGateways([{ ip: "1.1.1.1", sent: 5, received: 4, rtt: "3.25" }, { ip: 7 }, { ip: "2.2.2.2", sent: 0, received: 0, rtt: null }])).toEqual([
      { ip: "1.1.1.1", rtt: 3.3, loss: 0.2 },
      { ip: "2.2.2.2", rtt: null, loss: 0 },
    ])
    expect(readGateways("nada")).toEqual([])
  })

  it("towers, online by PPPoE session (suspended not counted), light problems, links matched to gateways by /24", () => {
    const n = liveNet([norte, sur, lejos], clients, TODAY, figures)
    const s = n.sites.find((x) => x.id === norte.id)!
    expect(s.towers.map((t) => [t.name, t.live, t.online, t.justo, t.baja])).toEqual([
      ["A", 2, 1, 1, 0],
      ["B", 2, 1, 0, 1],
    ])
    expect([s.live, s.online, s.capacity, s.use]).toEqual([4, 2, 1500, 1290])
    expect(s.share).toBeCloseTo(0.86)
    expect(s.state).toBe("full")
    expect(s.links.map((l) => [l.hub, l.gateway?.ip ?? null, l.state])).toEqual([
      ["totalplay", "189.1.1.1", "ok"],
      ["telmex", "200.2.2.1", "lossy"],
    ])
    expect([s.rtt, s.loss]).toEqual([6.5, 0.2])
  })

  it("a router silent for three of its intervals: no online count, stale traffic dropped; no router: no live data", () => {
    const n = liveNet([norte, sur, lejos], clients, TODAY, figures)
    const s = n.sites.find((x) => x.id === sur.id)!
    expect([s.state, s.online, s.use, s.towers[0].live]).toEqual(["silent", null, null, 1])
    expect(n.sites.find((x) => x.id === lejos.id)!.state).toBe("nodata")
    expect(liveNet([norte], clients, TODAY, null).sites[0]).toMatchObject({ state: "nodata", online: null, use: null })
  })

  it("an open failure wins; ≥ 95 % is saturated", () => {
    const out = liveNet([norte], clients, TODAY, { ...figures, outages: [{ routerId: "r1", siteId: norte.id, kind: "carrier", start: ago(10) }] })
    expect(out.sites[0].state).toBe("outage")
    const hot = liveNet([norte], clients, TODAY, { ...figures, traffic: [{ siteId: norte.id, down: 1450, up: 0, at: ago(6) }] })
    expect(hot.sites[0].state).toBe("saturated")
  })

  it("hubs by carrier name (case and spaces ignored), deployments without a link hang from their own hub; totals", () => {
    const n = liveNet([norte, sur, lejos], clients, TODAY, figures)
    expect(hubKey("  Total  Play ")).toBe("total play")
    expect(n.hubs.map((h) => [h.key, h.sites.length, h.capacity, h.state])).toEqual([
      ["totalplay", 2, 1300, "ok"],
      ["telmex", 1, 500, "lossy"],
      [NO_LINK, 1, null, "nodata"],
    ])
    expect(n.totals).toMatchObject({ live: 5, online: 2, use: 1290, capacity: 1500, outages: 1, full: 1, worst: { name: "Norte", rtt: 6.5 } })
  })

  it("layout: everything inside the square, one strand per link (plus one for a deployment without links)", () => {
    const n = liveNet([norte, sur, lejos], clients, TODAY, figures)
    for (const size of [340, 600]) {
      const l = liveLayout(n, size)
      expect(l.strands).toHaveLength(4)
      expect(l.sites.every((s) => s.x - s.r >= 0 && s.x + s.r <= size && s.y - s.r >= 0 && s.y + s.r <= size)).toBe(true)
      expect(l.hubs.every((h) => Math.hypot(h.x - size / 2, h.y - size / 2) < size / 2)).toBe(true)
      expect(l.strands.every((s) => /^M[\d.]+,[\d.]+ C/.test(s.d) && s.length > 0)).toBe(true)
    }
    expect(strandWidth(1000)).toBeCloseTo(6)
    expect(strandWidth(null)).toBe(1.2)
  })

  it("the simulated minute: one router per demo deployment, most clients online, changes from minute to minute", () => {
    const set = demoSet(TODAY)
    const f1 = demoLive(set, NOW)
    const f2 = demoLive(set, NOW + 60000)
    const n = liveNet(set.sites, set.clients, TODAY, f1)
    expect(f1.routers).toHaveLength(set.sites.length)
    expect(n.sites.every((s) => s.state !== "nodata" && s.online !== null && s.use !== null)).toBe(true)
    expect((n.totals.online ?? 0) / n.totals.live).toBeGreaterThan(0.75)
    expect(f1.traffic.map((t) => t.down)).not.toEqual(f2.traffic.map((t) => t.down))
  })
})
