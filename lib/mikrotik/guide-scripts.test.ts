import { describe, expect, it } from "vitest"
import { matchInternal } from "../internal-pages"
import { BUNDLE_ORDER, bundleModules, merge, optionsOf, stepBlock } from "./bundle"
import { advContext, deploymentBundle, guideScripts } from "./guide-scripts"
import { inspectExport, type PartSpec } from "./inspect"
import { decodeAdvanced, decodeDeployment, deploymentFields, encodeDeployment, initialState, type LabState } from "./state"

const base = (): LabState => initialState()
const withAdv = (on: string[], o: Record<string, Record<string, unknown>> = {}): LabState => ({ ...base(), advanced: { on, o } })

describe("guide steps", () => {
  it("come in pasting order, each opened by its guards and with a check", () => {
    const g = guideScripts(base())
    expect(g.steps.map((s) => s.id).slice(0, 5)).toEqual(["base", "balance", "pppoe", "cgnat", "hardening"])
    expect(g.steps[0].script.split("\n")[0]).toMatch(/DS-WAN.*> 0.*:error "DS: la base ya esta/)
    for (const s of g.steps.slice(1)) expect(s.script).toContain('name="DS-WAN"]] = 0) do={:error')
    expect(g.steps.every((s) => s.verify)).toBe(true)
  })
  it("the balancing stops when it's already there or a DHCP link has no lease", () => {
    const s = base()
    const bal = guideScripts(s).steps.find((x) => x.id === "balance")!.script
    expect(bal).toContain(':if ([:len [/routing table find where comment~"^LB: "]] > 0) do={:error')
    const dhcp = s.wans.filter((w) => w.type === "dhcp")
    expect(dhcp.length).toBeGreaterThan(0)
    for (const w of dhcp) expect(bal).toContain(`[/ip dhcp-client find where interface="${w.iface}"]`)
    expect(bal).toContain('status] != "bound") do={:error')
  })
  it("no steps when the settings have errors", () => {
    const s = base()
    expect(guideScripts({ ...s, setup: { ...s.setup, pool: "nada" } }).steps).toEqual([])
    expect(deploymentBundle({ ...s, setup: { ...s.setup, pool: "nada" } }).steps).toEqual([])
  })
})

describe("deployment bundle", () => {
  it("guide first, then the turned-on scripts in bundle order, undo in reverse", () => {
    const b = deploymentBundle(withAdv(["prioridad", "filtros"]))
    const groups = [...new Set(b.steps.map((s) => s.group))]
    expect(groups).toEqual(["guide", "filtros", "prioridad"])
    const undoFiltros = b.undo.indexOf("DSX filtros: ")
    const undoPrioridad = b.undo.indexOf("DSX prioridad: ")
    const undoBase = b.undo.indexOf('comment~"^LB: "')
    expect(undoPrioridad).toBeGreaterThanOrEqual(0)
    expect(undoPrioridad).toBeLessThan(undoFiltros)
    expect(undoFiltros).toBeLessThan(undoBase)
  })
  it("scripts with errors are left out and listed", () => {
    const r = bundleModules(advContext(base()), { on: ["bgp", "filtros"], o: {} })
    expect(r.skipped).toEqual(["bgp"])
    expect(r.included.map((m) => m.mod)).toEqual(["filtros"])
  })
  it("every module is in the bundle order once", () => {
    expect(new Set(BUNDLE_ORDER).size).toBe(BUNDLE_ORDER.length)
  })
  it("step blocks carry number, title, check and verify", () => {
    expect(stepBlock(3, "Base", "/x", "antes", "/print")).toBe("# ── Paso 3 · Base\n# Antes: antes\n/x\n# Comprueba: /print\n")
  })
})

describe("saved settings", () => {
  it("merge keeps only fields of the default's kind", () => {
    expect(merge({ a: 1, b: "x", c: true, d: [1] }, { a: "2", b: "y", c: 0, d: [3], e: 9 })).toEqual({ a: 1, b: "y", c: true, d: [3] })
    expect(merge({ a: 1 }, null)).toEqual({ a: 1 })
    expect(merge({ a: 1 }, { a: Number.NaN })).toEqual({ a: 1 })
  })
  it("failover probes keep defaults for links added later", () => {
    const s = base()
    const o = optionsOf<{ probes: Record<string, string> }>("failover", advContext(s), { on: [], o: { failover: { probes: { [s.wans[0].name]: "9.9.9.9" } } } })
    expect(o.probes[s.wans[0].name]).toBe("9.9.9.9")
    expect(Object.keys(o.probes).length).toBe(s.wans.length)
  })
  it("decodeAdvanced is lenient", () => {
    expect(decodeAdvanced(null)).toEqual({ on: [], o: {} })
    expect(decodeAdvanced("{roto")).toEqual({ on: [], o: {} })
    expect(decodeAdvanced(JSON.stringify({ on: ["filtros", 3], o: { filtros: { smb: false } } }))).toEqual({ on: ["filtros"], o: { filtros: { smb: false } } })
  })
  it("travel with the deployment", () => {
    const s = withAdv(["filtros"], { filtros: { smb: false, udpLimit: 77 } })
    const back = decodeDeployment(encodeDeployment(deploymentFields(s)))
    expect(back?.advanced).toEqual(s.advanced)
    const plain = decodeDeployment(encodeDeployment(deploymentFields(base())))
    expect(plain?.advanced).toEqual({ on: [], o: {} })
  })
})

describe("what's installed", () => {
  const spec: PartSpec[] = [
    { id: "base", prefix: "DS: ", script: '/x add comment="DS: a"\n/x add comment="DS: b"', loose: true },
    { id: "filtros", prefix: "DSX filtros: ", script: '/y add comment="DSX filtros: uno"\n/y add comment="DSX filtros: dos"', needs: ["base"] },
  ]
  const state = (text: string) => Object.fromEntries(inspectExport(text, spec).map((r) => [r.id, r.state]))
  it("absent, ok, incomplete, duplicated, outdated", () => {
    expect(state("")).toEqual({ base: "absent", filtros: "absent" })
    expect(state('add comment="DS: a"\nadd comment="DS: b"\nadd comment="DSX filtros: uno"\nadd comment="DSX filtros: dos"')).toEqual({ base: "ok", filtros: "ok" })
    expect(state('add comment="DSX filtros: uno"').filtros).toBe("incomplete")
    expect(state('add comment="DSX filtros: uno"\nadd comment="DSX filtros: uno"\nadd comment="DSX filtros: dos"').filtros).toBe("duplicated")
    expect(state('add comment="DSX filtros: uno"\nadd comment="DSX filtros: dos"\nadd comment="DSX filtros: viejo"').filtros).toBe("outdated")
  })
  it("reports what an installed part needs", () => {
    const r = inspectExport('add comment="DSX filtros: uno"\nadd comment="DSX filtros: dos"', spec).find((x) => x.id === "filtros")!
    expect(r.needs).toEqual(["base"])
  })
  it("reads continuation lines of a non-terse export", () => {
    expect(state('add chain=forward \\\n    comment="DSX filtros: uno"\nadd comment="DSX filtros: dos"').filtros).toBe("ok")
  })
  it("the real guide reads back as ok", () => {
    const g = guideScripts(base())
    const script = g.steps.map((s) => s.script).join("\n")
    const r = inspectExport(script, [{ id: "base", prefix: "DS: ", script, loose: true }])
    expect(r[0].state).toBe("ok")
  })
})

describe("routes", () => {
  it("/mikrotik-optimo and /mikrotik-optimal open the guide page", () => {
    expect(matchInternal("/mikrotik-optimo")).toEqual({ rewriteTo: "/es/mikrotik-optimo" })
    expect(matchInternal("/MIKROTIK-OPTIMAL")).toEqual({ rewriteTo: "/es/mikrotik-optimo" })
    expect(matchInternal("/es/mikrotik-optimo")).toEqual({ rewriteTo: null })
    expect(matchInternal("/mikrotik")).toEqual({ rewriteTo: "/es/mikrotik" })
    expect(matchInternal("/es/mikrotik")).toEqual({ rewriteTo: null })
  })
})

describe("each guide step refuses a second paste", () => {
  it("by something the step always creates", () => {
    const g = guideScripts(initialState())
    const guard = (id: string) => g.steps.find((s) => s.id === id)!.script.split("\n").slice(0, 2).join("\n")
    expect(guard("pppoe")).toContain('[:len [/ip pool find where name="DS-clientes"]] > 0) do={:error "DS: el PPPoE ya esta')
    expect(guard("cgnat")).toContain('comment="DS: pool sin salida"]] > 0) do={:error "DS: el CGNAT ya esta')
    expect(guard("hardening")).toContain('comment="DS: bogon"]] > 0) do={:error')
    // What each guard looks for is written by its own step.
    expect(g.steps.find((s) => s.id === "pppoe")!.script).toContain("add name=DS-clientes")
    expect(g.steps.find((s) => s.id === "cgnat")!.script).toMatch(/add [^\n]*comment="DS: pool sin salida"/)
    expect(g.steps.find((s) => s.id === "hardening")!.script).toMatch(/add [^\n]*comment="DS: bogon"/)
  })
})
