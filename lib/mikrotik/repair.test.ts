import { describe, expect, it } from "vitest"
import { MODULES, moduleSteps } from "./bundle"
import { advContext, deploymentBundle, guideScripts } from "./guide-scripts"
import { inspectExport, type PartSpec } from "./inspect"
import { linesWriting, prefixOf, repairPlan, scriptUnits } from "./repair"
import { checkScript } from "./ros-syntax"
import { initialState, type LabState } from "./state"

const deployment = (on: string[] = ["filtros", "prioridad"]): LabState => ({ ...initialState(), deployment: "Torre", advanced: { on, o: {} } })

/** The installed check's parts for a deployment (as the panel builds them). */
function specs(s: LabState): PartSpec[] {
  const g = guideScripts(s)
  const join = (ids: string[]) => g.steps.filter((x) => ids.includes(x.id)).map((x) => x.script).join("\n")
  return [
    { id: "base", prefix: "DS: ", script: join(["base", "pppoe", "cgnat", "hardening", "ops"]), loose: true },
    { id: "balance", prefix: "LB: ", script: join(["balance"]), needs: ["base"], loose: true },
    ...MODULES.map((mod): PartSpec => {
      const m = moduleSteps(mod, advContext(s), s.advanced)
      return { id: mod, prefix: prefixOf(mod), script: m.ok ? m.steps.map((x) => x.script).join("\n") : "" }
    }),
  ]
}
/** What the router would have after pasting the deployment's file (one line per command, as an export lists them). */
const installed = (s: LabState) => deploymentBundle(s).steps.map((x) => x.script).join("\n")
const plan = (s: LabState, text: string, removeOff = false) => repairPlan(s, inspectExport(text, specs(s)), { removeOff })

