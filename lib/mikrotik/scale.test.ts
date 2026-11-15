import { describe, expect, it } from "vitest"
import { check, DEFAULT_RULE, longestSingleBurst, planDefaults, RULES, ruleId, solve, type QueueParams } from "./burst"
import { estimateSpeedTest, plainMean, trimmedMean } from "./speedtest"
import { fairShare, simulateCapacity, size, worstTestShare, type CapacityInput } from "./capacity"
import {
  asciiName,
  planName,
  pppProfile,
  queueTree,
  queueTypeSetup,
  rateLimit,
  sharedPpp,
  sharedSimpleQueues,
  simpleQueue,
  simpleQueueLine,
  simpleQueueUpsert,
  userManagerPlans,
} from "./routeros"
import { parseRateLimit, parseRouterOS } from "./import"
import { auditExport, migrationScript, speedHints } from "./audit"
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
    expect(check(planDefaults(500, RULES.flat), { planMbps: 500 }).map((i) => i.code)).toEqual(["burstNone"])
    // Partly set burst values are still reported as incomplete.
    expect(check({ ...planDefaults(500, RULES.flat), burstTime: 16 }).map((i) => i.code)).toEqual(["burstOff"])
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

  it("fair share: small asks are met, the rest split evenly", () => {
    const out: number[] = []
    fairShare(100, [10, 80, 80], out)
    expect(out).toEqual([10, 45, 45])
    fairShare(1000, [10, 80, 80], out)
    expect(out).toEqual([10, 80, 80])
  })
  it("moves about the average per client it's given", () => {
    const r = simulateCapacity(base({ plans: PRESETS.map((p) => ({ id: p.id, planMbps: p.downMbps, clients: 400, params: planDefaults(p.downMbps, RULES.flat) })) }))
    expect(r.perClientMbps).toBeGreaterThan(3.4 * 0.85)
    expect(r.perClientMbps).toBeLessThan(3.4 * 1.15)
    expect(r.offeredMbps).toBeCloseTo(3.4 * 1200)
  })
  it("with room to spare every speed test and download gets the plan", () => {
    const r = simulateCapacity(base())
    for (const p of r.plans) {
      expect(p.tests).toBeGreaterThan(40)
      expect(p.testP10Mbps).toBeCloseTo(p.planMbps)
      // A download never beats the plan (it can start mid-step).
      expect(p.transferMbps).toBeLessThanOrEqual(p.planMbps + 1e-6)
      expect(p.transferMbps).toBeGreaterThan(p.planMbps * 0.9)
    }
    expect(r.parent.saturatedShare).toBe(0)
    expect(r.videoShortShare).toBe(0)
  })
  it("speed tests read the network without loading it", () => {
    const quiet = simulateCapacity(base({ avgMbps: 0 }))
    expect(quiet.parent.avgMbps).toBe(0)
    expect(quiet.plans[2].testMbps).toBeCloseTo(1000)
  })
  it("a small uplink saturates and the tests drop", () => {
    const r = simulateCapacity(base({ parentMbps: 700 }))
    expect(r.parent.saturatedShare).toBeGreaterThan(0.05)
    expect(r.parent.p95Mbps).toBeLessThanOrEqual(700 + 1e-6)
    expect(r.plans[2].testP10Mbps).toBeLessThan(700)
  })
  it("a full PON port caps what the tests get; XGS-PON doesn't", () => {
    // 64 heavy homes per port: ~1.9 Gbps average on a 2.5 Gbps GPON port.
    const heavy = { avgMbps: 30, pon: { tech: "gpon" as const, homesPerPort: 64 } }
    const gpon = simulateCapacity(base(heavy))
    const xgs = simulateCapacity(base({ ...heavy, pon: { tech: "xgspon", homesPerPort: 64 } }))
    // Usable: the line rate × 92 % (GEM framing, FEC).
    expect(gpon.ports?.capacityMbps).toBeCloseTo(2488.32 * 0.92)
    expect(gpon.plans[2].testP10Mbps).toBeLessThan(xgs.plans[2].testP10Mbps)
    expect(xgs.plans[2].testP10Mbps).toBeCloseTo(1000)
    // GPON upload is half the download.
    expect(simulateCapacity(base({ direction: "up", avgMbps: 0.2 })).ports?.capacityMbps).toBeCloseTo(1244.16 * 0.92)
    // XG-PON: 10G down, 2.5G up.
    expect(simulateCapacity(base({ pon: { tech: "xgpon", homesPerPort: 64, efficiency: 1 } })).ports?.capacityMbps).toBeCloseTo(9953.28)
    expect(simulateCapacity(base({ direction: "up", avgMbps: 0.2, pon: { tech: "xgpon", homesPerPort: 64, efficiency: 1 } })).ports?.capacityMbps).toBeCloseTo(2488.32)
  })
  it("the OLT's uplink caps everything behind it", () => {
    const olt = (uplinkMbps: number) => base({ parentMbps: 1e9, olt: { uplinkMbps } })
    const ten = simulateCapacity(olt(10_000))
    const one = simulateCapacity(olt(1_000))
    // 180 clients at 32 per port use 6 ports.
    expect(ten.olt).toMatchObject({ ports: 6, uplinkMbps: 10_000 })
    expect(ten.olt?.saturatedShare).toBe(0)
    // 180 clients × 3.4 Mbps ≈ 612 Mbps average: a single 1G uplink is often full.
    expect(one.olt?.saturatedShare).toBeGreaterThan(0)
    expect(one.plans[2].testP10Mbps).toBeLessThan(ten.plans[2].testP10Mbps)
    expect(one.parent.p95Mbps).toBeLessThanOrEqual(1000 + 1e-6)
    expect(simulateCapacity(base({ olt: null })).olt).toBeNull()
  })
  it("sizing says when the OLT's uplink is the limit", () => {
    const { parentMbps: _drop, ...input } = base({ avgMbps: 10, olt: { uplinkMbps: 1500 } })
    void _drop
    const r = size(input, 0.8)
    expect(r.uplink.ok).toBe(false)
    if (!r.uplink.ok) expect(r.uplink.limit).toBe("olt")
    // Clients per port never go past the 1:128 split.
    expect(Math.max(r.perPort.gpon, r.perPort.xgpon, r.perPort.xgspon)).toBeLessThanOrEqual(128)
  })
  it("flags demand above the uplink", () => {
    const r = simulateCapacity(base({ parentMbps: 300, durationS: 120 }))
    expect(r.offeredMbps).toBeGreaterThan(300)
  })
  it("is repeatable (seeded)", () => {
    const a = simulateCapacity(base({ parentMbps: 1500 }))
    const b = simulateCapacity(base({ parentMbps: 1500 }))
    expect(a.parent).toEqual(b.parent)
    expect(a.plans).toEqual(b.plans)
  })
  it("sizes the uplink and the clients per port, or says what limits it", () => {
    const { parentMbps: _drop, ...input } = base()
    void _drop
    const flat = size(input, 0.8)
    expect(flat.uplink.ok).toBe(true)
    if (flat.uplink.ok) {
      expect(flat.uplink.share).toBeGreaterThanOrEqual(0.8 - 1e-9)
      // Well below the answer, 9 of 10 tests don't reach 80 %.
      expect(worstTestShare(simulateCapacity({ ...input, parentMbps: flat.uplink.parentMbps * 0.5 })).share).toBeLessThan(0.8)
    }
    expect(flat.perPort.xgspon).toBeGreaterThanOrEqual(flat.perPort.gpon)
    // 20 % rule: the queue is the limit, at about a third of the plan.
    const low = size({ ...input, plans: input.plans.map((p) => ({ ...p, params: planDefaults(p.planMbps, RULES.s20) })) }, 0.8)
    expect(low.uplink.ok).toBe(false)
    if (!low.uplink.ok) {
      expect(low.uplink.limit).toBe("queue")
      expect(low.uplink.bestShare).toBeCloseTo(1 / 3, 1)
    }
    expect(low.perPort).toEqual({ gpon: 0, xgpon: 0, xgspon: 0 })
    // Heavy homes on a crowded GPON port: the port is the limit.
    const crowded = size({ ...input, avgMbps: 30, pon: { tech: "gpon", homesPerPort: 64 } }, 0.8)
    expect(crowded.uplink.ok).toBe(false)
    if (!crowded.uplink.ok) expect(crowded.uplink.limit).toBe("pon")
    expect(crowded.perPort.gpon).toBeLessThan(64)
  })
})

