/**
 * Configuration of a new deployment (owner, 2026-11-15: PPPoE, a VLAN for
 * the clients' internet and one for managing the OLT, CGNAT addresses,
 * MikroTik and Huawei OLT commands; then his build checklist "MikroTik BNG +
 * Multi-WAN PCC + CGNAT", phases 0-6).
 *
 * MikroTik (RouterOS v7), in the checklist's phases:
 * - base (phase 0): identity, time, NTP, firmware upgrade, syncookies and
 *   loose rp-filter (strict breaks multi-WAN return paths), the management
 *   VLAN and address, interface lists, services and MAC access only from
 *   management, PPPoE logging (remote too when a collector is set).
 * - cgnat (phase 3): 100.64/10 dropped in raw on every link whose provider
 *   isn't CGNAT itself, the pool blackholed, subscribers isolated, IPFIX NAT
 *   events to the collector. (Masquerade per link lives in the balancing
 *   script.) No "forward, out WAN, src 100.64 → drop": forward runs before
 *   src-nat, so it would drop every subscriber.
 * - pppoe (phase 4): the internet VLAN (1508 for 1500-byte PPPoE), the pool,
 *   DNS, one PPP profile per plan with the deployment's burst rule (same
 *   names as the "Varios clientes" PPPoE export, add-or-update), the PPPoE
 *   server (keepalive 10 s, sessions = the pool).
 * - hardening (phase 5): fq-codel on the links and the OLT port,
 *   connection-tracking timeouts for CGNAT, raw bogons and bad TCP flags,
 *   the basic firewall, no direct SMTP and a cap on connections per
 *   subscriber.
 * Everything carries a "DS: " comment for undo.
 *
 * Huawei OLT (MA5600T family / MA5800): smart VLANs on the uplink port, the
 * management address, per plan a traffic table (download, a bit above the
 * plan so the MikroTik queue is the one that limits), a DBA profile
 * (upload, type4 max) and a GPON line profile mapping GEM 1 to the internet
 * VLAN, a service profile, the security set from the owner's checklist, and a
 * template to add one ONT (bridge mode: the ONT's port goes untagged into the
 * internet VLAN). Command families from the SmartAX MA5600T/MA5603T/MA5608T
 * configuration guide; a starting point to check on each OLT.
 *
 * Pure functions; the UI shows the text and its notes.
 */

import { plans as catalog } from "../plans"
import { DEFAULT_RULE, planDefaults, type PlanRule } from "./burst"
import { rateLimit, planName, rosString, upsert, queueTypeSetup, type Pair, type QueueKind } from "./routeros"
import { MIN_PORTS, natLayout, natScript, type NatLink } from "./cgnat"

export type OntMode = "bridge" | "router"
/** How subscribers leave: masquerade (any port, needs the NAT log) or fixed port blocks (no log needed). */
export type NatMode = "masquerade" | "fixed"
export const NAT_MODES: NatMode[] = ["masquerade", "fixed"]
/** Clients ask the router (cache) or the resolvers directly. */
export type DnsMode = "router" | "direct"
export const DNS_MODES: DnsMode[] = ["router", "direct"]
/** Where the router sends its alerts. */
export type AlertMode = "none" | "telegram" | "email"
export const ALERT_MODES: AlertMode[] = ["none", "telegram", "email"]
/** Daily backup: on the router only, or also sent out. */
export type BackupMode = "none" | "local" | "email" | "sftp"
export const BACKUP_MODES: BackupMode[] = ["none", "local", "email", "sftp"]
/** Passwords never live on this page: the script leaves these for the owner to replace before pasting. */
export const SECRET = {
  backup: "PEGA-AQUI-CLAVE-DEL-RESPALDO",
  mail: "PEGA-AQUI-CLAVE-DEL-CORREO",
  sftp: "PEGA-AQUI-CLAVE-SFTP",
  telegram: "PEGA-AQUI-TOKEN-DEL-BOT",
  snmp: "PEGA-AQUI-COMUNIDAD-SNMP",
} as const
export const SECRET_MARK = "PEGA-AQUI-"

/** A plan the deployment sells: download and upload, Mbps; name empty = "plan-<speed>" like the bulk export. */
export type SetupPlan = { name: string; down: number; up: number }

/** The site's plans (200 Mbps, 500 Mbps, 1 Gbps, symmetric): what a deployment starts with. */
export const DEFAULT_PLANS: SetupPlan[] = catalog.map((p) => ({ name: "", down: p.downMbps, up: p.upMbps }))
export const MAX_PLANS = 12

