import { describe, expect, it } from "vitest"
import { DEFAULT_SETTINGS, decodeSettings, settingsIssues, type OltSettings } from "./settings"
import { TOOLS, profilesBlock, readSn, run, toolById, type Out, type Values } from "./tools"

const S: OltSettings = { ...DEFAULT_SETTINGS }
const code = (id: string, v: Values, s = S) => {
  const r = run(toolById(id)!, v, s)
  if (!r || "error" in r) throw new Error(JSON.stringify(r))
  return (r as Out).blocks.map((b) => b.code).join("\n")
}

describe("DavorOLT (owner, 2026-11-21)", () => {
  it("serial numbers: hex as autofind shows it, or vendor letters + 8 hex from the label", () => {
    expect(readSn("48575443 1a2b3c4d".replace(" ", ""))).toBe("485754431A2B3C4D")
    expect(readSn("HWTC1A2B3C4D")).toBe("485754431A2B3C4D")
    expect(readSn("hwtc-1a2b3c4d")).toBe("485754431A2B3C4D")
    expect(readSn("HWTC1A2B")).toBeNull()
  })

  it("every tool is in a group, has unique id; info-only ones have no builder", () => {
    expect(new Set(TOOLS.map((t) => t.id)).size).toBe(TOOLS.length)
    expect(TOOLS.filter((t) => !t.build).map((t) => t.id)).toEqual(["wifi", "otraMarca", "pasos", "ipv6", "xml"])
  })

  it("profiles: speed on the OLT (traffic table per plan) or VLAN per plan (unlimited), IPTV gem, router service profile", () => {
    const pr = profilesBlock(S, "priority").join("\n")
    expect(pr).toContain("traffic table ip index 10 cir 220032 priority 0 priority-policy local-setting")
    expect(pr).toContain("dba-profile add profile-id 12 type4 max 1100032")
    expect(pr).toContain('ont-lineprofile gpon profile-id 11 profile-name "500M"\n tcont 1 dba-profile-id 11\n gem add 1 eth tcont 1\n gem mapping 1 0 vlan 100\n gem add 2 eth tcont 1\n gem mapping 2 1 vlan 300')
    expect(pr).toContain('ont-srvprofile gpon profile-id 10 profile-name "router"\n ont-port eth adaptive pots adaptive\n port vlan eth 2 300\n multicast-forward untag')
    const vl = profilesBlock(S, "vlan").join("\n")
    expect(vl).not.toContain("traffic table")
    expect(vl).toContain(" gem mapping 1 0 vlan 500")
  })

  it("authorize: confirm with plan, PPPoE over OMCI (to verify), service-port, IPTV multicast user", () => {
    const v = { slot: "1", port: "3", ontId: "5", sn: "HWTC1A2B3C4D", desc: 'Ana "Depto 4"', plan: "1", spIndex: "", pppoeUser: "ana4", pppoePass: "x9y8", iptv: "si", iptvIndex: "2005" }
    const c = code("autorizar", v)
    expect(c).toContain('interface gpon 0/1\n display ont autofind 3\n ont confirm 3 ontid 5 sn-auth 485754431A2B3C4D omci ont-lineprofile-id 11 ont-srvprofile-id 10 desc "Ana Depto 4"')
    expect(c).toContain(" ont ipconfig 3 5 ip-index 0 pppoe vlan 100 priority 0 user-account username ana4 password x9y8")
    expect(c).toContain("service-port vlan 100 gpon 0/1/3 ont 5 gemport 1 multi-service user-vlan 100 rx-cttr 11 tx-cttr 11")
    expect(c).toContain("service-port 2005 vlan 300 gpon 0/1/3 ont 5 gemport 2 multi-service user-vlan 300 rx-cttr 9 tx-cttr 9\nbtv\n igmp user add service-port 2005")
    const r = run(toolById("autorizar")!, v, S) as Out
    expect(r.verify).toContain("ont internet-config")
    // VLAN per plan: the plan's VLAN and the unlimited traffic table (the gateway limits).
    const vl = code("autorizar", { ...v, iptv: "no" }, { ...S, planMode: "vlan" })
    expect(vl).toContain("service-port vlan 500 gpon 0/1/3 ont 5 gemport 1 multi-service user-vlan 500 rx-cttr 6 tx-cttr 6")
  })

  it("bad input names the field: serial, PPPoE password with a space, ONT-ID out of range", () => {
    const base = { slot: "1", port: "0", ontId: "1", sn: "HWTC1A2B3C4D", plan: "0", iptv: "no" }
    expect(run(toolById("autorizar")!, { ...base, sn: "nope" }, S)).toEqual({ error: "field", field: "sn" })
    expect(run(toolById("autorizar")!, { ...base, pppoeUser: "a", pppoePass: "con espacio" }, S)).toEqual({ error: "field", field: "pppoePass" })
    expect(run(toolById("eliminar")!, { ...base, ontId: "128" }, S)).toEqual({ error: "field", field: "ontId" })
  })

  it("initial setup, removal, migration in two blocks, MikroTik forward only from the admin IP", () => {
    const init = code("inicial", { ntp: "" })
    expect(init).toContain("vlan 10 standard\nport vlan 10 0/2 0\ninterface vlanif 10\n ip address 192.168.10.2 24\n quit\nip route-static 0.0.0.0 0 192.168.10.1")
    expect(code("eliminar", { slot: "0", port: "2", ontId: "7" })).toContain("undo service-port port 0/0/2 ont 7\ninterface gpon 0/0\n ont delete 2 7")
    const m = run(toolById("migrar")!, { slot: "0", port: "2", ontId: "7", toSlot: "1", toPort: "4", toOntId: "9", sn: "HWTC1A2B3C4D", plan: "0", iptv: "no" }, S) as Out
    expect(m.blocks.map((b) => b.label)).toEqual(["origen", "destino"])
    const fw = code("redireccion", { wan: "ether1", extPort: "2222", proto: "ssh", adminIp: "201.1.1.1" })
    expect(fw).toContain("src-address-list=davorolt-admin action=dst-nat to-addresses=192.168.10.2 to-ports=22")
  })

  it("settings: decoded safely, repeated VLANs flagged", () => {
    expect(decodeSettings({ mgmtVlan: 99999, planMode: "x", plans: [] })).toMatchObject({ mgmtVlan: 10, planMode: "priority", plans: DEFAULT_SETTINGS.plans })
    expect(settingsIssues({ ...S, iptvVlan: 100 })).toContain("vlanRepeated")
    expect(settingsIssues(S)).toEqual([])
  })
})