describe("calculator", () => {
  it("counts whole sub-windows", () => {
    // threshold 75 of burst 500: ⌈2.4⌉ = 3 sub-windows → burst-time 43 s gives 8.06 s.
    const r = solve({ maxLimit: 100, burstLimit: 500, targetS: 8, solveFor: "burstTime", burstThreshold: 75 })
    expect(r).toEqual({ burstThreshold: 75, burstTime: 43, durationS: (3 * 43) / 16 })
    // Fixed burst-time: the largest threshold that still gives the target.
    expect(solve({ maxLimit: 100, burstLimit: 500, targetS: 8, solveFor: "burstThreshold", burstTime: 16 })).toEqual({
      burstThreshold: 250,
      burstTime: 16,
      durationS: 8,
    })
  })
  it("knows the longest burst that doesn't repeat", () => {
    expect(longestSingleBurst(100, 500, 16)).toBe(4)
    expect(longestSingleBurst(2, 4, 16)).toBe(8)
    expect(longestSingleBurst(500, 500, 16)).toBe(0)
  })
})

describe("import defaults", () => {
  it("rate-limit with a burst but no threshold or time: RouterOS uses the rate and 1 s", () => {
    const r = parseRateLimit("10M/20M 20M/40M")
    expect(r.ok && r.down).toEqual({ maxLimit: 20, burstLimit: 40, burstThreshold: 20, burstTime: 1, limitAt: 0 })
    expect(r.ok && r.notes).toEqual(["burstDefaults"])
    const t = parseRateLimit("10M/20M 20M/40M 15M/30M")
    expect(t.ok && t.up).toEqual({ maxLimit: 10, burstLimit: 20, burstThreshold: 15, burstTime: 1, limitAt: 0 })
  })
  it("PCQ with a burst but no pcq-burst-time: 10 s", () => {
    const r = parseRouterOS('/queue type\nadd kind=pcq name=p-down pcq-classifier=dst-address pcq-rate=100M pcq-burst-rate=500M pcq-burst-threshold=75M')
    expect(r.ok && r.down.burstTime).toBe(10)
    expect(r.ok && r.notes).toContain("pcqTimeDefault")
  })
})

