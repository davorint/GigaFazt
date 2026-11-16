/**
 * Many clients at once: a pasted list (CSV, semicolons or tabs) becomes a
 * RouterOS script for simple queues, PPPoE secrets, User Manager users or
 * PCQ per plan (address lists).
 *
 * Columns: name, IP (simple queues, PCQ) or username (PPPoE / User Manager),
 * plan speed, password (PPPoE / User Manager). A first line that doesn't
 * parse as a client is taken as a header. Runs in the browser only: the list
 * is never sent anywhere or put in the share link.
 */

import { planDefaults, type PlanRule } from "./burst"
import {
  addIfMissing,
  asciiName,
  pcqProps,
  planName,
  pppProfiles,
  queueTypeSetup,
  rosString,
  simpleQueueLine,
  simpleQueueUpsert,
  upsert,
  userManagerPlans,
  type Pair,
  type QueueKind,
} from "./routeros"

/**
 * simple: one simple queue per client (target = its IP).
 * pppoe: one PPP profile per plan + a secret per client (dynamic queue per session).
 * usermanager: User Manager limitation/profile per plan + a user per client.
 * pcq: one PCQ queue pair per plan; clients go into a per-plan address list.
 */
export type BulkMethod = "simple" | "pppoe" | "usermanager" | "pcq"
export const BULK_METHODS: BulkMethod[] = ["simple", "pppoe", "usermanager", "pcq"]
/** Methods whose second column is an IP (the rest take a username). */
export const byIp = (m: BulkMethod) => m === "simple" || m === "pcq"
export const MAX_ROWS = 5000

/** profile: the deployment's PPP profile (PPPoE with the deployment's plans). */
export type BulkRow = { line: number; name: string; id: string; planMbps: number; password: string | null; profile?: string }

/** A deployment plan as PPPoE secrets reference it: its profile name and download speed. */
export type BulkProfile = { name: string; down: number }

export type BulkErrorCode = "columns" | "plan" | "planAmbiguous" | "ip" | "user" | "duplicateName" | "duplicateId" | "password" | "tooMany"
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

/**
 * The deployment plan a PPPoE line asks for: by profile name (any case) or by download speed when only one plan has it.
 * "ambiguous" when two plans share that speed.
 */
export function matchProfile(text: string, profiles: BulkProfile[], known: { id: string; mbps: number }[] = []): BulkProfile | "ambiguous" | null {
  const t = text.trim().toLowerCase()
  const byName = profiles.find((p) => p.name.toLowerCase() === t)
  if (byName) return byName
  const mbps = parsePlan(text, known)
  if (mbps === null) return null
  const hits = profiles.filter((p) => p.down === mbps)
  return hits.length === 1 ? hits[0] : hits.length > 1 ? "ambiguous" : null
}

