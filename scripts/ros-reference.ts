/**
 * Builds lib/mikrotik/ros-725.ts, the RouterOS 7.25 command table the syntax check uses, from MikroTik's CLI reference
 * (manual.mikrotik.com/docs/7.25/cli-reference/<menu>/): for every menu the tools write, its arguments, read-only
 * arguments and flags, the values a property takes when the reference lists them (enum choices, yes/no, flag lists),
 * and the pages of its special commands (send, save, show-client-config…).
 *
 *   npm run ros:reference            (pages cached in .ros-cache/; delete it to fetch again)
 *
 * Run it when a generator starts using a new menu or command (the syntax test says which), or to move to a newer
 * RouterOS: change VERSION, run, and fix what the test reports.
 */
import fs from "node:fs"
import path from "node:path"
import { rosCorpus } from "../lib/mikrotik/ros-corpus"
import { STANDARD_VERBS } from "../lib/mikrotik/ros-syntax"
import { parseScript } from "../lib/mikrotik/ros-parse"

const VERSION = "7.25"
const BASE = `https://manual.mikrotik.com/docs/${VERSION}/cli-reference/`
const CACHE = path.join(process.cwd(), ".ros-cache", VERSION)
const OUT = path.join(process.cwd(), "lib", "mikrotik", "ros-725.ts")

/** What a literal value may be: one of a set, or a comma list of a set where each may start with "!". */
type ValueRule = { kind: "one" | "list"; of: string[] }
type Page = { args: string[]; ro: string[]; flags: string[]; values: Record<string, ValueRule> }

async function fetchPage(p: string): Promise<string | null> {
  const file = path.join(CACHE, `${p.replace(/\//g, "_") || "_root"}.html`)
  if (fs.existsSync(file)) {
    const data = fs.readFileSync(file, "utf8")
    return data === "missing" ? null : data
  }
  const res = await fetch(`${BASE}${p}/`, { headers: { "User-Agent": "Mozilla/5.0" } })
  const data = res.ok ? await res.text() : res.status === 404 || res.status === 403 ? "missing" : null
  if (data === null) throw new Error(`${p}: HTTP ${res.status}`)
  fs.writeFileSync(file, data)
  await new Promise((r) => setTimeout(r, 300))
  return data === "missing" ? null : data
}

/** The value rule in a reference type: "enum (a | b)", "bool", "super { ! , state: ubit (a, b) }", a nested "flag: enum (…)"; null otherwise. */
function valueRule(type: string): ValueRule | null {
  const t = type.replace(/\s+/g, " ").trim()
  if (t === "bool") return { kind: "one", of: ["yes", "no", "true", "false"] }
  const opts = (inner: string) => inner.split(/[|,]/).map((x) => x.trim()).filter((x) => /^[a-z0-9][a-z0-9.-]*$/.test(x))
  const top = /^enum \(([^)]*)\)/.exec(t)
  if (top) {
    // One listed choice ("enum (disabled)", "enum (no-queue)") is a special value next to numbers or names: not a closed set.
    const of = opts(top[1])
    return of.length >= 2 ? { kind: "one", of } : null
  }
  const inner = /(?:ubit|flag: enum) \(([^)]*)\)/.exec(t)
  if (t.startsWith("super {") && inner) {
    const of = opts(inner[1])
    return of.length ? { kind: "list", of } : null
  }
  return null
}

function parsePage(html: string, anchor: string): Page {
  const i = html.indexOf(`id=${anchor}>`)
  let seg = i >= 0 ? html.slice(i) : html
  const end = seg.indexOf("</article>")
  if (end > 0) seg = seg.slice(0, end)
  const page: Page = { args: [], ro: [], flags: [], values: {} }
  for (const [, tbl] of seg.matchAll(/<table class=styled_table>([\s\S]*?)<\/table>/g)) {
    const head = /<th[^>]*>([^<]+)/.exec(tbl)?.[1].trim()
    if (head === "Flag") page.flags.push(...[...tbl.matchAll(/<td><em>([a-z0-9-]+)<\/em>/g)].map((m) => m[1]))
    const names = [...tbl.matchAll(/<td id="?([a-z0-9][a-z0-9-]*)"?>/g)].map((m) => m[1])
    if (head === "Argument") {
      page.args.push(...names)
      for (const row of tbl.split(/<tr>/).slice(1)) {
        const name = /<td id="?([a-z0-9][a-z0-9-]*)"?>/.exec(row)?.[1]
        const type = /<td><em>([\s\S]*?)<\/em>/.exec(row)?.[1]
        const rule = name && type ? valueRule(type) : null
        if (name && rule) page.values[name] = rule
      }
    }
    if (head === "Read-only Argument") page.ro.push(...names)
  }
  return page
}

async function main() {
  fs.mkdirSync(CACHE, { recursive: true })
  const used = new Map<string, Set<string>>()
  for (const e of rosCorpus())
    for (const c of parseScript(e.script)) {
      const v = used.get(c.menu) ?? new Set<string>()
      if (c.verb) v.add(c.verb)
      used.set(c.menu, v)
    }
  const table: Record<string, { props: string[]; commands: Record<string, string[]>; values: Record<string, ValueRule> }> = {}
  for (const [menu, verbs] of [...used.entries()].sort()) {
    const p = menu.replace(/^\//, "").replace(/ /g, "/")
    const html = p ? await fetchPage(p) : null
    const page: Page = html ? parsePage(html, p.replace(/\//g, "-")) : { args: [], ro: [], flags: [], values: {} }
    const commands: Record<string, string[]> = {}
    const values: Record<string, ValueRule> = { ...page.values }
    for (const v of [...verbs].sort()) {
      // Standard commands have no page, except on menus that have none of their own (/export, /system backup save).
      if (STANDARD_VERBS.has(v) && html) continue
      const cp = p ? `${p}/${v}` : v
      const ch = await fetchPage(cp)
      if (ch) {
        const c = parsePage(ch, cp.replace(/\//g, "-"))
        commands[v] = [...new Set([...c.args, ...c.ro])].sort()
        for (const [k, r] of Object.entries(c.values)) values[k] ??= r
      }
    }
    if (!html && p) console.log(`no page: ${menu}`)
    table[menu] = { props: [...new Set([...page.args, ...page.ro, ...page.flags])].sort(), commands, values }
  }
  const body = JSON.stringify(table, null, 1).replace(/\n\s*/g, " ")
  fs.writeFileSync(
    OUT,
    `// Generated by scripts/ros-reference.ts from the RouterOS ${VERSION} CLI reference (manual.mikrotik.com/docs/${VERSION}/cli-reference/). Do not edit by hand.\n` +
      `export const ROS_VERSION = "${VERSION}"\n` +
      `export type RosValueRule = { kind: "one" | "list"; of: string[] }\n` +
      `export const ROS_TABLE: Record<string, { props: string[]; commands: Record<string, string[]>; values: Record<string, RosValueRule> }> = ${body}\n`
  )
  console.log(`${Object.keys(table).length} menus → ${path.relative(process.cwd(), OUT)}`)
}

void main()
