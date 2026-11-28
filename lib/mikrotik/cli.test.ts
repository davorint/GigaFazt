import { describe, expect, it } from "vitest"
import { cliSteps, indexExport, PIECE, pieceText, readScript, topSplit } from "./cli"
import { deploymentBundle } from "./guide-scripts"
import { MODULES } from "./bundle"
import { initialState } from "./state"
import { upsert } from "./routeros"

const lines = (r: ReturnType<typeof cliSteps>) => r.steps.flatMap((s) => s.segments.flatMap((g) => g.lines))

describe("cli: reading scripts", () => {
  it("splits outside quotes and brackets", () => {
    expect(topSplit('add a="x y" b=[find where c="d e"] f', " ")).toEqual(["add", 'a="x y"', 'b=[find where c="d e"]', "f"])
    expect(topSplit(':local p [x]; :if (a) do={b; c}', ";")).toEqual([":local p [x]", ":if (a) do={b; c}"])
  })

  it("gives relative commands their menu path", () => {
    const r = cliSteps([{ title: "t", script: '/ip pool\nadd name=a ranges=1.1.1.1-1.1.1.9 comment="DS: x"' }], { mode: "new" })
    expect(lines(r).map((l) => l.text)).toEqual(['/ip pool add name=a ranges=1.1.1.1-1.1.1.9 comment="DS: x"'])
  })

  it("turns add-or-update into a plain add on a new router", () => {
    const script = upsert("/ppp profile", "plan-200M", ['rate-limit="1M/1M"'], ['name="plan-200M"', 'rate-limit="1M/1M"', 'comment="DS: plan"'])
    const r = cliSteps([{ title: "t", script }], { mode: "new" })
    expect(lines(r).map((l) => l.text)).toEqual(['/ppp profile add name="plan-200M" rate-limit="1M/1M" comment="DS: plan"'])
  })

  it("turns guards into checks to run before", () => {
    const script = ':if ([:len [/ip pool find where name="DS-clientes"]] > 0) do={:error "DS: ya esta"}\n:if ([:len [/interface list find where name="DS-WAN"]] = 0) do={:error "DS: falta la base"}\n/ip pool add name=DS-clientes ranges=10.0.0.2-10.0.0.9 comment="DS: c"'
    const r = cliSteps([{ title: "t", script }], { mode: "new" })
    const seg = r.steps[0].segments[0]
    expect(seg.before).toEqual([
      { cmd: '/ip pool print count-only where name="DS-clientes"', expect: { kind: "zero" }, msg: "DS: ya esta" },
      { cmd: '/interface list print count-only where name="DS-WAN"', expect: { kind: "atLeast", n: 1 }, msg: "DS: falta la base" },
    ])
    expect(seg.lines).toHaveLength(1)
  })

  it("keeps loops as script lines and unrolls a :local into the command", () => {
    const script = '{:local i 0; :while ($i < 3) do={:set i ($i + 1)}}\n{ :local p [/ip firewall mangle find where comment="LB: x"]; :if ([:len $p] > 0) do={/ip firewall mangle add chain=forward comment="DSX a: y" place-before=[:pick $p 0]} else={:error "falta"} }'
    const st = readScript(script)
    expect(st[0].t).toBe("script")
    const r = cliSteps([{ title: "t", script }], { mode: "new" })
    const out = lines(r)
    expect(out[0].kind).toBe("script")
    expect(out[1].text).toBe('/ip firewall mangle add chain=forward comment="DSX a: y" place-before=[:pick [/ip firewall mangle find where comment="LB: x"] 0]')
    expect(r.steps[0].segments[0].before[0]).toMatchObject({ cmd: '/ip firewall mangle print count-only where comment="LB: x"', expect: { kind: "atLeast", n: 1 } })
  })
})