export type SetupState = {
  /** MikroTik port toward the OLT's uplink. */
  oltPort: string
  internetVlan: number
  mgmtVlan: number
  /** Management network: the MikroTik takes .1, the OLT .2. */
  mgmtNet: string
  /** Clients' addresses (CGNAT): the MikroTik takes the first, PPPoE hands out the rest. */
  pool: string
  /** DNS servers the router asks, comma-separated (never the links' probe IPs). */
  dns: string
  /** PPPoE service name. */
  service: string
  /** Basic firewall for a router without one. */
  firewall: boolean
  /** OLT uplink port as frame/slot/port. */
  oltUplink: string
  /** IPFIX and syslog collector; empty = none yet. */
  collector: string
  /** 1500-byte PPPoE (RFC 4638): VLAN MTU 1508. */
  mtu1500: boolean
  /** Subscribers can't reach each other. */
  isolate: boolean
  /** No direct SMTP (TCP/25) from subscribers. */
  blockSmtp: boolean
  /** ONT in bridge mode (the client's router does PPPoE) or router mode (the ONT does it). */
  ontMode: OntMode
  /** Plans sold in this deployment, and the burst rule that turns them into queues. */
  plans: SetupPlan[]
  rule: PlanRule
  /** CGNAT: masquerade per link (balancing) or fixed port blocks per client. */
  natMode: NatMode
  /** One log line per PPPoE login and logout (user, address, MAC), kept on disk and sent to the collector. */
  sessionLog: boolean
  /** OLT: PITP (PPPoE intermediate agent) tags each client's PPPoE with its ONT. */
  pitp: boolean
  /** IPv6 for clients: prefix the router hands out (empty = no IPv6), size of each client's prefix, optional /64s for the clients' WAN. */
  ipv6Pd: string
  ipv6PdLength: number
  ipv6Wan: string
  dnsMode: DnsMode
  alert: AlertMode
  /** Telegram chat id (the bot's token goes in by hand). */
  telegramChat: string
  /** Mail server for alerts and backups (port 587, STARTTLS), sender and recipient. */
  mailServer: string
  mailFrom: string
  mailTo: string
  backup: BackupMode
  backupHost: string
  backupUser: string
  backupPath: string
  /** SNMP v2c, read only, from the management network. */
  snmp: boolean
}

export const DEFAULT_SETUP: SetupState = {
  oltPort: "sfp-sfpplus2",
  internetVlan: 100,
  mgmtVlan: 10,
  mgmtNet: "192.168.10.0/24",
  pool: "100.64.0.0/22",
  // Not among the default probe IPs (each of those is pinned to one link).
  dns: "9.9.9.10,149.112.112.10",
  service: "gigafazt",
  firewall: true,
  oltUplink: "0/9/0",
  collector: "",
  mtu1500: true,
  isolate: true,
  blockSmtp: true,
  // The company's own Huawei HGU ONTs (Wi-Fi 6 / Wi-Fi 7) dial PPPoE themselves; bridge is for a client's own router.
  ontMode: "router",
  plans: DEFAULT_PLANS,
  rule: DEFAULT_RULE,
  natMode: "masquerade",
  sessionLog: true,
  pitp: true,
  ipv6Pd: "",
  ipv6PdLength: 56,
  ipv6Wan: "",
  dnsMode: "router",
  alert: "none",
  telegramChat: "",
  mailServer: "",
  mailFrom: "",
  mailTo: "",
  backup: "local",
  backupHost: "",
  backupUser: "",
  backupPath: "",
  snmp: false,
}

/** The router's DNS sized for an ISP (defaults are 2,048 KiB and 100 queries): starting points, not vendor figures. */
export const DNS_CACHE_KIB = 20480
export const DNS_QUERIES = 1000
export const DNS_TCP = 100
/** CPU alert: this % for this many minutes in a row. */
export const CPU_ALERT_PCT = 85
export const CPU_ALERT_MIN = 5

/** Per-client fq-codel / CAKE PPP queues: a forum report has ~560 PPPoE clients pegging one core. */
export const QUEUE_CPU_CLIENTS = 500

/** OLT downstream table and upstream DBA: the plan + 10 %, so the MikroTik's burst queue is what limits. */
export const OLT_HEADROOM = 1.1
/** First id of the profiles and tables this writes (Huawei's defaults sit below). */
export const OLT_FIRST_ID = 10
/** New connections one subscriber may have open before more are dropped (infected CPEs). */
export const CONN_LIMIT = 1000

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
const cidrText = (c: Cidr) => `${intToIp(c.net)}/${c.prefix}`

/** Addresses the pool hands out: all but the network, the router's and the broadcast. */
export const poolHosts = (c: Cidr) => Math.max(0, size(c) - 3)

/** An IPv6 prefix (2001:db8:100::/40): its length, or null when it isn't a valid prefix with zero host bits. */
export function parseIpv6Prefix(text: string): number | null {
  const m = /^([0-9a-fA-F:]+)\/(\d{1,3})$/.exec(text.trim())
  if (!m) return null
  const len = Number(m[2])
  if (len < 16 || len > 64) return null
  const halves = m[1].split("::")
  if (halves.length > 2) return null
  const parts = (h: string) => (h === "" ? [] : h.split(":"))
  const head = parts(halves[0])
  const tail = halves.length === 2 ? parts(halves[1]) : []
  if ([...head, ...tail].some((g) => !/^[0-9a-fA-F]{1,4}$/.test(g))) return null
  const missing = 8 - head.length - tail.length
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail].map((g) => parseInt(g, 16))
  // Host bits must be zero.
  for (let bit = len; bit < 128; bit++) if ((groups[Math.floor(bit / 16)] >> (15 - (bit % 16))) & 1) return null
  return len
}

/** Client prefixes one IPv6 pool gives (capped so huge pools don't overflow). */
export const ipv6Count = (poolLen: number, each: number) => (each < poolLen ? 0 : 2 ** Math.min(each - poolLen, 40))

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
  | "dnsIsProbe"
  | "badService"
  | "badUplink"
  | "badCollector"
  | "noPlans"
  | "badPlanSpeed"
  | "badPlanName"
  | "duplicatePlan"
  | "badNatIps"
  | "fewPorts"
  | "natOwnIp"
  | "badIpv6"
  | "ipv6Small"
  | "ipv6Upstream"
  | "queueCpu"
  | "badChat"
  | "badMail"
  | "badBackup"
  | "secretsPending"