describe("speed test with household traffic", () => {
  it("a 4K stream running all but cancels the burst of the 20 % rule", () => {
    expect(estimateSpeedTest(planDefaults(200), { backgroundMbps: 25 }).first.trimmedMbps).toBeCloseTo(15, 0)
    expect(estimateSpeedTest(planDefaults(200, RULES.s80), { backgroundMbps: 25 }).first.trimmedMbps).toBeGreaterThan(160)
    expect(estimateSpeedTest(planDefaults(500, RULES.flat), { backgroundMbps: 25 }).first.trimmedMbps).toBeCloseTo(475)
  })
  it("no background = the same as from rest", () => {
    expect(estimateSpeedTest(planDefaults(500), { backgroundMbps: 0 })).toEqual(estimateSpeedTest(planDefaults(500)))
  })
})

describe("queue types and re-runnable scripts", () => {
  const q = planDefaults(500, RULES.s80)
  it("fq-codel / CAKE: the type is created once and the queues use it", () => {
    const s = simpleQueue(sym(q), { name: "c", target: "10.0.0.2/32", queue: "fq-codel" })
    expect(s.split("\n")[0]).toBe(':if ([:len [/queue type find where name="fq-codel"]] = 0) do={/queue type add name="fq-codel" kind=fq-codel}')
    expect(s).toContain('queue="fq-codel/fq-codel"')
    expect(queueTree(sym(q), { name: "c", parent: "global", markUp: "u", markDown: "d", queue: "cake" })).toContain('queue="cake"')
    expect(pppProfile(sym(q), { name: "p", queue: "cake" })).toContain('queue-type="cake"')
    expect(queueTypeSetup("default")).toBeNull()
  })
  it("upsert updates by name and clears what the new plan doesn't use", () => {
    const flat = planDefaults(500, RULES.flat)
    expect(simpleQueueUpsert(sym(flat), { name: "Juan", target: "10.0.0.2/32" })).toBe(
      ':if ([:len [/queue simple find where name="Juan"]] > 0) do={/queue simple set [find where name="Juan"] target=10.0.0.2/32 max-limit=500M/500M burst-limit=0/0 burst-threshold=0/0 burst-time=0s/0s limit-at=0/0} else={/queue simple add name="Juan" target=10.0.0.2/32 max-limit=500M/500M}'
    )
    expect(asciiName("José Ñúñez")).toBe("Jose Nunez")
  })
})

