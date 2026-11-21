import { describe, expect, it } from "vitest"
import { newClient, newService } from "../clients/model"
import { newPayment } from "../payments/model"
import { decodePlans, newVouchers, planIssues, profileOf, voucherActions } from "./hotspot"
import { SUSPENDED_PROFILE, actionLine, agentScript, desiredUsers, diffRouter, parseReport, safe } from "./routers"

const TODAY = "2026-11-21"
const svc = (id: string, p: Partial<ReturnType<typeof newService>> = {}) => newService("internet", { id: `${id}-s`, monthly: 396, plan: "200M", start: "2026-09-01", pppoeUser: id, ...p })
const client = (id: string, p = {}, s: Partial<ReturnType<typeof newService>> = {}) => newClient({ id: `cli-${id}`, name: id, siteId: "site-001", billingFrom: "2026-09", services: [svc(id, s)], ...p })
const paidUp = (id: string) => newPayment({ clientId: `cli-${id}`, date: "2026-11-02", amount: 396 * 3, method: "transferencia" })

describe("WispDavor phase 3: router reports", () => {
  it("reads secrets, hotspot users and results; skips junk", () => {
    const r = parseReport("s;ana;200M;false;1;1000;5000\ns;beto;DSX-suspendido;true;0;0;0\nh;ab12cd34;1h5m;2048\nd;17;ok\nd;18;err\nbasura\ns;;x")
    expect(r.secrets).toEqual([
      { user: "ana", profile: "200M", disabled: false, active: true, rx: 1000, tx: 5000 },
      { user: "beto", profile: "DSX-suspendido", disabled: true, active: false, rx: 0, tx: 0 },
    ])
    expect(r.hotspot).toEqual([{ name: "ab12cd34", uptime: "1h5m", bytes: 2048 }])
    expect(r.done).toEqual([
      { id: 17, ok: true },
      { id: 18, ok: false },
    ])
  })
})

describe("WispDavor phase 3: desired state and differences", () => {
  const late = client("ana")
  const promised = client("beto", { promiseDate: "2026-11-25" })
  const paid = client("caro")
  const cancelled = client("dani", {}, { status: "cancelado" })
  const newOne = client("eva")
  const desired = desiredUsers([late, promised, paid, cancelled, newOne], [paidUp("caro"), paidUp("eva")], TODAY)

  it("late without a standing promise → suspended profile; paid → plan; cancelled → disabled", () => {
    const by = Object.fromEntries(desired.map((d) => [d.user, d]))
    expect(by.ana).toMatchObject({ profile: SUSPENDED_PROFILE, suspended: true })
    expect(by.beto).toMatchObject({ profile: "200M", suspended: false })
    expect(by.caro).toMatchObject({ profile: "200M" })
    expect(by.dani).toMatchObject({ disabled: true })
  })

  it("only differences are sent; users the router lacks are left for staff; others on the router untouched", () => {
    const { changes, missing } = diffRouter(desired, [
      { user: "ana", profile: "200M", disabled: false },
      { user: "beto", profile: SUSPENDED_PROFILE, disabled: false },
      { user: "caro", profile: "200M", disabled: false },
      { user: "dani", profile: "200M", disabled: false },
      { user: "otro-del-router", profile: "x", disabled: false },
    ])
    expect(changes.map((c) => `${c.kind}:${c.user}:${c.profile}`)).toEqual([`profile:ana:${SUSPENDED_PROFILE}`, "profile:beto:200M", "disable:dani:"])
    expect(missing.map((m) => m.user)).toEqual(["eva"])
  })
})

