import { describe, expect, it } from "vitest"
import { check, DEFAULT_RULE, planDefaults, RULES, ruleId, type QueueParams } from "./burst"
import { estimateSpeedTest, plainMean, trimmedMean } from "./speedtest"
import { fairShare, simulateCapacity, sizeUplink, type CapacityInput } from "./capacity"
import { planName, rateLimit, sharedPpp, sharedSimpleQueues, simpleQueueLine, userManagerPlans } from "./routeros"
import { bulkScript, fillPasswords, hostTargets, networkOf, parseBulk, parsePlan, parseTarget, randomPassword, splitLine } from "./bulk"
import { decodeState, DEFAULT_CAPACITY, encodeState, initialState, memberPair, PRESETS, presetState } from "./state"

const KNOWN = PRESETS.map((p) => ({ id: p.id, mbps: p.downMbps }))
const sym = (q: QueueParams) => ({ up: q, down: q })

describe("plan rules", () => {
  it("turns a plan speed into queue values", () => {
    expect(planDefaults(500, RULES.flat)).toEqual({ maxLimit: 500, burstLimit: 0, burstThreshold: 0, burstTime: 0, limitAt: 0 })
    expect(planDefaults(500, RULES.s80)).toEqual({ maxLimit: 400, burstLimit: 500, burstThreshold: 300, burstTime: 16, limitAt: 0 })
    expect(planDefaults(200, RULES.s50)).toEqual({ maxLimit: 100, burstLimit: 200, burstThreshold: 75, burstTime: 16, limitAt: 0 })
    // The default is the first scenario the owner tested.
    expect(planDefaults(500)).toEqual(planDefaults(500, RULES.s20))
    // Small custom plans keep kbps precision.
    expect(planDefaults(5, RULES.s20).maxLimit).toBe(1)
    expect(planDefaults(2, { sustained: 0.3, threshold: 0.75, burstTime: 8 })).toEqual({
      maxLimit: 0.6,
      burstLimit: 2,
      burstThreshold: 0.45,
      burstTime: 8,
      limitAt: 0,
    })
  })
  it("names the rule, or custom", () => {
    expect(ruleId(RULES.s80)).toBe("s80")
    expect(ruleId({ sustained: 1, threshold: 0.5, burstTime: 3 })).toBe("flat")
    expect(ruleId({ ...RULES.s80, burstTime: 10 })).toBe("custom")
  })
  it("a flat plan has no burst and passes the plan check", () => {
    expect(check(planDefaults(500, RULES.flat), { planMbps: 500 }).map((i) => i.code)).toEqual(["burstOff"])
  })
  it("loading a plan uses the state's rule", () => {
    const s = presetState(PRESETS[1], { ...initialState(), rule: RULES.s80 })
    expect(s.down).toEqual(planDefaults(500, RULES.s80))
    expect(s.rule).toEqual(RULES.s80)
  })
})

describe("speed test estimate", () => {
  it("drops the fastest 10 % and slowest 30 % of the time", () => {
    // 3 s at 500, 12 s at 100: keep 1.5 s of 500 and 7.5 s of 100.
    const parts = [
      { v: 500, w: 3 },
      { v: 100, w: 12 },
    ]
    expect(plainMean(parts)).toBeCloseTo(180)
    expect(trimmedMean(parts)).toBeCloseTo((1.5 * 500 + 7.5 * 100) / 9)
    expect(trimmedMean([])).toBe(0)
  })
  it("500 Mbps at 20 %: ≈167 Mbps from rest, ≈100 Mbps when repeated 5 s later", () => {
    const e = estimateSpeedTest(planDefaults(500))
    expect(e.first.plainMbps).toBeCloseTo(180)
    expect(e.first.trimmedMbps).toBeCloseTo(166.667, 2)
    // The window still holds the first test: a 1 s burst, then max-limit.
    expect(e.again.plainMbps).toBeCloseTo((500 + 14 * 100) / 15)
    expect(e.again.trimmedMbps).toBeCloseTo(100)
  })
  it("without burst the test shows the plan; a line cap caps it", () => {
    expect(estimateSpeedTest(planDefaults(500, RULES.flat)).first.trimmedMbps).toBeCloseTo(500)
    expect(estimateSpeedTest(planDefaults(1000, RULES.flat), { lineCapMbps: 940 }).first.trimmedMbps).toBeCloseTo(940)
  })
})

