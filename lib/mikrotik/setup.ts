/**
 * Configuration of a new deployment (owner, 2026-11-15: PPPoE, a VLAN for
 * the clients' internet and one for managing the OLT, CGNAT addresses,
 * MikroTik and Huawei OLT commands).
 *
 * MikroTik (RouterOS v7): VLANs on the port toward the OLT, the management
 * address, the clients' pool, DNS, interface lists, one PPP profile per plan
 * with the deployment's burst rule (same names as the "Varios clientes"
 * PPPoE export, so its secrets land on these profiles), the PPPoE server
 * and a basic firewall. Everything carries a "DS: " comment for undo.
 *
 * Huawei OLT (MA5600T family / MA5800): smart VLANs on the uplink port, the
 * management address, per plan a traffic table (download, a bit above the
 * plan so the MikroTik queue is the one that limits), a DBA profile
 * (upload, type4 max) and a GPON line profile mapping GEM 1 to the internet
 * VLAN, a service profile, and a template to add one ONT. Command families
 * from the SmartAX MA5600T/MA5603T/MA5608T configuration guide; a starting
 * point to check on each OLT (syntax varies with board and version).
 *
 * Pure functions; the UI shows the text and its notes.
 */

import { planDefaults, type PlanRule } from "./burst"
import { rateLimit, planName, rosString, upsert, queueTypeSetup, type Pair, type QueueKind } from "./routeros"

export type SetupState = {
  /** MikroTik port toward the OLT's uplink. */
  oltPort: string
  internetVlan: number
  mgmtVlan: number
  /** Management network: the MikroTik takes .1, the OLT .2. */
  mgmtNet: string
  /** Clients' addresses (CGNAT): the MikroTik takes the first, PPPoE hands out the rest. */
  pool: string
  /** DNS servers the router asks, comma-separated. */
  dns: string
  /** PPPoE service name. */
  service: string
  /** Basic firewall for a router without one. */
  firewall: boolean
  /** OLT uplink port as frame/slot/port. */
  oltUplink: string
}

export const DEFAULT_SETUP: SetupState = {
  oltPort: "sfp-sfpplus2",
  internetVlan: 100,
  mgmtVlan: 10,
  mgmtNet: "192.168.10.0/24",
  pool: "100.64.0.0/22",
  dns: "1.1.1.1,8.8.8.8",
  service: "gigafazt",
  firewall: true,
  oltUplink: "0/9/0",
}

/** OLT downstream table and upstream DBA: the plan + 10 %, so the MikroTik's burst queue is what limits. */
export const OLT_HEADROOM = 1.1
/** First id of the profiles and tables this writes (Huawei's defaults sit below). */
export const OLT_FIRST_ID = 10

// ── Addresses ──────────────────────────────────────────────────────────────

const ipToInt = (ip: string) => ip.split(".").reduce((a, o) => a * 256 + Number(o), 0)
const intToIp = (n: number) => [24, 16, 8, 0].map((s) => Math.floor(n / 2 ** s) % 256).join(".")

export type Cidr = { net: number; prefix: number }

/** A network in CIDR form whose address is the network's own (100.64.0.0/22, not 100.64.1.0/22). */
export function parseCidr(text: string): Cidr | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(text.trim())
  if (!m) return null
  const octets = m.slice(1, 5).map(Number)
  const prefix = Number(m[5])
  if (octets.some((o) => o > 255) || prefix > 32) return null
  const net = ipToInt(octets.join("."))
  return net % 2 ** (32 - prefix) === 0 ? { net, prefix } : null
}

const size = (c: Cidr) => 2 ** (32 - c.prefix)
const inside = (inner: Cidr, outer: Cidr) => inner.prefix >= outer.prefix && Math.floor(inner.net / size(outer)) === Math.floor(outer.net / size(outer))
const overlap = (a: Cidr, b: Cidr) => inside(a, b) || inside(b, a)
const mask = (prefix: number) => intToIp(2 ** 32 - 2 ** (32 - prefix))

/** Addresses the pool hands out: all but the network, the router's and the broadcast. */
export const poolHosts = (c: Cidr) => Math.max(0, size(c) - 3)

// ── Checks ─────────────────────────────────────────────────────────────────