describe("WispDavor phase 3: what goes to the router is safe", () => {
  it("action lines: no unsafe values, no empty trailing fields", () => {
    expect(actionLine({ id: 5, kind: "profile", user: "ana", arg1: "200M", arg2: "", arg3: "", arg4: "" })).toBe("5,profile,ana,200M")
    expect(actionLine({ id: 6, kind: "profile", user: 'ana"; /system reset', arg1: "200M", arg2: "", arg3: "", arg4: "" })).toBeNull()
    expect(actionLine({ id: 7, kind: "profile", user: "a,b", arg1: "200M", arg2: "", arg3: "", arg4: "" })).toBeNull()
    expect(safe("ana.perez@edificio")).toBe(true)
    expect(safe("con espacio")).toBe(false)
  })

  it("the agent script: balanced braces, fixed commands, never :parse, HTTPS checked", () => {
    const s = agentScript({ url: "https://www.gigafazt.com/api/routers/agente", routerId: "rt-000001", key: "k".repeat(32) })
    const body = s.slice(s.indexOf("source={") + "source=".length, s.lastIndexOf("/system scheduler"))
    const stripped = body.replace(/"(?:[^"\\]|\\.)*"/g, "")
    let depth = 0
    let min = 0
    for (const ch of stripped) {
      if (ch === "{") depth++
      if (ch === "}") depth--
      min = Math.min(min, depth)
    }
    expect(depth).toBe(0)
    expect(min).toBe(0)
    expect(s).not.toContain(":parse")
    expect(s).toContain("check-certificate=yes")
    expect(s).toContain("Bearer rt-000001.")
    expect(s).toContain("/system scheduler add name=wispdavor interval=5m")
  })
})

describe("WispDavor phase 3: hotspot vouchers", () => {
  it("plans as the owner sets them; vouchers unique; actions with profile, limits and bytes", () => {
    const [p] = decodePlans([{ id: "abc123", name: "1 día", minutes: 1440, mb: 0, rate: "5M/10M", price: 25 }])
    expect(planIssues(p)).toEqual([])
    expect(planIssues({ ...p, minutes: 0, mb: 0 })).toEqual(["limit"])
    const vs = newVouchers(50, new Set())
    expect(new Set(vs.map((v) => v.code)).size).toBe(50)
    const a = voucherActions(p, vs.slice(0, 2))!
    expect(a[0]).toMatchObject({ kind: "hsprofile", user: profileOf(p), arg1: "5M/10M" })
    expect(a[1]).toMatchObject({ kind: "voucher", user: vs[0].code, arg1: "WD-abc123", arg3: "1440m", arg4: "0" })
  })
})

describe("WispDavor review (2026-11-21)", () => {
  it("a manual hold stays suspended even when paid up; a debt suspension reconnects", async () => {
    const { cutLists } = await import("./cortes")
    const held = client("fer", {}, { status: "suspendido", hold: true })
    const debt = client("gus", {}, { status: "suspendido" })
    const pays = [paidUp("fer"), paidUp("gus")]
    const by = Object.fromEntries(desiredUsers([held, debt], pays, TODAY).map((d) => [d.user, d]))
    expect(by.fer).toMatchObject({ profile: SUSPENDED_PROFILE, suspended: true })
    expect(by.gus).toMatchObject({ profile: "200M", suspended: false })
    expect(cutLists([held, debt], pays, TODAY).restore.map((r) => r.user)).toEqual(["gus"])
  })

  it("services WispDavor can't manage are reported, not skipped silently", async () => {
    const { unmanagedUsers } = await import("./routers")
    const bad = client("hugo", {}, { plan: "200 Mbps" })
    const noPlan = client("ivan", {}, { plan: "" })
    expect(unmanagedUsers([bad, noPlan, client("ok")]).map((u) => [u.user, u.reason])).toEqual([
      ["hugo", "plan"],
      ["ivan", "plan"],
    ])
  })

  it("a report too big for traffic: state-only lines", () => {
    expect(parseReport("S;ana;200M;false").secrets).toEqual([{ user: "ana", profile: "200M", disabled: false, active: false, rx: 0, tx: 0, stateOnly: true }])
  })

  it("CFDI: the months a payment covers, as Cobranza applies it", async () => {
    const { monthsCovered, monthsLabel } = await import("./cfdi")
    const c = client("jose")
    const p1 = newPayment({ id: "pay-0001", clientId: "cli-jose", date: "2026-09-05", amount: 396, method: "efectivo" })
    const p2 = newPayment({ id: "pay-0002", clientId: "cli-jose", date: "2026-11-02", amount: 792, method: "transferencia" })
    expect(monthsCovered(c, [p1, p2], "pay-0001", TODAY)).toEqual(["2026-09"])
    expect(monthsCovered(c, [p1, p2], "pay-0002", TODAY)).toEqual(["2026-10", "2026-11"])
    expect(monthsLabel(["2026-10", "2026-11"])).toBe("octubre y noviembre de 2026")
    expect(monthsLabel(["2026-12", "2027-01", "2027-02"])).toBe("diciembre de 2026 a febrero de 2027")
  })
})

