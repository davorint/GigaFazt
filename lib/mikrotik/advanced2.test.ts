import { describe, expect, it } from "vitest"
import type { AdvContext } from "./advanced"
import {
  DEFAULT_ALERTS,
  DEFAULT_FAILOVER,
  DEFAULT_FILTERS,
  alertsScript,
  bondScript,
  defaultProbes,
  exportInterfaces,
  failoverScript,
  filtersScript,
  fullExportScript,
  priorityScript,
  profileSyncScripts,
  publicIpScript,
  remapExport,
} from "./advanced2"
import { initialState } from "./state"
import { DEFAULT_SETUP } from "./setup"

const wans = initialState().wans
const ctx = (patch: Partial<AdvContext["setup"]> = {}, more: Partial<AdvContext> = {}): AdvContext => ({
  name: "Torre A",
  setup: { ...DEFAULT_SETUP, alert: "telegram", telegramChat: "1", ...patch },
  wans,
  failover: "recursive",
  ...more,
})
const codes = (r: { issues: { code: string }[] }) => r.issues.map((i) => i.code)

describe("quality failover", () => {
  const probes = defaultProbes(wans, wans.map((w) => w.monitor))
  const r = failoverScript(ctx(), { ...DEFAULT_FAILOVER, probes, lte: "lte1" })
  it("two ICMP probes per link with loss and latency thresholds", () => {
    expect(Object.values(probes)).toEqual(["208.67.222.222", "208.67.220.220", "4.2.2.2"])
    expect(r.script).toContain('add name="DSX-fo-WAN1-a" host=1.1.1.1 type=icmp interval=10s packet-count=10 thr-loss-percent=20 thr-avg=150ms')
    expect(r.script).toContain('add name="DSX-fo-WAN1-b" host=208.67.222.222 type=icmp')
    // The second probe follows the link's gateway, copied from the balancing's pinned route.
    expect(r.script).toContain('add dst-address=208.67.222.222/32 gateway=[/ip route get [find where comment="LB: vigila WAN1"] gateway] scope=10')
  })
  it("disables only the link's balancing routes, never the last link, and waits the hold time to come back", () => {
    expect(r.script).toContain("(\\$a = \\\"down\\\") && (\\$b = \\\"down\\\")")
    expect(r.script).toContain("comment~\\\"^LB: .+ (por|respaldo) WAN1\\\\\\$\\\"")
    expect(r.script).toContain('comment!=\\"LB: main por WAN1\\"')
    // 5 minutes at one check every 10 s.
    expect(r.script).toContain(">= 30)")
    expect(r.script).toContain("add name=DSX-failover interval=10s")
  })
  it("LTE under every table at distance 3, with a cap and its own NAT", () => {
    expect(r.script).toContain('add dst-address=0.0.0.0/0 gateway="lte1" routing-table="to-WAN1" distance=3')
    expect(r.script).toContain('add name=DSX-lte target="lte1" max-limit=20M/20M')
    expect(r.undo).toContain('/ip route enable [find where comment~"^LB: " and disabled=yes]')
  })
  it("needs recursive failover, valid distinct probes, not the clients' DNS", () => {
    expect(codes(failoverScript(ctx({}, { failover: "gateway" }), { ...DEFAULT_FAILOVER, probes }))).toContain("needsRecursive")
    expect(codes(failoverScript(ctx(), { ...DEFAULT_FAILOVER, probes: { ...probes, WAN2: "1.1.1.1" } }))).toContain("probeTwice")
    expect(codes(failoverScript(ctx(), { ...DEFAULT_FAILOVER, probes: { ...probes, WAN2: "9.9.9.10" } }))).toContain("probeIsDns")
  })
})

describe("OLT bond", () => {
  it("bond with the OLT port, VLANs moved in the same line, Huawei static LACP", () => {
    const r = bondScript(ctx(), { ports: `${DEFAULT_SETUP.oltPort}, sfp-sfpplus3`, oltPorts: "0/2/0 0/3/0" })
    expect(r.router).toContain(`slaves="${DEFAULT_SETUP.oltPort}","sfp-sfpplus3" mode=802.3ad lacp-rate=1sec transmit-hash-policy=layer-2-and-3`)
    // VLANs wait on a temporary bridge so the port can join the bond; if the bond fails they go back.
    expect(r.router).toContain("/interface vlan set $v interface=DSX-espera")
    expect(r.router).toContain("/interface vlan set $v interface=DSX-bond-olt}")
    expect(r.router).toContain(`on-error={/interface vlan set $v interface="${DEFAULT_SETUP.oltPort}"`)
    expect(r.undo.indexOf("bonding remove")).toBeLessThan(r.undo.indexOf(`interface="${DEFAULT_SETUP.oltPort}"`))
    expect(r.olt).toContain("link-aggregation 0/2 0 0/3 0 egress-ingress workmode lacp-static")
    expect(codes(r)).not.toContain("sameBoard")
    expect(codes(bondScript(ctx(), { ports: "ether1, ether2", oltPorts: "0/2/0 0/3/0" }))).toContain("bondHasOltPort")
    expect(codes(bondScript(ctx(), { ports: `${DEFAULT_SETUP.oltPort}, ether2`, oltPorts: "0/2/0 0/2/1" }))).toContain("sameBoard")
  })
})