describe("bulk: PCQ per plan and updates", () => {
  const rows = (text: string, m: "simple" | "pcq" | "pppoe" | "usermanager") => parseBulk(text, m, KNOWN).rows
  it("PCQ: types, trees, mangle and address lists per plan", () => {
    const script = bulkScript(rows("Juan, 10.0.0.2, 500\nAna, 10.0.0.3, 500\nLuis, 10.0.0.4, 1G", "pcq"), "pcq", { rule: RULES.s80 })
    const lines = script.split("\n")
    expect(lines).toContain('add name="plan-500M-down" kind=pcq pcq-classifier=dst-address pcq-rate=400M pcq-burst-rate=500M pcq-burst-threshold=300M pcq-burst-time=16s')
    expect(lines).toContain('add name="plan-1000M-up" parent=global packet-mark="plan-1000M-up" queue="plan-1000M-up"')
    expect(lines).toContain('add chain=forward dst-address-list="plan-500M" action=mark-packet new-packet-mark="plan-500M-down" passthrough=yes comment="plan-500M-down"')
    expect(lines).toContain('add list="plan-500M" address=10.0.0.2 comment="Juan"')
    expect(lines.filter((l) => l.startsWith("add list=")).length).toBe(3)
  })
  it("PCQ upsert moves an IP between plan lists and doesn't duplicate mangle", () => {
    const script = bulkScript(rows("Juan, 10.0.0.2, 500", "pcq"), "pcq", { rule: RULES.s80, upsert: true })
    expect(script).toContain('remove [find where address="10.0.0.2" and list~"^plan-"]')
    expect(script).toContain(':if ([:len [/ip firewall mangle find where new-packet-mark="plan-500M-down"]] = 0) do={/ip firewall mangle add ')
    expect(script).toContain(':if ([:len [/queue type find where name="plan-500M-down"]] > 0) do={/queue type set [find where name="plan-500M-down"] kind=pcq')
  })
  it("simple queues: names without accents, the full name in comment, queue type", () => {
    const script = bulkScript(rows("José Pérez, 10.0.0.2, 200", "simple"), "simple", { rule: RULES.s80, queue: "fq-codel" })
    expect(script).toContain('add name="Jose Perez" target=10.0.0.2/32 queue="fq-codel/fq-codel" max-limit=160M/160M')
    expect(script).toContain('comment="José Pérez"')
    expect(parseBulk("José, 10.0.0.2, 200\nJose, 10.0.0.3, 200", "simple", KNOWN).errors).toEqual([{ line: 2, code: "duplicateName" }])
  })
  it("PPPoE upsert keeps passwords; User Manager re-assigns profiles", () => {
    const ppp = bulkScript(rows("Juan, juan, 500, s3cr3t", "pppoe"), "pppoe", { rule: RULES.s80, upsert: true })
    expect(ppp).toContain(':if ([:len [/ppp secret find where name="juan"]] > 0) do={/ppp secret set [find where name="juan"] profile="plan-500M"} else={/ppp secret add name="juan" password="s3cr3t" service=pppoe profile="plan-500M" comment="Juan"}')
    const um = bulkScript(rows("Juan, juan, 500, s3cr3t", "usermanager"), "usermanager", { rule: RULES.flat, upsert: true })
    expect(um).toContain('remove [find where user="juan"]')
    expect(um).toContain(':if ([:len [/user-manager user find where name="juan"]] = 0) do={/user-manager user add name="juan"')
    expect(um).toContain("rate-limit-burst-rx=0")
  })
})

