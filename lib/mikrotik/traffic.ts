/**
 * Client traffic for the burst simulator.
 *
 * Two families:
 * - Rate patterns (sustained, intermittent, speed test) ask for a rate
 *   (or everything) while active.
 * - Transfer patterns (web, video, download) move a fixed amount of data and
 *   take as much rate as the queue gives until it's done, so a faster queue
 *   finishes sooner. Completion times are computed inside the step, not
 *   rounded to it.
 *
 * Rates in Mbps, sizes in megabits internally (MB in the pattern), times in s.
 */

export type RateKind = "sustained" | "intermittent" | "speedtest"
export type TransferKind = "web" | "video" | "download"
export type PatternKind = RateKind | TransferKind

export const RATE_KINDS: RateKind[] = ["sustained", "intermittent", "speedtest"]
export const TRANSFER_KINDS: TransferKind[] = ["web", "video", "download"]
export const KINDS: PatternKind[] = [...RATE_KINDS, ...TRANSFER_KINDS]

export type Pattern = {
  kind: PatternKind
  /** Rate patterns: what the client asks for while active, Mbps. null = as much as it gets. */
  demandMbps: number | null
  /** Idle seconds before the traffic starts. */
  startS: number
  /** intermittent: seconds on / seconds off. */
  onS: number
  offS: number
  /** speedtest: test length. */
  testS: number
  /** download: file size, MB. */
  fileMB: number
  /** video: stream bitrate, Mbps. */
  videoMbps: number
  /** web: page size, MB. */
  pageMB: number
}

export function isTransfer(kind: PatternKind): kind is TransferKind {
  return (TRANSFER_KINDS as PatternKind[]).includes(kind)
}

/** Demand the closed-form figures should assume: transfers take everything. */
export function effectiveDemand(pattern: Pattern): number | null {
  return isTransfer(pattern.kind) ? null : pattern.demandMbps
}

/** Rate patterns: demand at time t (Mbps). `Infinity` = saturating. 0 for transfer kinds. */
export function demandAt(pattern: Pattern, t: number): number {
  const rate = pattern.demandMbps ?? Number.POSITIVE_INFINITY
  const local = t - pattern.startS
  if (local < 0) return 0
  switch (pattern.kind) {
    case "sustained":
      return rate
    case "speedtest":
      return local < pattern.testS ? rate : 0
    case "intermittent": {
      const period = pattern.onS + pattern.offS
      if (pattern.onS <= 0) return 0
      if (period <= 0) return rate
      return local % period < pattern.onS ? rate : 0
    }
    default:
      return 0
  }
}

// ── Transfer patterns ───────────────────────────────────────────────────────

/** Video: segment length and the buffer the player keeps ahead (typical DASH/HLS players). */
export const VIDEO_SEGMENT_S = 4
export const VIDEO_BUFFER_S = 30
/** Web: reading time between pages, s (fixed sequence so runs repeat exactly). */
export const WEB_THINK_S = [5, 9, 4, 12, 7, 3, 10, 6, 14, 8]

export type TransferStats = {
  kind: TransferKind
  /** Requests completed (pages, video segments, the file). */
  done: number
  /** Mean request → completion time, s (web: page transfer time). null if none finished. */
  meanS: number | null
  /** download: start → file complete, s. null if it didn't finish. */
  finishS: number | null
  /** video: start → first segment ready (playback starts), s. */
  startupS: number | null
  /** video: seconds with the buffer empty while playing. */
  stallS: number
}

export interface Source {
  /** Rate it would take during [t, t+dt) with no limit, Mbps (Infinity = saturating). */
  want(t: number, dt: number): number
  /** Moves data during [t, t+dt) at up to `rate` Mbps; returns megabits delivered. */
  serve(t: number, dt: number, rate: number): number
  stats(): TransferStats | null
}

