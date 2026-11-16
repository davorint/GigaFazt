import { describe, expect, it } from "vitest"
import {
  balanceScript,
  BALANCE_UNDO,
  balanceUndo,
  checkBalance,
  DEFAULT_LINK_QUEUES,
  defaultWans,
  leaseScript,
  pccWeights,
  usableSpeed,
  type BalanceOptions,
} from "./balance"
import { summarize } from "./deployments"
import { planDefaults, RULES } from "./burst"
import { simulateCapacity, size, type CapacityInput } from "./capacity"
import { checkOlt, OLT_SPECS, portsNeeded } from "./olt"
import { decodeState, DEFAULT_BALANCE, DEFAULT_CAPACITY, deploymentFields, encodeState, initialState, PRESETS } from "./state"

const deploymentFieldsOf = () => deploymentFields(initialState())

const opts = (over: Partial<BalanceOptions> = {}): BalanceOptions => ({
  wans: defaultWans(3).map((w, k) => ({ ...w, type: "static" as const, gateway: `192.168.${k + 1}.1` })),
  clients: ["10.10.0.0/16", "100.64.0.0/10"],
  classifier: "src-address",
  failover: "recursive",
  speed: "normal",
  nat: true,
  queues: DEFAULT_LINK_QUEUES,
  ...over,
})