export type SetupIssueCode =
  | "missingPort"
  | "portIsWan"
  | "badVlan"
  | "sameVlan"
  | "badMgmt"
  | "badPool"
  | "poolOverlap"
  | "poolSmall"
  | "poolNotBalanced"
  | "badDns"
  | "badService"
  | "badUplink"
export type SetupIssue = { code: SetupIssueCode; level: "error" | "warn" | "info"; value?: string; need?: number; have?: number }

export type SetupContext = {
  /** Clients of the deployment. */
  clients: number
  /** Its internet interfaces (the OLT can't hang from one of them). */
  wanIfaces: string[]
  /** Networks the load balancing treats as clients; null = no balancing. */
  balanced: string[] | null
}

const isIp = (s: string) => /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(s) && s.split(".").every((o) => Number(o) <= 255)
const dnsList = (s: string) => s.split(/[\s,;]+/).filter(Boolean)
const goodVlan = (v: number) => Number.isInteger(v) && v >= 2 && v <= 4094

export function checkSetup(s: SetupState, ctx: SetupContext): SetupIssue[] {
  const out: SetupIssue[] = []
  const port = s.oltPort.trim()
  if (!port) out.push({ code: "missingPort", level: "error" })
  else if (ctx.wanIfaces.some((w) => w.trim() === port)) out.push({ code: "portIsWan", level: "error", value: port })
  for (const v of [s.internetVlan, s.mgmtVlan]) if (!goodVlan(v)) out.push({ code: "badVlan", level: "error", value: String(v) })
  if (s.internetVlan === s.mgmtVlan) out.push({ code: "sameVlan", level: "error" })
  const mgmt = parseCidr(s.mgmtNet)
  if (!mgmt || mgmt.prefix > 30) out.push({ code: "badMgmt", level: "error", value: s.mgmtNet })
  const pool = parseCidr(s.pool)
  if (!pool || pool.prefix > 29) out.push({ code: "badPool", level: "error", value: s.pool })
  if (mgmt && pool && overlap(mgmt, pool)) out.push({ code: "poolOverlap", level: "error" })
  // Room for every client and some growth.
  if (pool && pool.prefix <= 29 && poolHosts(pool) < Math.ceil(ctx.clients * 1.1)) out.push({ code: "poolSmall", level: "warn", have: poolHosts(pool), need: Math.ceil(ctx.clients * 1.1) })
  if (pool && ctx.balanced && !ctx.balanced.some((b) => { const c = parseCidr(b.includes("/") ? b : `${b}/32`); return c !== null && inside(pool, c) }))
    out.push({ code: "poolNotBalanced", level: "info", value: s.pool })
  const dns = dnsList(s.dns)
  if (dns.length === 0 || dns.some((d) => !isIp(d))) out.push({ code: "badDns", level: "error", value: s.dns })
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(s.service.trim())) out.push({ code: "badService", level: "error", value: s.service })
  if (!/^\d{1,2}\/\d{1,2}\/\d{1,2}$/.test(s.oltUplink.trim())) out.push({ code: "badUplink", level: "error", value: s.oltUplink })
  return out
}

// ── MikroTik ───────────────────────────────────────────────────────────────

export type SetupPlans = { name: string; pair: Pair }[]

/** The plans as PPP profiles take them (the deployment's burst rule), named as the bulk PPPoE export names them. */
export function setupPlans(speeds: number[], rule: PlanRule): SetupPlans {
  return speeds.map((mbps) => {
    const q = planDefaults(mbps, rule)
    const pair = { up: q, down: q }
    return { name: planName(pair), pair }
  })
}

const vlanName = (id: number, what: string) => `vlan${id}-${what}`