describe("DavorOLT review fixes (2026-11-21)", () => {
  const base = { slot: "1", port: "3", ontId: "5", sn: "HWTC1A2B3C4D", plan: "1", iptv: "si", iptvIndex: "20" }
  it("TV needs the IPTV VLAN and its own service-port index", () => {
    expect(run(toolById("autorizar")!, base, { ...S, iptvVlan: 0 })).toEqual({ error: "field", field: "iptv" })
    expect(run(toolById("autorizar")!, { ...base, spIndex: "20" }, S)).toEqual({ error: "field", field: "iptvIndex" })
  })
  it("moving keeps TV; changing plan of a bridge moves its service profile and VLAN", () => {
    expect(code("mover", { ...base, toSlot: "0", toPort: "1", toOntId: "2" })).toContain("igmp user add service-port 20")
    const c = code("plan", { slot: "1", port: "3", ontId: "5", plan: "2", spIndex: "7" }, { ...S, ontMode: "bridge", planMode: "vlan" })
    expect(c).toContain(" ont modify 3 5 ont-lineprofile-id 12 ont-srvprofile-id 12\n ont port native-vlan 3 5 eth 1 vlan 1000")
  })
  it("initial setup enables 8 ports on an 8-port board", () => {
    const c = code("todo", { slots: "0", ports: "8", ntp: "" })
    expect(c).toContain(" port 7 ont-auto-find enable")
    expect(c).not.toContain(" port 8 ont-auto-find enable")
  })
})
