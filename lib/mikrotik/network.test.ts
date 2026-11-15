import { describe, expect, it } from "vitest"
import { balanceScript, BALANCE_UNDO, checkBalance, defaultWans, pccWeights, type BalanceOptions } from "./balance"
import { planDefaults, RULES } from "./burst"
import { simulateCapacity, size, type CapacityInput } from "./capacity"
import { checkOlt, OLT_SPECS, portsNeeded } from "./olt"
import { decodeState, DEFAULT_BALANCE, DEFAULT_CAPACITY, encodeState, initialState, PRESETS } from "./state"

const opts = (over: Partial<BalanceOptions> = {}): BalanceOptions => ({
  wans: defaultWans(3).map((w, k) => ({ ...w, gateway: `192.168.${k + 1}.1` })),
  clients: ["10.10.0.0/16", "100.64.0.0/10"],
  classifier: "src-address",
  failover: "recursive",
  nat: true,
  ...over,
})

describe("PCC weights", () => {
  it("follow the link speeds", () => {
    expect(pccWeights([1000, 1000, 1000])).toEqual([1, 1, 1])
    expect(pccWeights([1000, 1000, 500])).toEqual([2, 2, 1])
    expect(pccWeights([10000, 1000])).toEqual([10, 1])
    // Capped at 24 slots.
    expect(pccWeights([1000, 999]).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(24)
  })
})

describe("load balancing script (RouterOS v7)", () => {
  const script = balanceScript(opts())
  const lines = script.split("\n")

  it("creates a routing table per link before using it", () => {
    expect(lines.indexOf("/routing table")).toBe(0)
    expect(lines).toContain('add name="to-WAN1" fib comment="LB: tabla WAN1"')
  })
  it("never balances local traffic, marks incoming connections first, then PCC by client", () => {
    const accept = lines.findIndex((l) => l.includes("action=accept src-address-list=LB-clientes dst-address-list=LB-locales"))
    const incoming = lines.findIndex((l) => l.includes('in-interface="ether1" connection-mark=no-mark new-connection-mark="WAN1"'))
    const pcc0 = lines.findIndex((l) => l.includes("per-connection-classifier=src-address:3/0"))
    expect(accept).toBeGreaterThan(0)
    expect(incoming).toBeGreaterThan(accept)
    expect(pcc0).toBeGreaterThan(incoming)
    expect(lines[pcc0]).toContain("dst-address-type=!local connection-mark=no-mark connection-state=new")
    expect(lines.filter((l) => l.includes("per-connection-classifier=")).length).toBe(3)
    expect(lines).toContain('add list=LB-clientes address=10.10.0.0/16 comment="LB: clientes"')
  })
  it("each link's table: its own link first, the others as ECMP backup, watched through a public IP", () => {
    expect(lines).toContain('add dst-address=1.1.1.1/32 gateway=192.168.1.1 scope=10 comment="LB: vigila WAN1"')
    expect(lines).toContain('add dst-address=0.0.0.0/0 gateway=1.1.1.1@main routing-table="to-WAN1" distance=1 target-scope=11 check-gateway=ping comment="LB: to-WAN1 por WAN1"')
    expect(lines).toContain('add dst-address=0.0.0.0/0 gateway=8.8.8.8@main routing-table="to-WAN1" distance=2 target-scope=11 check-gateway=ping comment="LB: to-WAN1 respaldo WAN2"')
    expect(lines).toContain('add dst-address=0.0.0.0/0 gateway=9.9.9.9 distance=1 target-scope=11 check-gateway=ping comment="LB: main por WAN3"')
    expect(lines).toContain('add chain=srcnat action=masquerade out-interface="ether2" comment="LB: NAT WAN2"')
  })
  it("gateway failover and PPPoE links (no gateway IP: the interface)", () => {
    const s = balanceScript(opts({ failover: "gateway", wans: [{ name: "WAN1", iface: "pppoe-out1", gateway: "", mbps: 1000, monitor: "" }, ...opts().wans.slice(1)] }))
    expect(s).toContain('add dst-address=0.0.0.0/0 gateway=pppoe-out1 routing-table="to-WAN1" distance=1 check-gateway=ping')
    expect(s).not.toContain("scope=10")
  })
  it("unequal links get proportional slots", () => {
    const s = balanceScript(opts({ wans: opts().wans.map((w, k) => ({ ...w, mbps: k === 2 ? 500 : 1000 })) }))
    expect(s).toContain("per-connection-classifier=src-address:5/4")
    expect(s.match(/new-connection-mark="WAN3" passthrough=yes comment="LB: reparto/g)?.length).toBe(1)
  })
  it("reports mistakes and writes nothing until they're fixed", () => {
    const bad = opts({ wans: [{ ...opts().wans[0] }, { ...opts().wans[1], iface: "ether1", monitor: "1.1.1.1" }], clients: ["10.10.0.0/33"] })
    const codes = checkBalance(bad).map((i) => i.code)
    expect(codes).toEqual(expect.arrayContaining(["duplicateIface", "duplicateMonitor", "badClients"]))
    expect(balanceScript(bad)).toBe("")
    expect(checkBalance(opts({ wans: opts().wans.slice(0, 1) })).map((i) => i.code)).toContain("oneLink")
  })
  it("can be undone by its comments", () => {
    expect(BALANCE_UNDO).toContain('/ip firewall mangle remove [find where comment~"^LB: "]')
  })
})

describe("the deployment's OLT", () => {
  it("knows the MA5600T family has no XGS-PON and only unconfirmed XG-PON", () => {
    expect(checkOlt({ model: "ma5608t", tech: "xgspon", homesPerPort: 32, uplinkMbps: 10000 }, 256).map((i) => i.code)).toContain("unsupported")
    expect(checkOlt({ model: "ma5683t", tech: "xgpon", homesPerPort: 32, uplinkMbps: 10000 }, 256).map((i) => i.code)).toContain("unconfirmed")
    // 1,024 clients at 64 per port: the 16 XGS-PON ports of an MA5800-X2.
    expect(checkOlt({ model: "ma5800x2", tech: "xgspon", homesPerPort: 64, uplinkMbps: 20000 }, 1024)).toEqual([])
  })
  it("checks the ports the clients need, the split and the users against the model", () => {
    const issues = checkOlt({ model: "ma5608t", tech: "gpon", homesPerPort: 130, uplinkMbps: 0 }, 5000)
    expect(issues.map((i) => i.code)).toEqual(["tooManyPorts", "tooManyHomes", "tooManyUsers", "noUplink"])
    expect(issues[0]).toMatchObject({ max: 32, need: 39 })
    expect(portsNeeded(600, 32)).toBe(19)
    expect(portsNeeded(0, 32)).toBe(0)
    expect(OLT_SPECS.ma5683t.maxPorts.gpon).toBe(96)
  })
})

describe("capacity with the router's internet links", () => {
  const base = (over: Partial<CapacityInput> = {}): CapacityInput => ({
    parentMbps: Number.POSITIVE_INFINITY,
    plans: PRESETS.map((p) => ({ id: p.id, planMbps: p.downMbps, clients: 60, params: planDefaults(p.downMbps, RULES.flat) })),
    direction: "down",
    avgMbps: 3.4,
    videoShare: 0.5,
    videoMbps: 5,
    fileMB: 50,
    pon: { tech: "gpon", homesPerPort: 32 },
    testS: 15,
    durationS: 300,
    ...over,
  })
  const halfGig = [500, 500, 500]

  it("balanced per client, a client and its test use one link; per connection, the links add up", () => {
    const perClient = simulateCapacity(base({ links: { mbps: halfGig, mode: "client" } }))
    const pooled = simulateCapacity(base({ links: { mbps: halfGig, mode: "connection" } }))
    expect(perClient.links).toMatchObject({ count: 3, perClient: true })
    expect(perClient.links?.each.map((l) => l.clients)).toEqual([60, 60, 60])
    // 1 Gbps plan on 500 Mbps links: one link is the most a test gets.
    expect(perClient.plans[2].testP10Mbps).toBeLessThanOrEqual(500 + 1e-6)
    expect(pooled.links).toMatchObject({ count: 1, perClient: false })
    expect(pooled.plans[2].testP10Mbps).toBeGreaterThan(500)
    // The links replace parentMbps (a 100 Mbps uplink would be full all the time).
    const gig = simulateCapacity(base({ parentMbps: 100, links: { mbps: [1000, 1000, 1000], mode: "client" } }))
    expect(gig.links?.each.map((l) => l.mbps)).toEqual([1000, 1000, 1000])
    expect(gig.parent.saturatedShare).toBeLessThan(0.3)
    expect(simulateCapacity(base({ parentMbps: 100 })).parent.saturatedShare).toBeGreaterThan(0.9)
  })
  it("sizing counts links, and says when one link is too slow for a plan", () => {
    const { parentMbps: _a, ...gig } = base({ links: { mbps: [1000, 1000, 1000], mode: "client" } })
    void _a
    const r = size(gig, 0.5)
    expect(r.uplink.ok).toBe(true)
    if (r.uplink.ok) {
      expect(r.uplink.linkMbps).toBe(1000)
      expect(r.uplink.links).toBeGreaterThanOrEqual(1)
      expect(r.uplink.parentMbps).toBe((r.uplink.links ?? 0) * 1000)
    }
    const { parentMbps: _b, ...half } = base({ links: { mbps: halfGig, mode: "client" } })
    void _b
    const slow = size(half, 0.8)
    expect(slow.uplink).toMatchObject({ ok: false, limit: "link" })
  })
})

describe("share link: deployment, OLT and links", () => {
  it("round-trips", () => {
    const s = {
      ...initialState(),
      deployment: "Pedregal, torre B | 2",
      wans: [
        { name: "WAN1", iface: "sfp-sfpplus1", gateway: "201.150.1.1", mbps: 1000, monitor: "1.1.1.1" },
        { name: "Telmex", iface: "pppoe-out1", gateway: "", mbps: 500, monitor: "8.8.8.8" },
      ],
      balance: { ...DEFAULT_BALANCE, classifier: "both-addresses" as const, failover: "gateway" as const, nat: false, clients: ["10.20.0.0/16", "192.168.88.0/24"] },
      capacity: { ...DEFAULT_CAPACITY, oltModel: "ma5800x7" as const, pon: "xgspon" as const, oltUplinkMbps: 20_000, internet: "single" as const, ponEfficiency: 0.9 },
    }
    expect(decodeState(encodeState(s))).toEqual(s)
  })
  it("links from before the OLT keep one uplink and no OLT limit; bad parts fall back", () => {
    const old = decodeState("#d=100,500,75,16,0&h=10000,down,3.4,0.21,0.5,5,50,gpon,32,200,200,200")
    expect(old?.capacity).toMatchObject({ parentMbps: 10_000, internet: "single", oltUplinkMbps: 0 })
    expect(old?.deployment).toBe("")
    const bad = decodeState("#d=100,500,75,16,0&o=0.92,sideways,ma5608t,10000&w=src-address|recursive|1||")
    expect(bad?.capacity).toEqual(DEFAULT_CAPACITY)
    expect(bad?.wans).toEqual(initialState().wans)
  })
})