describe("busiest-hour capacity", () => {
  const base = (over: Partial<CapacityInput> = {}): CapacityInput => ({
    parentMbps: 1e9,
    plans: PRESETS.map((p) => ({ id: p.id, planMbps: p.downMbps, clients: 40, params: planDefaults(p.downMbps, RULES.flat) })),
    activeShare: 0.1,
    sessionS: 20,
    demandMbps: null,
    testS: 15,
    durationS: 300,
    ...over,
  })

  it("fair share: small asks are met, the rest split evenly", () => {
    const out: number[] = []
    fairShare(100, [10, 80, 80], out)
    expect(out).toEqual([10, 45, 45])
    fairShare(1000, [10, 80, 80], out)
    expect(out).toEqual([10, 80, 80])
  })
  it("with a huge uplink every speed test shows the plan", () => {
    const r = simulateCapacity(base())
    for (const p of r.plans) {
      expect(p.tests).toBeGreaterThan(5)
      expect(p.testMbps).toBeCloseTo(p.planMbps)
      expect(p.activeAvgMbps).toBeCloseTo(p.planMbps)
    }
    expect(r.parent.saturatedShare).toBe(0)
  })
  it("a small uplink saturates and the tests drop", () => {
    const r = simulateCapacity(base({ parentMbps: 2000 }))
    expect(r.parent.saturatedShare).toBeGreaterThan(0.5)
    expect(r.parent.p95Mbps).toBeLessThanOrEqual(2000 + 1e-6)
    expect(r.plans[2].testMbps).toBeLessThan(800)
  })
  it("is repeatable (seeded)", () => {
    const a = simulateCapacity(base({ parentMbps: 3000 }))
    const b = simulateCapacity(base({ parentMbps: 3000 }))
    expect(a.parent).toEqual(b.parent)
    expect(a.plans).toEqual(b.plans)
  })
  it("sizes the uplink, or says the queue rule is the limit", () => {
    const input: Omit<CapacityInput, "parentMbps"> = base()
    const flat = sizeUplink(input, 0.8)
    expect(flat.ok).toBe(true)
    if (flat.ok) {
      expect(flat.share).toBeGreaterThanOrEqual(0.8 - 1e-9)
      const below = simulateCapacity({ ...input, parentMbps: flat.parentMbps * 0.5 })
      expect(Math.min(...below.plans.map((p) => p.testMbps / p.planMbps))).toBeLessThan(0.8)
    }
    const low = sizeUplink({ ...input, plans: input.plans.map((p) => ({ ...p, params: planDefaults(p.planMbps, RULES.s20) })) }, 0.8)
    expect(low.ok).toBe(false)
    if (!low.ok) expect(low.bestShare).toBeCloseTo(1 / 3, 1)
  })
})