describe("repair", () => {
  it("nothing to do on a router that has the whole file", () => {
    const s = deployment()
    expect(plan(s, installed(s)).actions).toEqual([])
  })
  it("a router without the base gets the deployment file, not a repair", () => {
    const s = deployment()
    expect(plan(s, "/ip address add address=1.1.1.1/24 interface=ether1").actions.map((a) => a.kind)).toEqual(["fresh"])
  })
  it("a missing base line is pasted alone, with its menu", () => {
    const s = deployment()
    const lines = installed(s).split("\n")
    const k = lines.findIndex((l) => l.includes('comment="DS: pool sin salida"') && !l.includes("find where"))
    expect(k).toBeGreaterThan(-1)
    lines.splice(k, 1)
    const p = plan(s, lines.join("\n"))
    expect(p.actions).toHaveLength(1)
    expect(p.actions[0]).toMatchObject({ part: "base", kind: "lines", added: 1, removed: 0 })
    expect(p.script).toMatch(/^\/ip route add .*comment="DS: pool sin salida"$/)
    expect(checkScript(p.script)).toEqual([])
  })
  it("a missing firewall rule goes back to its place in the chain, not to the end", () => {
    const s = deployment()
    const lines = installed(s).split("\n")
    // The first filter rule of the base whose comment no other line shares.
    const comment = (l: string) => /comment="(DS: [^"]+)"/.exec(l)?.[1]
    const count = (c: string) => lines.filter((l) => comment(l) === c).length
    let menu = ""
    const k = lines.findIndex((l) => {
      if (/^\/[a-z0-9 -]+$/.test(l)) menu = l
      const c = comment(l)
      return menu === "/ip firewall filter" && /^add /.test(l) && !!c && count(c) === 1
    })
    expect(k).toBeGreaterThan(-1)
    const gone = comment(lines[k])!
    lines.splice(k, 1)
    const p = plan(s, lines.join("\n"))
    expect(p.script.startsWith(`/ip firewall filter add `)).toBe(true)
    expect(p.script).toContain(`comment="${gone}" place-before=[:pick [/ip firewall filter find where comment="DS: `)
    expect(checkScript(p.script)).toEqual([])
  })
  it("one of several lines sharing a comment missing: reported for a manual check, nothing guessed", () => {
    const s = deployment()
    const lines = installed(s).split("\n")
    const k = lines.findIndex((l) => /^add .*comment="DS: respuestas"/.test(l))
    expect(k).toBeGreaterThan(-1)
    lines.splice(k, 1)
    const p = plan(s, lines.join("\n"))
    expect(p.actions).toEqual([expect.objectContaining({ part: "base", kind: "lines", added: 0, removed: 0, manual: ["DS: respuestas"] })])
    expect(p.script).toBe("")
  })
  it("old lines are removed by comment in their menu", () => {
    const s = deployment()
    const p = plan(s, `${installed(s)}\n/ip firewall filter add chain=forward action=drop comment="DS: regla vieja"`)
    expect(p.actions[0]).toMatchObject({ part: "base", kind: "lines", added: 0, removed: 1 })
    expect(p.script).toBe(':do {/ip firewall filter remove [find where comment="DS: regla vieja"]} on-error={:put "No se pudo quitar DS: regla vieja (/ip firewall filter): revisalo a mano"}')
    expect(checkScript(p.script)).toEqual([])
  })
  it("a duplicated or incomplete expert script is pasted again; one switched on and missing is installed", () => {
    const s = deployment()
    const dup = installed(s) + "\n" + installed(s).split("\n").filter((l) => l.includes("DSX prioridad: ")).join("\n")
    expect(plan(s, dup).actions.map((a) => `${a.part}:${a.kind}`)).toEqual(["prioridad:repaste"])
    const without = installed(s).split("\n").filter((l) => !l.includes("DSX filtros: ")).join("\n")
    expect(plan(s, without).actions.map((a) => `${a.part}:${a.kind}`)).toEqual(["filtros:install"])
  })
  it("expert scripts the deployment doesn't switch on are removed only when asked, before the rest", () => {
    const s = deployment()
    const on = deployment(["filtros", "prioridad", "destinos"])
    const s2 = { ...on, advanced: { on: ["filtros", "prioridad", "destinos"], o: { destinos: { rules: [{ wan: on.wans[0].name, dest: "198.51.100.0/24" }] } } } }
    const text = installed(s2)
    expect(plan(s, text).actions).toEqual([])
    const p = plan(s, text, true)
    expect(p.actions.map((a) => `${a.part}:${a.kind}`)).toEqual(["destinos:remove"])
    expect(p.script).toContain('/ip firewall mangle remove [find where comment="DSX destinos: ')
    expect(checkScript(p.script)).toEqual([])
  })
  it("a missing balancing is installed before the expert scripts that need it", () => {
    const s = deployment(["filtros"])
    const text = installed(s).split("\n").filter((l) => !/comment="LB: /.test(l)).join("\n")
    const kinds = plan(s, text).actions.map((a) => `${a.part}:${a.kind}`)
    expect(kinds[0]).toBe("balance:install")
  })
})

describe("script units", () => {
  it("keeps multi-line blocks whole and gives relative lines their menu", () => {
    const u = scriptUnits('/ip pool\nadd name=a comment="DS: a"\n{\n  :local x 1\n  /ip firewall nat add comment="DS: loop"\n}')
    expect(u.map((x) => x.text.split("\n").length)).toEqual([1, 4])
    expect(linesWriting('/ip pool\nadd name=a comment="DS: a"', "DS: ", ["DS: a"])).toEqual(['/ip pool add name=a comment="DS: a"'])
  })
})

describe("each expert script reads back from its own file", () => {
  it("complete (or not checkable) with nothing to repair, besides re-pasting the uncheckable ones", () => {
    const rows: string[] = []
    for (const mod of MODULES) {
      const s = deployment([mod])
      if (!moduleSteps(mod, advContext(s), s.advanced).ok) continue
      const reports = inspectExport(installed(s), specs(s))
      const r = reports.find((x) => x.id === mod)!
      const kinds = repairPlan(s, reports, { removeOff: false }).actions.map((a) => a.kind)
      rows.push(`${mod}:${r.state}:${kinds.join(",")}`)
      expect(["ok", "untracked"], `${mod} ${r.state} missing=${r.missing.slice(0, 2)} dup=${r.duplicated.slice(0, 2)}`).toContain(r.state)
      expect(kinds.every((k) => k === "untracked"), `${mod} ${kinds}`).toBe(true)
    }
    expect(rows.length).toBeGreaterThanOrEqual(8)
  })
})
