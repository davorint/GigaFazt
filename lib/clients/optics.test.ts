import { describe, expect, it } from "vitest"
import { newClient, newService } from "./model"
import { applyOptics, clientLight, lightStatus, matchOptics, parseOltOptics } from "./optics"

const TABLE = `MA5608T(config)#interface gpon 0/1
MA5608T(config-if-gpon-0/1)#display ont optical-info 0 all
  -----------------------------------------------------------------------------
  ONT  Rx power  Tx power  OLT Rx ONT  Temperature  Voltage  Current
  ID   (dBm)     (dBm)     power(dBm)  (C)          (V)      (mA)
  -----------------------------------------------------------------------------
  0    -19.38    2.21      -21.55      47           3.280    11
  1    -26.10    2.05      -28.02      45           3.270    12
  2    -         -         -           -            -        -
  -----------------------------------------------------------------------------`

const DETAIL = `  F/S/P                                   : 0/1/3
  ONT-ID                                  : 7
  Rx optical power(dBm)                   : -27.62
  Tx optical power(dBm)                   : 2.10
  OLT Rx ONT optical power(dBm)           : -29.40
  -----------------------------------------------------------------------------`

describe("light at each client's ONT", () => {
  it("reads the port table (frame/slot from the prompt, port from the command), skipping offline ONTs", () => {
    const r = parseOltOptics(TABLE)
    expect(r.readings.map((x) => [x.port, x.ontId, x.rx, x.oltRx])).toEqual([
      ["0/1/0", 0, -19.38, -21.55],
      ["0/1/0", 1, -26.1, -28.02],
    ])
    expect(r.offline).toBe(1)
  })
  it("reads one ONT's detail and plain lines", () => {
    expect(parseOltOptics(DETAIL).readings.map((x) => [x.port, x.ontId, x.rx, x.oltRx])).toEqual([["0/1/3", 7, -27.62, -29.4]])
    expect(parseOltOptics("0/1/0, 5, -18.2\n0-1-1 3 -20\n0/1/2;9;-22.5;-24").readings.map((x) => [x.port, x.ontId, x.rx, x.oltRx])).toEqual([
      ["0/1/0", 5, -18.2, null],
      ["0/1/2", 9, -22.5, -24],
    ])
    // A table row without the prompt and command can't be placed on a port.
    expect(parseOltOptics("  0    -19.38    2.21      -21.55").readings).toEqual([])
  })
  it("status against the ONT's −27 dBm sensitivity with a 3 dB margin, and saturation above −8 dBm", () => {
    expect([-15, -24, -25.5, -27.5, -7].map(lightStatus)).toEqual(["bien", "bien", "justo", "baja", "satura"])
    expect(lightStatus(null)).toBeNull()
  })
  it("matches by OLT port and ONT ID within the location; applies every matched service; the worst light per client", () => {
    const a = newClient({ siteId: "sitio-uno-1", services: [newService("internet", { oltPort: "0/1/0", ontId: 1 })] })
    const b = newClient({ siteId: "sitio-dos-1", services: [newService("internet", { oltPort: "0-1-0", ontId: 0 })] })
    const c = newClient({ siteId: "sitio-uno-1", services: [newService("internet", { oltPort: "0/1/0", ontId: 0 }), newService("internet", { oltPort: "0/1/3", ontId: 7 })] })
    const readings = [...parseOltOptics(TABLE).readings, ...parseOltOptics(DETAIL).readings]
    const m = matchOptics(readings, [a, b, c], "sitio-uno-1")
    expect(m.matched.map((x) => x.client.id)).toEqual([c.id, a.id, c.id])
    expect(m.unknown).toEqual([])
    const changed = applyOptics(m, "2026-11-18")
    expect(changed.map((x) => x.id)).toEqual([c.id, a.id])
    const cc = changed[0]
    expect(cc.services.map((s) => [s.rxDbm, s.rxDate])).toEqual([
      [-19.38, "2026-11-18"],
      [-27.62, "2026-11-18"],
    ])
    expect(clientLight(cc)).toEqual({ rx: -27.62, status: "baja" })
    // Without a location, the other location's client on the same port is found too.
    expect(matchOptics(readings, [a, b], "").matched.map((x) => x.client.id)).toEqual([b.id, a.id])
  })
})

describe("light history (2026-11-19)", () => {
  it("each new day's reading moves the previous one to the history; the same day only keeps the last; the drop since the first shows", async () => {
    const { newService, withReading, lightDrop, decodeClient } = await import("./model")
    let s = newService("internet")
    s = withReading(s, -19.5, -22, "2026-09-01")
    s = withReading(s, -20, null, "2026-09-01")
    expect(s.rxHistory).toEqual([])
    s = withReading(s, -21.2, null, "2026-10-15")
    s = withReading(s, -22.4, null, "2026-11-19")
    expect(s.rxHistory.map((h) => [h.date, h.rx])).toEqual([["2026-09-01", -20], ["2026-10-15", -21.2]])
    expect(s).toMatchObject({ rxDbm: -22.4, rxDate: "2026-11-19" })
    expect(lightDrop(s)).toBe(2.4)
    const back = decodeClient({ services: [{ ...s, type: "internet" }] })!.services[0]
    expect(back.rxHistory).toHaveLength(2)
  })
})
