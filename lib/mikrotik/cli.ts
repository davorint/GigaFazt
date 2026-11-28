/**
 * The scripts page's "Comandos CLI" view (owner, 2026-11-28): the same configuration the scripts write, as plain
 * terminal commands for the WinBox terminal, in small steps.
 *
 * - Every line carries its full menu path (`/ip pool add …`), so a step pasted alone never depends on the menu
 *   the terminal was left in. No tabs (WinBox completes on them) and no line continuations.
 * - Guards (`:if (…) do={:error …}`) become "Comprobar antes" commands with the answer to expect.
 * - Add-or-update one-liners become `add` on a new router. On a configured one, with its `/export` pasted, each
 *   item is compared: the same → skipped, different → `set [find where …]` with only what changes, missing → `add`,
 *   and items with this tool's comment prefix that it no longer creates → `remove`.
 * - Anything the reader can't turn into plain commands (loops, waits) stays as it is and is marked as a script line.
 * - Each step is split by menu into pieces of about a dozen lines, each with a check and its own undo.
 *
 * Pure functions; the terminal runs the same language as /import, so a converted line means what the script meant.
 */

export type CliMode = "new" | "existing"

/** A command to run and what it should answer. */
export type CliCheck = {
  cmd: string
  /** count: `print count-only` → 0, or at least `n`; value: `:put [...]` → the value (or anything but it). */
  expect: { kind: "zero" } | { kind: "atLeast"; n: number } | { kind: "value"; value: string; not: boolean } | { kind: "list" }
  /** The guard's own message, when it came from one. */
  msg?: string
}

export type CliLineKind = "cmd" | "script" | "manual"
/** add/set/remove: what the line does to the router; changed = the props a diff `set` touches. */
export type CliLine = { text: string; menu: string; verb: string; kind: CliLineKind; changed?: string[]; stale?: boolean }

export type CliSegment = {
  /** Stable id from the step and the text (a changed piece starts unticked). */
  id: string
  step: number
  part: number
  parts: number
  menus: string[]
  lines: CliLine[]
  before: CliCheck[]
  verify: CliCheck[]
  undo: string[]
  /** Some lines (set, script) can't be undone from here: use the export saved before. */
  undoPartial: boolean
  /** The step's own verify command (last piece only). */
  stepVerify?: string
}

/** stale: the extra piece of a configured router, items this tool no longer creates. */
export type CliStep = { title: string; segments: CliSegment[]; same: number; stale?: boolean }

export type CliResult = {
  steps: CliStep[]
  /** Existing mode: items already the same on the router (skipped). */
  same: number
  /** Existing mode with an export: how many items it read. */
  exportItems: number
  nonAscii: boolean
}

export type CliInput = { title: string; script: string; verify?: string }

/* ---------- tokens ---------- */

/** Splits at `sep` outside quotes and brackets; keeps every token raw. */
export function topSplit(s: string, sep: " " | ";"): string[] {
  const out: string[] = []
  let cur = ""
  let depth = 0
  let quoted = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (quoted) {
      cur += ch
      if (ch === "\\" && i + 1 < s.length) cur += s[++i]
      else if (ch === '"') quoted = false
      continue
    }
    if (ch === '"') {
      quoted = true
      cur += ch
      continue
    }
    if ("[{(".includes(ch)) depth++
    if ("]})".includes(ch)) depth = Math.max(0, depth - 1)
    const isSep = sep === " " ? ch === " " || ch === "\t" : ch === ";"
    if (isSep && depth === 0) {
      if (cur.trim()) out.push(sep === " " ? cur : cur.trim())
      cur = ""
      continue
    }
    cur += ch
  }
  if (cur.trim()) out.push(sep === " " ? cur : cur.trim())
  return out
}

/** A quoted RouterOS value without its quotes and escapes; bare values as they are. */
export function unquote(v: string): string {
  const t = v.trim()
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1).replace(/\\(.)/g, "$1")
  return t
}

const quote = (v: string) => `"${v.replace(/["\\$]/g, (c) => `\\${c}`)}"`

const VERBS = new Set(["add", "set", "remove", "disable", "enable", "print", "export", "run", "unset", "move", "reset-counters", "comment", "edit", "get", "find", "monitor", "save", "load", "import", "upgrade", "reboot", "show-client-config", "monitor-traffic", "flush", "send", "check-for-updates", "install", "download", "clear"])
const MENU_WORD = /^[a-z0-9][a-z0-9-]*$/