/** profiles: the deployment's plans; with them (PPPoE only), lines are matched to those profiles and none are created. */
export function parseBulk(text: string, method: BulkMethod, known: { id: string; mbps: number }[] = [], profiles?: BulkProfile[]): BulkParse {
  const deployment = method === "pppoe" && profiles && profiles.length > 0 ? profiles : null
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
    const match = deployment ? matchProfile(plan, deployment, known) : null
    const planMbps = deployment ? (match && match !== "ambiguous" ? match.down : null) : parsePlan(plan, known)
    // First line that isn't a client: a header.
    if (seen === 1 && planMbps === null && match !== "ambiguous" && cols.length >= 3) {
      header = true
      return
    }
    if (rows.length >= MAX_ROWS) {
      if (!errors.some((e) => e.code === "tooMany")) errors.push({ line, code: "tooMany" })
      return
    }
    if (cols.length < 3 || !name || !id) return void errors.push({ line, code: "columns" })
    if (match === "ambiguous") return void errors.push({ line, code: "planAmbiguous" })
    if (planMbps === null) return void errors.push({ line, code: "plan" })
    let target = id
    if (byIp(method)) {
      const t = parseTarget(id)
      if (!t) return void errors.push({ line, code: "ip" })
      target = t
    } else if (/\s|"/.test(id)) return void errors.push({ line, code: "user" })
    // Queue names must be unique (and go without accents); otherwise the name is only a comment.
    const queueName = asciiName(name).toLowerCase()
    if (method === "simple" && names.has(queueName)) return void errors.push({ line, code: "duplicateName" })
    if (ids.has(target.toLowerCase())) return void errors.push({ line, code: "duplicateId" })
    if (!byIp(method) && !password) return void errors.push({ line, code: "password" })
    names.add(queueName)
    ids.add(target.toLowerCase())
    rows.push({ line, name, id: target, planMbps, password: password || null, ...(match ? { profile: match.name } : {}) })
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
export function fillPasswords(text: string, method: BulkMethod, known: { id: string; mbps: number }[], make: () => string, profiles?: BulkProfile[]): string {
  const sep = delimiter(text)
  const parsed = parseBulk(text, byIp(method) ? "pppoe" : method, known, method === "pppoe" ? profiles : undefined)
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

export type BulkOptions = {
  rule: PlanRule
  /** Parent simple queue (simple queues) or parent-queue (PPPoE). Not used by PCQ. */
  parent?: string
  /** Update entries that already exist instead of only adding (safe to run again). */
  upsert?: boolean
  /** Queue type for simple queues and PPPoE dynamic queues. */
  queue?: QueueKind
}

/** "10.0.0.2/32" → "10.0.0.2" (address lists show single hosts without the prefix). */
const listAddress = (target: string) => target.replace(/\/32$/, "")

/**
 * Update or add a PPPoE secret. An existing account changes plan, except one that is suspended or reduced (a DSX-
 * profile: reactivating is a separate step) and a "-familia" one, which moves to the familia version of the new plan.
 * A new account is added with the plan.
 */
function secretUpsert(id: string, profile: string, add: string[]): string {
  const n = rosString(id)
  const p = rosString(profile)
  return `:if ([:len [/ppp secret find where name=${n}]] > 0) do={:local c [/ppp secret get [find where name=${n}] profile]; :if ([:pick $c 0 4] != "DSX-") do={:if ([:typeof [:find $c "-familia"]] = "num") do={/ppp secret set [find where name=${n}] profile=(${p} . "-familia")} else={/ppp secret set [find where name=${n}] profile=${p}}}} else={/ppp secret add ${add.join(" ")}}`
}

/** The RouterOS script for the parsed clients. */
export function bulkScript(rows: BulkRow[], method: BulkMethod, o: BulkOptions): string {
  if (rows.length === 0) return ""
  const parent = o.parent?.trim() || undefined
  const kind = method === "simple" || method === "pppoe" ? o.queue : undefined
  const setup = queueTypeSetup(kind)
  const out: string[] = setup ? [setup] : []

  if (method === "simple") {
    out.push("/queue simple")
    for (const r of rows) {
      const name = asciiName(r.name)
      const opts = { name, target: r.id, parent, queue: kind, comment: name !== r.name ? r.name : undefined }
      const pair = planPair(r.planMbps, o.rule)
      out.push(o.upsert ? simpleQueueUpsert(pair, opts) : simpleQueueLine(pair, opts))
    }
    return out.join("\n")
  }

  // One profile (or PCQ pair) per plan speed.
  const speeds = [...new Set(rows.map((r) => r.planMbps))].sort((a, b) => a - b)
  const nameOf = new Map(speeds.map((s) => [s, planName(planPair(s, o.rule))]))

  if (method === "pcq") {
    const types: string[] = []
    const trees: string[] = []
    const mangle: string[] = []
    for (const s of speeds) {
      const name = nameOf.get(s) ?? ""
      const pair = planPair(s, o.rule)
      for (const [dir, classifier, q, listKey] of [
        ["down", "dst-address", pair.down, "dst-address-list"],
        ["up", "src-address", pair.up, "src-address-list"],
      ] as const) {
        const qname = `${name}-${dir}`
        const typeProps = pcqProps(qname, classifier, q)
        types.push(o.upsert ? upsert("/queue type", qname, pcqProps(qname, classifier, q, true).slice(1), typeProps) : `add ${typeProps.join(" ")}`)
        const treeProps = [`name=${rosString(qname)}`, "parent=global", `packet-mark=${rosString(qname)}`, `queue=${rosString(qname)}`]
        trees.push(o.upsert ? upsert("/queue tree", qname, treeProps.slice(1), treeProps) : `add ${treeProps.join(" ")}`)
        const markProps = [
          "chain=forward",
          `${listKey}=${rosString(name)}`,
          "action=mark-packet",
          `new-packet-mark=${rosString(qname)}`,
          "passthrough=yes",
          `comment=${rosString(qname)}`,
        ]
        mangle.push(o.upsert ? addIfMissing("/ip firewall mangle", `new-packet-mark=${rosString(qname)}`, markProps) : `add ${markProps.join(" ")}`)
      }
    }
    const lists = rows.flatMap((r) => {
      const address = listAddress(r.id)
      const add = `add list=${rosString(nameOf.get(r.planMbps) ?? "")} address=${address} comment=${rosString(r.name)}`
      // Moving a client between plans: take it out of any other plan list first.
      return o.upsert ? [`remove [find where address=${rosString(address)} and list~"^plan-"]`, add] : [add]
    })
    return ["/queue type", ...types, "/queue tree", ...trees, "/ip firewall mangle", ...mangle, "/ip firewall address-list", ...lists].join("\n")
  }

  // PPPoE on the deployment's plans: Configuración made the profiles (pool, DNS, session log, IPv6…); only the secrets go here.
  if (method === "pppoe" && rows.every((r) => r.profile)) {
    const used = [...new Set(rows.map((r) => r.profile as string))]
    const guard = used.map(
      (p) => `:if ([:len [/ppp profile find where name=${rosString(p)}]] = 0) do={:error ${rosString(`Falta el perfil ${p}: pega antes la configuracion del despliegue`)}}`
    )
    const parents = parent ? ["/ppp profile", ...used.map((p) => `set [find where name=${rosString(p)}] parent-queue=${rosString(parent)}`)] : []
    const secrets = rows.map((r) => {
      const profile = `profile=${rosString(r.profile as string)}`
      const add = [`name=${rosString(r.id)}`, `password=${rosString(r.password ?? "")}`, "service=pppoe", profile, `comment=${rosString(r.name)}`]
      return o.upsert ? secretUpsert(r.id, r.profile as string, add) : `add ${add.join(" ")}`
    })
    return [...guard, ...parents, "/ppp secret", ...secrets].join("\n")
  }

  const { lines, names } = pppProfiles(
    speeds.map((s) => ({ pair: planPair(s, o.rule) })),
    { parentQueue: parent, queue: kind, upsert: o.upsert }
  )
  const profileOf = new Map(speeds.map((s, i) => [s, names[i]]))

  if (method === "pppoe") {
    const secrets = rows.map((r) => {
      const profile = `profile=${rosString(profileOf.get(r.planMbps) ?? "")}`
      const add = [`name=${rosString(r.id)}`, `password=${rosString(r.password ?? "")}`, "service=pppoe", profile, `comment=${rosString(r.name)}`]
      // An existing secret keeps its password; only the plan changes.
      return o.upsert ? secretUpsert(r.id, profileOf.get(r.planMbps) ?? "", add) : `add ${add.join(" ")}`
    })
    return [...out, "/ppp profile", ...lines, "/ppp secret", ...secrets].join("\n")
  }

  const plans = speeds.map((s) => ({ name: profileOf.get(s) ?? "", pair: planPair(s, o.rule) }))
  const users = rows.map((r) => {
    const add = [`name=${rosString(r.id)}`, `password=${rosString(r.password ?? "")}`, `comment=${rosString(r.name)}`]
    return o.upsert ? addIfMissing("/user-manager user", `name=${rosString(r.id)}`, add) : `add ${add.join(" ")}`
  })
  const links = rows.flatMap((r) => {
    const add = `add user=${rosString(r.id)} profile=${rosString(profileOf.get(r.planMbps) ?? "")}`
    return o.upsert ? [`remove [find where user=${rosString(r.id)}]`, add] : [add]
  })
  return [userManagerPlans(plans, { upsert: o.upsert }), "/user-manager user", ...users, "/user-manager user-profile", ...links].join("\n")
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
