import { describe, expect, it } from "vitest"
import { RULES } from "./burst"
import { checkSetup, DEFAULT_PLANS, DEFAULT_SETUP, mikrotikSetup, oltSetup, ontTemplate, parseCidr, poolHosts, setupParts, setupPlans, setupUndo, type SetupContext } from "./setup"
import { decodeState, encodeState, initialState } from "./state"

const ctx = (over: Partial<SetupContext> = {}): SetupContext => ({
  clients: 600,
  wanIfaces: ["ether1", "ether2", "ether3"],
  balanced: ["10.0.0.0/8", "100.64.0.0/10"],
  ...over,
})
const plans = setupPlans(DEFAULT_PLANS, RULES.s20)
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
    expect(lines).toContain('add name="vlan100-internet" vlan-id=100 interface="sfp-sfpplus2" mtu=1508 comment="DS: internet de los clientes"')
    expect(lines).toContain('add address=192.168.10.1/24 interface="vlan10-gestion" comment="DS: gestion de la OLT"')
    expect(lines).toContain('add name=DS-clientes ranges=100.64.0.2-100.64.3.254 comment="DS: clientes PPPoE"')
  })
  it("one PPP profile per plan with the burst rule, and the PPPoE server", () => {
    const p200 = lines.find((l) => l.includes('name="plan-200M"'))
    expect(p200).toContain('rate-limit="40M/40M 200M/200M 30M/30M 16/16"')
    expect(p200).toContain("local-address=100.64.0.1 remote-address=DS-clientes dns-server=100.64.0.1")
    expect(p200).toContain("interface-list=DS-LAN")
    expect(lines).toContain(
      'add service-name="gigafazt" interface="vlan100-internet" default-profile="plan-200M" authentication=pap,chap one-session-per-host=yes max-sessions=1021 keepalive-timeout=10 max-mtu=1500 max-mru=1500 mrru=disabled disabled=no'
    )
    expect(p200).toContain("use-compression=no use-encryption=no use-upnp=no")
  })
  it("basic firewall, optional", () => {
    expect(lines).toContain('add chain=forward action=drop src-address=100.64.0.0/22 dst-address=192.168.10.0/24 comment="DS: los clientes no llegan a la gestion"')
    expect(lines).toContain('add list=DS-WAN interface="ether3" comment="DS: internet"')
    const noFw = mikrotikSetup({ ...DEFAULT_SETUP, firewall: false, blockSmtp: false, isolate: false }, { ...ctx(), name: "", plans })
    expect(noFw).not.toContain("los clientes no administran el router")
    // Even without the basic firewall, the router's DNS never answers the internet.
    expect(noFw).toContain('add chain=input action=drop in-interface-list=DS-WAN protocol=udp dst-port=53 comment="DS: DNS solo para los clientes"')
    expect(noFw).not.toContain("dst-port=25")
    expect(mikrotikSetup({ ...DEFAULT_SETUP, oltPort: "" }, { ...ctx(), name: "", plans })).toBe("")
    const undo = setupUndo(DEFAULT_SETUP).split("\n")
    // Access and profiles let go of the lists before the lists are removed.
    expect(undo.indexOf("/tool mac-server mac-winbox set allowed-interface-list=all")).toBeLessThan(undo.indexOf('/interface list remove [find where comment~"^DS: "]'))
    expect(undo.indexOf('/ppp profile set [find where comment~"^DS: "] interface-list=none')).toBeLessThan(undo.indexOf('/interface list remove [find where comment~"^DS: "]'))
    expect(undo).toContain('/interface pppoe-server server remove [find where service-name="gigafazt"]')
  })
})