type Cmd = { menu: string; verb: string; args: string[] }
type Cond = { kind: "count"; menu: string; where: string; op: "zero" | "some" } | { kind: "value"; expr: string; value: string; eq: boolean }
type Stmt =
  | { t: "cmd"; cmd: Cmd }
  | { t: "guard"; cond: Cond | null; msg: string; raw: string }
  | { t: "if"; cond: Extract<Cond, { kind: "count" }>; then: Stmt[]; else: Stmt[] }
  | { t: "script"; raw: string }

/** key=value (or a bare flag → "") of a command's arguments; the first bare non-flag word is the target. */
function propsOf(args: string[], verb: string): { props: Map<string, string>; target: string | null } {
  const props = new Map<string, string>()
  let target: string | null = null
  for (const a of args) {
    const m = /^([a-z0-9][a-z0-9-]*)=([\s\S]*)$/.exec(a)
    if (m) props.set(m[1], m[2])
    else if (verb !== "add" && target === null && (a.startsWith("[") || /^[A-Za-z0-9*][^=]*$/.test(a))) target = a
    else props.set(a, "")
  }
  return { props, target }
}

/* ---------- reading the scripts ---------- */

function subst(text: string, vars: Map<string, string>): string {
  if (!vars.size) return text
  return text.replace(/\$([a-zA-Z][a-zA-Z0-9]*)\b/g, (all, name: string) => vars.get(name) ?? all)
}

function parseCond(raw: string, vars: Map<string, string>): Cond | null {
  let c = subst(raw.trim(), vars)
  if (c.startsWith("(") && c.endsWith(")")) c = c.slice(1, -1).trim()
  const count = /^\[:len \[(\/[a-z0-9][a-z0-9 -]*?) find(?: where ([\s\S]+))?\]\]\s*(>|=|!=)\s*0$/.exec(c)
  if (count) return { kind: "count", menu: count[1].trim(), where: (count[2] ?? "").trim(), op: count[3] === "=" ? "zero" : "some" }
  const value = /^(\[[\s\S]+\])\s*(=|!=)\s*"([^"]*)"$/.exec(c)
  if (value) return { kind: "value", expr: value[1], value: value[3], eq: value[2] === "=" }
  return null
}

/** A `{…}` or `do={…}` body without its braces. */
function inner(tok: string, open: string): string | null {
  if (!tok.startsWith(open) || !tok.endsWith("}")) return null
  return tok.slice(open.length, -1).trim()
}

/** One statement (no `;` at the top level) in menu `ctx`. */
function parseStmt(text: string, ctx: { menu: string }, vars: Map<string, string>): Stmt[] | null {
  const s = text.trim()
  if (!s || s.startsWith("#")) return []
  const toks = topSplit(s, " ")
  const head = toks[0]
  if (head === ":if") {
    if (toks.length < 3) return null
    const body = inner(toks[2], "do={")
    if (body === null) return null
    const elseBody = toks[3] ? inner(toks[3], "else={") : ""
    if (elseBody === null || toks.length > 4) return null
    const thenStmts = parseBody(body, ctx, vars)
    const elseStmts = elseBody ? parseBody(elseBody, ctx, vars) : []
    const cond = parseCond(toks[1], vars)
    // A guard: stops with a message.
    const err = /^:error\s+("(?:[^"\\]|\\.)*")$/.exec(body)
    if (err && !elseBody) return [{ t: "guard", cond, msg: unquote(err[1]), raw: s }]
    if (!cond || cond.kind !== "count" || !thenStmts || !elseStmts) return null
    return [{ t: "if", cond, then: thenStmts, else: elseStmts }]
  }
  if (head === ":do") {
    const body = toks[1] ? inner(toks[1], "{") : null
    if (body === null || toks.length > 3 || (toks[2] && !toks[2].startsWith("on-error="))) return null
    return parseBody(body, ctx, vars)
  }
  if (head.startsWith("{")) {
    const body = inner(s, "{")
    if (body === null) return null
    const local = new Map(vars)
    const out: Stmt[] = []
    for (const part of topSplit(body, ";")) {
      const loc = /^:local\s+([a-zA-Z][a-zA-Z0-9]*)\s+(\[[\s\S]+\])$/.exec(part)
      if (loc) {
        // [find …] at the start of an expression belongs to no menu: give it its path.
        local.set(loc[1], subst(loc[2], local))
        continue
      }
      const got = parseStmt(part, ctx, local)
      if (!got || got.some((x) => x.t === "script")) return null
      out.push(...got)
    }
    return out
  }
  if (head.startsWith(":")) return [{ t: "script", raw: subst(s, vars) }]
  // A command: /menu path [verb] args, or a verb relative to the menu last named.
  const ws = head.startsWith("/") ? [head.slice(1), ...toks.slice(1)] : toks
  let i = 0
  let menu = ctx.menu
  if (head.startsWith("/")) {
    const path: string[] = []
    while (i < ws.length && MENU_WORD.test(ws[i]) && !VERBS.has(ws[i])) path.push(ws[i++])
    menu = "/" + path.join(" ")
    if (i >= ws.length) {
      // A bare "/menu path" line: the add/set lines after it belong to it.
      ctx.menu = menu
      return []
    }
  }
  const verb = ws[i]
  if (!VERBS.has(verb)) return null
  ctx.menu = menu
  const args = ws.slice(i + 1).map((a) => subst(a, vars))
  return [{ t: "cmd", cmd: { menu: menu === "/" ? "" : menu, verb, args } }]
}

