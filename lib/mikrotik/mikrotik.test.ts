import { describe, expect, it } from "vitest"
import { check, defaultsFor, demandAt, figures, simulate, solve, type Pattern, type QueueParams } from "./burst"
import { hotspotProfile, pcqTypes, pppProfile, queueTree, radiusAttribute, rateLimit, rosRate, simpleQueue } from "./routeros"
import { decodeState, encodeState, initialState, PRESETS, presetState } from "./state"
import { fmtData, fmtRate, fmtSec } from "./format"
import { matchInternal } from "../internal-pages"

const sustained: Pattern = { kind: "sustained", demandMbps: null, startS: 0, onS: 1, offS: 1, testS: 1 }
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
    const test: Pattern = { kind: "intermittent", demandMbps: null, startS: 0, onS: 10, offS: 16, testS: 1 }
    const { samples } = simulate(p, test, 52)
    expect(samples.filter((s) => s.t >= 26 && s.t < 32).every((s) => s.rate === 1000)).toBe(true)
  })

  it("patterns", () => {
    const pt: Pattern = { kind: "intermittent", demandMbps: 300, startS: 2, onS: 3, offS: 2, testS: 1 }
    expect([0, 2, 4.9, 5, 6.9, 7].map((t) => demandAt(pt, t))).toEqual([0, 300, 300, 0, 0, 300])
    expect(demandAt({ ...pt, kind: "speedtest", testS: 10 }, 11.9)).toBe(300)
    expect(demandAt({ ...pt, kind: "speedtest", testS: 10 }, 12)).toBe(0)
    expect(demandAt({ ...pt, demandMbps: null, kind: "sustained" }, 5)).toBe(Number.POSITIVE_INFINITY)
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
    s.pattern = { ...s.pattern, kind: "speedtest", demandMbps: 1500, testS: 12 }
    expect(decodeState(`#${encodeState(s)}`)).toEqual(s)
    const sym = initialState()
    expect(decodeState(encodeState(sym))).toEqual(sym)
  })
  it("rejects malformed hashes", () => {
    expect(decodeState("")).toBeNull()
    expect(decodeState("#d=abc")).toBeNull()
    expect(decodeState("#d=0,1,1,1,0")).toBeNull()
    expect(decodeState("#d=500,1000,375,16,0&t=evil,1&p=nope")?.preset).toBe("custom")
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