/** The RouterOS v7 script. Empty when there are errors. */
export function mikrotikSetup(s: SetupState, ctx: SetupContext & { name: string; plans: SetupPlans; queue?: QueueKind }): string {
  if (checkSetup(s, ctx).some((i) => i.level === "error") || ctx.plans.length === 0) return ""
  const mgmt = parseCidr(s.mgmtNet) as Cidr
  const pool = parseCidr(s.pool) as Cidr
  const port = rosString(s.oltPort.trim())
  const inet = vlanName(s.internetVlan, "internet")
  const mg = vlanName(s.mgmtVlan, "gestion")
  const local = intToIp(pool.net + 1)
  const lines: string[] = []
  const add = (...l: string[]) => lines.push(...l)
  const c = (text: string) => `comment=${rosString(`DS: ${text}`)}`

  if (ctx.name.trim()) add(`/system identity set name=${rosString(ctx.name.trim())}`)
  add("/system clock set time-zone-name=America/Mexico_City")

  add(
    "/interface vlan",
    `add name=${rosString(inet)} vlan-id=${s.internetVlan} interface=${port} ${c("internet de los clientes")}`,
    `add name=${rosString(mg)} vlan-id=${s.mgmtVlan} interface=${port} ${c("gestion de la OLT")}`
  )
  add("/ip address", `add address=${intToIp(mgmt.net + 1)}/${mgmt.prefix} interface=${rosString(mg)} ${c("gestion de la OLT")}`)
  add("/ip pool", `add name=DS-clientes ranges=${intToIp(pool.net + 2)}-${intToIp(pool.net + size(pool) - 2)} ${c("clientes PPPoE")}`)
  add("/ip dns", `set allow-remote-requests=yes servers=${dnsList(s.dns).join(",")}`)

  // Lists: the providers' interfaces, and the client side (PPPoE sessions join it from their profile).
  add("/interface list", `add name=DS-WAN ${c("internet")}`, `add name=DS-LAN ${c("clientes y gestion")}`)
  add("/interface list member")
  for (const w of ctx.wanIfaces.map((x) => x.trim()).filter(Boolean)) add(`add list=DS-WAN interface=${rosString(w)} ${c("internet")}`)
  add(`add list=DS-LAN interface=${rosString(inet)} ${c("clientes")}`, `add list=DS-LAN interface=${rosString(mg)} ${c("gestion")}`)

  const typeLine = queueTypeSetup(ctx.queue)
  if (typeLine) add(typeLine)
  add("/ppp profile")
  for (const p of ctx.plans) {
    const props = [
      `local-address=${local}`,
      "remote-address=DS-clientes",
      `dns-server=${local}`,
      `rate-limit=${rosString(rateLimit(p.pair))}`,
      "only-one=yes",
      "change-tcp-mss=yes",
      "interface-list=DS-LAN",
      ...(ctx.queue && ctx.queue !== "default" ? [`queue-type=${rosString(ctx.queue)}`] : []),
      c(`plan ${p.name}`),
    ]
    add(upsert("/ppp profile", p.name, props, [`name=${rosString(p.name)}`, ...props]))
  }
  add(
    "/interface pppoe-server server",
    `add service-name=${rosString(s.service.trim())} interface=${rosString(inet)} default-profile=${rosString(ctx.plans[0].name)} one-session-per-host=yes disabled=no`
  )

  if (s.firewall) {
    const poolNet = `${intToIp(pool.net)}/${pool.prefix}`
    const mgmtNet = `${intToIp(mgmt.net)}/${mgmt.prefix}`
    add(
      "/ip firewall filter",
      `add chain=input action=accept connection-state=established,related,untracked ${c("respuestas")}`,
      `add chain=input action=drop connection-state=invalid ${c("invalidas")}`,
      `add chain=input action=accept protocol=icmp ${c("ping")}`,
      `add chain=input action=accept src-address=${poolNet} protocol=udp dst-port=53 ${c("DNS de los clientes")}`,
      `add chain=input action=accept src-address=${poolNet} protocol=tcp dst-port=53 ${c("DNS de los clientes")}`,
      `add chain=input action=drop src-address=${poolNet} ${c("los clientes no administran el router")}`,
      `add chain=input action=drop in-interface-list=DS-WAN ${c("nada desde internet al router")}`,
      `add chain=forward action=accept connection-state=established,related,untracked ${c("respuestas")}`,
      `add chain=forward action=drop connection-state=invalid ${c("invalidas")}`,
      `add chain=forward action=drop src-address=${poolNet} dst-address=${mgmtNet} ${c("los clientes no llegan a la gestion")}`,
      `add chain=forward action=drop in-interface-list=DS-WAN connection-nat-state=!dstnat ${c("nada nuevo desde internet")}`
    )
  }
  return lines.join("\n")
}