export type SetupIssue = { code: SetupIssueCode; level: "error" | "warn" | "info"; value?: string; need?: number; have?: number }

export type SetupContext = {
  /** Clients of the deployment. */
  clients: number
  /** Its internet interfaces (the OLT can't hang from one of them). */
  wanIfaces: string[]
  /** Networks the load balancing treats as clients; null = no balancing. */
  balanced: string[] | null
  /** Public IPs the links watch (each is routed through one link only). */
  monitors?: string[]
  /** Interfaces of the links whose provider is CGNAT itself (gateway in 100.64/10): no raw drop on them. */
  cgnatUpstreams?: string[]
  /** PPPoE links: no interface queue to set. */
  pppoeIfaces?: string[]
  /** The links with the public IPs they lend to fixed CGNAT. */
  links?: NatLink[]
  /** Queue type of the clients' PPP queues. */
  queue?: QueueKind
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
  // A probe IP only answers through its own link: as DNS it dies with that link.
  for (const d of dns) if (ctx.monitors?.includes(d)) out.push({ code: "dnsIsProbe", level: "warn", value: d })
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(s.service.trim())) out.push({ code: "badService", level: "error", value: s.service })
  if (!/^\d{1,2}\/\d{1,2}\/\d{1,2}$/.test(s.oltUplink.trim())) out.push({ code: "badUplink", level: "error", value: s.oltUplink })
  if (s.collector.trim() && !isIp(s.collector.trim())) out.push({ code: "badCollector", level: "error", value: s.collector })
  if (s.plans.length === 0) out.push({ code: "noPlans", level: "error" })
  const names = new Set<string>()
  for (const p of s.plans) {
    if (!(p.down > 0 && p.up > 0)) out.push({ code: "badPlanSpeed", level: "error", value: p.name || String(p.down) })
    if (p.name.trim() && !/^[A-Za-z0-9_.-]{1,32}$/.test(p.name.trim())) out.push({ code: "badPlanName", level: "error", value: p.name })
    const n = planLabel(p, s.rule)
    if (names.has(n)) out.push({ code: "duplicatePlan", level: "error", value: n })
    names.add(n)
  }
  if (s.natMode === "fixed" && pool) {
    const own: string[] = []
    for (const l of ctx.links ?? []) {
      const lay = natLayout(pool, l)
      if (!lay) out.push({ code: "badNatIps", level: "error", value: `${l.name}: ${l.natIps}` })
      else if (lay.block < MIN_PORTS) out.push({ code: "fewPorts", level: "warn", value: l.name, have: lay.block, need: MIN_PORTS })
      if (lay && !lay.ips) own.push(l.name)
    }
    if (own.length) out.push({ code: "natOwnIp", level: "info", value: own.join(", ") })
  }
  if (s.ipv6Pd.trim()) {
    const pd = parseIpv6Prefix(s.ipv6Pd)
    const len = s.ipv6PdLength
    if (pd === null || !Number.isInteger(len) || len < 48 || len > 64 || len < pd) out.push({ code: "badIpv6", level: "error", value: s.ipv6Pd })
    else if (ipv6Count(pd, len) < Math.ceil(ctx.clients * 1.1)) out.push({ code: "ipv6Small", level: "warn", have: ipv6Count(pd, len), need: Math.ceil(ctx.clients * 1.1) })
    if (s.ipv6Wan.trim()) {
      const wan = parseIpv6Prefix(s.ipv6Wan)
      if (wan === null) out.push({ code: "badIpv6", level: "error", value: s.ipv6Wan })
      else if (ipv6Count(wan, 64) < Math.ceil(ctx.clients * 1.1)) out.push({ code: "ipv6Small", level: "warn", have: ipv6Count(wan, 64), need: Math.ceil(ctx.clients * 1.1) })
    }
    if (ctx.wanIfaces.filter((w) => w.trim()).length > 1) out.push({ code: "ipv6Upstream", level: "info" })
  }
  const mail = (x: string) => /^[^\s@"]+@[^\s@"]+\.[^\s@"]+$/.test(x.trim())
  if (s.alert === "telegram" && !/^-?\d{3,20}$/.test(s.telegramChat.trim())) out.push({ code: "badChat", level: "error", value: s.telegramChat })
  if ((s.alert === "email" || s.backup === "email") && (!/^[A-Za-z0-9.-]+$/.test(s.mailServer.trim()) || !mail(s.mailFrom) || !mail(s.mailTo)))
    out.push({ code: "badMail", level: "error" })
  if (s.backup === "sftp" && (!/^[A-Za-z0-9.:-]+$/.test(s.backupHost.trim()) || !/^[A-Za-z0-9._-]+$/.test(s.backupUser.trim()) || /["\\$]/.test(s.backupPath)))
    out.push({ code: "badBackup", level: "error" })
  if (s.backup !== "none" || s.alert !== "none" || s.snmp) out.push({ code: "secretsPending", level: "info" })
  if ((ctx.queue === "fq-codel" || ctx.queue === "cake") && ctx.clients >= QUEUE_CPU_CLIENTS) out.push({ code: "queueCpu", level: "warn", have: ctx.clients, value: ctx.queue })
  return out
}

// ── MikroTik ───────────────────────────────────────────────────────────────

export type SetupPlans = { name: string; pair: Pair; down: number; up: number }[]

const planPair = (p: SetupPlan, rule: PlanRule): Pair => ({ down: planDefaults(p.down, rule), up: planDefaults(p.up, rule) })
/** The profile name: the one typed, or "plan-<top speed>" as the bulk PPPoE export names it. */
export const planLabel = (p: SetupPlan, rule: PlanRule) => p.name.trim() || planName(planPair(p, rule))

/** The plans as PPP profiles take them: each with the deployment's burst rule. */
export function setupPlans(list: SetupPlan[], rule: PlanRule): SetupPlans {
  return list.filter((p) => p.down > 0 && p.up > 0).map((p) => ({ name: planLabel(p, rule), pair: planPair(p, rule), down: p.down, up: p.up }))
}

const vlanName = (id: number, what: string) => `vlan${id}-${what}`

/** The router script by phase of the checklist. */
export type SetupParts = { base: string; cgnat: string; pppoe: string; hardening: string; ops: string }

export type SetupScriptContext = SetupContext & { name: string; plans: SetupPlans }

/** The parts of the RouterOS v7 script; null when there are errors. */
export function setupParts(s: SetupState, ctx: SetupScriptContext): SetupParts | null {
  if (checkSetup(s, ctx).some((i) => i.level === "error") || ctx.plans.length === 0) return null
  const mgmt = parseCidr(s.mgmtNet) as Cidr
  const pool = parseCidr(s.pool) as Cidr
  const port = rosString(s.oltPort.trim())
  const inet = vlanName(s.internetVlan, "internet")
  const mg = vlanName(s.mgmtVlan, "gestion")
  const local = intToIp(pool.net + 1)
  const poolNet = cidrText(pool)
  const mgmtNet = cidrText(mgmt)
  const collector = s.collector.trim()
  const wans = ctx.wanIfaces.map((x) => x.trim()).filter(Boolean)
  const c = (text: string) => `comment=${rosString(`DS: ${text}`)}`

  // Phase 0: base and safety.
  const base: string[] = []
  if (ctx.name.trim()) base.push(`/system identity set name=${rosString(ctx.name.trim())}`)
  base.push(
    "/system clock set time-zone-name=America/Mexico_City",
    "/system ntp client set enabled=yes servers=time.cloudflare.com,pool.ntp.org",
    "/system routerboard settings set auto-upgrade=yes",
    "/ip settings set tcp-syncookies=yes rp-filter=loose",
    "/interface vlan",
    `add name=${rosString(mg)} vlan-id=${s.mgmtVlan} interface=${port} ${c("gestion de la OLT")}`,
    "/ip address",
    `add address=${intToIp(mgmt.net + 1)}/${mgmt.prefix} interface=${rosString(mg)} ${c("gestion de la OLT")}`,
    "/interface list",
    `add name=DS-WAN ${c("internet")}`,
    `add name=DS-LAN ${c("clientes")}`,
    `add name=DS-MGMT ${c("gestion")}`,
    "/interface list member",
    ...wans.map((w) => `add list=DS-WAN interface=${rosString(w)} ${c("internet")}`),
    `add list=DS-MGMT interface=${rosString(mg)} ${c("gestion")}`,
    "/system logging",
    `add topics=pppoe,info action=memory`
  )
  if (collector)
    base.push(
      "/system logging action",
      `add name=DSremoto target=remote remote=${collector}`,
      "/system logging",
      "add topics=pppoe action=DSremoto",
      "add topics=critical action=DSremoto"
    )
  // Last, so a paste over the management network isn't cut halfway.
  base.push(
    "/ip service disable telnet,ftp,www,api,api-ssl",
    `/ip service set winbox address=${mgmtNet}`,
    `/ip service set ssh address=${mgmtNet}`,
    "/tool mac-server set allowed-interface-list=DS-MGMT",
    "/tool mac-server mac-winbox set allowed-interface-list=DS-MGMT",
    // MikroTik's "Securing your router": no discovery on the links, no bandwidth-test server, no proxy/SOCKS/UPnP/cloud.
    "/ip neighbor discovery-settings set discover-interface-list=DS-MGMT",
    "/tool bandwidth-server set enabled=no",
    "/ip socks set enabled=no",
    "/ip proxy set enabled=no",
    "/ip upnp set enabled=no",
    "/ip cloud set ddns-enabled=no update-time=no"
  )

  // Phase 3: CGNAT boundary, isolation and the NAT log.
  const cg: string[] = ["/ip firewall raw"]
  for (const w of wans) {
    if (ctx.cgnatUpstreams?.includes(w)) continue
    cg.push(`add chain=prerouting in-interface=${rosString(w)} src-address=100.64.0.0/10 action=drop ${c(`sin 100.64 desde ${w}`)}`)
  }
  if (cg.length === 1) cg.pop()
  cg.push("/ip route", `add dst-address=${poolNet} blackhole distance=250 ${c("pool sin salida")}`)
  if (s.isolate) cg.push("/ip firewall filter", `add chain=forward src-address=${poolNet} dst-address=${poolNet} action=drop ${c("clientes aislados entre si")}`)
  if (s.natMode === "fixed")
    for (const l of ctx.links ?? []) {
      const lay = natLayout(pool, l)
      if (lay && lay.iface) cg.push(natScript(lay, poolNet))
    }
  if (collector)
    cg.push(
      "/ip traffic-flow set enabled=yes interfaces=all cache-entries=64k active-flow-timeout=1m inactive-flow-timeout=15s",
      "/ip traffic-flow target",
      `add dst-address=${collector} port=4739 version=ipfix`,
      "/ip traffic-flow ipfix set nat-events=yes"
    )

  // Phase 4: PPPoE toward the OLT.
  const pp: string[] = [
    "/interface vlan",
    `add name=${rosString(inet)} vlan-id=${s.internetVlan} interface=${port}${s.mtu1500 ? " mtu=1508" : ""} ${c("internet de los clientes")}`,
    "/interface list member",
    `add list=DS-LAN interface=${rosString(inet)} ${c("clientes")}`,
    "/ip pool",
    `add name=DS-clientes ranges=${intToIp(pool.net + 2)}-${intToIp(pool.net + size(pool) - 2)} ${c("clientes PPPoE")}`,
    "/ip dns",
    s.dnsMode === "router"
      ? `set allow-remote-requests=yes servers=${dnsList(s.dns).join(",")} cache-size=${DNS_CACHE_KIB} max-concurrent-queries=${DNS_QUERIES} max-concurrent-tcp-sessions=${DNS_TCP}`
      : `set allow-remote-requests=no servers=${dnsList(s.dns).join(",")}`,
  ]
  const clientDns = s.dnsMode === "router" ? local : dnsList(s.dns).slice(0, 2).join(",")
  // The router answers DNS for the clients; without the basic firewall nothing else stops the internet from using it.
  if (!s.firewall && s.dnsMode === "router")
    pp.push(
      "/ip firewall filter",
      `add chain=input action=drop in-interface-list=DS-WAN protocol=udp dst-port=53 ${c("DNS solo para los clientes")}`,
      `add chain=input action=drop in-interface-list=DS-WAN protocol=tcp dst-port=53 ${c("DNS solo para los clientes")}`
    )
  const typeLine = queueTypeSetup(ctx.queue)
  if (typeLine) pp.push(typeLine)
  const v6 = s.ipv6Pd.trim()
  const v6wan = s.ipv6Wan.trim()
  // Official example "IPv6 PD over PPP": the profile's dhcpv6-pd-pool makes a DHCPv6 server per session.
  if (v6)
    pp.push(
      "/ipv6 pool",
      `add name=DS-pd prefix=${v6} prefix-length=${s.ipv6PdLength}`,
      ...(v6wan ? [`add name=DS-wan6 prefix=${v6wan} prefix-length=64`] : []),
      // Each session installs its own route; the rest of the block goes nowhere instead of bouncing back to the provider.
      "/ipv6 route",
      `add dst-address=${v6} blackhole ${c("prefijos de clientes sin uso")}`,
      ...(v6wan ? [`add dst-address=${v6wan} blackhole ${c("prefijos WAN sin uso")}`] : [])
    )
  // The session log: who had which address, and when (the NAT lookup ends here).
  const session = (what: string) => `:log info ("DS-sesion ${what} usuario=" . $user . " ip=" . $"remote-address" . " mac=" . $"caller-id")`
  pp.push("/ppp profile")
  for (const p of ctx.plans) {
    const props = [
      `local-address=${local}`,
      "remote-address=DS-clientes",
      `dns-server=${clientDns}`,
      `rate-limit=${rosString(rateLimit(p.pair))}`,
      "only-one=yes",
      "change-tcp-mss=yes",
      "use-compression=no",
      "use-encryption=no",
      "use-upnp=no",
      "interface-list=DS-LAN",
      ...(v6 ? ["use-ipv6=yes", "dhcpv6-pd-pool=DS-pd", ...(v6wan ? ["remote-ipv6-prefix-pool=DS-wan6"] : [])] : []),
      ...(s.sessionLog ? [`on-up=${rosString(session("alta"))}`, `on-down=${rosString(session("baja"))}`] : []),
      ...(ctx.queue && ctx.queue !== "default" ? [`queue-type=${rosString(ctx.queue)}`] : []),
      c(`plan ${p.name}`),
    ]
    pp.push(upsert("/ppp profile", p.name, props, [`name=${rosString(p.name)}`, ...props]))
  }
  if (s.sessionLog)
    pp.push(
      "/system logging action",
      `add name=DSsesiones target=disk disk-file-name=DS-sesiones disk-lines-per-file=20000 disk-file-count=20`,
      "/system logging",
      "add topics=script,info action=DSsesiones",
      ...(collector ? ["add topics=script,info action=DSremoto"] : [])
    )
  pp.push(
    "/interface pppoe-server server",
    `add service-name=${rosString(s.service.trim())} interface=${rosString(inet)} default-profile=${rosString(ctx.plans[0].name)} authentication=pap,chap one-session-per-host=yes max-sessions=${poolHosts(pool)} keepalive-timeout=10${s.mtu1500 ? " max-mtu=1500 max-mru=1500 mrru=disabled" : ""} disabled=no`
  )

  // Phase 5: queues on the ports, connection tracking, firewall.
  const hd: string[] = ["/queue type", `add name=DS-fq-codel kind=fq-codel`, "/queue interface"]
  for (const i of [...wans.filter((w) => !ctx.pppoeIfaces?.includes(w)), s.oltPort.trim()]) hd.push(`set [find where interface=${rosString(i)}] queue=DS-fq-codel`)
  hd.push(
    "/ip firewall connection tracking set enabled=yes loose-tcp-tracking=yes tcp-established-timeout=2h4m tcp-syn-sent-timeout=30s tcp-syn-received-timeout=30s tcp-fin-wait-timeout=1m tcp-close-wait-timeout=1m tcp-last-ack-timeout=30s tcp-time-wait-timeout=1m tcp-close-timeout=10s udp-timeout=30s udp-stream-timeout=3m icmp-timeout=30s generic-timeout=10m",
    "/ip firewall raw",
    `add chain=prerouting in-interface-list=DS-WAN src-address=0.0.0.0/8 action=drop ${c("bogon")}`,
    `add chain=prerouting in-interface-list=DS-WAN src-address=127.0.0.0/8 action=drop ${c("bogon")}`,
    `add chain=prerouting in-interface-list=DS-WAN src-address=240.0.0.0/4 action=drop ${c("bogon")}`,
    `add chain=prerouting protocol=tcp tcp-flags=syn,fin action=drop ${c("banderas TCP invalidas")}`,
    `add chain=prerouting protocol=tcp tcp-flags=syn,rst action=drop ${c("banderas TCP invalidas")}`,
    `add chain=prerouting protocol=tcp tcp-flags=!fin,!syn,!rst,!ack action=drop ${c("banderas TCP invalidas")}`
  )
  const fw: string[] = []
  if (s.blockSmtp) fw.push(`add chain=forward action=drop src-address=${poolNet} protocol=tcp dst-port=25 ${c("sin SMTP directo de los clientes")}`)
  // Only new connections: on every packet, a client over the cap would lose the ones it already has.
  fw.push(`add chain=forward action=drop src-address=${poolNet} connection-state=new connection-limit=${CONN_LIMIT},32 ${c("tope de conexiones por cliente")}`)
  if (s.firewall)
    fw.push(
      `add chain=input action=accept connection-state=established,related,untracked ${c("respuestas")}`,
      `add chain=input action=drop connection-state=invalid ${c("invalidas")}`,
      `add chain=input action=accept protocol=icmp limit=50,100:packet ${c("ping")}`,
      ...(s.dnsMode === "router"
        ? [
            `add chain=input action=accept src-address=${poolNet} protocol=udp dst-port=53 ${c("DNS de los clientes")}`,
            `add chain=input action=accept src-address=${poolNet} protocol=tcp dst-port=53 ${c("DNS de los clientes")}`,
          ]
        : []),
      `add chain=input action=drop src-address=${poolNet} ${c("los clientes no administran el router")}`,
      `add chain=input action=drop in-interface-list=DS-WAN ${c("nada desde internet al router")}`,
      `add chain=forward action=accept connection-state=established,related,untracked ${c("respuestas")}`,
      `add chain=forward action=drop connection-state=invalid ${c("invalidas")}`,
      `add chain=forward action=drop src-address=${poolNet} dst-address=${mgmtNet} ${c("los clientes no llegan a la gestion")}`,
      `add chain=forward action=drop in-interface-list=DS-WAN connection-nat-state=!dstnat ${c("nada nuevo desde internet")}`
    )
  if (fw.length) hd.push("/ip firewall filter", ...fw)
  // IPv6 skips the IPv4 rules: the same SMTP block and isolation, whether or not the basic firewall is on.
  const fw6: string[] = []
  if (v6 && s.blockSmtp) fw6.push(`add chain=forward action=drop in-interface-list=DS-LAN protocol=tcp dst-port=25 ${c("sin SMTP directo de los clientes")}`)
  if (v6 && s.isolate) fw6.push(`add chain=forward action=drop in-interface-list=DS-LAN out-interface-list=DS-LAN ${c("clientes aislados entre si")}`)
  if (fw6.length) hd.push("/ipv6 firewall filter", ...fw6)
  if (v6 && s.firewall)
    hd.push(
      "/ipv6 firewall filter",
      `add chain=input action=accept connection-state=established,related,untracked ${c("respuestas")}`,
      `add chain=input action=drop connection-state=invalid ${c("invalidas")}`,
      `add chain=input action=accept protocol=icmpv6 ${c("ICMPv6")}`,
      `add chain=input action=accept protocol=udp dst-port=546 src-address=fe80::/10 in-interface-list=DS-WAN ${c("DHCPv6 del proveedor")}`,
      `add chain=input action=accept protocol=udp dst-port=547 in-interface-list=DS-LAN ${c("DHCPv6-PD de los clientes")}`,
      `add chain=input action=drop in-interface-list=DS-WAN ${c("nada desde internet al router")}`,
      `add chain=forward action=drop connection-state=invalid ${c("invalidas")}`
    )

  return { base: base.join("\n"), cgnat: cg.join("\n"), pppoe: pp.join("\n"), hardening: hd.join("\n"), ops: opsScript(s, ctx.name, mgmtNet) }
}

/** Alerts (Telegram or e-mail), daily backup, SNMP. Passwords stay as PEGA-AQUI-… for the owner to fill in. */
function opsScript(s: SetupState, name: string, mgmtNet: string): string {
  const out: string[] = []
  const c = (text: string) => `comment=${rosString(`DS: ${text}`)}`
  const mailOn = s.alert === "email" || s.backup === "email"
  if (mailOn)
    out.push(
      "/tool e-mail",
      `set server=${s.mailServer.trim()} port=587 tls=starttls from=${rosString(s.mailFrom.trim())} user=${rosString(s.mailFrom.trim())} password=${rosString(SECRET.mail)}`
    )
  if (s.alert !== "none") {
    // DSmsg carries the text: Netwatch, the scheduler and anything else set it and run DS-aviso.
    const send =
      s.alert === "telegram"
        ? `/tool fetch url="https://api.telegram.org/bot${SECRET.telegram}/sendMessage" http-method=post http-header-field="Content-Type: application/json" http-data=("{\\"chat_id\\":\\"${s.telegramChat.trim()}\\",\\"text\\":\\"" . $m . "\\"}") output=none`
        : `/tool e-mail send to="${s.mailTo.trim()}" subject=$m body=$m`
    const aviso = `:global DSmsg; :local m ([/system identity get name] . ": " . $DSmsg); ${send}`
    const cpu = `:global DScpu; :if ([:typeof $DScpu] = "nothing") do={:set DScpu 0}; :if ([/system resource get cpu-load] > ${CPU_ALERT_PCT}) do={:set DScpu ($DScpu + 1)} else={:set DScpu 0}; :if ($DScpu = ${CPU_ALERT_MIN}) do={:global DSmsg "CPU arriba de ${CPU_ALERT_PCT} % por ${CPU_ALERT_MIN} min"; /system script run DS-aviso}`
    out.push(
      "/system script",
      `add name=DS-aviso policy=read,write,test dont-require-permissions=yes source=${rosString(aviso)} ${c("avisos")}`,
      "/system scheduler",
      `add name=DS-arranque start-time=startup on-event=${rosString(':delay 60s; :global DSmsg "el router arranco"; /system script run DS-aviso')} ${c("aviso al arrancar")}`,
      `add name=DS-cpu interval=1m on-event=${rosString(cpu)} ${c("aviso de CPU")}`
    )
  }
  if (s.backup !== "none") {
    const send =
      s.backup === "email"
        ? [`/tool e-mail send to="${s.mailTo.trim()}" subject=("Respaldo " . $n . " " . $d) body="Respaldo diario" file=DS-respaldo.backup,DS-respaldo.rsc`]
        : s.backup === "sftp"
          ? ["backup", "rsc"].map(
              (ext) =>
                `/tool fetch upload=yes mode=sftp address=${s.backupHost.trim()} user=${s.backupUser.trim()} password="${SECRET.sftp}" src-path=DS-respaldo.${ext} dst-path=("${s.backupPath.trim().replace(/\/+$/, "")}${s.backupPath.trim() ? "/" : ""}" . $n . "-" . $d . ".${ext}")`
            )
          : []
    // The .backup is encrypted with its password; the .rsc export leaves passwords out (RouterOS v7 default).
    const src = [
      ":local n [/system identity get name]",
      ":local d [:pick [/system clock get date] 0 10]",
      `/system backup save name=DS-respaldo password="${SECRET.backup}"`,
      "/export file=DS-respaldo",
      ":delay 10s",
      ...send,
    ].join("; ")
    out.push(
      "/system script",
      `add name=DS-respaldo policy=ftp,read,write,policy,test,sensitive dont-require-permissions=yes source=${rosString(src)} ${c("respaldo diario")}`,
      "/system scheduler",
      `add name=DS-respaldo start-time=03:30:00 interval=1d on-event="/system script run DS-respaldo" ${c("respaldo diario")}`
    )
  }
  if (s.snmp)
    out.push(
      "/snmp community",
      `set [find default=yes] name=${rosString(SECRET.snmp)} addresses=${mgmtNet} read-access=yes write-access=no`,
      `/snmp set enabled=yes contact="GigaFazt" location=${rosString(name.trim() || "despliegue")}`
    )
  return out.join("\n")
}

/** The whole router script in order (base, PPPoE, CGNAT, hardening). Empty when there are errors. */
export function mikrotikSetup(s: SetupState, ctx: SetupScriptContext): string {
  const p = setupParts(s, ctx)
  return p ? [p.base, p.pppoe, p.cgnat, p.hardening, p.ops].filter(Boolean).join("\n") : ""
}

/** Undo for the MikroTik part (PPP profiles stay: the clients' secrets use them; settings stay as set). */
export function setupUndo(s: SetupState): string {
  return [
    // Access and profiles point to the lists: release them first, or the lists can't be removed.
    "/tool mac-server set allowed-interface-list=all",
    "/ip neighbor discovery-settings set discover-interface-list=all",
    '/system scheduler remove [find where name~"^DS-"]',
    '/system script remove [find where name~"^DS-"]',
    "/snmp set enabled=no",
    "/tool mac-server mac-winbox set allowed-interface-list=all",
    '/ip service set winbox address=""',
    '/ip service set ssh address=""',
    '/ppp profile set [find where comment~"^DS: "] on-up="" on-down=""',
    ':do {/ppp profile set [find where comment~"^DS: "] interface-list=""} on-error={:do {/ppp profile set [find where comment~"^DS: "] interface-list=none} on-error={}}',
    "/system logging remove [find where action=DSremoto]",
    "/system logging remove [find where action=DSsesiones]",
    "/system logging action remove [find where name=DSsesiones]",
    "/system logging action remove [find where name=DSremoto]",
    `/interface pppoe-server server remove [find where service-name=${rosString(s.service.trim())}]`,
    '/ip firewall filter remove [find where comment~"^DS: "]',
    '/ip firewall nat remove [find where comment~"^DS: "]',
    '/ipv6 firewall filter remove [find where comment~"^DS: "]',
    '/ipv6 route remove [find where comment~"^DS: "]',
    '/ip firewall raw remove [find where comment~"^DS: "]',
    '/ip route remove [find where comment~"^DS: "]',
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

/** Plans as the OLT gets them: a traffic table (download), a DBA profile (upload) and a line profile each; then the security set. */
export function oltSetup(s: SetupState, ctx: { plans: { name: string; down: number; up: number }[] }): string {
  const mgmt = parseCidr(s.mgmtNet)
  if (!mgmt || !/^\d{1,2}\/\d{1,2}\/\d{1,2}$/.test(s.oltUplink.trim())) return ""
  const up = frameSlot(s.oltUplink)
  const lines = ["enable", "config"]
  for (const v of [s.internetVlan, s.mgmtVlan]) lines.push(`vlan ${v} smart`, `port vlan ${v} ${up.fs} ${up.port}`)
  lines.push(`interface vlanif ${s.mgmtVlan}`, ` ip address ${intToIp(mgmt.net + 2)} ${mask(mgmt.prefix)}`, " quit", `ip route-static 0.0.0.0 0.0.0.0 ${intToIp(mgmt.net + 1)}`)
  if (ctx.plans.length === 0) return ""
  ctx.plans.forEach((p, k) => {
    const id = OLT_FIRST_ID + k
    // The service-port uses this table in both directions (rx and tx): it covers the faster one.
    lines.push(`traffic table ip index ${id} cir ${oltKbps(Math.max(p.down, p.up))} priority 0 priority-policy local-setting`)
    lines.push(`dba-profile add profile-id ${id} type4 max ${oltKbps(p.up)}`)
  })
  ctx.plans.forEach((p, k) => {
    const id = OLT_FIRST_ID + k
    lines.push(
      `ont-lineprofile gpon profile-id ${id} profile-name "${p.name}"`,
      ` tcont 1 dba-profile-id ${id}`,
      " gem add 1 eth tcont 1",
      ` gem mapping 1 0 vlan ${s.internetVlan}`,
      " commit",
      " quit"
    )
  })
  lines.push(`ont-srvprofile gpon profile-id ${OLT_FIRST_ID} profile-name "${s.ontMode === "bridge" ? "puente" : "router"}"`, " ont-port eth adaptive pots adaptive", " commit", " quit")
  // The owner's checklist: Huawei's recommended set for PPPoE subscribers.
  lines.push("security anti-macspoofing enable", "security anti-ipspoofing enable", "security anti-macduplicate enable", "security anti-dos enable", "security anti-ipattack enable")
  // IP anti-spoofing (and PITP) only act when also on at VLAN level (a VLAN service profile) and per service-port (ONT template).
  if (s.pitp) lines.push("pitp enable pmode")
  lines.push(
    `vlan service-profile profile-id ${OLT_FIRST_ID}`,
    ...(s.pitp ? [" pitp enable"] : []),
    " security anti-ipspoofing enable",
    " commit",
    " quit",
    `vlan bind service-profile ${s.internetVlan} profile-id ${OLT_FIRST_ID}`
  )
  return lines.join("\n")
}

/** servicePort: the service-port's index (it switches anti-spoofing and PITP on for that ONT). */
/** What the installer types on the ONT's web page, in order; the page words each item. */
export type InstallItem = { key: string; value?: number }

export function ontInstall(s: SetupState): InstallItem[] {
  if (s.ontMode === "bridge") return [{ key: "bridgeWan" }, { key: "vlan", value: s.internetVlan }, { key: "bridgePort" }, { key: "clientRouter" }]
  return [
    { key: "wanMode" },
    { key: "service" },
    { key: "vlan", value: s.internetVlan },
    { key: "priority", value: 0 },
    { key: "nat" },
    { key: "account" },
    { key: s.mtu1500 ? "mtu1500" : "mtu1492" },
    ...(s.ipv6Pd.trim() ? [{ key: "ipv6" }] : []),
    { key: "adminPassword" },
    { key: "wifi" },
    { key: "remoteAccess" },
  ]
}

export type OntInput = { plan: number; ponPort: string; ontId: number; sn: string; client: string; servicePort: number }

/** Adding one ONT on a PON port with a plan's line profile and traffic table. */
export function ontTemplate(s: SetupState, o: OntInput): string {
  if (!/^\d{1,2}\/\d{1,2}\/\d{1,3}$/.test(o.ponPort.trim()) || !Number.isInteger(o.servicePort) || o.servicePort < 0) return ""
  const p = frameSlot(o.ponPort)
  const id = OLT_FIRST_ID + o.plan
  const desc = o.client.replace(/["\\]/g, "").slice(0, 60) || "cliente"
  return [
    `interface gpon ${p.fs}`,
    ` ont add ${p.port} ${o.ontId} sn-auth "${o.sn.trim() || "HWTC00000000"}" omci ont-lineprofile-id ${id} ont-srvprofile-id ${OLT_FIRST_ID} desc "${desc}"`,
    // Bridge: the client's router plugs into the ONT's first port untagged; the ONT puts it in the internet VLAN.
    ...(s.ontMode === "bridge" ? [` ont port native-vlan ${p.port} ${o.ontId} eth 1 vlan ${s.internetVlan} priority 0`] : []),
    " quit",
    `service-port ${o.servicePort} vlan ${s.internetVlan} gpon ${p.fs}/${p.port} ont ${o.ontId} gemport 1 multi-service user-vlan ${s.internetVlan} rx-cttr ${id} tx-cttr ${id}`,
    `security anti-ipspoofing service-port ${o.servicePort} enable`,
    ...(s.pitp ? [`pitp permit-forwarding service-port ${o.servicePort} enable`] : []),
  ].join("\n")
}
