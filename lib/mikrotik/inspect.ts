/**
 * "¿Qué tiene este router?": reads a pasted `/export terse` and says, for the guide's parts and each expert script, whether
 * it's there, complete, duplicated (pasted twice the old way) or out of date (lines from older settings), and whether
 * what it needs is installed. Everything is matched by the comments and DSX- names the scripts write; nothing leaves
 * the browser.
 */

/** untracked: the part writes nothing the export can identify it by (settings, items without a comment). */
export type PartState = "absent" | "ok" | "incomplete" | "duplicated" | "outdated" | "untracked"
export type PartReport = {
  id: string
  state: PartState
  found: number
  expected: number
  missing: string[]
  extra: string[]
  /** The menu each extra comment sits in on the router (to remove it). */
  extraMenus: Record<string, string>
  /** The menu of every comment of this part found on the router. */
  foundMenus: Record<string, string>
  duplicated: string[]
  needs: string[]
}

/** What a script writes: each comment (once per command line) and each DSX- name that has no comment (Netwatch). */
export function markers(script: string, prefix: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const raw of script.split("\n")) {
    // A comment in a find filter ([find where comment="LB: …"]) points at another line; it isn't one.
    const line = raw.replace(/\bfind\s+where\b[^\]]*/g, "")
    const found = new Set<string>()
    // Only the script's own lines: a comment=\"…\" inside a stored script is not a line of the router's config.
    for (const m of line.matchAll(/comment=(?:"((?:[^"\\]|\\.)*?)"|(\S+))/g)) {
      const value = (m[1] ?? m[2] ?? "").replace(/\\"/g, '"')
      if (value.startsWith(prefix)) found.add(`c:${value}`)
    }
    // Netwatch probes carry only a name.
    if (/^add name="?DSX-fo-/.test(line.trim())) {
      const m = /name="?([\w.-]+)"?/.exec(line)
      if (m) found.add(`n:${m[1]}`)
    }
    for (const k of found) out.set(k, (out.get(k) ?? 0) + 1)
  }
  return out
}

/** The menu of an export line: "/ip firewall filter add …" (terse) or the last bare "/ip firewall filter" line. */
const VERB_AT = /^(\/[a-z0-9 -]+?)\s+(?:add|set)\b/

/** The same keys counted in an export (terse or not: one command per line after joining continuations); `menus` gets where each sits. */
export function exportMarkers(text: string, menus?: Map<string, string>): Map<string, number> {
  const joined = text.replace(/\\\r?\n\s*/g, "")
  const out = new Map<string, number>()
  let menu = "/"
  for (const raw of joined.split(/\r?\n/)) {
    const line = raw.trim()
    if (/^\/[a-z0-9 -]+$/.test(line)) menu = line
    const lineMenu = VERB_AT.exec(line)?.[1].trim() ?? menu
    // One count per line: an export line is one item (a pasted one-liner may name its comment in both branches).
    const seen = new Set<string>()
    for (const m of line.replace(/\bfind\s+where\b[^\]]*/g, (x) => " ".repeat(x.length)).matchAll(/comment=(?:"((?:[^"\\]|\\.)*)"|(\S+))/g)) {
      const key = `c:${(m[1] ?? m[2] ?? "").replace(/\\"/g, '"')}`
      if (seen.has(key)) continue
      seen.add(key)
      out.set(key, (out.get(key) ?? 0) + 1)
      // In a one-liner the menu is the nearest "/menu … add|set" before the comment.
      const inLine = [...line.slice(0, m.index).matchAll(/\/([a-z][a-z0-9 -]*?)\s+(?:add|set)\b/g)].at(-1)
      menus?.set(key, inLine ? `/${inLine[1].trim()}` : lineMenu)
    }
    const nw = /\/tool netwatch.* name="?(DSX-fo-[\w.-]+)"?/.exec(line) ?? (/^add .*name="?(DSX-fo-[\w.-]+)"?/.test(line.trim()) ? /name="?(DSX-fo-[\w.-]+)"?/.exec(line) : null)
    if (nw) out.set(`n:${nw[1]}`, (out.get(`n:${nw[1]}`) ?? 0) + 1)
  }
  return out
}

export type PartSpec = {
  id: string
  /** Comment prefix of its lines ("DS: ", "LB: ", "DSX morosos: "). */
  prefix: string
  /** The script with the current settings ("" when its settings have errors: then only presence is reported). */
  script: string
  /** Parts it needs. */
  needs?: string[]
  /** Loops write many lines with one comment (fixed CGNAT): skip the duplicate check. */
  loose?: boolean
}

export function inspectExport(text: string, parts: PartSpec[]): PartReport[] {
  const where = new Map<string, string>()
  const have = exportMarkers(text, where)
  const present = (p: PartSpec) => [...have.keys()].some((k) => k.startsWith(`c:${p.prefix}`) || (p.prefix.startsWith("DSX failover") && k.startsWith("n:DSX-fo-")))
  const reports = parts.map((p): PartReport => {
    const want = markers(p.script, p.prefix)
    if (p.prefix.startsWith("DSX failover")) for (const [k, v] of markers(p.script, "DSX-fo-")) want.set(k, v)
    const mine = [...have.entries()].filter(([k]) => k.startsWith(`c:${p.prefix}`) || (p.prefix.startsWith("DSX failover") && k.startsWith("n:DSX-fo-")))
    const found = mine.reduce((a, [, v]) => a + v, 0)
    const expected = [...want.values()].reduce((a, v) => a + v, 0)
    const label = (k: string) => k.slice(2)
    const missing = [...want.keys()].filter((k) => !have.has(k)).map(label)
    const extraKeys = want.size ? mine.filter(([k]) => !want.has(k)).map(([k]) => k) : []
    const extra = extraKeys.map(label)
    const extraMenus = Object.fromEntries(extraKeys.filter((k) => k.startsWith("c:")).map((k) => [label(k), where.get(k) ?? "/"]))
    const duplicated = p.loose ? [] : [...want.entries()].filter(([k, v]) => (have.get(k) ?? 0) > v).map(([k]) => label(k))
    const state: PartState = p.script.trim() && want.size === 0 ? "untracked" : !found ? "absent" : missing.length ? "incomplete" : duplicated.length ? "duplicated" : extra.length ? "outdated" : "ok"
    const foundMenus = Object.fromEntries(mine.filter(([k]) => k.startsWith("c:")).map(([k]) => [label(k), where.get(k) ?? "/"]))
    return { id: p.id, state, found, expected, missing, extra, extraMenus, foundMenus, duplicated, needs: [] }
  })
  // What each installed part needs and isn't there.
  const byId = new Map(reports.map((r) => [r.id, r]))
  for (const p of parts) {
    const r = byId.get(p.id)
    if (!r || r.state === "absent") continue
    r.needs = (p.needs ?? []).filter((n) => {
      const spec = parts.find((x) => x.id === n)
      return spec ? !present(spec) : false
    })
  }
  return reports
}
