/**
 * Many clients at once: a pasted list (CSV, semicolons or tabs) becomes a
 * RouterOS script for simple queues, PPPoE secrets or User Manager users.
 *
 * Columns: name, IP (simple queues) or username (PPPoE / User Manager),
 * plan speed, password (PPPoE / User Manager). A first line that doesn't
 * parse as a client is taken as a header. Runs in the browser only: the list
 * is never sent anywhere or put in the share link.
 */

import { planDefaults, type PlanRule } from "./burst"
import { pppProfiles, rosString, simpleQueueLine, userManagerPlans, type Pair } from "./routeros"

export type BulkMethod = "simple" | "pppoe" | "usermanager"
export const BULK_METHODS: BulkMethod[] = ["simple", "pppoe", "usermanager"]
export const MAX_ROWS = 5000

export type BulkRow = { line: number; name: string; id: string; planMbps: number; password: string | null }

export type BulkErrorCode = "columns" | "plan" | "ip" | "user" | "duplicateName" | "duplicateId" | "password" | "tooMany"
export type BulkError = { line: number; code: BulkErrorCode }

export type BulkParse = { rows: BulkRow[]; errors: BulkError[]; header: boolean }

/** Split one line on `sep`, honoring "quoted, fields" with "" escapes. */
export function splitLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ""
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"' && cur.trim() === "") {
      quoted = true
      cur = ""
    } else if (ch === sep) {
      out.push(cur.trim())
      cur = ""
    } else cur += ch
  }
  out.push(cur.trim())
  return out
}

/** "500", "500M", "500 Mbps", "1G", "1 Gbps", "fibra-500" → Mbps. null if unreadable. */
export function parsePlan(text: string, known: { id: string; mbps: number }[] = []): number | null {
  const s = text.trim().toLowerCase()
  const byId = known.find((k) => k.id.toLowerCase() === s)
  if (byId) return byId.mbps
  const m = /^(\d+(?:\.\d+)?)\s*(k|m|g)?(?:bps|b)?$/.exec(s)
  if (!m) return null
  const n = Number(m[1])
  const mbps = m[2] === "k" ? n / 1000 : m[2] === "g" ? n * 1000 : n
  return mbps > 0 && mbps <= 1e6 ? mbps : null
}

/** IPv4 or IPv4/prefix → "a.b.c.d/n" (no prefix = /32). null if invalid. */
export function parseTarget(text: string): string | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/.exec(text.trim())
  if (!m) return null
  const octets = m.slice(1, 5).map(Number)
  if (octets.some((o) => o > 255)) return null
  const prefix = m[5] === undefined ? 32 : Number(m[5])
  if (prefix > 32) return null
  return `${octets.join(".")}/${prefix}`
}

function delimiter(text: string): string {
  const first = text.split(/\r?\n/).find((l) => l.trim() && !l.trim().startsWith("#")) ?? ""
  if (first.includes("\t")) return "\t"
  if (first.includes(";")) return ";"
  return ","
}

