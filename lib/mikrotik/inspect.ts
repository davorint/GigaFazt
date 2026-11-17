/**
 * "¿Qué tiene este router?": reads a pasted `/export terse` and says, for the guide's parts and each expert script, whether
 * it's there, complete, duplicated (pasted twice the old way) or out of date (lines from older settings), and whether
 * what it needs is installed. Everything is matched by the comments and DSX- names the scripts write; nothing leaves
 * the browser.
 */

export type PartState = "absent" | "ok" | "incomplete" | "duplicated" | "outdated"
export type PartReport = { id: string; state: PartState; found: number; expected: number; missing: string[]; extra: string[]; duplicated: string[]; needs: string[] }

/** What a script writes: each comment (once per command line) and each DSX- name that has no comment (Netwatch). */
export function markers(script: string, prefix: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const line of script.split("\n")) {
    const found = new Set<string>()
    for (const m of line.matchAll(/comment=(?:\\?"((?:[^"\\]|\\.)*?)\\?"|(\S+))/g)) {
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

/** The same keys counted in an export (terse or not: one command per line after joining continuations). */
export function exportMarkers(text: string): Map<string, number> {
  const joined = text.replace(/\\\r?\n\s*/g, "")
  const out = new Map<string, number>()
  for (const line of joined.split(/\r?\n/)) {
    for (const m of line.matchAll(/comment=(?:"((?:[^"\\]|\\.)*)"|(\S+))/g)) {
      const key = `c:${(m[1] ?? m[2] ?? "").replace(/\\"/g, '"')}`
      out.set(key, (out.get(key) ?? 0) + 1)
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
  const have = exportMarkers(text)
  const present = (p: PartSpec) => [...have.keys()].some((k) => k.startsWith(`c:${p.prefix}`) || (p.prefix.startsWith("DSX failover") && k.startsWith("n:DSX-fo-")))
  const reports = parts.map((p): PartReport => {
    const want = markers(p.script, p.prefix)
    if (p.prefix.startsWith("DSX failover")) for (const [k, v] of markers(p.script, "DSX-fo-")) want.set(k, v)
    const mine = [...have.entries()].filter(([k]) => k.startsWith(`c:${p.prefix}`) || (p.prefix.startsWith("DSX failover") && k.startsWith("n:DSX-fo-")))
    const found = mine.reduce((a, [, v]) => a + v, 0)
    const expected = [...want.values()].reduce((a, v) => a + v, 0)
    const label = (k: string) => k.slice(2)
    const missing = [...want.keys()].filter((k) => !have.has(k)).map(label)
    const extra = want.size ? mine.filter(([k]) => !want.has(k)).map(([k]) => label(k)) : []
    const duplicated = p.loose ? [] : [...want.entries()].filter(([k, v]) => (have.get(k) ?? 0) > v).map(([k]) => label(k))
    const state: PartState = !found ? "absent" : missing.length ? "incomplete" : duplicated.length ? "duplicated" : extra.length ? "outdated" : "ok"
    return { id: p.id, state, found, expected, missing, extra, duplicated, needs: [] }
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
