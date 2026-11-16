import { describe, expect, it } from "vitest"
import { RULES } from "./burst"
import { checkSetup, DEFAULT_SETUP, mikrotikSetup, oltSetup, ontTemplate, parseCidr, poolHosts, setupPlans, setupUndo, type SetupContext } from "./setup"
import { decodeState, encodeState, initialState } from "./state"

const ctx = (over: Partial<SetupContext> = {}): SetupContext => ({
  clients: 600,
  wanIfaces: ["ether1", "ether2", "ether3"],
  balanced: ["10.0.0.0/8", "100.64.0.0/10"],
  ...over,
})
const plans = setupPlans([200, 500, 1000], RULES.s20)
const codes = (s = DEFAULT_SETUP, c = ctx()) => checkSetup(s, c).map((i) => i.code)

describe("deployment setup: addresses and checks", () => {
  it("reads CIDR networks and sizes the pool", () => {
    const p = parseCidr("100.64.0.0/22")
    expect(p).not.toBeNull()
    if (p) expect(poolHosts(p)).toBe(1021)
    expect(parseCidr("100.64.1.0/22")).toBeNull()
    expect(parseCidr("100.64.0.0")).toBeNull()
  })
  it("the defaults fit 600 clients", () => {
    expect(codes()).toEqual([])
  })
  it("flags what would break the deployment", () => {
    expect(codes({ ...DEFAULT_SETUP, pool: "100.64.0.0/24" })).toContain("poolSmall")
    expect(codes({ ...DEFAULT_SETUP, mgmtVlan: 100 })).toContain("sameVlan")
    expect(codes({ ...DEFAULT_SETUP, oltPort: "ether2" })).toContain("portIsWan")
    expect(codes({ ...DEFAULT_SETUP, oltUplink: "0-9-0" })).toContain("badUplink")
    expect(codes({ ...DEFAULT_SETUP, mgmtNet: "100.64.0.0/24" })).toContain("poolOverlap")
    expect(codes(DEFAULT_SETUP, ctx({ balanced: ["10.0.0.0/8"] }))).toContain("poolNotBalanced")
    expect(codes(DEFAULT_SETUP, ctx({ balanced: null }))).toEqual([])
  })
})

describe("deployment setup: MikroTik", () => {
  const script = mikrotikSetup(DEFAULT_SETUP, { ...ctx(), name: "Pedregal", plans })
  const lines = script.split("\n")
  it("VLANs on the port toward the OLT, management address, CGNAT pool", () => {
    expect(lines).toContain('/system identity set name="Pedregal"')
    expect(lines).toContain('add name="vlan100-internet" vlan-id=100 interface="sfp-sfpplus2" comment="DS: internet de los clientes"')
    expect(lines).toContain('add address=192.168.10.1/24 interface="vlan10-gestion" comment="DS: gestion de la OLT"')
    expect(lines).toContain('add name=DS-clientes ranges=100.64.0.2-100.64.3.254 comment="DS: clientes PPPoE"')
  })
  it("one PPP profile per plan with the burst rule, and the PPPoE server", () => {
    const p200 = lines.find((l) => l.includes('name="plan-200M"'))
    expect(p200).toContain('rate-limit="40M/40M 200M/200M 30M/30M 16/16"')
    expect(p200).toContain("local-address=100.64.0.1 remote-address=DS-clientes dns-server=100.64.0.1")
    expect(p200).toContain("interface-list=DS-LAN")
    expect(lines).toContain('add service-name="gigafazt" interface="vlan100-internet" default-profile="plan-200M" one-session-per-host=yes disabled=no')
  })
  it("basic firewall, optional", () => {
    expect(lines).toContain('add chain=forward action=drop src-address=100.64.0.0/22 dst-address=192.168.10.0/24 comment="DS: los clientes no llegan a la gestion"')
    expect(lines).toContain('add list=DS-WAN interface="ether3" comment="DS: internet"')
    expect(mikrotikSetup({ ...DEFAULT_SETUP, firewall: false }, { ...ctx(), name: "", plans })).not.toContain("/ip firewall filter")
    expect(mikrotikSetup({ ...DEFAULT_SETUP, oltPort: "" }, { ...ctx(), name: "", plans })).toBe("")
    expect(setupUndo(DEFAULT_SETUP).split("\n")[0]).toBe('/interface pppoe-server server remove [find where service-name="gigafazt"]')
  })
})

describe("deployment setup: Huawei OLT", () => {
  const olt = oltSetup(DEFAULT_SETUP, { speeds: [200, 500, 1000], names: plans.map((p) => p.name) }).split("\n")
  it("smart VLANs on the uplink and the management address", () => {
    expect(olt.slice(0, 6)).toEqual(["enable", "config", "vlan 100 smart", "port vlan 100 0/9 0", "vlan 10 smart", "port vlan 10 0/9 0"])
    expect(olt).toContain(" ip address 192.168.10.2 255.255.255.0")
    expect(olt).toContain("ip route-static 0.0.0.0 0.0.0.0 192.168.10.1")
  })
  it("per plan a table and a DBA 10 % above it (multiples of 64 kbit/s), and a line profile to the internet VLAN", () => {
    // 200 Mbps × 1.1 = 220,000 kbit/s → 220,032.
    expect(olt).toContain("traffic table ip index 10 cir 220032 priority 0 priority-policy local-setting")
    expect(olt).toContain("dba-profile add profile-id 12 type4 max 1100032")
    const i = olt.indexOf('ont-lineprofile gpon profile-id 11 profile-name "plan-500M"')
    expect(olt.slice(i + 1, i + 6)).toEqual([" tcont 1 dba-profile-id 11", " gem add 1 eth tcont 1", " gem mapping 1 0 vlan 100", " commit", " quit"])
  })
  it("adds one ONT with its plan", () => {
    expect(ontTemplate(DEFAULT_SETUP, { plan: 1, ponPort: "0/1/3", ontId: 5, sn: "HWTC1A2B3C4D", client: 'Juan "Pérez"' }).split("\n")).toEqual([
      "interface gpon 0/1",
      ' ont add 3 5 sn-auth "HWTC1A2B3C4D" omci ont-lineprofile-id 11 ont-srvprofile-id 10 desc "Juan Pérez"',
      " quit",
      "service-port vlan 100 gpon 0/1/3 ont 5 gemport 1 multi-service user-vlan 100 rx-cttr 11 tx-cttr 11",
    ])
    expect(ontTemplate(DEFAULT_SETUP, { plan: 0, ponPort: "x", ontId: 0, sn: "", client: "" })).toBe("")
  })
})

describe("deployment setup: share link", () => {
  it("round-trips and falls back to the defaults", () => {
    const s = { ...initialState(), setup: { ...DEFAULT_SETUP, oltPort: "ether5", internetVlan: 200, pool: "100.64.8.0/21", dns: "9.9.9.9", firewall: false, oltUplink: "0/19/0" } }
    expect(decodeState(encodeState(s))).toEqual(s)
    expect(decodeState("#d=100,500,75,16,0")?.setup).toEqual(DEFAULT_SETUP)
    expect(decodeState("#d=100,500,75,16,0&ds=a|b")?.setup).toEqual(DEFAULT_SETUP)
  })
})
