import { describe, expect, it } from "vitest"
import { planDefaults, RULES } from "../mikrotik/burst"
import { asterBurst, carKBps, compare, hqosBps, MAX_BUCKET } from "./burst"
import { accessBlock, carriersBlock, deploymentIssues, plansBlock, poolHosts, pppoeBlock, usersBlock, type AsterDeployment } from "./config"

const deployment = (p: Partial<AsterDeployment> = {}): AsterDeployment => ({
  hostname: "Los Pinos",
  adminUser: "noc",
  mgmtPort: 8,
  mgmtAddress: "192.168.88.2/24",
  mgmtGateway: "192.168.88.1",
  ntp: "pool.ntp.org",
  dns: "1.1.1.1",
  oltPorts: [1],
  plans: [
    { name: "200M", mbps: 200, vlan: 200, pool: "100.64.1.0/24" },
    { name: "500M", mbps: 500, vlan: 500, pool: "100.64.2.0/24" },
  ],
  carriers: [
    { name: "Totalplay", port: 5, mode: "static", address: "200.1.1.2/30", gateway: "200.1.1.1", mbps: 1000 },
    { name: "Izzi", port: 6, mode: "static", address: "201.2.2.2/30", gateway: "201.2.2.1", mbps: 500 },
  ],
  wanMode: "balance",
  probe: "1.1.1.1",
  design: "two-stage",
  rule: RULES.s20,
  ...p,
})

describe("MikroTik burst on AsterNOS (owner, 2026-11-20)", () => {
  it("both designs give MikroTik's real burst from idle; two-stage stays close for short repeated bursts", () => {
    const p = planDefaults(200, RULES.s20)
    const a = asterBurst(p)
    expect(a.burstS).toBe(3) // 1/16 sampling: 2.4 s by the formula, 3.0 s in practice
    expect(a.single).toMatchObject({ cirMbps: 40, pirMbps: 200, cbs: 60_000_000 })
    expect(a.twoStage.refillMbps).toBeLessThan(p.burstThreshold)
    const c = compare(p, a)
    const worst = (k: "singleMb" | "twoStageMb") => Math.max(...c.map((x) => Math.abs(x[k] / x.mikrotikMb - 1)))
    expect(c.find((x) => x.id === "speedtest")!.singleMb / c.find((x) => x.id === "speedtest")!.mikrotikMb).toBeCloseTo(1, 2)
    expect(worst("twoStageMb")).toBeLessThan(0.1)
    expect(worst("singleMb")).toBeGreaterThan(0.3)
  })
  it("a plan without burst is just the plan speed; buckets never exceed VPP's 32-bit cap; units", () => {
    const flat = asterBurst(planDefaults(500, RULES.flat))
    expect(flat.burst).toBe(false)
    expect(flat.single.cirMbps).toBe(500)
    expect(asterBurst(planDefaults(1000, RULES.s20)).twoStage.size).toBeLessThanOrEqual(MAX_BUCKET)
    expect(carKBps(200)).toBe(25_000)
    expect(hqosBps(200)).toBe(25_000_000)
  })
})

describe("AsterNOS configuration", () => {
  it("pools: gateway first, clients the rest; pool size checks", () => {
    expect(poolHosts("100.64.1.0/24")).toMatchObject({ gateway: "100.64.1.1", first: "100.64.1.2", last: "100.64.1.254", mask: "255.255.255.0" })
    expect(poolHosts("100.64.1.0/24")!.hosts).toHaveLength(253)
    expect(poolHosts("nada")).toBeNull()
    expect(deploymentIssues(deployment())).toEqual([])
    expect(deploymentIssues(deployment({ plans: [{ name: "X", mbps: 200, vlan: 200, pool: "100.64.0.0/22" }] })).map((i) => i.code)).toContain("poolSize")
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
    expect(code).toMatch(/car tr-tcm cir \d+ cbs \d+ pir 25000 pbs \d+ yellow-packet-action REMARK red-packet-action REMARK remark-tc 1/)
    expect(code).toContain("tc-queue 1 mode strict shaping pir 5000000")
    expect(code).toContain("rule 500 dst-ip 100.64.1.2/32 packet-action permit traffic-behavior DL200M0_1_2 set-hqos-user UDL200M0_1_2")
    expect(code).toContain("rule 500 src-ip 100.64.1.2/32")
    expect(code).toContain("interface ethernet 5\nacl DL-200M0 priority 200")
    expect(code).toContain("interface sub-ethernet 1.200\nacl UL-200M0 priority 200")
    expect(code.match(/^traffic behavior /gm)).toHaveLength(253 * 2)
  })
  it("single policer: exceed and violate dropped, no HQoS", () => {
    const code = plansBlock(deployment({ design: "single" }), 0).code
    expect(code).not.toContain("hqos")
    expect(code).toContain("car tr-tcm cir 5000 cbs 60000000 pir 25000")
    expect(code).toContain("yellow-packet-action DROP red-packet-action DROP")
  })
  it("carriers: NAT out of each, balancing across their gateways, a route each for failover", () => {
    const balance = carriersBlock(deployment()).code
    expect(balance).toContain("nat pool WAN1 200.1.1.2\nnat binding NAT-WAN1 WAN1")
    expect(balance).toContain("nexthop-group CARRIERS\nnexthop 200.1.1.1\nnexthop 201.2.2.1")
    const failover = carriersBlock(deployment({ wanMode: "failover" })).code
    expect(failover).toContain("ip route 0.0.0.0/0 200.1.1.1 10\nip route 0.0.0.0/0 201.2.2.1 20")
    const one = carriersBlock(deployment({ carriers: [deployment().carriers[0]] })).code
    expect(one).toContain("ip route 0.0.0.0/0 200.1.1.1\n")
  })
  it("users go to their plan's PPPoE server; unknown plans are reported", () => {
    const r = usersBlock(deployment(), [
      { user: "ana", password: "x1", mbps: 200 },
      { user: "beto", password: "x2", mbps: 500 },
      { user: "carla", password: "x3", mbps: 1000 },
    ])
    expect(r.block.code).toContain("interface pppoe-server 0\nppp chap username ana x1\nexit")
    expect(r.block.code).toContain("interface pppoe-server 1\nppp chap username beto x2")
    expect(r.unplaced).toEqual(["carla"])
    expect(accessBlock(deployment()).code).toContain("hostname LosPinos")
  })
})
