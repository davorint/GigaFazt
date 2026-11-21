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
    expect(s).toContain("/system scheduler add name=wispdavor interval=2m")
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