describe("exports for several clients", () => {
  const q = planDefaults(500, RULES.s80)

  it("simple queue line with parent, priority and comment", () => {
    expect(simpleQueueLine(sym(q), { name: "c1", target: "10.0.0.2/32", parent: "padre", priority: 3, comment: "Juan" })).toBe(
      'add name="c1" target=10.0.0.2/32 parent="padre" priority=3/3 max-limit=400M/400M burst-limit=500M/500M burst-threshold=300M/300M burst-time=16s/16s comment="Juan"'
    )
    // Priority 8 is the default: not written.
    expect(simpleQueueLine(sym(q), { name: "c", target: "", priority: 8 })).not.toContain("priority")
  })
  it("rate-limit carries a priority even without limit-at", () => {
    const flat = planDefaults(200, RULES.flat)
    expect(rateLimit(sym(flat), 3)).toBe("200M/200M 200M/200M 200M/200M 1/1 3")
    expect(rateLimit(sym(flat))).toBe("200M/200M")
  })
  it("parent + children", () => {
    const script = sharedSimpleQueues({
      parent: "padre",
      target: "10.0.0.0/24",
      maxLimit: 1000,
      children: [{ name: "cliente-1", target: "10.0.0.2/32", pair: sym({ ...q, limitAt: 50 }), priority: 8 }],
    })
    expect(script.split("\n")).toEqual([
      "/queue simple",
      'add name="padre" target=10.0.0.0/24 max-limit=1000M/1000M',
      'add name="cliente-1" target=10.0.0.2/32 parent="padre" max-limit=400M/400M burst-limit=500M/500M burst-threshold=300M/300M burst-time=16s/16s limit-at=50M/50M',
    ])
  })
  it("PPP: one profile per distinct rate-limit, under the parent", () => {
    const r = sharedPpp({
      parent: "padre",
      target: "10.0.0.0/24",
      maxLimit: 1000,
      children: [
        { pair: sym(q), priority: 8 },
        { pair: sym(q), priority: 8 },
        { pair: sym({ ...q, limitAt: 20 }), priority: 8 },
        { pair: sym(q), priority: 2 },
      ],
    })
    expect(r.names).toEqual(["plan-500M", "plan-500M", "plan-500M-2", "plan-500M-p2"])
    expect(r.script).toContain('add name="plan-500M" rate-limit="400M/400M 500M/500M 300M/300M 16/16" parent-queue="padre"')
    expect(r.script).toContain('add name="plan-500M-p2" rate-limit="400M/400M 500M/500M 300M/300M 16/16 2" parent-queue="padre"')
  })
  it("User Manager v7: limitation, profile and link; rx = client upload, in bps", () => {
    const up = planDefaults(100, RULES.flat)
    expect(userManagerPlans([{ name: "plan-500M", pair: { up, down: q } }]).split("\n")).toEqual([
      "/user-manager limitation",
      'add name="plan-500M" rate-limit-rx=100000000 rate-limit-tx=400000000 rate-limit-burst-rx=100000000 rate-limit-burst-tx=500000000 rate-limit-burst-threshold-rx=100000000 rate-limit-burst-threshold-tx=300000000 rate-limit-burst-time-rx=1s rate-limit-burst-time-tx=16s',
      "/user-manager profile",
      'add name="plan-500M" name-for-users="plan-500M" validity=unlimited',
      "/user-manager profile-limitation",
      'add profile="plan-500M" limitation="plan-500M"',
    ])
    expect(planName(sym(planDefaults(200, RULES.flat)))).toBe("plan-200M")
  })
})

