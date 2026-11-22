import { describe, expect, it } from "vitest"
import { diffConfigs, handChanges, normalizeConfig, parsePartHeader } from "./backups"
import { agentScript, actionLine } from "./routers"

const A = "# 2026-11-22 03:00:01 by RouterOS 7.25.1\n# software id = ABCD-1234\n/ppp profile\nadd name=200M rate-limit=200M/200M\n/ppp secret\nadd name=ana profile=200M\n"
const B = "# 2026-11-23 03:00:04 by RouterOS 7.25.1\n# software id = ABCD-1234\n/ppp profile\nadd name=200M rate-limit=200M/200M\nadd name=500M rate-limit=500M/500M\n/ppp secret\n"

describe("Phase 7: configuration copies", () => {
  it("the export's date line doesn't count as a change", () => {
    expect(normalizeConfig(A)).toBe(normalizeConfig(A.replace("2026-11-22 03:00:01", "2026-11-23 09:15:00")))
    expect(normalizeConfig(A)).toContain("# software id = ABCD-1234")
  })
  it("what changed: lines added and removed", () => {
    expect(diffConfigs(A, B)).toEqual({ added: ["add name=500M rate-limit=500M/500M"], removed: ["add name=ana profile=200M"] })
    expect(diffConfigs(A, A)).toEqual({ added: [], removed: [] })
  })
  it("piece headers from the router", () => {
    expect(parsePartHeader("123/0/3")).toEqual({ upload: "123", idx: 0, total: 3 })
    expect(parsePartHeader("123/3/3")).toBeNull()
    expect(parsePartHeader("x/0/1")).toBeNull()
    expect(parsePartHeader("1/0/999")).toBeNull()
  })
  it("the agent: a backup action line, the export read in pieces and posted to /respaldo", () => {
    expect(actionLine({ id: 7, kind: "backup", user: "", arg1: "", arg2: "", arg3: "", arg4: "" })).toBe("7,backup")
    const s = agentScript({ url: "https://www.gigafazt.com/api/routers/agente", routerId: "rt-000001", key: "k".repeat(32) })
    expect(s).toContain(':local burl "https://www.gigafazt.com/api/routers/respaldo"')
    expect(s).toContain("/export terse file=wispdavor-cfg")
    expect(s).toContain("chunk-size=30000 as-value")
    expect(s).toContain("/file remove $fid")
  })
  it("WispDavor's own PPPoE and hotspot changes don't count as hand edits", () => {
    const before = ["/ppp secret add name=ana profile=200M", "/ip firewall filter add chain=input action=accept"].join("\n")
    const after = ["/ppp secret add name=ana profile=DSX-suspendido", "/ip hotspot user add name=F1 profile=1h", "/ip firewall filter add chain=input action=accept"].join("\n")
    expect(handChanges(diffConfigs(before, after))).toEqual({ added: [], removed: [] })
    expect(handChanges(diffConfigs(before, [after, "/ip service set telnet disabled=no"].join("\n"))).added).toEqual(["/ip service set telnet disabled=no"])
  })
})