/** Undo for the MikroTik part (PPP profiles stay: the clients' secrets use them). */
export function setupUndo(s: SetupState): string {
  return [
    `/interface pppoe-server server remove [find where service-name=${rosString(s.service.trim())}]`,
    '/ip firewall filter remove [find where comment~"^DS: "]',
    '/interface list member remove [find where comment~"^DS: "]',
    '/interface list remove [find where comment~"^DS: "]',
    '/ip pool remove [find where comment~"^DS: "]',
    '/ip address remove [find where comment~"^DS: "]',
    '/interface vlan remove [find where comment~"^DS: "]',
  ].join("\n")
}

// ── Huawei OLT ─────────────────────────────────────────────────────────────

/** kbit/s for the OLT, rounded up to a multiple of 64. */
const oltKbps = (mbps: number) => Math.ceil((mbps * 1000 * OLT_HEADROOM) / 64) * 64

const frameSlot = (fsp: string) => {
  const [f, sl, p] = fsp.trim().split("/")
  return { fs: `${f}/${sl}`, port: p }
}

/** Plan speeds as the OLT gets them: a traffic table, a DBA profile and a line profile each. */
export function oltSetup(s: SetupState, ctx: { speeds: number[]; names: string[] }): string {
  const mgmt = parseCidr(s.mgmtNet)
  if (!mgmt || !/^\d{1,2}\/\d{1,2}\/\d{1,2}$/.test(s.oltUplink.trim())) return ""
  const up = frameSlot(s.oltUplink)
  const lines = ["enable", "config"]
  for (const v of [s.internetVlan, s.mgmtVlan]) lines.push(`vlan ${v} smart`, `port vlan ${v} ${up.fs} ${up.port}`)
  lines.push(`interface vlanif ${s.mgmtVlan}`, ` ip address ${intToIp(mgmt.net + 2)} ${mask(mgmt.prefix)}`, " quit", `ip route-static 0.0.0.0 0.0.0.0 ${intToIp(mgmt.net + 1)}`)
  ctx.speeds.forEach((mbps, k) => {
    const id = OLT_FIRST_ID + k
    lines.push(`traffic table ip index ${id} cir ${oltKbps(mbps)} priority 0 priority-policy local-setting`)
    lines.push(`dba-profile add profile-id ${id} type4 max ${oltKbps(mbps)}`)
  })
  ctx.speeds.forEach((_, k) => {
    const id = OLT_FIRST_ID + k
    lines.push(
      `ont-lineprofile gpon profile-id ${id} profile-name "${ctx.names[k]}"`,
      ` tcont 1 dba-profile-id ${id}`,
      " gem add 1 eth tcont 1",
      ` gem mapping 1 0 vlan ${s.internetVlan}`,
      " commit",
      " quit"
    )
  })
  lines.push(`ont-srvprofile gpon profile-id ${OLT_FIRST_ID} profile-name "router"`, " ont-port eth adaptive pots adaptive", " commit", " quit")
  return lines.join("\n")
}

export type OntInput = { plan: number; ponPort: string; ontId: number; sn: string; client: string }

/** Adding one ONT on a PON port with a plan's line profile and traffic table. */
export function ontTemplate(s: SetupState, o: OntInput): string {
  if (!/^\d{1,2}\/\d{1,2}\/\d{1,3}$/.test(o.ponPort.trim())) return ""
  const p = frameSlot(o.ponPort)
  const id = OLT_FIRST_ID + o.plan
  const desc = o.client.replace(/["\\]/g, "").slice(0, 60) || "cliente"
  return [
    `interface gpon ${p.fs}`,
    ` ont add ${p.port} ${o.ontId} sn-auth "${o.sn.trim() || "HWTC00000000"}" omci ont-lineprofile-id ${id} ont-srvprofile-id ${OLT_FIRST_ID} desc "${desc}"`,
    " quit",
    `service-port vlan ${s.internetVlan} gpon ${p.fs}/${p.port} ont ${o.ontId} gemport 1 multi-service user-vlan ${s.internetVlan} rx-cttr ${id} tx-cttr ${id}`,
  ].join("\n")
}
