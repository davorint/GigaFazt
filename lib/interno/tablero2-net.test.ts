import { describe, expect, it } from "vitest"
import { newClient, newService } from "../clients/model"
import { newRoom, newRoomCarrier, newSite } from "../sites/model"
import { demoSet } from "./dashboard-demo"
import { demoCarriers } from "./tablero2-demo"
import { carrierOf, continuityStrip, gatewayStats, hourglass, planSpeed, quantile, runs, saturation } from "./tablero2-net"

const H = 3600000

describe("Tablero 2, carriers and continuity", () => {
  it("names a gateway's carrier: the only link, or the one on the same /24; else nothing", () => {
    const one = newSite({ rooms: [newRoom({ carriers: [newRoomCarrier({ name: "Telmex" })] })] })
    const two = newSite({ rooms: [newRoom({ carriers: [newRoomCarrier({ name: "Totalplay", ip: "201.10.20.5" }), newRoomCarrier({ name: "Izzi", ip: "NAT" })] })] })
    expect(carrierOf([one, two], one.id, "10.0.0.1")).toBe("Telmex")
    expect(carrierOf([one, two], two.id, "201.10.20.1")).toBe("Totalplay")
    expect(carrierOf([one, two], two.id, "192.168.1.1")).toBe("")
  })

  it("gateway week: median latency, high percentile, pings lost", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5)
    const s = gatewayStats([
      { t: "a", rtt: 4, p95: 8, loss: 0 },
      { t: "b", rtt: 6, p95: 12, loss: 0.1 },
      { t: "c", rtt: null, p95: null, loss: 1 },
    ])
    expect(s.rtt).toBe(5)
    expect(s.loss).toBeCloseTo(1.1 / 3)
  })

  it("continuity strip: outage over lossy over ok over no data; availability since the first report", () => {
    const now = Date.parse("2026-11-20T12:30:00Z")
    const hour = (ago: number) => new Date(Math.floor(now / H) * H - ago * H).toISOString()
    const c = {
      routerId: "r",
      router: "R",
      siteId: "",
      hours: [hour(48), hour(47), hour(3), hour(2), hour(1), hour(0)].map((t, i) => ({ t, lossy: i === 3 })),
      outages: [{ kind: "carrier" as const, start: hour(3), end: new Date(Date.parse(hour(3)) + 30 * 60000).toISOString() }],
    }
    const s = continuityStrip(c, now, 3)
    expect(s.cells).toHaveLength(72)
    expect(s.cells.slice(-4)).toEqual([3, 2, 1, 1])
    expect(s.cells[s.cells.length - 49]).toBe(1)
    expect(s.cells[0]).toBe(0)
    expect(s.downMinutes).toBe(30)
    const watched = now - Date.parse(hour(48))
    expect(s.availability).toBeCloseTo(1 - (30 * 60000) / watched)
    expect(runs([0, 0, 1, 1, 1, 3, 1])).toEqual([
      { from: 0, to: 2, cell: 0 },
      { from: 2, to: 5, cell: 1 },
      { from: 5, to: 6, cell: 3 },
      { from: 6, to: 7, cell: 1 },
    ])
  })

  it("hourglass: speed sold vs links vs what each gets with everyone on at once", () => {
    expect([planSpeed("200M"), planSpeed("500 Mbps"), planSpeed("1G"), planSpeed("1.5 Gbps"), planSpeed("Básico")]).toEqual([200, 500, 1000, 1500, null])
    const s = newSite({ name: "Uno", rooms: [newRoom({ carriers: [newRoomCarrier({ downMbps: 1000 })] })] })
    const clients = [newClient({ siteId: s.id, services: [newService("internet", { plan: "500M", status: "activo" })] }), newClient({ siteId: s.id, services: [newService("internet", { plan: "1G", status: "activo" })] }), newClient({ siteId: s.id, services: [newService("internet", { plan: "Sin nombre", status: "activo" })] })]
    const [g] = hourglass([s], clients, new Map([["Uno", 640]]))
    expect(g).toMatchObject({ sold: 1500, unknown: 1, link: 1000, busy: 640, active: 3, ratio: 1.5 })
    expect(g.each).toBeCloseTo(1000 / 3)
  })

  it("saturation: a line over six weeks, days until 80 %, already full, or flat", () => {
    const s = newSite({ name: "Uno", rooms: [newRoom({ carriers: [newRoomCarrier({ downMbps: 100, upMbps: 100 })] })] })
    const flat = newSite({ name: "Dos", rooms: [newRoom({ carriers: [newRoomCarrier({ downMbps: 100 })] })] })
    const today = "2026-11-20"
    const day = (k: number) => new Date(Date.parse(`${today}T12:00:00Z`) - k * 864e5).toISOString().slice(0, 10)
    const rising = { siteId: s.id, days: Array.from({ length: 50 }, (_, i) => ({ day: day(49 - i), down: 50 + i * 0.5, up: 5 })) }
    const level = { siteId: flat.id, days: Array.from({ length: 50 }, (_, i) => ({ day: day(49 - i), down: 40, up: 5 })) }
    const [a, b] = saturation([s, flat], [rising, level], today)
    expect(a.slope).toBeCloseTo(0.005)
    expect(a.level).toBeCloseTo(0.745)
    expect(a.eta).toBe(11)
    expect(b.eta).toBeNull()
    expect(b.full).toBe(false)
    // Today's busiest hour so far (a day not over) is left out: a low reading this morning changes nothing.
    rising.days[rising.days.length - 1] = { day: today, down: 10, up: 1 }
    expect(saturation([s], [rising], today)[0].eta).toBe(11)
  })

  it("the simulated operator's carriers fill every chart: lossy hours, outages, one link filling soon", () => {
    const set = demoSet("2026-11-22")
    const now = Date.parse("2026-11-22T18:00:00Z")
    const f = demoCarriers(set, now)
    expect(f.gateways.length).toBeGreaterThanOrEqual(6)
    expect(carrierOf(set.sites, f.gateways[0].siteId, f.gateways[0].ip)).toBe("Carrier A")
    const strips = f.continuity.map((c) => continuityStrip(c, now))
    expect(strips.some((x) => x.cells.includes(3))).toBe(true)
    expect(strips.every((x) => (x.availability ?? 0) > 0.99)).toBe(true)
    const fc = saturation(set.sites, f.daily, "2026-11-22")
    expect(fc.some((x) => x.full)).toBe(true)
    expect(fc.some((x) => !x.full && x.eta !== null && x.eta < 60)).toBe(true)
  })
})
