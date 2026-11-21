import { describe, expect, it } from "vitest"
import { carKBps, hqosBps } from "./burst"
import { maxGrowth, simulateBusyHour, waterFill } from "./busy"
import { priorityDelayMs, queueDelayMs } from "./classes"
import { accessBlock, carriersBlock, configCounts, deploymentIssues, filtersBlock, plansBlock, poolHosts, pppoeBlock, usersBlock, type AsterDeployment, type AsterPlan } from "./config"
import { burstSeconds, PRESETS, rechargeSeconds, simulateClient, SITUATIONS } from "./plan"
import { cgnatSessions, sizing } from "./sizing"

const plan = (name: string, mbps: number, vlan: number, pool: string, p: Partial<AsterPlan> = {}): AsterPlan => ({ name, mbps, vlan, pool, sustainedMbps: mbps, burstMB: 0, rechargeMbps: mbps, clients: 0, ...p })

const deployment = (p: Partial<AsterDeployment> = {}): AsterDeployment => ({
  hostname: "Los Pinos",
  adminUser: "noc",
  mgmtPort: 8,
  mgmtAddress: "192.168.88.2/24",
  mgmtGateway: "192.168.88.1",
  ntp: "pool.ntp.org",
  dns: "1.1.1.1",
  oltPorts: [1],
  plans: [plan("200M", 200, 200, "100.64.1.0/24", { sustainedMbps: 40, burstMB: 60, rechargeMbps: 24 }), plan("500M", 500, 500, "100.64.2.0/24")],
  carriers: [
    { name: "Totalplay", port: 5, mode: "static", address: "200.1.1.2/30", gateway: "200.1.1.1", mbps: 1000 },
    { name: "Izzi", port: 6, mode: "static", address: "201.2.2.2/30", gateway: "201.2.2.1", mbps: 500 },
  ],
  wanMode: "balance",
  probe: "1.1.1.1",
  design: "two-stage",
  classes: false,
  ...p,
})