class RateSource implements Source {
  constructor(private readonly pattern: Pattern) {}
  want(t: number): number {
    return demandAt(this.pattern, t)
  }
  serve(t: number, dt: number, rate: number): number {
    return Math.max(0, Math.min(demandAt(this.pattern, t), rate)) * dt
  }
  stats(): null {
    return null
  }
}

const EPS = 1e-9
const UNLIMITED = 1e9

type Job = { left: number; at: number }

class TransferSource implements Source {
  private cur: Job | null = null
  private requested = 0
  private done = 0
  private loadSum = 0
  private finish: number | null = null
  private startup: number | null = null
  private stall = 0
  private buffer = 0
  private playing = false
  private nextAt: number

  constructor(
    private readonly pattern: Pattern & { kind: TransferKind },
    private readonly scratch = false
  ) {
    this.nextAt = pattern.startS
  }

  private clone(): TransferSource {
    const c = new TransferSource(this.pattern, true)
    Object.assign(c, this, { scratch: true, cur: this.cur ? { ...this.cur } : null })
    return c
  }

  private size(): number {
    const p = this.pattern
    if (p.kind === "download") return Math.max(0, p.fileMB) * 8
    if (p.kind === "web") return Math.max(0, p.pageMB) * 8
    return Math.max(0, p.videoMbps) * VIDEO_SEGMENT_S
  }

  /** When the next request goes out, given the client is idle at time `now`. */
  private due(now: number): number {
    const p = this.pattern
    if (now < p.startS - EPS && this.requested === 0) return p.startS
    if (p.kind === "download") return this.requested === 0 ? p.startS : Number.POSITIVE_INFINITY
    if (p.kind === "web") return this.nextAt
    // video: fetch while there's room in the buffer for another segment.
    return this.buffer <= VIDEO_BUFFER_S - VIDEO_SEGMENT_S + EPS ? now : Number.POSITIVE_INFINITY
  }

  private complete(at: number, job: Job) {
    const p = this.pattern
    this.done++
    this.loadSum += at - job.at
    if (p.kind === "download") this.finish = at - p.startS
    if (p.kind === "web") this.nextAt = at + WEB_THINK_S[(this.done - 1) % WEB_THINK_S.length]
    if (p.kind === "video") {
      this.buffer += VIDEO_SEGMENT_S
      if (!this.playing) {
        this.playing = true
        this.startup = at - p.startS
      }
    }
  }

  want(t: number, dt: number): number {
    return this.clone().serve(t, dt, UNLIMITED) / dt
  }

  serve(t: number, dt: number, rate: number): number {
    const end = t + dt
    let now = t
    let mb = 0
    if (this.size() > 0) {
      while (now < end - EPS) {
        if (!this.cur) {
          const at = Math.max(this.due(now), now)
          if (at >= end - EPS) break
          this.cur = { left: this.size(), at }
          this.requested++
          now = at
        }
        if (!(rate > 0)) break
        const room = rate * (end - now)
        if (this.cur.left <= room + EPS) {
          const doneAt = now + this.cur.left / rate
          mb += this.cur.left
          const job = this.cur
          this.cur = null
          this.complete(doneAt, job)
          now = doneAt
        } else {
          this.cur.left -= room
          mb += room
          now = end
        }
      }
    }
    // Playback drains the buffer in real time once it has started.
    if (this.pattern.kind === "video" && this.playing && !this.scratch) {
      this.buffer -= dt
      if (this.buffer < 0) {
        this.stall += -this.buffer
        this.buffer = 0
      }
    }
    return mb
  }

  stats(): TransferStats {
    return {
      kind: this.pattern.kind,
      done: this.done,
      meanS: this.done > 0 ? this.loadSum / this.done : null,
      finishS: this.finish,
      startupS: this.startup,
      stallS: this.stall,
    }
  }
}

export function makeSource(pattern: Pattern): Source {
  return isTransfer(pattern.kind) ? new TransferSource(pattern as Pattern & { kind: TransferKind }) : new RateSource(pattern)
}