describe("deployment setup: Huawei OLT", () => {
  const olt = oltSetup(DEFAULT_SETUP, { plans }).split("\n")
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
  it("adds one ONT with its plan (bridge: the ONT's first port goes untagged into the internet VLAN)", () => {
    expect(ontTemplate(DEFAULT_SETUP, { plan: 1, ponPort: "0/1/3", ontId: 5, sn: "HWTC1A2B3C4D", client: 'Juan "Pérez"' }).split("\n")).toEqual([
      "interface gpon 0/1",
      ' ont add 3 5 sn-auth "HWTC1A2B3C4D" omci ont-lineprofile-id 11 ont-srvprofile-id 10 desc "Juan Pérez"',
      " ont port native-vlan 3 5 eth 1 vlan 100 priority 0",
      " quit",
      "service-port vlan 100 gpon 0/1/3 ont 5 gemport 1 multi-service user-vlan 100 rx-cttr 11 tx-cttr 11",
    ])
    expect(ontTemplate(DEFAULT_SETUP, { plan: 0, ponPort: "x", ontId: 0, sn: "", client: "" })).toBe("")
    expect(ontTemplate({ ...DEFAULT_SETUP, ontMode: "router" }, { plan: 0, ponPort: "0/1/0", ontId: 1, sn: "", client: "" })).not.toContain("native-vlan")
    expect(oltSetup(DEFAULT_SETUP, { plans: plans.slice(0, 1) })).toContain("security anti-macspoofing enable\nsecurity anti-ipspoofing enable")
  })
})

describe("deployment setup: the checklist's phases", () => {
  const full = (over = {}) => ({ ...ctx(), name: "Norte", plans, monitors: ["1.1.1.1", "8.8.8.8", "9.9.9.9"], cgnatUpstreams: ["ether2"], pppoeIfaces: ["ether3"], ...over })
  const parts = setupParts({ ...DEFAULT_SETUP, collector: "192.168.10.50" }, full())
  it("phase 0: hardened base, services and MAC access only from management, remote logging", () => {
    const base = parts?.base.split("\n") ?? []
    expect(base).toContain("/ip settings set tcp-syncookies=yes rp-filter=loose")
    expect(base).toContain("/ip service set winbox address=192.168.10.0/24")
    expect(base).toContain('add name=DSremoto target=remote remote=192.168.10.50')
    // Access is narrowed last, so a paste over management isn't cut halfway.
    expect(base.at(-1)).toBe("/tool mac-server mac-winbox set allowed-interface-list=DS-MGMT")
  })
  it("phase 3: 100.64 dropped on links that aren't CGNAT, pool blackholed, isolation, IPFIX", () => {
    const cg = parts?.cgnat ?? ""
    expect(cg).toContain('add chain=prerouting in-interface="ether1" src-address=100.64.0.0/10 action=drop')
    expect(cg).not.toContain('in-interface="ether2" src-address=100.64.0.0/10')
    expect(cg).toContain('add dst-address=100.64.0.0/22 blackhole distance=250 comment="DS: pool sin salida"')
    expect(cg).toContain("add chain=forward src-address=100.64.0.0/22 dst-address=100.64.0.0/22 action=drop")
    expect(cg).toContain("add dst-address=192.168.10.50 port=4739 version=ipfix")
    // Never the forward drop of 100.64 toward the links: forward runs before src-nat.
    expect(cg).not.toMatch(/chain=forward[^\n]*out-interface-list=DS-WAN/)
  })
  it("phase 5: fq-codel on the ports (not on PPPoE links), conntrack for CGNAT, raw, abuse limits", () => {
    const hd = parts?.hardening ?? ""
    expect(hd).toContain('set [find where interface="ether1"] queue=DS-fq-codel')
    expect(hd).toContain('set [find where interface="sfp-sfpplus2"] queue=DS-fq-codel')
    expect(hd).not.toContain('interface="ether3"] queue=')
    expect(hd).toContain("tcp-established-timeout=2h")
    expect(hd).toContain("protocol=tcp tcp-flags=syn,fin action=drop")
    // Only new connections count, so a client over the cap keeps the ones it has.
    expect(hd).toContain("connection-state=new connection-limit=1000,32")
  })
  it("warns when a DNS server is a probe IP and refuses a bad collector", () => {
    const codes = (over = {}) => checkSetup({ ...DEFAULT_SETUP, ...over }, full()).map((i) => i.code)
    expect(codes({ dns: "1.1.1.1,9.9.9.10" })).toContain("dnsIsProbe")
    expect(codes()).toEqual([])
    expect(codes({ collector: "nope" })).toContain("badCollector")
  })
})

