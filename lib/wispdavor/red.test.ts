import { describe, expect, it } from "vitest"
import { newClient, newService, type Client } from "../clients/model"
import { byPort, issuesOf, ontsOf, summary } from "./red"

const client = (id: string, s: Partial<ReturnType<typeof newService>>[]): Client => ({
  ...newClient(),
  id,
  name: `Cliente ${id}`,
  services: s.map((x, i) => ({ ...newService("internet"), id: `${id}-s${i}`, status: "activo", ...x })),
})

describe("Phase 8: network inventory", () => {
  const today = "2026-11-22"
  const clients = [
    client("a", [{ ontSn: "48575443aaaa0001", oltPort: "0/1/0", ontId: 0, rxDbm: -19, rxDate: today, rxHistory: [{ date: "2026-10-01", rx: -15, oltRx: null }] }]),
    client("b", [{ ontSn: "48575443AAAA0001", oltPort: "0/1/0", ontId: 1, rxDbm: -29, rxDate: today }]),
    client("c", [{ ontSn: "48575443AAAA0003", oltPort: "0/1/0", ontId: 1, rxDbm: -20, rxDate: "2026-09-01" }]),
    client("d", [{ ontSn: "", oltPort: "", ontId: null }]),
    client("e", [{ ontSn: "X", oltPort: "0/1/2", ontId: 3, status: "cancelado" }]),
    client("f", [{ ontSn: "48575443AAAA0006", oltPort: "0/1/10", ontId: 0, rxDbm: null }]),
  ]
  const onts = ontsOf(clients)
  it("cancelled services aren't ONTs; serials compared in capitals", () => {
    expect(onts.map((o) => o.clientId)).toEqual(["a", "b", "c", "d", "f"])
    expect(onts[0].sn).toBe("48575443AAAA0001")
    expect(onts[0].drop).toBe(4)
  })
  it("ports in numeric order, the lowest free ONT ID", () => {
    const p = byPort(onts)
    expect(p.map((r) => r.port)).toEqual(["0/1/0", "0/1/10"])
    expect(p[0]).toMatchObject({ used: 2, free: 126, nextFree: 2 })
    expect(p[1].nextFree).toBe(1)
  })
  it("what needs attention", () => {
    const kinds = issuesOf(onts, today).map((i) => ("ont" in i ? `${i.kind}:${i.ont.clientId}` : `${i.kind}:${i.onts.map((o) => o.clientId).join("+")}`))
    expect(kinds).toEqual(["dupSn:a+b", "dupId:b+c", "falling:a", "light:b", "stale:c", "missing:d", "noReading:f"])
    expect(summary(onts, issuesOf(onts, today))).toMatchObject({ total: 5, light: { bien: 2, baja: 1, none: 2 } })
  })
})
