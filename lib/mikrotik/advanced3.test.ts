import { describe, expect, it } from "vitest"
import type { AdvContext } from "./advanced"
import {
  DEFAULT_CONNTRACK,
  DEFAULT_POOL,
  DEFAULT_PORTS,
  DEFAULT_SESSIONS,
  HEAVY_LIST,
  conntrackScript,
  defaultPorts,
  poolScript,
  portsScript,
  sessionsScript,
  sheetCommand,
  sheetScript,
} from "./advanced3"
import { checkScript } from "./ros-syntax"
import { DEFAULT_SETUP } from "./setup"
import { initialState } from "./state"

const wans = initialState().wans
const ctx = (patch: Partial<AdvContext["setup"]> = {}): AdvContext => ({ name: "Torre A", setup: { ...DEFAULT_SETUP, alert: "telegram", telegramChat: "1", ...patch }, wans, failover: "recursive" })
const codes = (r: { issues: { code: string }[] }) => r.issues.map((i) => i.code)
/** Every { has its } in each step and in the undo (the stored sources are one-liners). */
const balanced = (r: { steps: { script: string }[]; undo: string }) =>
  [...r.steps.map((s) => s.script), r.undo].every((x) => (x.match(/\{/g) ?? []).length === (x.match(/\}/g) ?? []).length)

describe("client sheet", () => {
  const r = sheetScript(ctx())
  it("defines a global function at paste time and at every boot", () => {
    expect(r.script).toContain('add name=DSX-ficha policy=read,write,test dont-require-permissions=yes source=":global DSXficha do={')
    expect(r.script).toContain("/system script run DSX-ficha")
    expect(r.script).toContain("add name=DSX-ficha start-time=startup on-event=DSX-ficha")
    expect(r.steps[0].script.split("\n")[0]).toContain("DS-clientes")
  })
  it("reads the account, the last disconnect, the session, live traffic, connections and a ping", () => {
    for (const x of ["last-logged-out", "last-disconnect-reason", "last-caller-id", "rate-limit", "/interface monitor-traffic", "count-only", "/tool ping address=\\$ip count=5"]) expect(r.script).toContain(x)
  })
  it("the terminal command, and the undo also forgets the function", () => {
    expect(sheetCommand(" juan.perez ")).toBe(':global DSXficha; $DSXficha "juan.perez"')
    expect(r.undo).toContain('/system script environment remove [find where name="DSXficha"]')
    expect(balanced(r)).toBe(true)
  })
})

describe("stuck and flapping sessions", () => {
  it("removes sessions without address or interface after 2 min, and counts new session-ids", () => {
    const r = sessionsScript(ctx(), DEFAULT_SESSIONS)
    expect(r.script).toContain("/ppp active remove \\$a")
    expect(r.script).toContain("session-id")
    expect(r.script).toContain("add name=DSX-sesiones interval=2m")
    expect(r.script).toContain("add name=DSX-sesiones-hora interval=1h")
    expect(r.script).toContain("/system script run DS-aviso")
    expect(balanced(r)).toBe(true)
  })
  it("without the cleanup or the report, only the other part", () => {
    const noStale = sessionsScript(ctx(), { stale: false, flaps: 4 })
    expect(noStale.script).not.toContain("/ppp active remove")
    expect(balanced(noStale)).toBe(true)
    const noReport = sessionsScript(ctx(), { stale: true, flaps: 0 })
    expect(noReport.script).not.toContain("DSX-sesiones-hora")
    expect(codes(sessionsScript(ctx(), { stale: false, flaps: 0 }))).toContain("nothing")
  })
  it("without alerts it writes to the log", () => {
    const r = sessionsScript(ctx({ alert: "none" }), DEFAULT_SESSIONS)
    expect(codes(r)).toContain("logOnly")
    expect(r.script).not.toContain("DS-aviso")
    expect(r.script).toContain(":log warning")
  })
})