describe("audit of a router export", () => {
  const EXPORT = [
    "# nov/15/2026 by RouterOS 7.20",
    "/queue simple",
    'add burst-limit=200M/200M burst-threshold=30M/30M burst-time=16s/16s max-limit=40M/40M name=juan target=10.0.0.2/32',
    'add max-limit=500M/500M name="ana lopez" target=10.0.0.3/32',
    "add burst-limit=600M/600M burst-threshold=200M/200M burst-time=16s/16s max-limit=100M/100M name=luis \\",
    "    parent=nodo1 target=10.0.0.2/32",
    "add max-limit=0/300M name=raro target=10.0.0.9/32",
    "/queue type",
    "add kind=pcq name=plan-1g-down pcq-classifier=dst-address pcq-rate=200M pcq-burst-rate=1G pcq-burst-threshold=150M pcq-burst-time=16s",
    "add kind=fq-codel name=fq",
    "/ppp profile",
    'set [ find default=yes ] rate-limit=200M/200M',
    'add name=plan-500 rate-limit="100M/100M 500M/500M 75M/75M 16/16"',
    "/ip address",
    "add address=10.0.0.1/24 interface=bridge",
  ].join("\n")

  it("reads every queue and profile, recognizes plans and flags problems", () => {
    const r = auditExport(EXPORT, { plans: KNOWN, rule: RULES.s80 })
    expect(r.entries.map((e) => `${e.kind}:${e.name}`)).toEqual([
      "simple:juan",
      "simple:ana lopez",
      "simple:luis",
      "simple:raro",
      "pcq:plan-1g-down",
      "ppp:default",
      "ppp:plan-500",
    ])
    expect(r.ignored).toBe(1)
    const by = Object.fromEntries(r.entries.map((e) => [e.name, e]))
    expect(by.juan.planMbps).toBe(200)
    expect(by.juan.rule).toEqual({ sustained: 0.2, threshold: 0.75, burstTime: 16 })
    expect(by.juan.flags).toEqual(["duplicateTarget", "ruleDiffers"])
    expect(by["ana lopez"].flags).toEqual(["ruleDiffers"])
    expect(by.luis.flags).toContain("duplicateTarget")
    expect(by.luis.flags).toContain("parentMissing")
    expect(by.luis.flags).toContain("thresholdAboveMax")
    expect(by.luis.flags).toContain("unknownPlan")
    expect(by.raro.flags).toContain("unlimited")
    expect(by["plan-1g-down"].direction).toBe("down")
    expect(by["plan-1g-down"].planMbps).toBe(1000)
    expect(by.default.planMbps).toBe(200)
  })
  it("writes set commands to the current rule, leaving unknown plans alone", () => {
    const r = auditExport(EXPORT, { plans: KNOWN, rule: RULES.s80 })
    const m = migrationScript(r.entries, { plans: KNOWN, rule: RULES.s80 })
    // luis (600M) and raro (300M) match no plan.
    expect(m.skipped).toBe(2)
    const lines = m.script.split("\n")
    expect(lines).toContain('set [find where name="juan"] max-limit=160M/160M burst-limit=200M/200M burst-threshold=120M/120M burst-time=16s/16s limit-at=0/0')
    expect(lines).toContain('set [find where name="ana lopez"] max-limit=400M/400M burst-limit=500M/500M burst-threshold=300M/300M burst-time=16s/16s limit-at=0/0')
    expect(lines).toContain('set [find where name="plan-1g-down"] pcq-rate=800M pcq-burst-rate=1000M pcq-burst-threshold=600M pcq-burst-time=16s')
    expect(lines).toContain('set [find where name="plan-500"] rate-limit="400M/400M 500M/500M 300M/300M 16/16"')
    expect(lines[0]).toBe("/queue simple")
    // Already on the rule: nothing to do.
    const same = auditExport('/queue simple\nadd max-limit=160M/160M burst-limit=200M/200M burst-threshold=120M/120M burst-time=16s/16s name=x target=10.0.0.5/32', { plans: KNOWN, rule: RULES.s80 })
    expect(migrationScript(same.entries, { plans: KNOWN, rule: RULES.s80 }).changed).toBe(0)
  })
})