describe("cli: the default deployment", () => {
  const s = initialState()
  s.advanced = { on: [...MODULES], o: {} }
  const steps = deploymentBundle(s).steps.map((x) => ({ title: x.id, script: x.script, verify: x.verify }))
  const r = cliSteps(steps, { mode: "new" })

  it("writes every command with its full path, no tabs, ASCII", () => {
    const out = lines(r)
    expect(out.length).toBeGreaterThan(150)
    for (const l of out) {
      if (l.kind === "cmd") expect(l.text.startsWith("/")).toBe(true)
      expect(l.text).not.toContain("\t")
    }
    expect(r.nonAscii).toBe(false)
    // Only the waits stay as script.
    expect(out.filter((l) => l.kind === "script").length).toBeLessThanOrEqual(3)
  })

  it("cuts every step into pieces of at most a dozen lines", () => {
    for (const st of r.steps) for (const g of st.segments) expect(g.lines.length).toBeLessThanOrEqual(PIECE)
    expect(r.steps.find((x) => x.title === "balance")!.segments.length).toBeGreaterThan(3)
  })

  it("undoes adds by name or comment, never by anchors alone", () => {
    const base = r.steps.find((x) => x.title === "base")!
    const undo = base.segments.flatMap((g) => g.undo)
    expect(undo).toContain('/interface list remove [find where name="DS-WAN"]')
    // The memory logging rule has no comment: removing by action=memory would hit the router's own rules.
    expect(undo.some((u) => u.includes("/system logging remove"))).toBe(false)
    expect(base.segments.some((g) => g.undoPartial)).toBe(true)
  })

  it("gives each piece a stable id and pasteable text", () => {
    const again = cliSteps(steps, { mode: "new" })
    expect(again.steps[0].segments[0].id).toBe(r.steps[0].segments[0].id)
    expect(pieceText(r.steps[0].segments[0]).split("\n")).toHaveLength(r.steps[0].segments[0].lines.length)
  })
})

describe("cli: a configured router", () => {
  const script = [
    '/ppp profile',
    'add name="plan-200M" rate-limit="40M/40M 200M/200M" only-one=yes comment="DS: plan plan-200M"',
    'add name="plan-500M" rate-limit="100M/100M 500M/500M" only-one=yes comment="DS: plan plan-500M"',
    '/ip firewall nat',
    'add chain=srcnat action=masquerade out-interface="ether1" comment="DS: NAT"',
    'add chain=srcnat action=masquerade out-interface="ether2" comment="DS: NAT"',
    '/ip dns set allow-remote-requests=yes servers=9.9.9.10',
  ].join("\n")
  const exportText = [
    "# 2026-11-28 by RouterOS 7.25.1",
    "/ip dns",
    "set allow-remote-requests=yes servers=1.1.1.1",
    "/ip firewall nat",
    "add action=masquerade chain=srcnat comment=\"DS: NAT\" out-interface=ether1",
    "add action=masquerade chain=srcnat comment=\"DS: NAT viejo\" out-interface=ether9",
    "add action=masquerade chain=srcnat comment=\"otro\" out-interface=ether8",
    "/ppp profile",
    "add comment=\"DS: plan plan-200M\" name=plan-200M only-one=yes \\",
    "    rate-limit=\"40M/40M 200M/200M\"",
    "add comment=\"DS: plan plan-500M\" name=plan-500M only-one=yes rate-limit=\"90M/90M 450M/450M\"",
  ].join("\n")

  it("reads a non-terse export with line continuations", () => {
    const ex = indexExport(exportText)
    expect(ex.items).toHaveLength(6)
    expect(ex.byMenu.get("/ppp profile")![0].props.get("rate-limit")).toBe("40M/40M 200M/200M")
  })

  it("skips what is the same, sets only what changed, adds what is missing, removes its own leftovers", () => {
    const r = cliSteps([{ title: "t", script }], { mode: "existing", exportText })
    const out = lines(r).map((l) => l.text)
    expect(out).toContain('/ppp profile set [find where name="plan-500M"] rate-limit="100M/100M 500M/500M"')
    expect(out).toContain('/ip firewall nat add chain=srcnat action=masquerade out-interface="ether2" comment="DS: NAT"')
    expect(out).toContain("/ip dns set servers=9.9.9.10")
    expect(out.some((l) => l.includes("plan-200M"))).toBe(false)
    expect(r.same).toBe(2)
    const stale = r.steps.find((x) => x.stale)!
    expect(stale.segments[0].lines.map((l) => l.text)).toEqual(['/ip firewall nat remove [find where comment="DS: NAT viejo" chain="srcnat" action="masquerade" out-interface="ether9"]'])
  })

  it("without an export, shows the new-router commands", () => {
    const r = cliSteps([{ title: "t", script }], { mode: "existing", exportText: "  " })
    expect(lines(r)).toHaveLength(5)
    expect(r.exportItems).toBe(0)
  })
})