export function parseBulk(text: string, method: BulkMethod, known: { id: string; mbps: number }[] = []): BulkParse {
  const sep = delimiter(text)
  const rows: BulkRow[] = []
  const errors: BulkError[] = []
  const names = new Set<string>()
  const ids = new Set<string>()
  let header = false
  let seen = 0

  text.split(/\r?\n/).forEach((raw, idx) => {
    const line = idx + 1
    if (!raw.trim() || raw.trim().startsWith("#")) return
    seen++
    const cols = splitLine(raw, sep)
    const [name = "", id = "", plan = "", password = ""] = cols
    const planMbps = parsePlan(plan, known)
    // First line that isn't a client: a header.
    if (seen === 1 && planMbps === null && cols.length >= 3) {
      header = true
      return
    }
    if (rows.length >= MAX_ROWS) {
      if (!errors.some((e) => e.code === "tooMany")) errors.push({ line, code: "tooMany" })
      return
    }
    if (cols.length < 3 || !name || !id) return void errors.push({ line, code: "columns" })
    if (planMbps === null) return void errors.push({ line, code: "plan" })
    let target = id
    if (method === "simple") {
      const t = parseTarget(id)
      if (!t) return void errors.push({ line, code: "ip" })
      target = t
    } else if (/\s|"/.test(id)) return void errors.push({ line, code: "user" })
    // Queue names must be unique; for PPPoE and User Manager the name is only a comment.
    if (method === "simple" && names.has(name.toLowerCase())) return void errors.push({ line, code: "duplicateName" })
    if (ids.has(target.toLowerCase())) return void errors.push({ line, code: "duplicateId" })
    if (method !== "simple" && !password) return void errors.push({ line, code: "password" })
    names.add(name.toLowerCase())
    ids.add(target.toLowerCase())
    rows.push({ line, name, id: target, planMbps, password: password || null })
  })
  return { rows, errors, header }
}

const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"

/** Random password from the browser's CSPRNG, no look-alike characters. */
export function randomPassword(length = 12, random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length
  let out = ""
  while (out.length < length) {
    for (const b of random(length * 2)) {
      if (b < limit && out.length < length) out += ALPHABET[b % ALPHABET.length]
    }
  }
  return out
}

/**
 * Adds a password to every client line that has three columns and no
 * password. Lines with errors other than the missing password are left as
 * they are; so is the header.
 */
export function fillPasswords(text: string, method: BulkMethod, known: { id: string; mbps: number }[], make: () => string): string {
  const sep = delimiter(text)
  const parsed = parseBulk(text, method === "simple" ? "pppoe" : method, known)
  const missing = new Set(parsed.errors.filter((e) => e.code === "password").map((e) => e.line))
  const gap = sep === "\t" ? "\t" : `${sep} `
  return text
    .split(/\r?\n/)
    .map((raw, idx) => {
      if (!missing.has(idx + 1)) return raw
      const line = raw.trimEnd()
      const cols = splitLine(line, sep)
      // "a, b, 500" → append; "a, b, 500," (empty last column) → fill it.
      if (cols.length === 3) return `${line}${gap}${make()}`
      if (cols.length === 4 && cols[3] === "" && line.endsWith(sep)) return `${line}${sep === "\t" ? "" : " "}${make()}`
      return raw
    })
    .join("\n")
}

const planPair = (mbps: number, rule: PlanRule): Pair => {
  const q = planDefaults(mbps, rule)
  return { up: q, down: q }
}

/** The RouterOS script for the parsed clients. */
export function bulkScript(rows: BulkRow[], method: BulkMethod, o: { rule: PlanRule; parent?: string }): string {
  if (rows.length === 0) return ""
  const parent = o.parent?.trim() || undefined
  if (method === "simple") {
    return ["/queue simple", ...rows.map((r) => simpleQueueLine(planPair(r.planMbps, o.rule), { name: r.name, target: r.id, parent }))].join("\n")
  }

  // One profile per plan speed.
  const speeds = [...new Set(rows.map((r) => r.planMbps))].sort((a, b) => a - b)
  const { lines, names } = pppProfiles(
    speeds.map((s) => ({ pair: planPair(s, o.rule) })),
    { parentQueue: parent }
  )
  const profileOf = new Map(speeds.map((s, i) => [s, names[i]]))

  if (method === "pppoe") {
    const secrets = rows.map(
      (r) =>
        `add name=${rosString(r.id)} password=${rosString(r.password ?? "")} service=pppoe profile=${rosString(profileOf.get(r.planMbps) ?? "")} comment=${rosString(r.name)}`
    )
    return ["/ppp profile", ...lines, "/ppp secret", ...secrets].join("\n")
  }

  const plans = speeds.map((s) => ({ name: profileOf.get(s) ?? "", pair: planPair(s, o.rule) }))
  const users = rows.map((r) => `add name=${rosString(r.id)} password=${rosString(r.password ?? "")} comment=${rosString(r.name)}`)
  const links = rows.map((r) => `add user=${rosString(r.id)} profile=${rosString(profileOf.get(r.planMbps) ?? "")}`)
  return [userManagerPlans(plans), "/user-manager user", ...users, "/user-manager user-profile", ...links].join("\n")
}

/**
 * `count` client addresses inside a network, from the 2nd host up (the 1st
 * is usually the gateway): "10.0.0.0/24", 3 → 10.0.0.2/32 … 10.0.0.4/32.
 * null when the network is invalid or too small.
 */
export function hostTargets(cidr: string, count: number): string[] | null {
  const t = parseTarget(cidr)
  if (!t) return null
  const [ip, bits] = t.split("/")
  const prefix = Number(bits)
  const n = ip.split(".").reduce((a, o) => a * 256 + Number(o), 0)
  const size = 2 ** (32 - prefix)
  const network = n - (n % size)
  // Usable hosts: network+1 … broadcast-1; skip the first (gateway).
  if (prefix > 30 || size - 3 < count) return null
  return Array.from({ length: count }, (_, i) => {
    const v = network + 2 + i
    return `${[24, 16, 8, 0].map((s) => Math.floor(v / 2 ** s) % 256).join(".")}/32`
  })
}

/** "10.0.0.7/24" → "10.0.0.0/24" (the network itself). null if invalid. */
export function networkOf(cidr: string): string | null {
  const t = parseTarget(cidr)
  if (!t) return null
  const [ip, bits] = t.split("/")
  const size = 2 ** (32 - Number(bits))
  const n = ip.split(".").reduce((a, o) => a * 256 + Number(o), 0)
  const v = n - (n % size)
  return `${[24, 16, 8, 0].map((s) => Math.floor(v / 2 ** s) % 256).join(".")}/${bits}`
}