describe("PCC weights", () => {
  it("follow the link speeds", () => {
    expect(pccWeights([1000, 1000, 1000])).toEqual([1, 1, 1])
    expect(pccWeights([1000, 1000, 500])).toEqual([2, 2, 1])
    expect(pccWeights([10000, 1000])).toEqual([10, 1])
    // Capped at 24 slots.
    expect(pccWeights([1000, 999]).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(24)
    // Rounding after scaling used to go over: 1000/1000/470 gave 10/10/5 = 25.
    expect(pccWeights([1000, 1000, 470]).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(24)
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
    // Only connections that start on the link: replies to the router's own pings stay unmarked.
    const incoming = lines.findIndex((l) => l.includes('in-interface="ether1" connection-state=new connection-mark=no-mark new-connection-mark="WAN1"'))
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
  it("gateway failover and PPPoE links (the gateway is the pppoe-out interface)", () => {
    const s = balanceScript(opts({ failover: "gateway", wans: [{ name: "WAN1", type: "pppoe", iface: "pppoe-out1", gateway: "", mbps: 1000, measuredMbps: null, upMbps: null, upstreamCgnat: false, monitor: "" }, ...opts().wans.slice(1)] }))
    expect(s).toContain('add dst-address=0.0.0.0/0 gateway=pppoe-out1 routing-table="to-WAN1" distance=1 check-gateway=ping')
    expect(s).not.toContain("scope=10")
    expect(s).not.toContain("/ip dhcp-client")
  })
  it("DHCP links: routes take the client's gateway, the client keeps them current", () => {
    const dhcp = opts({ wans: defaultWans(3) })
    const lines = balanceScript(dhcp).split("\n")
    const get = '[/ip dhcp-client get [find where interface="ether1"] gateway]'
    // Recursive: only the watch route goes straight to the provider.
    expect(lines).toContain(`add dst-address=1.1.1.1/32 gateway=${get} scope=10 comment="LB: vigila WAN1"`)
    const client = lines.indexOf("/ip dhcp-client")
    expect(client).toBeGreaterThan(lines.findIndex((l) => l.includes('comment="LB: main por WAN3"')))
    expect(lines[client + 1]).toBe(
      'set [find where interface="ether1"] add-default-route=no script=":if ([:tostr \\$bound] = \\"1\\") do={/ip route set [find where comment=\\"LB: vigila WAN1\\"] gateway=\\$\\"gateway-address\\"}"'
    )
    // Gateway failover: every route through that provider.
    const gwMode = balanceScript(opts({ wans: defaultWans(2), failover: "gateway" }))
    expect(gwMode).toContain(`add dst-address=0.0.0.0/0 gateway=${get} routing-table="to-WAN2" distance=2 check-gateway=ping comment="LB: to-WAN2 respaldo WAN1"`)
    expect(leaseScript(defaultWans(1)[0], ["to-WAN1 por WAN1", "main por WAN1"])).toBe(
      ':if ([:tostr $bound] = "1") do={/ip route set [find where comment="LB: to-WAN1 por WAN1" or comment="LB: main por WAN1"] gateway=$"gateway-address"}'
    )
    // Undo gives the clients their own default route back.
    expect(BALANCE_UNDO.split("\n")[0]).toBe('/ip dhcp-client set [find where script~"LB: "] add-default-route=yes script=""')
  })
  it("faster failover sets the router's check-gateway timers, and undo puts the defaults back", () => {
    expect(balanceScript(opts())).not.toContain("/routing settings")
    const fast = balanceScript(opts({ speed: "faster" })).split("\n")
    expect(fast.slice(-2)).toEqual(["/routing settings", "set check-gateway-ping-interval=2s check-gateway-ping-timeout=1s check-gateway-ping-count=3"])
    expect(balanceScript(opts({ speed: "fast" }))).toContain("set check-gateway-ping-interval=5s check-gateway-ping-timeout=1s check-gateway-ping-count=2")
    expect(balanceUndo("normal")).toBe(BALANCE_UNDO)
    expect(balanceUndo("fast").split("\n").at(-1)).toBe("/routing settings set check-gateway-ping-interval=10s check-gateway-ping-timeout=1s check-gateway-ping-count=2")
  })
  it("measured speeds weigh the links and size the internet side", () => {
    const wans = opts().wans.map((w, k) => ({ ...w, measuredMbps: k === 2 ? 470 : 940 }))
    // 940 / 940 / 470 → 2 / 2 / 1, as if they were 1G / 1G / 500M.
    expect(balanceScript(opts({ wans }))).toContain("per-connection-classifier=src-address:5/4")
    const f = { ...deploymentFieldsOf(), wans }
    // After the link queues (95 %): 893 + 893 + 446.
    expect(summarize(f).internetMbps).toBe(2232)
  })
  it("link queues: marks by interface, a tree per link and direction below the real speed, CAKE fair per client", () => {
    const wans = opts().wans.map((w, k) => ({ ...w, measuredMbps: k === 0 ? 940 : null, upMbps: k === 1 ? 100 : null }))
    const lines = balanceScript(opts({ wans })).split("\n")
    expect(lines).toContain('add chain=forward action=mark-packet in-interface="ether1" connection-bytes=0-500000 new-packet-mark="LB-WAN1-bajada-prioridad" passthrough=no comment="LB: bajada WAN1 prioridad"')
    expect(lines).toContain('add chain=forward action=mark-packet out-interface="ether2" protocol=udp packet-size=0-300 new-packet-mark="LB-WAN2-subida-prioridad" passthrough=no comment="LB: subida WAN2 prioridad"')
    expect(lines).toContain('add chain=forward action=mark-packet in-interface="ether3" new-packet-mark="LB-WAN3-bajada" passthrough=no comment="LB: bajada WAN3"')
    expect(lines).toContain("add name=LB-subida kind=cake cake-flowmode=dual-srchost cake-nat=yes")
    // 95 % of the measured 940 down; WAN2 uploads 100.
    expect(lines).toContain('add name="LB-WAN1-bajada" parent=global max-limit=893M comment="LB: bajada WAN1"')
    expect(lines).toContain('add name="LB-WAN2-subida" parent=global max-limit=95M comment="LB: subida WAN2"')
    expect(lines).toContain('add name="LB-WAN2-subida-prioridad" parent="LB-WAN2-subida" packet-mark="LB-WAN2-subida-prioridad" priority=1 queue=LB-subida comment="LB: subida WAN2 prioridad"')
    expect(lines).toContain('add name="LB-WAN2-subida-resto" parent="LB-WAN2-subida" packet-mark="LB-WAN2-subida" priority=8 queue=LB-subida comment="LB: subida WAN2 resto"')
    expect(usableSpeed(wans[1], "up", DEFAULT_LINK_QUEUES)).toBe(95)
    // Without priority: one leaf per link and direction.
    const flat = balanceScript(opts({ queues: { ...DEFAULT_LINK_QUEUES, prio: false } }))
    expect(flat).toContain('add name="LB-WAN1-bajada" parent=global packet-mark="LB-WAN1-bajada" max-limit=950M queue=LB-bajada comment="LB: bajada WAN1"')
    expect(flat).not.toContain("prioridad")
    // Off: no marks, no queues.
    const off = balanceScript(opts({ queues: { ...DEFAULT_LINK_QUEUES, shape: false } }))
    expect(off).not.toContain("/queue")
    expect(off).not.toContain("mark-packet")
    expect(checkBalance(opts()).map((i) => i.code)).toContain("shapeNominal")
  })
  it("Netwatch per link: log lines and fresh connections when it drops or comes back", () => {
    const lines = balanceScript(opts({ speed: "fast" })).split("\n")
    expect(lines).toContain(
      'add host=1.1.1.1 type=simple interval=5s down-script=":log warning \\"LB: WAN1 sin internet\\"; /ip firewall connection remove [find where connection-mark=\\"WAN1\\"]" up-script=":log warning \\"LB: WAN1 volvio\\"; /ip firewall connection remove [find where connection-mark=\\"WAN1\\"]" comment="LB: aviso WAN1"'
    )
    const logOnly = balanceScript(opts({ queues: { ...DEFAULT_LINK_QUEUES, flush: false } }))
    expect(logOnly).toContain('down-script=":log warning \\"LB: WAN2 sin internet\\""')
    expect(logOnly).not.toContain("connection remove")
    // Watching the gateway: the monitored IPs aren't routed per link, so no Netwatch.
    expect(balanceScript(opts({ failover: "gateway" }))).not.toContain("/tool netwatch")
    expect(checkBalance(opts({ failover: "gateway" })).map((i) => i.code)).toContain("netwatchRecursive")
    expect(BALANCE_UNDO).toContain('/queue type remove [find where name~"^LB-"]')
    expect(BALANCE_UNDO).toContain('/tool netwatch remove [find where comment~"^LB: "]')
  })
  it("a fixed IP needs its gateway; PPPoE on a physical port is suspicious", () => {
    const base = opts().wans
    const codes = (w: BalanceOptions["wans"]) => checkBalance(opts({ wans: w })).filter((i) => i.level !== "info").map((i) => i.code)
    expect(codes([{ ...base[0], gateway: "" }, base[1]])).toContain("missingGateway")
    expect(codes([{ ...base[0], type: "pppoe" }, base[1]])).toContain("pppoeIface")
    expect(codes([{ ...base[0], type: "dhcp", gateway: "" }, base[1]])).toEqual([])
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
        { name: "WAN1", type: "static" as const, iface: "sfp-sfpplus1", gateway: "201.150.1.1", mbps: 1000, measuredMbps: 941.5, upMbps: 500, upstreamCgnat: true, monitor: "1.1.1.1" },
        { name: "Telmex", type: "pppoe" as const, iface: "pppoe-out1", gateway: "", mbps: 500, measuredMbps: null, upMbps: null, upstreamCgnat: false, monitor: "8.8.8.8" },
        { name: "Izzi", type: "dhcp" as const, iface: "ether3", gateway: "", mbps: 1000, measuredMbps: null, upMbps: null, upstreamCgnat: false, monitor: "9.9.9.9" },
      ],
      balance: { ...DEFAULT_BALANCE, classifier: "both-addresses" as const, failover: "gateway" as const, speed: "fast" as const, queues: { shape: true, sharePct: 90, prio: false, alerts: true, flush: false }, nat: false, clients: ["10.20.0.0/16", "192.168.88.0/24"] },
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
  it("links saved before the connection type: gateway IP = fixed, pppoe-out = PPPoE, a port without gateway = DHCP", () => {
    const old = decodeState("#d=100,500,75,16,0&w=src-address|recursive|1|10.0.0.0%2F8|WAN1,ether1,,1000,1.1.1.1|WAN2,ether2,192.168.2.1,1000,8.8.8.8|WAN3,pppoe-out1,,500,9.9.9.9")
    expect(old?.wans.map((w) => w.type)).toEqual(["dhcp", "static", "pppoe"])
    expect(old?.wans.map((w) => w.measuredMbps)).toEqual([null, null, null])
    expect(old?.balance.speed).toBe("normal")
    expect(old?.balance.queues).toEqual(DEFAULT_LINK_QUEUES)
  })
})