describe("AsterNOS configuration", () => {
  it("units", () => {
    expect(carKBps(200)).toBe(25_000)
    expect(hqosBps(200)).toBe(25_000_000)
  })
  it("pools: gateway first, clients the rest; pool size checks", () => {
    expect(poolHosts("100.64.1.0/24")).toMatchObject({ gateway: "100.64.1.1", first: "100.64.1.2", last: "100.64.1.254", mask: "255.255.255.0" })
    expect(poolHosts("100.64.1.0/24")!.hosts).toHaveLength(253)
    expect(poolHosts("nada")).toBeNull()
    expect(deploymentIssues(deployment())).toEqual([])
    expect(deploymentIssues(deployment({ plans: [plan("X", 200, 200, "100.64.0.0/22")] })).map((i) => i.code)).toContain("poolSize")
    expect(deploymentIssues(deployment({ carriers: [{ name: "A", port: 5, mode: "dhcp", address: "", gateway: "", mbps: 0 }, { name: "B", port: 6, mode: "dhcp", address: "", gateway: "", mbps: 0 }] })).map((i) => i.code)).toContain("balanceGateway")
  })
  it("a PPPoE server per plan on its VLAN, with its pool", () => {
    const code = pppoeBlock(deployment()).code
    expect(code).toContain("pppoe-server enable")
    expect(code).toContain("ip-pool POOL-200M0\nip-range 100.64.1.2 100.64.1.254\nexit")
    expect(code).toContain("interface pppoe-server 1")
    expect(code).toContain("local-ip 100.64.2.1 255.255.255.0")
    expect(code).toContain("interface sub-ethernet 1.500\npppoe-server 1")
  })
  it("two-stage plans: a marker per address and direction, an HQoS user, ACL rules both ways", () => {
    const code = plansBlock(deployment(), 0).code
    expect(code).toContain("hqos enable")
    expect(code).toContain("traffic behavior DL200M0_1_2")
    expect(code).toContain("car tr-tcm cir 3000 cbs 60000000 pir 25000 pbs 1250000 yellow-packet-action REMARK red-packet-action REMARK remark-tc 1")
    // Classes 0 and 1 share (DWRR): strict ones always go first, so the over-burst class can't be strict.
    expect(code).toContain("tc-queue 0 mode dwrr 1 shaping pir 25000000")
    // Over the burst: sustained 40 − recharge 24 = 16 Mbps, so both classes add up to the sustained speed.
    expect(code).toContain("tc-queue 1 mode dwrr 1 shaping pir 2000000")
    expect(code).not.toContain("mode strict")
    expect(code).toContain("rule 495 dst-ip 100.64.1.2/32 packet-action permit traffic-behavior DL200M0_1_2 set-hqos-user UDL200M0_1_2")
    expect(code).toContain("rule 495 src-ip 100.64.1.2/32")
    expect(code).toContain("interface ethernet 5\nacl DL-200M0 priority 200")
    expect(code).toContain("interface sub-ethernet 1.200\nacl UL-200M0 priority 200")
    expect(code.match(/^traffic behavior /gm)).toHaveLength(253 * 2)
  })
  it("a plain plan in two-stage needs no marker; real-time class 7 when classes are on", () => {
    const plain = plansBlock(deployment(), 1).code
    expect(plain).not.toContain("traffic behavior")
    expect(plain).toContain("rule 495 dst-ip 100.64.2.2/32 packet-action permit set-hqos-user UDL500M1_2_2")
    const rt = plansBlock(deployment({ classes: true }), 0).code
    expect(rt).toContain("qos map dscp_to_tc TIEMPO-REAL 46 7")
    expect(rt).toContain("qos-map bind dscp_to_tc TIEMPO-REAL\ntc-queue 7 mode strict")
    expect(configCounts(deployment())).toEqual({ hosts: 506, aclRules: 506 * 2 + 10, policers: 506, hqosUsers: 1012 })
  })
  it("single policer: CIR = sustained, PIR = peak, burst in bytes; exceed and violate dropped, no HQoS", () => {
    const code = plansBlock(deployment({ design: "single" }), 0).code
    expect(code).not.toContain("hqos")
    expect(code).toContain("car tr-tcm cir 5000 cbs 60000000 pir 25000")
    expect(code).toContain("yellow-packet-action DROP red-packet-action DROP")
  })
  it("carriers: NAT out of each, balancing across their gateways, a route each", () => {
    const balance = carriersBlock(deployment()).code
    expect(balance).toContain("nat pool WAN1 200.1.1.2\nnat binding NAT-WAN1 WAN1")
    expect(balance).toContain("nexthop-group CARRIERS\nnexthop 200.1.1.1\nnexthop 201.2.2.1")
    expect(balance).toContain("ip route 0.0.0.0/0 200.1.1.1 10\nip route 0.0.0.0/0 201.2.2.1 20")
    const one = carriersBlock(deployment({ carriers: [deployment().carriers[0]] })).code
    expect(one).toContain("ip route 0.0.0.0/0 200.1.1.1\n")
  })
  it("filters at the top of each plan's upload table; DHCP carriers and repeated speeds flagged; bad passwords reported", () => {
    const f = filtersBlock(deployment()).code
    expect(f).toContain("access-list L3 UL-200M0 ingress\nrule 500 ip-protocol 6 dst-port 135 packet-action deny")
    const dhcp = deployment({ carriers: [{ name: "Izzi", port: 5, mode: "dhcp", address: "", gateway: "", mbps: 500 }] })
    expect(deploymentIssues(dhcp).map((i) => i.code)).toEqual(["dhcpNat"])
    const same = deployment({ plans: [...deployment().plans, plan("Empresa 200", 200, 300, "100.64.9.0/24")] })
    expect(deploymentIssues(same)).toContainEqual({ code: "sameSpeed", plan: "Empresa 200" })
    const r = usersBlock(deployment(), [
      { user: "ana", password: "con espacio", mbps: 200 },
      { user: "beto", password: "bien123", mbps: 500 },
      { user: "carla", password: "x3", mbps: 1000 },
    ])
    expect(r.badPassword).toEqual(["ana"])
    expect(r.block.code).toContain("interface pppoe-server 1\nppp chap username beto bien123")
    expect(r.unplaced).toEqual(["carla"])
    expect(accessBlock(deployment()).code).toContain("hostname LosPinos")
  })
})

