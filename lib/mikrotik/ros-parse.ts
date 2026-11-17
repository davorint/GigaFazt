/**
 * A small RouterOS script reader for the syntax check: finds every command a script runs (menu, verb, the properties
 * it sets) including the commands inside one-liners, [ ] substitutions, do={ } blocks and the scripts stored in
 * source=, on-event=, on-up=… strings (unescaped and read the same way).
 */

/** values: the literal values set on the command line (no variables, expressions or quoted text). */
export type RosCommand = { menu: string; verb: string; props: string[]; values?: Record<string, string>; line: number; text: string }

export const VERBS = new Set([
  "add", "set", "remove", "move", "print", "disable", "enable", "save", "run", "send", "get", "find", "monitor",
  "monitor-traffic", "export", "import", "unset", "reset-counters", "load", "show-client-config", "reboot", "upgrade",
  "check-for-updates", "download", "install", "edit", "comment",
])

/** Properties whose value is a script (read as RouterOS too). */
export const SCRIPT_PROPS = new Set(["source", "on-event", "on-up", "on-down", "down-script", "up-script", "script", "test-script"])

type Tok = { t: string; q?: boolean }

/** Splits one statement into tokens; quoted strings stay one token (q = true, value unescaped). */
function tokens(s: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  let cur = ""
  const push = () => {
    if (cur) out.push({ t: cur })
    cur = ""
  }
  while (i < s.length) {
    const ch = s[i]
    if (ch === '"') {
      let v = ""
      i++
      while (i < s.length && s[i] !== '"') {
        if (s[i] === "\\" && i + 1 < s.length) {
          const n = s[i + 1]
          v += n === "n" ? "\n" : n === "t" ? "\t" : n === "r" ? "" : n
          i += 2
          continue
        }
        v += s[i++]
      }
      i++
      // A quoted value glued to key= stays with its key.
      if (cur.endsWith("=")) {
        out.push({ t: cur })
        cur = ""
      } else push()
      out.push({ t: v, q: true })
      continue
    }
    if (" \t".includes(ch)) {
      push()
      i++
      continue
    }
    if ("[]{};()".includes(ch)) {
      push()
      out.push({ t: ch })
      i++
      continue
    }
    cur += ch
    i++
  }
  push()
  return out
}

const MENU_WORD = /^\/?[a-z0-9][a-z0-9-]*$/

export function parseScript(script: string, base = 0): RosCommand[] {
  const out: RosCommand[] = []
  let menu = "/"
  const lines = script.replace(/\\\r?\n\s*/g, "").split(/\r?\n/)
  lines.forEach((raw, idx) => {
    const line = raw.trim()
    if (!line || line.startsWith("#")) return
    const toks = tokens(line)
    // A bare "/menu path" line sets the menu for the add/set lines after it.
    if (toks.length && toks[0].t.startsWith("/") && toks.every((x) => !x.q && MENU_WORD.test(x.t)) && !toks.some((x) => VERBS.has(x.t.replace(/^\//, "")))) {
      menu = "/" + toks.map((x) => x.t.replace(/^\//, "")).join(" ")
      // Checked too: a misspelt menu line fails on the router.
      out.push({ menu, verb: "", props: [], line: idx + 1 + base, text: line })
      return
    }
    readTokens(toks, menu, idx + 1 + base, line, out)
  })
  return out
}

/** Reads every command in a token list; `ctx` is the menu a relative command (add …, set …, find) belongs to. */
function readTokens(toks: Tok[], start: string, line: number, text: string, out: RosCommand[]) {
  let ctx = start
  let i = 0
  const atStart = (k: number) => k === 0 || ["[", "{", ";", "("].includes(toks[k - 1].t) || toks[k - 1].t === "do=" || toks[k - 1].t === "else="
  while (i < toks.length) {
    const tk = toks[i]
    if (!tk.q && atStart(i) && (tk.t.startsWith("/") || VERBS.has(tk.t))) {
      // Menu path (absolute) or a relative verb.
      let menu = ctx
      let j = i
      if (tk.t.startsWith("/")) {
        const path: string[] = []
        while (j < toks.length && !toks[j].q && MENU_WORD.test(toks[j].t) && !VERBS.has(toks[j].t.replace(/^\//, ""))) {
          path.push(toks[j].t.replace(/^\//, ""))
          j++
        }
        menu = "/" + path.join(" ")
        if (j < toks.length && !toks[j].q && VERBS.has(toks[j].t.replace(/^\//, "")) && path.length === 0) {
          // "/export …" at the root.
          toks[j] = { t: toks[j].t.replace(/^\//, "") }
        }
      }
      const verb = j < toks.length && !toks[j].q && VERBS.has(toks[j].t) ? toks[j].t : ""
      const props: string[] = []
      const values: Record<string, string> = {}
      let k = verb ? j + 1 : j
      let depth = 0
      for (; k < toks.length; k++) {
        const x = toks[k]
        if (!x.q && (x.t === "[" || x.t === "{" || x.t === "(")) {
          depth++
          continue
        }
        if (!x.q && (x.t === "]" || x.t === "}" || x.t === ")")) {
          if (depth === 0) break
          depth--
          continue
        }
        if (depth > 0) continue
        if (!x.q && x.t === ";") break
        if (x.q) continue
        const m = /^!?([a-z0-9][a-z0-9-]*)=/.exec(x.t)
        if (m) {
          props.push(m[1])
          const literal = x.t.slice(x.t.indexOf("=") + 1)
          if (literal && !/[$(\[]/.test(literal) && (verb === "add" || verb === "set")) values[m[1]] = literal
          const v = toks[k + 1]
          if (SCRIPT_PROPS.has(m[1]) && v?.q) out.push(...parseScript(v.t).map((c) => ({ ...c, line, text })))
        } else if (verb === "get" && /^[a-z][a-z0-9-]*$/.test(x.t)) props.push(x.t)
      }
      if (verb || menu !== ctx) out.push({ menu, verb, props, values, line, text })
      // Relative commands after this one ([find …], do={add …}) belong to the menu just named.
      ctx = menu
      // Continue inside nested brackets of this command.
      i = verb ? j + 1 : j
      continue
    }
    i++
  }
}