function parseBody(body: string, ctx: { menu: string }, vars: Map<string, string>): Stmt[] | null {
  const out: Stmt[] = []
  const local = { menu: ctx.menu }
  for (const part of topSplit(body, ";")) {
    const got = parseStmt(part, local, vars)
    if (!got) return null
    out.push(...got)
  }
  return out
}

/** Every statement of a script, line by line; lines it can't read stay as script lines. */
export function readScript(script: string): Stmt[] {
  const out: Stmt[] = []
  const ctx = { menu: "/" }
  for (const raw of script.replace(/\\\r?\n\s*/g, "").split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const got = parseStmt(line, ctx, new Map())
    out.push(...(got ?? [{ t: "script" as const, raw: line }]))
  }
  return out
}

/* ---------- the router's export ---------- */

type Item = { menu: string; verb: "add" | "set"; props: Map<string, string>; target: string | null; raw: string; used?: boolean }
export type ExportIndex = { items: Item[]; byMenu: Map<string, Item[]> }

/** Reads `/export` (terse or not): every add and set, values without quotes. */
export function indexExport(text: string): ExportIndex {
  const items: Item[] = []
  const byMenu = new Map<string, Item[]>()
  for (const st of readScript(text)) {
    if (st.t !== "cmd" || (st.cmd.verb !== "add" && st.cmd.verb !== "set")) continue
    const { props, target } = propsOf(st.cmd.args, st.cmd.verb)
    const norm = new Map([...props].map(([k, v]) => [k, unquote(v)]))
    const it: Item = { menu: st.cmd.menu, verb: st.cmd.verb, props: norm, target: target ? normTarget(target) : null, raw: cmdText(st.cmd) }
    items.push(it)
    byMenu.set(it.menu, [...(byMenu.get(it.menu) ?? []), it])
  }
  return { items, byMenu }
}

/** "[ find default-name=ether1 ]", "[find where interface=\"ether1\"]" and "ether1" all name ether1. */
function normTarget(t: string): string {
  const m = /^\[\s*find(?:\s+where)?\s+[a-z-]+=("?)([^\]"]*)\1\s*\]$/.exec(t.trim())
  return m ? m[2] : unquote(t)
}

type Term = { k: string; op: "=" | "~"; v: string }
function terms(where: string): Term[] | null {
  const out: Term[] = []
  for (const tok of topSplit(where, " ")) {
    const m = /^([a-z0-9][a-z0-9-]*)(=|~)([\s\S]+)$/.exec(tok)
    if (!m || m[3].startsWith("[") || m[3].includes("$")) return null
    out.push({ k: m[1], op: m[2] as "=" | "~", v: unquote(m[3]) })
  }
  return out.length ? out : null
}

function matches(it: Item, ts: Term[]): boolean {
  return ts.every((t) => {
    const v = it.props.get(t.k)
    if (v === undefined) return false
    if (t.op === "=") return v === t.v
    try {
      return new RegExp(t.v).test(v)
    } catch {
      return false
    }
  })
}

/** How many export items `find where …` would find; null when the clause is beyond this reader. */
function countIn(ex: ExportIndex, menu: string, where: string): number | null {
  const ts = where ? terms(where) : []
  if (!ts) return null
  return (ex.byMenu.get(menu) ?? []).filter((it) => it.verb === "add" && matches(it, ts)).length
}

