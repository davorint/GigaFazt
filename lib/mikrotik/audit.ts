/**
 * Review what's already on the router: paste the output of
 * `/queue simple export`, `/queue tree export`, `/queue type export` and/or
 * `/ppp profile export` and get every client queue (or plan profile) with the
 * plan it seems to be, the rule it follows and its problems, plus the `set`
 * commands that move them to the current rule. Runs in the browser only.
 *
 * The plan is recognized by the most the queue gives (burst-limit, or
 * max-limit without burst) matching a plan speed; entries that match none
 * are reported and left alone.
 */

import { burstEnabled, check, planDefaults, type IssueCode, type PlanRule, type QueueParams } from "./burst"
import { cleanExport, oneWay, parseRateLimit, PCQ_DEFAULT_BURST_TIME, props, readSimple } from "./import"
import { pcqProps, rateLimit, rosString, simpleQueueProps, treeSetProps, type Pair } from "./routeros"

export type AuditKind = "simple" | "tree" | "pcq" | "ppp"
export const AUDIT_KINDS: AuditKind[] = ["simple", "ppp", "pcq", "tree"]

export type AuditFlag =
  | IssueCode
  /** Two enabled simple queues with the same target: only the first one in the list limits. */
  | "duplicateTarget"
  /** parent names a simple queue that isn't in the export. */
  | "parentMissing"
  | "disabled"
  /** max-limit 0 in a direction: no limit there. */
  | "unlimited"
  /** The most it gives matches no plan speed. */
  | "unknownPlan"
  /** Recognized plan, but not set like the current rule. */
  | "ruleDiffers"

export const FLAG_LEVEL: Record<AuditFlag, "error" | "warn" | "info"> = {
  burstOff: "info",
  burstNone: "info",
  burstLimitNotAbove: "error",
  thresholdAboveMax: "warn",
  thresholdBelowLimitAt: "warn",
  limitAtAboveMax: "error",
  burstAboveLineCap: "warn",
  maxAboveLineCap: "warn",
  shortBurst: "info",
  neverEnds: "warn",
  burstAbovePlan: "error",
  maxAbovePlan: "error",
  duplicateTarget: "error",
  parentMissing: "error",
  disabled: "info",
  unlimited: "warn",
  unknownPlan: "info",
  ruleDiffers: "info",
}

export type AuditEntry = {
  /** Position in the pasted text (entries, not lines: continuations are joined). */
  index: number
  kind: AuditKind
  name: string
  target: string | null
  parent: string | null
  /** Download side (simple, ppp) or the only direction (tree, pcq). */
  down: QueueParams
  /** Upload side of simple queues and PPP profiles; null for one-direction entries. */
  up: QueueParams | null
  /** Tree / PCQ: which direction the entry seems to be. */
  direction: "down" | "up" | null
  /** PCQ classifier, kept as it is when updating. */
  classifier: string | null
  disabled: boolean
  planMbps: number | null
  planId: string | null
  /** The rule the entry follows (shares of plan and max-limit), when the plan is known. */
  rule: PlanRule | null
  flags: AuditFlag[]
}

export type AuditResult = {
  entries: AuditEntry[]
  /** Entries whose values couldn't be read. */
  unreadable: number
  /** Lines that aren't queues or profiles (other menus), ignored. */
  ignored: number
}

export type KnownPlan = { id: string; mbps: number }

const top = (q: QueueParams) => (burstEnabled(q) ? q.burstLimit : q.maxLimit)
const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.001, Math.abs(b) * 0.005)

function planFor(q: QueueParams, plans: KnownPlan[]): KnownPlan | null {
  const t = top(q)
  return t > 0 ? (plans.find((p) => near(t, p.mbps)) ?? null) : null
}

/** The rule a queue follows for its plan speed. */
export function ruleOf(q: QueueParams, planMbps: number): PlanRule {
  if (!burstEnabled(q)) return { sustained: q.maxLimit / planMbps, threshold: 0, burstTime: 0 }
  return { sustained: q.maxLimit / planMbps, threshold: q.burstThreshold / q.maxLimit, burstTime: q.burstTime }
}

/** Same burst values as the target (limit-at is kept as it is, so it doesn't count). */
const sameValues = (a: QueueParams, b: QueueParams) =>
  near(a.maxLimit, b.maxLimit) &&
  (burstEnabled(a) || burstEnabled(b)
    ? burstEnabled(a) === burstEnabled(b) && near(a.burstLimit, b.burstLimit) && near(a.burstThreshold, b.burstThreshold) && a.burstTime === b.burstTime
    : true)

