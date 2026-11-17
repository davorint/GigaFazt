/**
 * Repair from "¿Qué tiene este router?": from the report and the open deployment, the commands that bring the router to
 * what the deployment says, without reinstalling what works. Targeted for the base and the balancing (their guards
 * refuse a second paste, and undoing them would cut the clients and the management access): only the missing lines are
 * pasted and the lines from older settings removed. The expert scripts are pasted again (each removes its own lines
 * first), except the backup router and the OLT bond, which run once and get the targeted repair too.
 */
import { BUNDLE_ORDER, moduleSteps, type Module } from "./bundle"
import { advContext, guideScripts } from "./guide-scripts"
import { markers, type PartReport } from "./inspect"
import { rosString } from "./routeros"
import type { LabState } from "./state"

export type RepairAction = {
  part: string
  kind: "install" | "lines" | "repaste" | "untracked" | "remove" | "fresh"
  /** Commands to paste for this part ("" when there's nothing to paste). */
  script: string
  /** How many lines are added and removed (targeted repair). */
  added?: number
  removed?: number
}

export type RepairPlan = { actions: RepairAction[]; script: string; skipped: string[] }

/** Runs only once (guarded by what it creates): re-pasting doesn't fix it, so it gets the targeted repair. */
const ONCE = new Set<Module>(["respaldo", "bond"])

/** Comment prefix of each part's lines. */
export const prefixOf = (part: string) => (part === "base" ? "DS: " : part === "balance" ? "LB: " : `DSX ${part === "ippublica" ? "ip-publica" : part}: `)

/**
 * The script split into units a router can run on their own: one line, or a whole { … } block that spans lines (loops),
 * each with the menu it runs in (the last bare "/menu" line before it).
 */
export function scriptUnits(script: string): { menu: string; text: string }[] {
  const units: { menu: string; text: string }[] = []
  let menu = ""
  let block: string[] = []
  let depth = 0
  for (const line of script.split("\n")) {
    const t = line.trim()
    if (!block.length && /^\/[a-z0-9 -]+$/.test(t)) {
      menu = t
      continue
    }
    block.push(line)
    depth += braceDelta(line)
    if (depth <= 0) {
      units.push({ menu, text: block.join("\n") })
      block = []
      depth = 0
    }
  }
  if (block.length) units.push({ menu, text: block.join("\n") })
  return units
}

/** { minus } outside quoted strings. */
function braceDelta(line: string): number {
  let d = 0
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === "\\") i++
      else if (c === '"') q = false
      continue
    }
    if (c === '"') q = true
    else if (c === "{") d++
    else if (c === "}") d--
  }
  return d
}

/** The units of a script that write any of the given comments, ready to paste anywhere (relative lines get their menu). */
export function linesWriting(script: string, prefix: string, comments: string[]): string[] {
  const want = new Set(comments.map((c) => `c:${c}`))
  return scriptUnits(script)
    .filter((u) => [...markers(u.text, prefix).keys()].some((k) => want.has(k)))
    .map((u) => (/^\s*(add|set) /.test(u.text) && u.menu ? `${u.menu} ${u.text.trim()}` : u.text))
}

/** Removes the router's lines that carry these comments, in the menus the export shows them in. */
export function removeLines(menus: Record<string, string>): string[] {
  return Object.entries(menus).map(([comment, menu]) => `${menu} remove [find where comment=${rosString(comment)}]`)
}

export function repairPlan(state: LabState, reports: PartReport[], opts: { removeOff: boolean }): RepairPlan {
  const by = new Map(reports.map((r) => [r.id, r]))
  const g = guideScripts(state)
  const ctx = advContext(state)
  const actions: RepairAction[] = []
  const skipped: string[] = []
  const guide = (ids: string[]) => g.steps.filter((s) => ids.includes(s.id)).map((s) => s.script).join("\n")
  const targeted = (part: string, script: string, r: PartReport): RepairAction | null => {
    const add = r.missing.length ? linesWriting(script, prefixOf(part), r.missing) : []
    const del = removeLines(r.extraMenus)
    if (!add.length && !del.length) return null
    return { part, kind: "lines", script: [...del, ...add].join("\n"), added: add.length, removed: del.length }
  }

  const base = by.get("base")
  if (!g.steps.length) return { actions, script: "", skipped: ["guide"] }
  if (!base || base.state === "absent") {
    // A router without the base: the deployment's file, from the start.
    return { actions: [{ part: "base", kind: "fresh", script: "" }], script: "", skipped }
  }
  if (base.state !== "ok") {
    const a = targeted("base", guide(["base", "pppoe", "cgnat", "hardening", "ops"]), base)
    if (a) actions.push(a)
  }
  const balance = by.get("balance")
  if (!balance || balance.state === "absent") actions.push({ part: "balance", kind: "install", script: guide(["balance"]) })
  else if (balance.state !== "ok") {
    const a = targeted("balance", guide(["balance"]), balance)
    if (a) actions.push(a)
  }

  for (const mod of BUNDLE_ORDER) {
    const r = by.get(mod)
    const on = state.advanced.on.includes(mod)
    const present = r && r.state !== "absent" && r.state !== "untracked"
    if (!on) {
      if (present && opts.removeOff) {
        // Its own undo; when its saved settings can't make one, the lines the export shows for it, by comment.
        const undo = moduleSteps(mod, ctx, state.advanced).undo || removeLines(r.foundMenus).join("\n")
        actions.push({ part: mod, kind: "remove", script: undo })
      }
      continue
    }
    if (r?.state === "ok") continue
    const m = moduleSteps(mod, ctx, state.advanced)
    if (!m.ok) {
      skipped.push(mod)
      continue
    }
    const script = m.steps.map((s) => s.script).join("\n")
    if (r?.state === "untracked") actions.push({ part: mod, kind: "untracked", script })
    else if (!present) actions.push({ part: mod, kind: "install", script })
    else if (ONCE.has(mod)) {
      const a = targeted(mod, script, r)
      if (a) actions.push(a)
    } else actions.push({ part: mod, kind: "repaste", script })
  }
  // Removals first (an old line may block a new one), then the rest in order.
  const ordered = [...actions.filter((a) => a.kind === "remove"), ...actions.filter((a) => a.kind !== "remove")]
  return { actions: ordered, script: ordered.map((a) => a.script).filter(Boolean).join("\n"), skipped }
}