/* ---------- comparing with the export ---------- */

/** Props that tell apart items sharing a comment (rules, list entries, routes). */
const ANCHORS = ["chain", "action", "list", "address", "interface", "in-interface", "out-interface", "in-interface-list", "out-interface-list", "src-address", "dst-address", "host", "routing-table", "protocol", "dst-port", "vlan-id", "url", "parent", "packet-mark", "new-packet-mark", "new-connection-mark", "new-routing-mark", "connection-mark", "per-connection-classifier", "dscp", "gateway", "tcp-flags"]
/** Values RouterOS leaves out of an export because they are the default. */
const DEFAULTS: Record<string, string> = { disabled: "no", passthrough: "yes" }

const simple = (v: string) => !/[[$]/.test(v)

function diffProps(ours: Map<string, string>, theirs: Map<string, string>, skip: Set<string>): string[] {
  const out: string[] = []
  for (const [k, raw] of ours) {
    // Computed on the router ([…], $var): nothing to compare it with.
    if (skip.has(k) || !simple(raw)) continue
    const v = unquote(raw)
    const t = theirs.get(k)
    if (t === undefined) {
      if (DEFAULTS[k] === v) continue
      out.push(k)
    } else if (t !== v) out.push(k)
  }
  return out
}

/** A `[find where …]` that picks this item: by name, else its comment and the props that tell it apart. */
function selectorFor(menu: string, props: Map<string, string>, ex: ExportIndex | null): string | null {
  const name = props.get("name")
  if (name !== undefined && simple(name)) return `[find where name=${quote(unquote(name))}]`
  const parts: string[] = []
  const comment = props.get("comment")
  if (comment !== undefined) parts.push(`comment=${quote(unquote(comment))}`)
  for (const k of ANCHORS) {
    const v = props.get(k)
    if (v !== undefined && v !== "" && simple(v) && !v.includes("!")) parts.push(`${k}=${quote(unquote(v))}`)
  }
  // No name and no comment: anchors alone could match the router's own items (the default logging rules…).
  if (comment === undefined) return null
  const where = parts.join(" ")
  // Picks more than one item on this router: not safe for a set or remove.
  if (ex && (countIn(ex, menu, where) ?? 0) > 1) return null
  return `[find where ${where}]`
}

function findItem(ex: ExportIndex, menu: string, props: Map<string, string>): { item: Item; diff: string[] } | null {
  const list = (ex.byMenu.get(menu) ?? []).filter((it) => it.verb === "add" && !it.used)
  const name = props.get("name")
  let cands: Item[]
  if (name !== undefined) cands = list.filter((it) => it.props.get("name") === unquote(name))
  else {
    const comment = props.get("comment")
    const anchors = ANCHORS.filter((k) => props.has(k) && simple(props.get(k)!))
    cands = list.filter((it) => (comment === undefined || it.props.get("comment") === unquote(comment)) && anchors.every((k) => it.props.get(k) === unquote(props.get(k)!)))
    if (comment === undefined) cands = cands.filter((it) => diffProps(props, it.props, new Set()).length === 0)
  }
  if (!cands.length) return null
  const scored = cands.map((item) => ({ item, diff: diffProps(props, item.props, new Set(["name"])) }))
  scored.sort((a, b) => a.diff.length - b.diff.length)
  return scored[0]
}

/* ---------- turning statements into lines ---------- */

type Out = { lines: (CliLine & { addProps?: Map<string, string> })[]; before: CliCheck[]; same: number }

/** "/menu verb args"; root commands ("/export …") keep their slash. */
const cmdText = (cmd: Cmd) => [cmd.menu ? `${cmd.menu} ${cmd.verb}` : `/${cmd.verb}`, ...cmd.args].join(" ")

const line = (cmd: Cmd, kind: CliLineKind = "cmd", extra: Partial<CliLine> = {}): CliLine => ({
  text: cmdText(cmd),
  menu: cmd.menu,
  verb: cmd.verb,
  kind,
  ...extra,
})

function checkOf(cond: Cond, wantTrue: boolean, msg?: string): CliCheck {
  if (cond.kind === "count") {
    const cmd = `${cond.menu} print count-only${cond.where ? ` where ${cond.where}` : ""}`
    const zero = (cond.op === "zero") === wantTrue
    return { cmd, expect: zero ? { kind: "zero" } : { kind: "atLeast", n: 1 }, msg }
  }
  return { cmd: `:put ${cond.expr}`, expect: { kind: "value", value: cond.value, not: cond.eq !== wantTrue }, msg }
}

function evalCond(cond: Cond, ex: ExportIndex | null): boolean | null {
  if (!ex || cond.kind !== "count") return null
  const n = countIn(ex, cond.menu, cond.where)
  if (n === null) return null
  return cond.op === "zero" ? n === 0 : n > 0
}

const isError = (stmts: Stmt[]) => stmts.length === 1 && stmts[0].t === "script" && stmts[0].raw.startsWith(":error")

const addCheck = (out: Out, c: CliCheck) => {
  if (!out.before.some((b) => b.cmd === c.cmd)) out.before.push(c)
}

function emit(stmts: Stmt[], mode: CliMode, ex: ExportIndex | null, out: Out) {
  for (const st of stmts) {
    if (st.t === "script") out.lines.push({ text: st.raw, menu: "", verb: "", kind: "script" })
    else if (st.t === "guard") {
      // On a configured router the "already installed" guards are the point: skip them; keep what must exist.
      if (!st.cond) out.lines.push({ text: st.raw, menu: "", verb: "", kind: "script" })
      else {
        const check = checkOf(st.cond, false, st.msg)
        if (mode === "existing" && check.expect.kind === "zero") continue
        addCheck(out, check)
      }
    } else if (st.t === "if") {
      const known = evalCond(st.cond, ex)
      if (known !== null && !(known === false && isError(st.else))) {
        emit(known ? st.then : st.else, mode, ex, out)
        continue
      }
      // "Do it if X is there, else stop": a check, then do it.
      if (isError(st.else)) {
        addCheck(out, checkOf(st.cond, true))
        emit(st.then, mode, ex, out)
      }
      // A new router has none of it: add-or-update → add, add-if-missing → add, "if it's there" → do it (and check).
      else if (st.cond.op === "zero") emit(st.then, mode, ex, out)
      else if (st.else.length) emit(st.else, mode, ex, out)
      else {
        addCheck(out, checkOf(st.cond, true))
        emit(st.then, mode, ex, out)
      }
    } else emitCmd(st.cmd, ex, out)
  }
}

function emitCmd(cmd: Cmd, ex: ExportIndex | null, out: Out) {
  const { props, target } = propsOf(cmd.args, cmd.verb)
  if (!ex || (cmd.verb !== "add" && cmd.verb !== "set")) {
    out.lines.push({ ...line(cmd), addProps: cmd.verb === "add" ? props : undefined })
    return
  }
  if (cmd.verb === "add") {
    const hit = findItem(ex, cmd.menu, props)
    if (!hit) {
      out.lines.push({ ...line(cmd), addProps: props })
      return
    }
    hit.item.used = true
    if (!hit.diff.length) {
      out.same++
      return
    }
    const sel = selectorFor(cmd.menu, props, ex)
    const changed = hit.diff.map((k) => (props.get(k) === "" ? k : `${k}=${props.get(k)}`))
    if (!sel) out.lines.push({ text: `# ${cmdText(cmd)}`, menu: cmd.menu, verb: "set", kind: "manual", changed: hit.diff })
    else out.lines.push({ text: `${cmd.menu} set ${sel} ${changed.join(" ")}`, menu: cmd.menu, verb: "set", kind: "cmd", changed: hit.diff })
    return
  }
  // set: an item the export added (by its find where), else the export's set lines for the same target.
  const where = target?.startsWith("[") ? /^\[\s*find(?:\s+where)?\s+([\s\S]*?)\s*\]$/.exec(target)?.[1] : undefined
  const ts = where ? terms(where) : null
  let theirs: Map<string, string> | null = null
  if (ts) {
    const hits = (ex.byMenu.get(cmd.menu) ?? []).filter((it) => it.verb === "add" && matches(it, ts))
    if (hits.length === 1) theirs = hits[0].props
  }
  if (!theirs) {
    const t = target ? normTarget(target) : null
    const sets = (ex.byMenu.get(cmd.menu) ?? []).filter((it) => it.verb === "set" && it.target === t)
    if (sets.length) theirs = new Map(sets.flatMap((s) => [...s.props]))
  }
  if (!theirs) {
    out.lines.push(line(cmd))
    return
  }
  const diff = diffProps(props, theirs, new Set())
  if (!diff.length) {
    out.same++
    return
  }
  const args = [...(target ? [target] : []), ...diff.map((k) => (props.get(k) === "" ? k : `${k}=${props.get(k)}`))]
  out.lines.push({ ...line({ ...cmd, args }), changed: diff })
}

/* ---------- pieces, checks and undo ---------- */

export const PIECE = 12
const LONG_RUN = 60
const LONG_PIECE = 50

/** The comment without its numbers (WAN1, WAN2 … are one run). */
const stem = (l: CliLine & { addProps?: Map<string, string> }) => unquote(l.addProps?.get("comment") ?? "").replace(/\d+/g, "#") || l.verb

function pieces(lines: Out["lines"]): Out["lines"][] {
  // Blocks of one menu, then runs of one comment stem inside a block that is too long.
  const blocks: Out["lines"][] = []
  for (const l of lines) {
    const last = blocks[blocks.length - 1]
    if (last && last[0].menu === l.menu && l.kind !== "script" && last[0].kind !== "script") last.push(l)
    else blocks.push([l])
  }
  const units: Out["lines"][] = []
  for (const b of blocks) {
    if (b.length <= PIECE) {
      units.push(b)
      continue
    }
    const runs: Out["lines"][] = []
    for (const l of b) {
      const last = runs[runs.length - 1]
      if (last && stem(last[0]) === stem(l)) last.push(l)
      else runs.push([l])
    }
    for (const r of runs) {
      const size = r.length > LONG_RUN ? LONG_PIECE : PIECE
      for (let k = 0; k < r.length; k += size) units.push(r.slice(k, k + size))
    }
  }
  // Pack small neighbours together up to a piece's size.
  const out: Out["lines"][] = []
  for (const u of units) {
    const last = out[out.length - 1]
    if (last && last.length + u.length <= PIECE) last.push(...u)
    else out.push([...u])
  }
  return out
}

/** The longest start shared by every string, cut to letters, digits, spaces, ":" "-" "_" (no regex escapes needed). */
function sharedStart(list: string[]): string {
  let p = list[0] ?? ""
  for (const s of list) while (!s.startsWith(p)) p = p.slice(0, -1)
  const m = /^[A-Za-z0-9 :_-]*/.exec(p)
  return m ? m[0] : ""
}

function verifyOf(seg: Out["lines"], counted: Out["lines"], mode: CliMode): CliCheck[] {
  const out: CliCheck[] = []
  const menus = [...new Set(seg.map((l) => l.menu).filter(Boolean))]
  for (const menu of menus) {
    const adds = seg.filter((l) => l.menu === menu && l.verb === "add" && l.kind === "cmd" && l.addProps)
    if (adds.length) {
      const key = adds.every((l) => l.addProps!.has("comment")) ? "comment" : adds.every((l) => l.addProps!.has("name")) ? "name" : null
      const start = key ? sharedStart(adds.map((l) => unquote(l.addProps!.get(key)!))) : ""
      if (key && start.length >= 3) {
        const n = counted.filter((l) => l.menu === menu && l.verb === "add" && l.kind === "cmd" && l.addProps?.has(key) && unquote(l.addProps.get(key)!).startsWith(start)).length
        out.push({ cmd: `${menu} print count-only where ${key}~${quote(`^${start}`)}`, expect: mode === "new" ? { kind: "atLeast", n } : { kind: "atLeast", n: adds.length } })
        continue
      }
    }
    if (seg.some((l) => l.menu === menu && l.kind === "cmd" && (l.verb === "add" || l.verb === "set"))) out.push({ cmd: `${menu} print`, expect: { kind: "list" } })
  }
  // Checks of what was added first: they say the most.
  return [...out.filter((c) => c.expect.kind !== "list"), ...out.filter((c) => c.expect.kind === "list")].slice(0, 3)
}

function undoOf(seg: Out["lines"]): { undo: string[]; partial: boolean } {
  const undo: string[] = []
  let partial = false
  for (const l of [...seg].reverse()) {
    if (l.kind === "cmd" && l.verb === "add" && l.addProps) {
      const sel = selectorFor(l.menu, l.addProps, null)
      if (sel) undo.push(`${l.menu} remove ${sel}`)
      else partial = true
    } else if (l.kind === "cmd" && (l.verb === "print" || l.verb === "export")) continue
    else partial = true
  }
  return { undo: [...new Set(undo)], partial }
}

/** A short stable hash (FNV-1a) for a piece's id. */
function hash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(36)
}