/** What the entry should be under `rule` (keeps its limit-at); null when the plan is unknown. */
function targetFor(q: QueueParams, plans: KnownPlan[], rule: PlanRule, fallback: KnownPlan | null): QueueParams | null {
  const plan = planFor(q, plans) ?? fallback
  return plan ? { ...planDefaults(plan.mbps, rule), limitAt: q.limitAt } : null
}

const DOWN = /(^|[^a-z])(down|download|dl|bajada|descarga|in)([^a-z]|$)/i
const UP = /(^|[^a-z])(up|upload|ul|subida|carga|out)([^a-z]|$)/i
function directionHint(p: Map<string, string>): "down" | "up" | null {
  const classifier = p.get("pcq-classifier") ?? ""
  if (/dst-address/.test(classifier)) return "down"
  if (/src-address/.test(classifier)) return "up"
  const text = [p.get("name"), p.get("packet-mark"), p.get("parent")].filter(Boolean).join(" ")
  const d = DOWN.test(text)
  const u = UP.test(text)
  return d === u ? null : d ? "down" : "up"
}

const MENUS: Record<string, AuditKind> = {
  "queue simple": "simple",
  "queue tree": "tree",
  "queue type": "pcq",
  "ppp profile": "ppp",
}

export function auditExport(text: string, opts: { plans: KnownPlan[]; rule: PlanRule }): AuditResult {
  const entries: AuditEntry[] = []
  let unreadable = 0
  let ignored = 0
  let menu = ""
  let index = 0

  for (const raw of cleanExport(text).split(/\r?\n/)) {
    let line = raw.trim()
    if (!line) continue
    if (line.startsWith("/")) {
      const m = /^\/([a-z0-9\- /]+?)(?:\s+(add|set)\s+(.*))?$/i.exec(line)
      if (!m) continue
      menu = m[1].replace(/\//g, " ").replace(/\s+/g, " ").trim().toLowerCase()
      if (!m[2]) continue
      line = `${m[2]} ${m[3]}`
    }
    const cmd = /^(add|set)\s+(.*)$/i.exec(line)
    if (!cmd) continue
    const kind = MENUS[menu]
    if (!kind) {
      ignored++
      continue
    }
    const isSet = cmd[1].toLowerCase() === "set"
    // Only PPP default profiles appear as `set` lines in an export.
    if (isSet && kind !== "ppp") continue
    const p = props(cmd[2])
    index++
    const disabled = p.get("disabled") === "yes"
    const base = {
      index,
      kind,
      target: null as string | null,
      parent: null as string | null,
      direction: null as "down" | "up" | null,
      classifier: null as string | null,
      disabled,
      planMbps: null as number | null,
      planId: null as string | null,
      rule: null as PlanRule | null,
      flags: [] as AuditFlag[],
    }

    if (kind === "simple") {
      const q = readSimple(p)
      if (!q) {
        unreadable++
        continue
      }
      entries.push({ ...base, name: p.get("name") ?? `queue${index}`, target: p.get("target") ?? null, parent: p.get("parent") ?? null, down: q.down, up: q.up })
    } else if (kind === "ppp") {
      const rl = p.get("rate-limit")
      if (!rl) {
        index--
        continue
      }
      const r = parseRateLimit(rl)
      if (!r.ok) {
        unreadable++
        continue
      }
      const name = p.get("name") ?? (/\*FFFFFFFE/i.test(cmd[2]) ? "default-encryption" : "default")
      entries.push({ ...base, name, down: r.down, up: r.up })
    } else {
      if (kind === "pcq" && (p.get("kind") ?? "").toLowerCase() !== "pcq") {
        index--
        continue
      }
      const keys =
        kind === "pcq"
          ? { rate: "pcq-rate", burst: "pcq-burst-rate", thr: "pcq-burst-threshold", time: "pcq-burst-time", defaultTime: PCQ_DEFAULT_BURST_TIME }
          : { rate: "max-limit", burst: "burst-limit", thr: "burst-threshold", time: "burst-time", min: "limit-at" }
      const q = oneWay(p, keys)
      if (q === null) {
        unreadable++
        continue
      }
      const one = q === "noMax" ? { maxLimit: 0, burstLimit: 0, burstThreshold: 0, burstTime: 0, limitAt: 0 } : q
      entries.push({
        ...base,
        name: p.get("name") ?? `${kind}${index}`,
        parent: p.get("parent") ?? null,
        direction: directionHint(p),
        classifier: p.get("pcq-classifier") ?? null,
        down: one,
        up: null,
      })
    }
  }

  // Per-entry checks.
  const simpleNames = new Set(entries.filter((e) => e.kind === "simple").map((e) => e.name))
  const targets = new Map<string, number>()
  for (const e of entries) {
    if (e.kind !== "simple" || e.disabled || !e.target) continue
    const key = e.target.split(",").map((t) => t.trim()).sort().join(",")
    targets.set(key, (targets.get(key) ?? 0) + 1)
  }
  for (const e of entries) {
    const flags = new Set<AuditFlag>()
    const plan = planFor(e.down, opts.plans) ?? (e.up ? planFor(e.up, opts.plans) : null)
    if (plan) {
      e.planMbps = plan.mbps
      e.planId = plan.id
      const main = e.down.maxLimit > 0 ? e.down : (e.up ?? e.down)
      e.rule = ruleOf(main, plan.mbps)
    } else flags.add("unknownPlan")
    for (const q of e.up ? [e.down, e.up] : [e.down]) {
      if (q.maxLimit === 0) {
        flags.add("unlimited")
        continue
      }
      for (const issue of check(q, { planMbps: plan?.mbps ?? null })) if (issue.level !== "info") flags.add(issue.code)
    }
    if (plan) {
      const want = planDefaults(plan.mbps, opts.rule)
      const differs = (e.up ? [e.down, e.up] : [e.down]).some((q) => q.maxLimit > 0 && !sameValues(q, want))
      if (differs) flags.add("ruleDiffers")
    }
    if (e.kind === "simple") {
      const key = (e.target ?? "").split(",").map((t) => t.trim()).sort().join(",")
      if (!e.disabled && e.target && (targets.get(key) ?? 0) > 1) flags.add("duplicateTarget")
      if (e.parent && e.parent !== "none" && !simpleNames.has(e.parent)) flags.add("parentMissing")
    }
    if (e.disabled) flags.add("disabled")
    e.flags = [...flags].sort((a, b) => rank(FLAG_LEVEL[a]) - rank(FLAG_LEVEL[b]))
  }
  return { entries, unreadable, ignored }
}

const rank = (l: "error" | "warn" | "info") => (l === "error" ? 0 : l === "warn" ? 1 : 2)

const RATE_KEYS = ["max-limit=", "burst-limit=", "burst-threshold=", "burst-time=", "limit-at="]

export type Migration = {
  script: string
  /** Entries the script changes. */
  changed: number
  /** Entries left alone because their plan wasn't recognized. */
  skipped: number
}

/** `set` commands that move every recognized entry to `rule` (limit-at kept). */
export function migrationScript(entries: AuditEntry[], opts: { plans: KnownPlan[]; rule: PlanRule }): Migration {
  const blocks: Record<AuditKind, string[]> = { simple: [], ppp: [], pcq: [], tree: [] }
  let changed = 0
  let skipped = 0
  for (const e of entries) {
    if (!e.planMbps) {
      skipped++
      continue
    }
    if (!e.flags.includes("ruleDiffers")) continue
    const plan = opts.plans.find((p) => p.id === e.planId) ?? null
    const find = `[find where name=${rosString(e.name)}]`
    if (e.kind === "simple" || e.kind === "ppp") {
      const down = targetFor(e.down, opts.plans, opts.rule, plan) ?? e.down
      const up = e.up ? (e.up.maxLimit > 0 ? (targetFor(e.up, opts.plans, opts.rule, plan) ?? e.up) : e.up) : down
      const pair: Pair = { down: e.down.maxLimit > 0 ? down : e.down, up }
      if (e.kind === "simple") {
        const rates = simpleQueueProps(pair, { name: e.name, target: e.target ?? "" }, true).filter((x) => RATE_KEYS.some((k) => x.startsWith(k)))
        blocks.simple.push(`set ${find} ${rates.join(" ")}`)
      } else blocks.ppp.push(`set ${find} rate-limit=${rosString(rateLimit(pair))}`)
    } else {
      const q = targetFor(e.down, opts.plans, opts.rule, plan) ?? e.down
      if (e.kind === "pcq") {
        const classifier = e.classifier === "src-address" ? "src-address" : "dst-address"
        blocks.pcq.push(`set ${find} ${pcqProps(e.name, classifier, q, true).filter((x) => x.startsWith("pcq-rate") || x.startsWith("pcq-burst")).join(" ")}`)
      } else blocks.tree.push(`set ${find} ${treeSetProps(q).join(" ")}`)
    }
    changed++
  }
  const menus: Record<AuditKind, string> = { simple: "/queue simple", ppp: "/ppp profile", pcq: "/queue type", tree: "/queue tree" }
  const script = AUDIT_KINDS.filter((k) => blocks[k].length).flatMap((k) => [menus[k], ...blocks[k]]).join("\n")
  return { script, changed, skipped }
}

/** Commands that print what the audit reads. */
export const EXPORT_COMMANDS = ["/queue simple export", "/queue tree export", "/queue type export", "/ppp profile export"]