describe("bulk client list", () => {
  it("reads plans, targets and quoted fields", () => {
    expect(parsePlan("500")).toBe(500)
    expect(parsePlan("1G")).toBe(1000)
    expect(parsePlan("1 Gbps")).toBe(1000)
    expect(parsePlan("512k")).toBe(0.512)
    expect(parsePlan("fibra-1g", KNOWN)).toBe(1000)
    expect(parsePlan("rápido")).toBeNull()
    expect(parseTarget("10.0.0.2")).toBe("10.0.0.2/32")
    expect(parseTarget("10.0.0.0/29")).toBe("10.0.0.0/29")
    expect(parseTarget("10.0.0.256")).toBeNull()
    expect(splitLine('"Pérez, Juan", juan, 500', ",")).toEqual(["Pérez, Juan", "juan", "500"])
    expect(splitLine('"a ""b""";x', ";")).toEqual(['a "b"', "x"])
  })
  it("skips a header and reports bad lines", () => {
    const text = ["nombre, ip, plan", "Juan, 10.0.0.2, 500", "Ana, 10.0.0.300, 200", "Luis, 10.0.0.3, turbo", "Juan, 10.0.0.4, 200", "Eva, 10.0.0.2, 1G", "solo"].join("\n")
    const r = parseBulk(text, "simple", KNOWN)
    expect(r.header).toBe(true)
    expect(r.rows.map((x) => x.name)).toEqual(["Juan"])
    expect(r.errors).toEqual([
      { line: 3, code: "ip" },
      { line: 4, code: "plan" },
      { line: 5, code: "duplicateName" },
      { line: 6, code: "duplicateId" },
      { line: 7, code: "columns" },
    ])
  })
  it("semicolons and tabs; PPPoE needs passwords and fills them", () => {
    const text = "Juan Pérez;juan;500\nAna;ana;1G;secreta"
    const r = parseBulk(text, "pppoe", KNOWN)
    expect(r.rows.map((x) => x.id)).toEqual(["ana"])
    expect(r.errors).toEqual([{ line: 1, code: "password" }])
    const filled = fillPasswords(text, "pppoe", KNOWN, () => "Abc123")
    expect(filled).toBe("Juan Pérez;juan;500; Abc123\nAna;ana;1G;secreta")
    expect(parseBulk(filled, "pppoe", KNOWN).rows).toHaveLength(2)
    expect(fillPasswords("a\tb\t200", "usermanager", KNOWN, () => "x")).toBe("a\tb\t200\tx")
    expect(fillPasswords("a, b, 200,", "pppoe", KNOWN, () => "x")).toBe("a, b, 200, x")
  })
  it("writes simple queues, PPPoE and User Manager scripts", () => {
    const rule = RULES.s80
    const simple = parseBulk("Juan, 10.0.0.2, 500\nAna, 10.0.0.3, 200", "simple", KNOWN).rows
    expect(bulkScript(simple, "simple", { rule, parent: "padre" }).split("\n")).toEqual([
      "/queue simple",
      'add name="Juan" target=10.0.0.2/32 parent="padre" max-limit=400M/400M burst-limit=500M/500M burst-threshold=300M/300M burst-time=16s/16s',
      'add name="Ana" target=10.0.0.3/32 parent="padre" max-limit=160M/160M burst-limit=200M/200M burst-threshold=120M/120M burst-time=16s/16s',
    ])
    const ppp = parseBulk("Juan, juan, 500, p1\nAna, ana, 200, p2\nLuis, luis, 500, p3", "pppoe", KNOWN).rows
    expect(bulkScript(ppp, "pppoe", { rule }).split("\n")).toEqual([
      "/ppp profile",
      'add name="plan-200M" rate-limit="160M/160M 200M/200M 120M/120M 16/16"',
      'add name="plan-500M" rate-limit="400M/400M 500M/500M 300M/300M 16/16"',
      "/ppp secret",
      'add name="juan" password="p1" service=pppoe profile="plan-500M" comment="Juan"',
      'add name="ana" password="p2" service=pppoe profile="plan-200M" comment="Ana"',
      'add name="luis" password="p3" service=pppoe profile="plan-500M" comment="Luis"',
    ])
    const um = bulkScript(ppp, "usermanager", { rule: RULES.flat })
    expect(um).toContain('/user-manager user\nadd name="juan" password="p1" comment="Juan"')
    expect(um).toContain('/user-manager user-profile\nadd user="juan" profile="plan-500M"')
    expect(um).toContain('add name="plan-200M" rate-limit-rx=200000000 rate-limit-tx=200000000\n')
    expect(bulkScript([], "simple", { rule })).toBe("")
  })
  it("addresses from a network; random passwords without look-alikes", () => {
    expect(hostTargets("10.0.0.0/24", 3)).toEqual(["10.0.0.2/32", "10.0.0.3/32", "10.0.0.4/32"])
    expect(hostTargets("10.0.0.0/29", 5)).toEqual(["10.0.0.2/32", "10.0.0.3/32", "10.0.0.4/32", "10.0.0.5/32", "10.0.0.6/32"])
    expect(hostTargets("10.0.0.0/29", 6)).toBeNull()
    expect(hostTargets("nope", 1)).toBeNull()
    expect(networkOf("192.168.5.77/24")).toBe("192.168.5.0/24")
    const pw = randomPassword(16)
    expect(pw).toHaveLength(16)
    expect(pw).toMatch(/^[a-km-np-zA-HJ-NP-Z2-9]+$/)
  })
})

describe("state with rule and capacity", () => {
  it("round-trips through the share hash", () => {
    const s = { ...initialState(), rule: { sustained: 0.65, threshold: 0.9, burstTime: 12 }, capacity: { ...DEFAULT_CAPACITY, clients: [10, 0, 7], demandMbps: 25, activeShare: 0.12 } }
    expect(decodeState(encodeState(s))).toEqual(s)
  })
  it("old links use the default rule and capacity; bad values fall back", () => {
    const old = decodeState("#p=fibra-500&d=100,500,75,16,0")
    expect(old?.rule).toEqual(DEFAULT_RULE)
    expect(old?.capacity).toEqual(DEFAULT_CAPACITY)
    expect(decodeState("#d=100,500,75,16,0&r=0,0.75,16")?.rule).toEqual(DEFAULT_RULE)
    expect(decodeState("#d=100,500,75,16,0&k=1000,2,30,,1,2,3")?.capacity).toEqual(DEFAULT_CAPACITY)
  })
  it("shared-parent clients export both directions with their limit-at", () => {
    const s = { ...initialState(), rule: RULES.s80 }
    expect(memberPair(s, { plan: "fibra-200", limitAt: 20, priority: 8, kind: "web", startS: 0 })).toEqual({
      down: { ...planDefaults(200, RULES.s80), limitAt: 20 },
      up: { ...planDefaults(200, RULES.s80), limitAt: 20 },
    })
  })
})