describe("AsterNOS simulator (owner, 2026-11-20)", () => {
  it("a plan's burst: seconds at peak from rest, recharge time, presets", () => {
    const p = { peakMbps: 200, sustainedMbps: 40, burstMB: 60, rechargeMbps: 24 }
    expect(burstSeconds(p)).toBeCloseTo((60 * 8) / (200 - 24), 5)
    expect(rechargeSeconds(p)).toBe(20)
    expect(burstSeconds(PRESETS.plain(200))).toBe(0)
    expect(PRESETS.short(200)).toMatchObject({ sustainedMbps: 100, burstMB: 125 })
  })
  it("one client: a speed test bursts to the peak then the sustained speed; a plain plan stays flat", () => {
    const sp = SITUATIONS.find((s) => s.id === "speedtest")!
    const burst = simulateClient({ peakMbps: 200, sustainedMbps: 40, burstMB: 60, rechargeMbps: 24 }, sp.pattern, sp.runS)
    expect(burst.burstS).toBeGreaterThan(2)
    expect(burst.burstS).toBeLessThan(4)
    // Once the burst is used, the client settles at the sustained speed (not sustained + recharge).
    const tail = burst.series.filter((x) => x.t >= 8 && x.t < 14).map((x) => x.mbps)
    for (const v of tail) expect(v).toBeCloseTo(40, 0)
    const plain = simulateClient(PRESETS.plain(200), sp.pattern, sp.runS)
    expect(plain.burstS).toBe(0)
    expect(plain.totalMb / 15).toBeCloseTo(200, 0)
  })
  it("busy hour: fair sharing, oversubscription, and more carriers hold more clients", () => {
    expect(waterFill([10, 50, 50], 90)).toEqual([10, 40, 40])
    const input = { plans: [{ name: "A", clients: 100, capMbps: 100, peakMbps: 200, groupMbps: null }], capacityMbps: 1000, activeShare: 0.2, demandShare: 1 }
    const r = simulateBusyHour(input)
    expect(r.oversubscription).toBe(10)
    expect(r.plans[0].p50).toBeLessThanOrEqual(1)
    expect(r.plans[0].p5).toBeLessThanOrEqual(r.plans[0].p50)
    expect(maxGrowth({ ...input, capacityMbps: 2000 }, 0.8)).toBeGreaterThan(maxGrowth(input, 0.8))
    expect(simulateBusyHour(input)).toEqual(r) // seeded: same inputs, same result
  })
  it("classes: a game packet waits behind the client's queue without classes, one packet with them", () => {
    expect(queueDelayMs(64, 40)).toBeCloseTo(19.2, 1)
    expect(priorityDelayMs(40)).toBeCloseTo(0.3, 1)
  })
  it("sizing: vendor limits, VM estimated per core, published CGNAT points only", () => {
    const base = { vmCores: 8, vmRamGB: 16, et2508RamGB: 16, peakMbps: 20000, avgPacketBytes: 800, clients: 600, sessionsPerClient: 150, aclRules: 1500, policers: 1200, hqosUsers: 1200 }
    const et = sizing({ ...base, platform: "et2508" })
    expect(et.checks.find((c) => c.id === "throughput")).toMatchObject({ level: "ok", limit: 58 })
    expect(et.estimated).toBe(false)
    expect(et.mpps).toBeCloseTo(3.125, 3)
    const vm = sizing({ ...base, platform: "vm", vmCores: 4 })
    expect(vm.estimated).toBe(true)
    expect(vm.gbps).toBeCloseTo(21.75, 2)
    expect(sizing({ ...base, platform: "et2508", aclRules: 12000 }).checks.find((c) => c.id === "aclRules")?.level).toBe("bad")
    expect(cgnatSessions(8)).toBeNull()
    expect(cgnatSessions(24)).toBe(2_090_000)
    expect(cgnatSessions(48)).toBe(10_000_000)
  })
})