describe("pool filling up", () => {
  it("reads the pool size from its ranges and alerts once each way", () => {
    const r = poolScript(ctx(), DEFAULT_POOL)
    expect(r.script).toContain('/ip pool used find where pool=\\"DS-clientes\\"')
    expect(r.script).toContain("[:toip [:pick \\$s")
    expect(r.script).toContain("(\\$p >= 90)")
    expect(r.script).toContain("(\\$p < 85)")
    expect(balanced(r)).toBe(true)
  })
  it("needs alerts and a sane level", () => {
    expect(codes(poolScript(ctx({ alert: "none" }), DEFAULT_POOL))).toContain("needsAlerts")
    expect(codes(poolScript(ctx(), { pct: 100 }))).toContain("poolPct")
  })
})

describe("connection table", () => {
  const r = conntrackScript(ctx(), DEFAULT_CONNTRACK)
  it("lists heavy clients at the top of prerouting and compares total with max entries", () => {
    expect(r.script).toContain(`chain=prerouting src-address=100.64.0.0/22 connection-state=new connection-limit=1000,32 action=add-src-to-address-list address-list=${HEAVY_LIST} address-list-timeout=15m`)
    expect(r.script).toContain("place-before=[:pick $p 0]")
    expect(r.script).toContain("total-entries")
    expect(r.script).toContain("max-entries")
    expect(r.script).toContain("add name=DSX-conexiones interval=1m")
    expect(r.undo).toContain(`/ip firewall address-list remove [find where list="${HEAVY_LIST}"]`)
    expect(balanced(r)).toBe(true)
  })
  it("the critical level must be above the high one", () => {
    expect(codes(conntrackScript(ctx(), { ...DEFAULT_CONNTRACK, warn: 95, crit: 90 }))).toContain("ctLevels")
    expect(codes(conntrackScript(ctx(), { ...DEFAULT_CONNTRACK, perClient: 10 }))).toContain("perClient")
  })
})

describe("ports and SFP optics", () => {
  it("watches the OLT port and the carriers' Ethernet ports by default", () => {
    const c = ctx()
    const expected = [c.setup.oltPort, ...c.wans.filter((w) => w.type !== "pppoe").map((w) => w.iface)]
    expect(defaultPorts(c)).toBe([...new Set(expected)].join(", "))
  })
  it("link and rate changes, receive power against the first reading, module temperature", () => {
    const r = portsScript(ctx(), { ...DEFAULT_PORTS, ports: "sfp-sfpplus1, ether1" })
    expect(r.script).toContain('in={\\"sfp-sfpplus1\\";\\"ether1\\"}')
    expect(r.script).toContain("/interface ethernet monitor \\$p once as-value")
    expect(r.script).toContain("sfp-rx-power")
    expect(r.script).toContain(">= 30)")
    expect(r.script).toContain("sfp-temperature")
    expect(r.script).toContain("(\\$y > 700)")
    expect(balanced(r)).toBe(true)
  })
  it("rejects empty lists and odd names", () => {
    expect(codes(portsScript(ctx(), { ...DEFAULT_PORTS, ports: "" }))).toContain("noPorts")
    expect(codes(portsScript(ctx(), { ...DEFAULT_PORTS, ports: "ether1, a b" }))).not.toContain("badPort")
    expect(codes(portsScript(ctx(), { ...DEFAULT_PORTS, ports: "ether1, $x" }))).toContain("badPort")
  })
})

describe("RouterOS 7.25 syntax", () => {
  it("every new script", () => {
    const all = [sheetScript(ctx()), sessionsScript(ctx(), DEFAULT_SESSIONS), poolScript(ctx(), DEFAULT_POOL), conntrackScript(ctx(), DEFAULT_CONNTRACK), portsScript(ctx(), { ...DEFAULT_PORTS, ports: "sfp-sfpplus1" })]
    for (const r of all) expect(checkScript(`${r.script}\n${r.undo}`)).toEqual([])
  })
})
