import { describe, expect, it } from "vitest"
import { check, defaultsFor, demandAt, figures, simulate, solve, type Pattern, type QueueParams } from "./burst"
import { hotspotProfile, pcqTypes, pppProfile, queueTree, radiusAttribute, rateLimit, rosRate, simpleQueue } from "./routeros"
import { decodeState, encodeState, initialState, PRESETS, presetState } from "./state"
import { fmtData, fmtRate, fmtSec } from "./format"
import { matchInternal } from "../internal-pages"
import { parseRate, parseRateLimit, parseRouterOS, parseTime } from "./import"
import { allocate, simulateShared } from "./shared"
import { DEFAULT_GROUP, memberSetup } from "./state"

const SIZES = { fileMB: 2000, videoMbps: 25, pageMB: 3 }
const sustained: Pattern = { kind: "sustained", demandMbps: null, startS: 0, onS: 1, offS: 1, testS: 1, ...SIZES }
/** MikroTik's classic example (Mbps): limit-at 1M, max-limit 2M, threshold 1.5M, burst 4M, 16 s. */
const classic: QueueParams = { limitAt: 1, maxLimit: 2, burstThreshold: 1.5, burstLimit: 4, burstTime: 16 }

describe("burst model", () => {
  it("reproduces the manual's example: 6 s at burst-limit from idle, then max-limit", () => {
    const { samples, stats } = simulate(classic, sustained, 40)
    expect(stats.stepS).toBe(1)
    expect(samples.slice(0, 6).every((s) => s.rate === 4)).toBe(true)
    expect(samples[6].rate).toBe(2)
    expect(samples[6].avg).toBeCloseTo(1.5)
    expect(stats.firstBurstS).toBe(6)
    expect(stats.burstCount).toBe(1)
    expect(samples.at(-1)!.rate).toBe(2)
  })

  it("closed-form figures match the simulation", () => {
    const f = figures(classic)
    expect(f.durationS).toBe(6)
    expect(f.approxS).toBe(6)
    expect(f.extraMB).toBeCloseTo(((4 - 2) * 6) / 8)
    expect(f.rechargeS).toBe(16)
    expect(f.sustainedMbps).toBe(2)
    expect(f.repeats).toBe(false)
    // Rounds up to whole sub-windows: 16·375/1000 = 6 steps of 1 s; 16·400/1000 = 6.4 → 7.
    const p = { ...defaultsFor(500), burstLimit: 1000, burstThreshold: 400 }
    expect(figures(p).durationS).toBe(7)
    expect(simulate(p, sustained, 30).stats.firstBurstS).toBe(7)
  })

  it("a threshold above max-limit keeps bringing the burst back", () => {
    const p: QueueParams = { maxLimit: 500, burstLimit: 1000, burstThreshold: 600, burstTime: 8, limitAt: 0 }
    const f = figures(p)
    expect(f.repeats).toBe(true)
    expect(f.sustainedMbps).toBe(600)
    const { stats } = simulate(p, sustained, 120)
    expect(stats.burstCount).toBeGreaterThan(3)
    expect(stats.avgMbps).toBeGreaterThan(550)
    expect(check(p).map((i) => i.code)).toContain("thresholdAboveMax")
  })

  it("demand below burst-limit stretches the burst; demand below threshold never ends it", () => {
    const p = defaultsFor(500) // 1000 burst, 375 threshold, 16 s
    expect(figures(p, { demandMbps: 750 }).durationS).toBe(8)
    expect(figures(p, { demandMbps: 600 }).durationS).toBe(10) // 16·375/600 = 10 steps of 1 s
    expect(figures(p, { demandMbps: 400 }).durationS).toBe(0) // below max-limit: no burst used
    const low = { ...p, burstThreshold: 600 }
    expect(figures(low, { demandMbps: 550 }).durationS).toBe(Number.POSITIVE_INFINITY)
    expect(check(low, { demandMbps: 550 }).map((i) => i.code)).toContain("neverEnds")
  })

  it("a line cap limits the burst rate", () => {
    const p = defaultsFor(500)
    const f = figures(p, { lineCapMbps: 940 })
    expect(f.burstRate).toBe(940)
    expect(check(p, { lineCapMbps: 940 }).map((i) => i.code)).toContain("burstAboveLineCap")
    const { stats } = simulate(p, sustained, 30, { lineCapMbps: 940 })
    expect(stats.peakMbps).toBe(940)
  })

  it("burst off or burst-limit not above max-limit does nothing", () => {
    const off = { ...defaultsFor(200), burstTime: 0 }
    expect(simulate(off, sustained, 10).stats.peakMbps).toBe(200)
    expect(check(off).map((i) => i.code)).toEqual(["burstOff"])
    const flat = { ...defaultsFor(200), burstLimit: 200 }
    expect(check(flat).map((i) => i.code)).toEqual(["burstLimitNotAbove"])
    expect(figures(flat).durationS).toBe(0)
  })

  it("refills after burst-time of idle", () => {
    const p = defaultsFor(500)
    const test: Pattern = { kind: "intermittent", demandMbps: null, startS: 0, onS: 10, offS: 16, testS: 1, ...SIZES }
    const { samples } = simulate(p, test, 52)
    expect(samples.filter((s) => s.t >= 26 && s.t < 32).every((s) => s.rate === 1000)).toBe(true)
  })

  it("patterns", () => {
    const pt: Pattern = { kind: "intermittent", demandMbps: 300, startS: 2, onS: 3, offS: 2, testS: 1, ...SIZES }
    expect([0, 2, 4.9, 5, 6.9, 7].map((t) => demandAt(pt, t))).toEqual([0, 300, 300, 0, 0, 300])
    expect(demandAt({ ...pt, kind: "speedtest", testS: 10 }, 11.9)).toBe(300)
    expect(demandAt({ ...pt, kind: "speedtest", testS: 10 }, 12)).toBe(0)
    expect(demandAt({ ...pt, demandMbps: null, kind: "sustained" }, 5)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe("transfer traffic", () => {
  const p500 = defaultsFor(500)
  const pt = (kind: Pattern["kind"], extra: Partial<Pattern> = {}): Pattern => ({ ...sustained, kind, ...extra })

  it("a download finishes sooner with burst: 6 s at 1 Gbps, then 500 Mbps", () => {
    // 2 GB = 16,000 Mb: 6 s x 1000 + 20 s x 500 = 26 s; without burst 32 s.
    expect(simulate(p500, pt("download"), 60).stats.transfer?.finishS).toBeCloseTo(26, 6)
    expect(simulate(p500, pt("download"), 60, { noBurst: true }).stats.transfer?.finishS).toBeCloseTo(32, 6)
    expect(simulate(p500, pt("download", { startS: 3 }), 60).stats.transfer?.finishS).toBeCloseTo(26, 6)
    expect(simulate(p500, pt("download"), 10).stats.transfer?.finishS).toBeNull()
  })

  it("the last step of a transfer delivers only what was left", () => {
    const { samples } = simulate(p500, pt("download", { fileMB: 100 }), 4)
    expect(samples.map((s) => s.rate)).toEqual([800, 0, 0, 0])
    expect(samples[0].demand).toBe(800)
  })

  it("web pages load inside the step and wait the reading time", () => {
    const st = simulate(p500, pt("web"), 60).stats.transfer
    // 3 MB = 24 Mb at the 1 Gbps burst.
    expect(st?.meanS).toBeCloseTo(0.024, 6)
    expect(st?.done).toBeGreaterThan(5)
  })

  it("video fills the buffer, then fetches a segment as it drains; a slow queue stalls", () => {
    const st = simulate(p500, pt("video"), 60).stats.transfer
    expect(st?.startupS).toBeCloseTo(0.1, 6)
    expect(st?.stallS).toBe(0)
    const slow = simulate({ ...p500, maxLimit: 20, burstLimit: 0 }, pt("video"), 60).stats.transfer
    expect(slow?.startupS).toBeCloseTo(5, 6)
    expect(slow?.stallS).toBeGreaterThan(5)
  })
})

describe("shared parent", () => {
  it("guarantees limit-at first, then shares by priority and equally", () => {
    const c = (want: number, limitAt = 0, priority = 8) => ({ want, limitAt, priority })
    expect(allocate(100, [c(80), c(80)])).toEqual([50, 50])
    expect(allocate(100, [c(80, 60), c(80)])).toEqual([80, 20])
    expect(allocate(100, [c(80, 0, 8), c(80, 0, 1)])).toEqual([20, 80])
    expect(allocate(100, [c(30), c(80), c(80)])).toEqual([30, 35, 35])
    expect(allocate(100, [c(80, 80), c(80, 80)])).toEqual([50, 50])
    expect(allocate(100, [c(10), c(0)])).toEqual([10, 0])
  })

  it("a full parent eats the burst", () => {
    const m = { params: defaultsFor(500), priority: 8, pattern: sustained }
    const alone = simulateShared(1000, [m], 30)
    expect(alone.members[0].burstS).toBe(6)
    const two = simulateShared(1000, [m, m], 30)
    expect(two.members.map((x) => x.burstS)).toEqual([0, 0])
    expect(two.samples[0].rates).toEqual([500, 500])
    expect(two.parent.congestedS).toBeGreaterThan(0)
  })

  it("limit-at holds against a higher-priority client", () => {
    const a = { params: { ...defaultsFor(500), limitAt: 250 }, priority: 8, pattern: sustained }
    const b = { params: defaultsFor(1000), priority: 1, pattern: sustained }
    const r = simulateShared(500, [a, b], 20)
    expect(r.members[0].guaranteeMet).toBe(1)
    expect(r.samples.every((s) => s.rates[0] >= 250 - 1e-6)).toBe(true)
    expect(simulateShared(500, [{ ...a, params: defaultsFor(500) }, b], 20).members[0].guaranteeMet).toBeNull()
  })

  it("a web page under a busy parent loads at its fair share, not over the whole step", () => {
    const web = { params: defaultsFor(500), priority: 8, pattern: { ...sustained, kind: "web" as const } }
    const dl = { params: defaultsFor(1000), priority: 8, pattern: { ...sustained, kind: "download" as const, fileMB: 50000 } }
    const r = simulateShared(1000, [dl, web], 30)
    expect(r.members[1].transfer?.meanS).toBeLessThan(0.1)
    expect(r.parent.congestedS).toBeGreaterThan(0)
    // The download still fills what the page leaves.
    expect(r.samples[5].rates[0] + r.samples[5].rates[1]).toBeGreaterThan(990)
  })

  it("builds members from the lab state", () => {
    const s = initialState()
    const first = memberSetup(s, DEFAULT_GROUP.members[0])
    expect(first.params).toMatchObject({ maxLimit: 500, limitAt: 250 })
    expect(first.pattern).toMatchObject({ kind: "download", demandMbps: null })
    expect(memberSetup(s, { ...DEFAULT_GROUP.members[0], plan: "current", limitAt: 0 }).params).toEqual(s.down)
  })
})

describe("import from RouterOS", () => {
  const p500 = { ...defaultsFor(500), limitAt: 250 }
  const up = { ...defaultsFor(100), limitAt: 50 }

  it("parses rates and times", () => {
    expect(["512k", "10M", "1G", "2000000", "1.5m", "x", ""].map(parseRate)).toEqual([0.512, 10, 1000, 2, 1.5, null, null])
    expect(["16", "16s", "1m30s", "500ms", "00:00:16", "1h", "abc"].map(parseTime)).toEqual([16, 16, 90, 0.5, 16, 3600, null])
  })

  it("reads back every export", () => {
    const pair = { up, down: p500 }
    const want = { ok: true, down: p500, up }
    expect(parseRouterOS(simpleQueue(pair, { name: "plan", target: "10.0.0.2/32" }))).toMatchObject({ ...want, source: "simple", notes: [] })
    expect(parseRouterOS(queueTree(pair, { name: "plan", parent: "global", markUp: "c-up", markDown: "c-down" }))).toMatchObject({ ...want, source: "tree", notes: [] })
    expect(parseRouterOS(pcqTypes(pair, { name: "plan" }))).toMatchObject({ ok: true, source: "pcq", down: { ...p500, limitAt: 0 }, up: { ...up, limitAt: 0 } })
    expect(parseRouterOS(pppProfile(pair, { name: "plan" }))).toMatchObject({ ...want, source: "rateLimit" })
    expect(parseRouterOS(hotspotProfile(pair, { name: "plan" }))).toMatchObject({ ...want, source: "rateLimit" })
    expect(parseRouterOS(radiusAttribute(pair))).toMatchObject({ ...want, source: "rateLimit" })
    expect(parseRouterOS(rateLimit(pair))).toMatchObject({ ...want, source: "rateLimit" })
    const off = { ...defaultsFor(500), burstLimit: 0, burstThreshold: 0, burstTime: 0, limitAt: 100 }
    expect(parseRouterOS(rateLimit({ up: off, down: { ...off, limitAt: 0 } }))).toMatchObject({ ok: true, up: off, down: { ...off, limitAt: 0 } })
  })

  it("reads the manual's example and common shapes", () => {
    const text = "/queue simple\nadd name=classic target=192.168.0.2/32 max-limit=2M/2M limit-at=1M/1M \\\n  burst-limit=4M/4M burst-threshold=1500k/1500k burst-time=16s/16s"
    expect(parseRouterOS(text)).toMatchObject({ ok: true, down: classic, up: classic })
    expect(parseRouterOS('Mikrotik-Rate-Limit := "10M/20M"')).toMatchObject({ ok: true, up: { maxLimit: 10 }, down: { maxLimit: 20, burstLimit: 0 }, notes: ["noBurst"] })
    expect(parseRouterOS("add name=x parent=global max-limit=300M")).toMatchObject({ ok: true, source: "tree", notes: ["oneDirection"] })
    expect(parseRateLimit("10M/20M 20M/40M 8M/15M 10/10 9")).toEqual({ ok: false, error: "badValue" })
  })

  it("reports what it can't read", () => {
    expect(parseRouterOS("  ")).toEqual({ ok: false, error: "empty" })
    expect(parseRouterOS("hola")).toEqual({ ok: false, error: "unrecognized" })
    expect(parseRouterOS("add target=1.1.1.1 max-limit=abc/1M")).toEqual({ ok: false, error: "badValue" })
    expect(parseRouterOS("add target=1.1.1.1 max-limit=0/0")).toEqual({ ok: false, error: "noMaxLimit" })
  })
})

describe("solver", () => {
  it("solves burst-time for a fixed threshold", () => {
    const r = solve({ maxLimit: 500, burstLimit: 1000, targetS: 8, solveFor: "burstTime", burstThreshold: 375 })
    expect(r).toEqual({ burstThreshold: 375, burstTime: 21, durationS: 7.875 })
  })
  it("solves the threshold for a fixed burst-time", () => {
    const r = solve({ maxLimit: 500, burstLimit: 1000, targetS: 6, solveFor: "burstThreshold", burstTime: 16 })
    expect(r).toEqual({ burstThreshold: 375, burstTime: 16, durationS: 6 })
  })
  it("rejects impossible inputs", () => {
    expect(solve({ maxLimit: 500, burstLimit: 500, targetS: 6, solveFor: "burstThreshold", burstTime: 16 })).toBeNull()
    expect(solve({ maxLimit: 500, burstLimit: 1000, targetS: 0, solveFor: "burstThreshold", burstTime: 16 })).toBeNull()
  })
})

describe("RouterOS export", () => {
  const p500 = defaultsFor(500)
  const sym = { up: p500, down: p500 }

  it("formats rates with k/M only", () => {
    expect(rosRate(500)).toBe("500M")
    expect(rosRate(1000)).toBe("1000M")
    expect(rosRate(1.5)).toBe("1500k")
    expect(rosRate(0.256)).toBe("256k")
    expect(rosRate(0)).toBe("0")
  })

  it("simple queue is upload/download", () => {
    const up = { ...defaultsFor(100), burstTime: 8 }
    expect(simpleQueue({ up, down: p500 }, { name: "cliente", target: "10.0.0.2/32" })).toBe(
      '/queue simple\nadd name="cliente" target=10.0.0.2/32 max-limit=100M/500M burst-limit=200M/1000M burst-threshold=75M/375M burst-time=8s/16s'
    )
  })

  it("simple queue: one direction without burst gets zeros; limit-at only when set", () => {
    const up = { ...p500, burstTime: 0 }
    const down = { ...p500, limitAt: 250 }
    expect(simpleQueue({ up, down }, { name: "x", target: "" })).toBe(
      '/queue simple\nadd name="x" target=0.0.0.0/0 max-limit=500M/500M burst-limit=0/1000M burst-threshold=0/375M burst-time=0s/16s limit-at=0/250M'
    )
  })

  it("queue tree and PCQ", () => {
    expect(queueTree(sym, { name: "c", parent: "global", markUp: "up-m", markDown: "down-m" })).toBe(
      [
        "/queue tree",
        'add name="c-down" parent=global packet-mark="down-m" max-limit=500M burst-limit=1000M burst-threshold=375M burst-time=16s',
        'add name="c-up" parent=global packet-mark="up-m" max-limit=500M burst-limit=1000M burst-threshold=375M burst-time=16s',
      ].join("\n")
    )
    expect(pcqTypes(sym, { name: "c" })).toBe(
      [
        "/queue type",
        'add name="c-down" kind=pcq pcq-classifier=dst-address pcq-rate=500M pcq-burst-rate=1000M pcq-burst-threshold=375M pcq-burst-time=16s',
        'add name="c-up" kind=pcq pcq-classifier=src-address pcq-rate=500M pcq-burst-rate=1000M pcq-burst-threshold=375M pcq-burst-time=16s',
      ].join("\n")
    )
  })

  it("rate-limit string: rx (client upload) first", () => {
    const up = defaultsFor(100)
    expect(rateLimit({ up, down: p500 })).toBe("100M/500M 200M/1000M 75M/375M 16/16")
    expect(rateLimit({ up: { ...up, limitAt: 50 }, down: { ...p500, limitAt: 250 } })).toBe(
      "100M/500M 200M/1000M 75M/375M 16/16 8 50M/250M"
    )
    const noBurst = { ...p500, burstLimit: 0, burstThreshold: 0, burstTime: 0 }
    expect(rateLimit({ up: noBurst, down: noBurst })).toBe("500M/500M")
    expect(rateLimit({ up: { ...noBurst, limitAt: 100 }, down: noBurst })).toBe("500M/500M 500M/500M 500M/500M 1/1 8 100M/0")
    expect(pppProfile(sym, { name: "plan-500" })).toBe('/ppp profile\nadd name="plan-500" rate-limit="500M/500M 1000M/1000M 375M/375M 16/16"')
    expect(hotspotProfile(sym, { name: "h" })).toContain("/ip hotspot user profile")
    expect(radiusAttribute(sym)).toBe('Mikrotik-Rate-Limit = "500M/500M 1000M/1000M 375M/375M 16/16"')
  })

  it("escapes names", () => {
    expect(pppProfile(sym, { name: 'a"b$c' })).toContain('name="a\\"b\\$c"')
  })
})

describe("state", () => {
  it("presets come from the plans", () => {
    expect(PRESETS.map((p) => p.downMbps)).toEqual([200, 500, 1000])
    expect(initialState().down.maxLimit).toBe(500)
  })
  it("round-trips through the share hash", () => {
    const s = { ...presetState(PRESETS[2]), symmetric: false, up: { ...defaultsFor(300), limitAt: 10 }, view: "up" as const, lineCapMbps: 940 }
    s.pattern = { ...s.pattern, kind: "speedtest", demandMbps: 1500, testS: 12, fileMB: 50000, videoMbps: 8, pageMB: 2.5 }
    s.group = { parentMbps: 2500, durationS: 90, members: [{ plan: "current", limitAt: 100, priority: 3, kind: "video", startS: 7.5 }] }
    expect(decodeState(`#${encodeState(s)}`)).toEqual(s)
    const sym = initialState()
    expect(decodeState(encodeState(sym))).toEqual(sym)
  })
  it("rejects malformed hashes", () => {
    expect(decodeState("")).toBeNull()
    expect(decodeState("#d=abc")).toBeNull()
    expect(decodeState("#d=0,1,1,1,0")).toBeNull()
    expect(decodeState("#d=500,1000,375,16,0&t=evil,1&p=nope")?.preset).toBe("custom")
    expect(decodeState("#d=500,1000,375,16,0&g=1000,60~fibra-500,0,9,web,0")?.group).toEqual(DEFAULT_GROUP)
    expect(decodeState("#d=500,1000,375,16,0&g=1000,60~nope,0,8,web,0")?.group).toEqual(DEFAULT_GROUP)
    expect(decodeState("#d=500,1000,375,16,0")?.pattern.fileMB).toBe(2000)
  })
})

describe("format", () => {
  it("formats", () => {
    expect(fmtRate(500)).toBe("500 Mbps")
    expect(fmtRate(1000)).toBe("1,000 Mbps")
    expect(fmtRate(12500)).toBe("12.5 Gbps")
    expect(fmtData(3000)).toBe("375 MB")
    expect(fmtData(80000)).toBe("10 GB")
    expect(fmtSec(0.25)).toBe("0.25 s")
    expect(fmtSec(Number.POSITIVE_INFINITY)).toBe("∞")
  })
})

describe("internal pages", () => {
  it("matches only internal paths", () => {
    expect(matchInternal("/mikrotik")).toEqual({ rewriteTo: "/es/mikrotik" })
    expect(matchInternal("/mikrotik.rsc")).toEqual({ rewriteTo: "/es/mikrotik.rsc" })
    expect(matchInternal("/mikrotik/x")).toEqual({ rewriteTo: "/es/mikrotik/x" })
    expect(matchInternal("/es/mikrotik")).toEqual({ rewriteTo: null })
    expect(matchInternal("/en/mikrotik.segments/a")).toEqual({ rewriteTo: null })
    expect(["/", "/es", "/mikrotikx", "/es/mikrotikx", "/es/planes", "/x/y/mikrotik"].map(matchInternal)).toEqual([null, null, null, null, null, null])
  })
  it("maps any capitalization to the lowercase route", () => {
    expect(matchInternal("/MIKROTIK")).toEqual({ rewriteTo: "/es/mikrotik" })
    expect(matchInternal("/MikroTik/x")).toEqual({ rewriteTo: "/es/mikrotik/x" })
    expect(matchInternal("/es/MIKROTIK")).toEqual({ rewriteTo: "/es/mikrotik" })
    expect(matchInternal("/ES/Mikrotik.rsc")).toEqual({ rewriteTo: "/es/mikrotik.rsc" })
  })
})
