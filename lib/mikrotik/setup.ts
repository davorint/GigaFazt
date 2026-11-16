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

import { planDefaults, type PlanRule } from "./burst"
import { rateLimit, planName, rosString, upsert, queueTypeSetup, type Pair, type QueueKind } from "./routeros"

export type OntMode = "bridge" | "router"

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
  ontMode: "bridge",
}

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

/** The router script by phase of the checklist. */
export type SetupParts = { base: string; cgnat: string; pppoe: string; hardening: string }

export type SetupScriptContext = SetupContext & { name: string; plans: SetupPlans; queue?: QueueKind }

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
    "/tool mac-server mac-winbox set allowed-interface-list=DS-MGMT"
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
    `set allow-remote-requests=yes servers=${dnsList(s.dns).join(",")}`,
  ]
  const typeLine = queueTypeSetup(ctx.queue)
  if (typeLine) pp.push(typeLine)
  pp.push("/ppp profile")
  for (const p of ctx.plans) {
    const props = [
      `local-address=${local}`,
      "remote-address=DS-clientes",
      `dns-server=${local}`,
      `rate-limit=${rosString(rateLimit(p.pair))}`,
      "only-one=yes",
      "change-tcp-mss=yes",
      "use-compression=no",
      "use-encryption=no",
      "use-upnp=no",
      "interface-list=DS-LAN",
      ...(ctx.queue && ctx.queue !== "default" ? [`queue-type=${rosString(ctx.queue)}`] : []),
      c(`plan ${p.name}`),
    ]
    pp.push(upsert("/ppp profile", p.name, props, [`name=${rosString(p.name)}`, ...props]))
  }
  pp.push(
    "/interface pppoe-server server",
    `add service-name=${rosString(s.service.trim())} interface=${rosString(inet)} default-profile=${rosString(ctx.plans[0].name)} authentication=pap,chap one-session-per-host=yes max-sessions=${poolHosts(pool)} keepalive-timeout=10${s.mtu1500 ? " max-mtu=1500 max-mru=1500 mrru=disabled" : ""} disabled=no`
  )

  // Phase 5: queues on the ports, connection tracking, firewall.
  const hd: string[] = ["/queue type", `add name=DS-fq-codel kind=fq-codel`, "/queue interface"]
  for (const i of [...wans.filter((w) => !ctx.pppoeIfaces?.includes(w)), s.oltPort.trim()]) hd.push(`set [find where interface=${rosString(i)}] queue=DS-fq-codel`)
  hd.push(
    "/ip firewall connection tracking set enabled=yes loose-tcp-tracking=yes tcp-established-timeout=2h tcp-syn-sent-timeout=30s tcp-syn-received-timeout=30s tcp-fin-wait-timeout=1m tcp-close-wait-timeout=1m tcp-last-ack-timeout=30s tcp-time-wait-timeout=1m tcp-close-timeout=10s udp-timeout=30s udp-stream-timeout=3m icmp-timeout=30s generic-timeout=10m",
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
  fw.push(`add chain=forward action=drop src-address=${poolNet} connection-limit=${CONN_LIMIT},32 ${c("tope de conexiones por cliente")}`)
  if (s.firewall)
    fw.push(
      `add chain=input action=accept connection-state=established,related,untracked ${c("respuestas")}`,
      `add chain=input action=drop connection-state=invalid ${c("invalidas")}`,
      `add chain=input action=accept protocol=icmp limit=50,100:packet ${c("ping")}`,
      `add chain=input action=accept src-address=${poolNet} protocol=udp dst-port=53 ${c("DNS de los clientes")}`,
      `add chain=input action=accept src-address=${poolNet} protocol=tcp dst-port=53 ${c("DNS de los clientes")}`,
      `add chain=input action=drop src-address=${poolNet} ${c("los clientes no administran el router")}`,
      `add chain=input action=drop in-interface-list=DS-WAN ${c("nada desde internet al router")}`,
      `add chain=forward action=accept connection-state=established,related,untracked ${c("respuestas")}`,
      `add chain=forward action=drop connection-state=invalid ${c("invalidas")}`,
      `add chain=forward action=drop src-address=${poolNet} dst-address=${mgmtNet} ${c("los clientes no llegan a la gestion")}`,
      `add chain=forward action=drop in-interface-list=DS-WAN connection-nat-state=!dstnat ${c("nada nuevo desde internet")}`
    )
  if (fw.length) hd.push("/ip firewall filter", ...fw)

  return { base: base.join("\n"), cgnat: cg.join("\n"), pppoe: pp.join("\n"), hardening: hd.join("\n") }
}

/** The whole router script in order (base, PPPoE, CGNAT, hardening). Empty when there are errors. */
export function mikrotikSetup(s: SetupState, ctx: SetupScriptContext): string {
  const p = setupParts(s, ctx)
  return p ? [p.base, p.pppoe, p.cgnat, p.hardening].join("\n") : ""
}

/** Undo for the MikroTik part (PPP profiles stay: the clients' secrets use them; settings stay as set). */
export function setupUndo(s: SetupState): string {
  return [
    `/interface pppoe-server server remove [find where service-name=${rosString(s.service.trim())}]`,
    '/ip firewall filter remove [find where comment~"^DS: "]',
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

/** Plan speeds as the OLT gets them: a traffic table, a DBA profile and a line profile each; then the security set. */
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
  lines.push(`ont-srvprofile gpon profile-id ${OLT_FIRST_ID} profile-name "${s.ontMode === "bridge" ? "puente" : "router"}"`, " ont-port eth adaptive pots adaptive", " commit", " quit")
  // The owner's checklist: Huawei's recommended set for PPPoE subscribers.
  lines.push("security anti-macspoofing enable", "security anti-ipspoofing enable", "security anti-macduplicate enable", "security anti-dos enable", "security anti-ipattack enable")
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
    // Bridge: the client's router plugs into the ONT's first port untagged; the ONT puts it in the internet VLAN.
    ...(s.ontMode === "bridge" ? [` ont port native-vlan ${p.port} ${o.ontId} eth 1 vlan ${s.internetVlan} priority 0`] : []),
    " quit",
    `service-port vlan ${s.internetVlan} gpon ${p.fs}/${p.port} ont ${o.ontId} gemport 1 multi-service user-vlan ${s.internetVlan} rx-cttr ${id} tx-cttr ${id}`,
  ].join("\n")
}