describe("spare router", () => {
  const text = '/interface ethernet\nset [ find default-name=ether1 ] comment=WAN1\n/interface vlan\nadd interface=sfp-sfpplus1 name=vlan100 vlan-id=100\n/ip address\nadd address=1.2.3.4/24 interface=ether10'
  it("finds the interfaces and renames whole names only", () => {
    expect(exportInterfaces(text)).toEqual(["ether1", "ether10", "sfp-sfpplus1"])
    const out = remapExport(text, { ether1: "ether2", "sfp-sfpplus1": "sfp28-1", ether10: "" })
    expect(out).toContain("default-name=ether2")
    expect(out).toContain("interface=sfp28-1")
    expect(out).toContain("interface=ether10")
  })
  it("the weekly full export needs the SFTP backup", () => {
    expect(codes(fullExportScript(ctx()))).toEqual(["needsSftp"])
    const r = fullExportScript(ctx({ backup: "sftp", backupHost: "10.0.0.5", backupUser: "r" }))
    expect(r.script).toContain("export show-sensitive file=DSX-completo")
  })
  it("profile sync writes guarded set lines and the backup imports them", () => {
    const s = profileSyncScripts("DSX-sync", "172.26.10.4")
    expect(s.main).toContain("/file add name=DSX-perfiles.rsc contents=\\$s")
    expect(s.main).toContain("on-error={}")
    expect(s.backup).toContain("/import file-name=DSX-perfiles.rsc")
  })
})

describe("filtering", () => {
  it("anti-spoofing, abused ports, UDP and DNS limits, IPv6 when on", () => {
    const r = filtersScript(ctx({ ipv6Pd: "2001:db8:100::/40" }), DEFAULT_FILTERS)
    expect(r.script).toContain("add chain=prerouting in-interface-list=DS-LAN src-address-list=!DSX-origen-valido action=drop")
    expect(r.script).toContain("add list=DSX-origen-valido6 address=fe80::/10")
    expect(r.script).toContain("protocol=tcp dst-port=135-139,445 action=drop")
    expect(r.script).toContain("protocol=udp dst-port=1900 action=drop")
    expect(r.script).toContain("connection-limit=1000,32")
    expect(r.script).toContain("dst-limit=50,100,src-address/1m action=accept")
    expect(r.script).toContain("/ipv6 firewall filter")
    expect(filtersScript(ctx(), { ...DEFAULT_FILTERS }).script).not.toContain("/ipv6")
  })
})

describe("alerts, priority, public IPs", () => {
  it("config changes by export size, new RouterOS, PPPoE failures", () => {
    const r = alertsScript(ctx(), DEFAULT_ALERTS)
    expect(r.script).toContain("/ip firewall export file=DSX-cfg-0")
    expect(r.script).toContain("/system package update check-for-updates")
    expect(r.script).toContain("(authentication|login) failed")
    expect(codes(alertsScript(ctx({ alert: "none" }), DEFAULT_ALERTS))).toContain("needsAlerts")
  })
  it("DSCP marks go before each link's catch-all", () => {
    const r = priorityScript(ctx())
    expect(r.script).toContain('comment=\"LB: bajada WAN1\"')
    expect(r.script).toContain('dscp=46 new-packet-mark="LB-WAN1-bajada-prioridad"')
    // The prerequisite check and the cleanup, then 4 DSCP values × 2 directions per link.
    expect(r.script.split("\n")).toHaveLength(2 + wans.length * 2 * 4)
  })
  it("a client keeps a public IP, skips CGNAT, leaves by its link and is reachable", () => {
    const r = publicIpScript(ctx(), [{ user: "empresa1", ip: "203.0.113.10", wan: "WAN2" }])
    expect(r.script).toContain('/ppp secret set [find where name="empresa1"] remote-address=203.0.113.10')
    expect(r.script).toContain("chain=srcnat src-address=203.0.113.10 action=accept")
    expect(r.script).toContain('new-routing-mark="to-WAN2"')
    expect(r.script).toContain('comment="DS: nada nuevo desde internet"')
    expect(codes(publicIpScript(ctx(), [{ user: "x", ip: "100.64.0.9", wan: "WAN1" }]))).toContain("ipInPool")
    expect(codes(publicIpScript(ctx(), [{ user: "x", ip: "192.168.1.9", wan: "WAN1" }]))).toContain("privateIp")
  })
})

describe("priority needs the link queues", () => {
  it("refuses without shaping or the priority split, so the deployment file leaves it out", () => {
    expect(codes(priorityScript(ctx({}, { linkQueues: { shape: true, prio: false } })))).toEqual(["needsQueues"])
    expect(codes(priorityScript(ctx({}, { linkQueues: { shape: false, prio: true } })))).toEqual(["needsQueues"])
    expect(priorityScript(ctx({}, { linkQueues: { shape: true, prio: true } })).steps.length).toBe(1)
  })
})