/** WinBox-safe text: tabs → spaces, no trailing blanks. */
const clean = (t: string) => t.replace(/\t/g, " ").replace(/\s+$/, "")

/** The steps of a tool as small CLI pieces, for a new router or against a configured router's export. */
export function cliSteps(steps: CliInput[], opts: { mode: CliMode; exportText?: string }): CliResult {
  const ex = opts.mode === "existing" && opts.exportText?.trim() ? indexExport(opts.exportText) : null
  const mode: CliMode = ex ? "existing" : "new"
  const outs = steps.map((s) => {
    const o: Out = { lines: [], before: [], same: 0 }
    emit(readScript(s.script), mode, ex, o)
    return o
  })
  let staleOut: Out | null = null
  // Configured router: items with this tool's comment prefix in the menus it touches that it no longer creates.
  if (ex && outs.length) {
    const ours = outs.flatMap((o) => o.lines)
    const prefixes = new Set(ours.flatMap((l) => {
      const m = /^([A-Za-z]+(?: [a-z]+)?): /.exec(unquote(l.addProps?.get("comment") ?? ""))
      return m ? [m[0]] : []
    }))
    const touched = new Set(steps.flatMap((s) => readScript(s.script)).flatMap(function walk(st: Stmt): string[] {
      if (st.t === "cmd" && st.cmd.verb === "add") return [st.cmd.menu]
      if (st.t === "if") return [...st.then, ...st.else].flatMap(walk)
      return []
    }))
    const extra: Out = { lines: [], before: [], same: 0 }
    for (const it of ex.items) {
      const c = it.props.get("comment")
      if (it.used || it.verb !== "add" || !touched.has(it.menu) || !c || ![...prefixes].some((p) => c.startsWith(p))) continue
      const sel = selectorFor(it.menu, new Map([...it.props].map(([k, v]) => [k, quote(v)])), ex)
      extra.lines.push(sel ? { text: `${it.menu} remove ${sel}`, menu: it.menu, verb: "remove", kind: "cmd", stale: true } : { text: `# ${it.raw}`, menu: it.menu, verb: "remove", kind: "manual", stale: true })
    }
    staleOut = extra
  }
  const all: (CliInput & { stale?: boolean })[] = [...steps]
  if (staleOut?.lines.length) {
    outs.push(staleOut)
    all.push({ title: "", script: "", stale: true })
  }
  let nonAscii = false
  const counted: Out["lines"] = []
  const result: CliStep[] = all.map((s, k) => {
    const o = outs[k]
    for (const l of o.lines) {
      l.text = clean(l.text)
      if (/[^\x20-\x7e]/.test(l.text)) nonAscii = true
    }
    const ps = o.lines.length ? pieces(o.lines) : []
    const segments: CliSegment[] = ps.map((p, j) => {
      counted.push(...p)
      const { undo, partial } = undoOf(p)
      return {
        id: hash(`${k}|${s.title}|${p.map((l) => l.text).join("\n")}`),
        step: k,
        part: j + 1,
        parts: ps.length,
        menus: [...new Set(p.map((l) => l.menu).filter(Boolean))],
        lines: p.map((l) => ({ text: l.text, menu: l.menu, verb: l.verb, kind: l.kind, changed: l.changed, stale: l.stale })),
        before: j === 0 ? o.before : [],
        verify: verifyOf(p, counted, mode),
        undo,
        undoPartial: partial,
        stepVerify: j === ps.length - 1 ? s.verify : undefined,
      }
    })
    // A step whose every item is already the same keeps its checks visible.
    if (!segments.length && o.before.length) segments.push({ id: hash(`${k}|${s.title}|checks`), step: k, part: 1, parts: 1, menus: [], lines: [], before: o.before, verify: [], undo: [], undoPartial: false, stepVerify: s.verify })
    return { title: s.title, segments, same: o.same, stale: s.stale }
  })
  return { steps: result, same: outs.reduce((a, o) => a + o.same, 0), exportItems: ex?.items.length ?? 0, nonAscii }
}

/** A piece as the text to paste: one command per line. */
export const pieceText = (seg: CliSegment) => seg.lines.map((l) => l.text).join("\n")
