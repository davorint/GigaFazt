import { describe, expect, it } from "vitest"
import { outageStep, parsePing, parseRtt } from "./monitor"
import { agentScript, parseReport } from "./routers"

const gw = (received: number) => ({ ip: "10.0.0.1", sent: 5, received, rtt: received ? 3 : null })

describe("WispDavor phase 4: pings in the report", () => {
  it("reads flood-ping's average in the forms RouterOS may print", () => {
    expect([parseRtt("12"), parseRtt("1.5"), parseRtt("12ms"), parseRtt("1ms500us"), parseRtt("00:00:00.012"), parseRtt(""), parseRtt("abc")]).toEqual([12, 1.5, 12, 1.5, 12, null, null])
  })
  it("gateway and ONT lines; malformed ones skipped", () => {
    const r = parseReport("g;10.0.0.1;5;4;3ms\ng;bad host;5;5;1\no;ana;2;0;\no;beto;2;2;4\no;x;0;0;1\ng;10.0.0.2;5;9;1")
    expect(r.gateways).toEqual([{ ip: "10.0.0.1", sent: 5, received: 4, rtt: 3 }])
    expect(r.onts).toEqual([
      { user: "ana", sent: 2, received: 0, rtt: null },
      { user: "beto", sent: 2, received: 2, rtt: 4 },
    ])
    expect(parsePing("5", "6", "1")).toBeNull()
  })
  it("the agent script pings carriers and ONTs and still balances its braces", () => {
    const s = agentScript({ url: "https://www.gigafazt.com/api/routers/agente", routerId: "rt-000001", key: "k".repeat(32) })
    expect(s).toContain("/tool flood-ping address=$ip count=5")
    expect(s).toContain(":local stop ($wdOi + 100)")
    expect(s).not.toContain("${")
    const body = s.slice(s.indexOf("source={") + "source=".length, s.lastIndexOf("/system scheduler")).replace(/"(?:[^"\\]|\\.)*"/g, "")
    let depth = 0
    for (const ch of body) depth += ch === "{" ? 1 : ch === "}" ? -1 : 0
    expect(depth).toBe(0)
  })
})

describe("WispDavor phase 4: outages", () => {
  it("opens when sessions drop to half of the last half hour's peak (5 or more), not for small dips", () => {
    expect(outageStep(null, 40, 100, [gw(5)])).toEqual({ action: "open", kind: "sesiones", baseline: 100, low: 40 })
    expect(outageStep(null, 60, 100, [gw(5)])).toBeNull()
    expect(outageStep(null, 1, 4, [])).toBeNull()
  })
  it("every carrier silent opens a carrier outage; one answering ends it", () => {
    expect(outageStep(null, 90, 100, [gw(0), { ...gw(0), ip: "10.0.0.2" }])).toMatchObject({ action: "open", kind: "carrier" })
    expect(outageStep({ kind: "carrier", baseline: 100, low: 90 }, 90, 100, [gw(0), { ...gw(5), ip: "10.0.0.2" }])).toEqual({ action: "close" })
  })
  it("sessions: tracks the lowest, ends at 80 % of the peak before it; a silent router ends when it reports", () => {
    const open = { kind: "sesiones" as const, baseline: 100, low: 40 }
    expect(outageStep(open, 30, 40, [gw(5)])).toEqual({ action: "low", low: 30 })
    expect(outageStep(open, 70, 40, [gw(5)])).toBeNull()
    expect(outageStep(open, 80, 70, [gw(5)])).toEqual({ action: "close" })
    expect(outageStep({ kind: "router", baseline: 0, low: 0 }, null, 0, [])).toEqual({ action: "close" })
  })
})