describe("deployment setup: plans", () => {
  it("custom and asymmetric plans with the deployment's burst rule", () => {
    const list = setupPlans([...DEFAULT_PLANS, { name: "empresa-300", down: 300, up: 100 }, { name: "", down: 50, up: 10 }], RULES.s50)
    expect(list.map((p) => p.name)).toEqual(["plan-200M", "plan-500M", "plan-1000M", "empresa-300", "plan-50M"])
    // 50 % sustained, 75 % threshold (whole Mbps), 16 s: 300/100 → max 150/50, burst 300/100, threshold 113/38.
    const script = mikrotikSetup({ ...DEFAULT_SETUP, plans: [{ name: "empresa-300", down: 300, up: 100 }], rule: RULES.s50 }, { ...ctx(), name: "", plans: setupPlans([{ name: "empresa-300", down: 300, up: 100 }], RULES.s50) })
    expect(script).toContain('rate-limit="50M/150M 100M/300M 38M/113M 16/16"')
    expect(script).toContain('default-profile="empresa-300"')
  })
  it("the OLT takes the download for the traffic table and the upload for the DBA", () => {
    const olt = oltSetup(DEFAULT_SETUP, { plans: setupPlans([{ name: "empresa-300", down: 300, up: 100 }], RULES.s20) })
    expect(olt).toContain("traffic table ip index 10 cir 330048 priority 0")
    // The service-port uses the table both ways: more upload than download takes the upload.
    expect(oltSetup(DEFAULT_SETUP, { plans: setupPlans([{ name: "sube", down: 100, up: 300 }], RULES.s20) })).toContain("traffic table ip index 10 cir 330048")
    expect(olt).toContain("dba-profile add profile-id 10 type4 max 110016")
    expect(olt).toContain('ont-lineprofile gpon profile-id 10 profile-name "empresa-300"')
  })
  it("checks names, speeds and repeats", () => {
    const codes = (plans: typeof DEFAULT_PLANS) => checkSetup({ ...DEFAULT_SETUP, plans }, ctx()).map((i) => i.code)
    expect(codes([])).toContain("noPlans")
    expect(codes([{ name: "a b", down: 10, up: 10 }])).toContain("badPlanName")
    expect(codes([{ name: "", down: 0, up: 10 }])).toContain("badPlanSpeed")
    expect(codes([{ name: "", down: 200, up: 200 }, { name: "plan-200M", down: 300, up: 300 }])).toContain("duplicatePlan")
  })
})

describe("deployment setup: share link", () => {
  it("round-trips and falls back to the defaults", () => {
    const s = {
      ...initialState(),
      setup: { ...DEFAULT_SETUP, oltPort: "ether5", internetVlan: 200, pool: "100.64.8.0/21", dns: "9.9.9.9", firewall: false, oltUplink: "0/19/0", collector: "10.9.9.9", mtu1500: false, ontMode: "router" as const, plans: [...DEFAULT_PLANS, { name: "empresa-300", down: 300, up: 100 }], rule: RULES.s50 },
    }
    expect(decodeState(encodeState(s))).toEqual(s)
    expect(decodeState("#d=100,500,75,16,0")?.setup).toEqual(DEFAULT_SETUP)
    expect(decodeState("#d=100,500,75,16,0&ds=a|b")?.setup).toEqual(DEFAULT_SETUP)
    // Links from before the checklist options (9 fields) take the defaults for them.
    const old = decodeState("#d=100,500,75,16,0&ds=ether5|200|20|192.168.20.0%2F24|100.64.0.0%2F22|9.9.9.9|isp|1|0%2F19%2F0")?.setup
    expect(old).toMatchObject({ oltPort: "ether5", internetVlan: 200, collector: "", mtu1500: true, ontMode: "bridge" })
  })
})