describe("Manual holds aren't charged (owner, 2026-11-21)", () => {
  it("a month whose day 1 falls in a hold is free; the month a hold starts in still pays", async () => {
    const { ledger } = await import("../payments/model")
    const { withHold } = await import("../clients/model")
    // Service since September; on hold from 2026-09-20 to 2026-11-05 → October and November free, September charged.
    const s = { ...svc("kiko"), status: "activo" as const, holds: [{ from: "2026-09-20", to: "2026-11-05" }] }
    const c = newClient({ id: "cli-kiko", name: "kiko", siteId: "site-001", billingFrom: "2026-09", services: [s] })
    const l = ledger(c, [], TODAY)
    expect(l.months.map((m) => [m.month, m.charge])).toEqual([
      ["2026-09", 396],
      ["2026-10", 0],
      ["2026-11", 0],
    ])
    expect(l.paused).toEqual(["2026-10", "2026-11"])
    // Still on hold: open period counts only while the flag is on; turning it off closes it today.
    const open = withHold({ ...svc("lalo"), status: "suspendido" as const }, true, "2026-10-15")
    const held = newClient({ id: "cli-lalo", name: "lalo", siteId: "site-001", billingFrom: "2026-09", services: [open] })
    expect(ledger(held, [], TODAY).months.map((m) => m.charge)).toEqual([396, 396, 0])
    expect(ledger(held, [], TODAY).monthly).toBe(0)
    const off = withHold(open, false, "2026-11-21")
    expect(off.holds).toEqual([{ from: "2026-10-15", to: "2026-11-21" }])
    expect(withHold(withHold(svc("x"), true, TODAY), false, TODAY).holds).toEqual([])
  })
})

describe("Report rate per router (owner, 2026-11-21: 2, 5 or 10 minutes)", () => {
  it("silent after 3 intervals, resent after about 2 (never under 10 min), default 5", async () => {
    const { DEFAULT_POLL, isOnline, pollOf, resendMinutes, silentMinutes } = await import("./routers")
    expect([pollOf(2), pollOf("10"), pollOf(7), pollOf(undefined)]).toEqual([2, 10, DEFAULT_POLL, DEFAULT_POLL])
    expect(DEFAULT_POLL).toBe(5)
    expect([silentMinutes(2), silentMinutes(5), silentMinutes(10)]).toEqual([6, 15, 30])
    expect([resendMinutes(2), resendMinutes(5), resendMinutes(10)]).toEqual([10, 12, 22])
    const now = Date.parse("2026-11-21T12:00:00Z")
    expect(isOnline("2026-11-21T11:50:00Z", 5, now)).toBe(true)
    expect(isOnline("2026-11-21T11:50:00Z", 2, now)).toBe(false)
    expect(isOnline("", 10, now)).toBe(false)
  })
  it("the agent script's scheduler takes the router's rate", () => {
    const base = { url: "https://www.gigafazt.com/api/routers/agente", routerId: "rt-000001", key: "k".repeat(32) }
    expect(agentScript(base)).toContain("interval=5m")
    expect(agentScript({ ...base, pollMinutes: 10 })).toContain("interval=10m")
  })
})

describe("Agent script robustness (2026-11-21 review)", () => {
  const s = agentScript({ url: "https://www.gigafazt.com/api/routers/agente", routerId: "rt-000001", key: "k".repeat(32) })
  it("each item is read inside its own :do (a client gone between find and get doesn't stop the report)", () => {
    expect(s).toContain(":do { :set rx [/interface get ($i->0) rx-byte]")
    expect(s).toContain(":local ad [/ppp active get $x address]")
    expect(s.split(String.fromCharCode(10)).some((l, i, a) => l.trim() === ":do {" && a[i + 1]?.trim() === ":local x ($act->$j)")).toBe(true)
    expect(s).toContain(":do { :set gs [:tostr [/ip route get $g gateway]] } on-error={}")
  })
  it("a report rebuilt without traffic still carries the gateway and voucher lines", () => {
    expect(s).toContain(":set out ($wdDone . $gl . $hl)")
  })
  it("an action line never has an empty field in the middle", () => {
    expect(actionLine({ id: 9, kind: "voucher", user: "abc12345", arg1: "WD-x", arg2: "", arg3: "60m", arg4: "0" })).toBeNull()
    expect(actionLine({ id: 9, kind: "profile", user: "ana", arg1: "200M", arg2: "", arg3: "", arg4: "" })).toBe("9,profile,ana,200M")
  })
})