describe("audit: parents and ambiguous plans", () => {
  const EXPORT = [
    "/queue simple",
    "add max-limit=1000M/1000M name=nodo1 target=10.0.0.0/24",
    "add burst-limit=1000M/1000M burst-threshold=375M/375M burst-time=16s/16s max-limit=500M/500M name=ana parent=nodo1 target=10.0.0.2/32",
    'add burst-limit=1000M/1000M burst-threshold=375M/375M burst-time=16s/16s comment="plan 500 Mbps" max-limit=500M/500M name=luis parent=nodo1 target=10.0.0.3/32',
    "add burst-limit=600M/600M burst-threshold=375M/375M burst-time=16s/16s max-limit=500M/500M name=eva parent=nodo1 target=10.0.0.4/32",
  ].join("\n")
  const r = auditExport(EXPORT, { plans: KNOWN, rule: RULES.s80 })
  const by = Object.fromEntries(r.entries.map((e) => [e.name, e]))

  it("a parent queue isn't a client", () => {
    expect(by.nodo1.flags).toEqual(["parentQueue"])
    expect(by.nodo1.planMbps).toBeNull()
  })
  it("500M max + 1000M burst: ambiguous unless the name or comment says the plan", () => {
    expect(by.ana.flags).toContain("ambiguousPlan")
    expect(by.ana.planMbps).toBeNull()
    expect(by.luis.planMbps).toBe(500)
    expect(by.luis.flags).toContain("burstAbovePlan")
    // Burst to 600M matches no plan: the max-limit says it's the 500 plan.
    expect(by.eva.planMbps).toBe(500)
  })
  it("the migration leaves parents and ambiguous entries alone", () => {
    const m = migrationScript(r.entries, { plans: KNOWN, rule: RULES.s80 })
    expect(m.script).not.toContain('name="nodo1"')
    expect(m.script).not.toContain('name="ana"')
    expect(m.script).toContain('set [find where name="luis"] max-limit=400M/400M burst-limit=500M/500M')
    expect(m.skipped).toBe(1)
  })
  it("reads speeds from names and comments", () => {
    expect(speedHints("plan-500M")).toEqual([500])
    expect(speedHints("plan-1g-down")).toEqual([1000])
    expect(speedHints("cliente sin plan")).toEqual([])
  })
})

describe("state: background, queue type and capacity", () => {
  it("round-trips through the share hash", () => {
    const s = {
      ...initialState(),
      backgroundMbps: 25,
      queueKind: "cake" as const,
      capacity: { ...DEFAULT_CAPACITY, direction: "up" as const, pon: "xgspon" as const, homesPerPort: 64, avgUpMbps: 0.5, clients: [10, 0, 7] },
    }
    expect(decodeState(encodeState(s))).toEqual(s)
  })
  it("old links (activity-based capacity) get the new defaults", () => {
    const old = decodeState("#p=fibra-500&d=100,500,75,16,0&k=10000,0.05,30,,200,200,200")
    expect(old?.capacity).toEqual(DEFAULT_CAPACITY)
    expect(old?.backgroundMbps).toBe(0)
    expect(old?.queueKind).toBe("default")
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
    const s = { ...initialState(), rule: { sustained: 0.65, threshold: 0.9, burstTime: 12 }, capacity: { ...DEFAULT_CAPACITY, clients: [10, 0, 7], avgDownMbps: 5.5, videoShare: 0.3 } }
    expect(decodeState(encodeState(s))).toEqual(s)
  })
  it("old links use the default rule and capacity; bad values fall back", () => {
    const old = decodeState("#p=fibra-500&d=100,500,75,16,0")
    expect(old?.rule).toEqual(DEFAULT_RULE)
    expect(old?.capacity).toEqual(DEFAULT_CAPACITY)
    expect(decodeState("#d=100,500,75,16,0&r=0,0.75,16")?.rule).toEqual(DEFAULT_RULE)
    expect(decodeState("#d=100,500,75,16,0&h=1000,sideways,3,0.2,0.5,5,50,gpon,32,1,2,3")?.capacity).toEqual(DEFAULT_CAPACITY)
  })
  it("shared-parent clients export both directions with their limit-at", () => {
    const s = { ...initialState(), rule: RULES.s80 }
    expect(memberPair(s, { plan: "fibra-200", limitAt: 20, priority: 8, kind: "web", startS: 0 })).toEqual({
      down: { ...planDefaults(200, RULES.s80), limitAt: 20 },
      up: { ...planDefaults(200, RULES.s80), limitAt: 20 },
    })
  })
})
