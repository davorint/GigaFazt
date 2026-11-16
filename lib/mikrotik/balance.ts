/**
 * Several internet links on one MikroTik (RouterOS v7): PCC load balancing
 * with failover, written from the manual's PCC and Failover examples.
 *
 * - Clients' new connections are spread with PCC in proportion to each link's
 *   speed (PCC slots). The default classifier is src-address: every client
 *   stays on one link, so sites that tie a session to the public IP (banks,
 *   games) keep working. both-addresses spreads per client-server pair;
 *   both-addresses-and-ports is the most even and the most likely to break
 *   those sessions.
 * - Each link has its own routing table: its link first (distance 1) and the
 *   others as backup (distance 2, ECMP), so a failed link's clients spread
 *   over the rest. The main table (the router's own traffic, anything not
 *   marked) uses all links (ECMP).
 * - Failover "recursive": every link watches a public IP through it (host
 *   route scope=10, default routes target-scope=11 check-gateway=ping, looked
 *   up in main with `@main` from the per-link tables), so it also notices a
 *   failure past the ISP's gateway. "gateway": pings the gateway only.
 * - Connections that come in on a link are marked so replies leave by it.
 * - NAT: masquerade per link.
 * - Weights follow each link's measured speed when it's known (what it
 *   really gives), otherwise the contracted one.
 * - Failover detection: RouterOS pings every 10 s and drops a gateway after
 *   2 missed replies (≈ 20 s). Faster presets set the router-wide timers in
 *   `/routing settings` (check-gateway-ping-interval / -timeout / -count;
 *   RouterOS manual, Routing Decision); older versions without them keep
 *   the default.
 * - How each link gets its address: a fixed IP (its gateway typed in), DHCP
 *   (the routes take the gateway the DHCP client holds when the script is
 *   pasted; the client stops adding its own default route and gets a lease
 *   script that sets the new gateway on exactly those routes when the
 *   provider changes it: `$bound`, `$"gateway-address"`, help.mikrotik.com
 *   DHCP), or PPPoE (the pppoe-out interface is the gateway).
 * - Link queues (optional, on by default): each link is shaped a little
 *   below its real speed in both directions, so the line forms in the
 *   router (fair, short) and not in the provider's modem (bufferbloat). A
 *   global queue tree per link and direction, fed by packet marks set in the
 *   forward chain by the link's interface; global trees run after src-nat and
 *   before the clients' simple queues, so both apply (RouterOS Packet Flow).
 *   Leaves are CAKE (RouterOS 7.1+): fair per client by destination going
 *   down, by source going up (cake-nat looks behind the masquerade).
 *   Priority: the first 500 KB of every connection (pages, DNS, the start of
 *   everything) and small UDP packets (games, calls) go before the rest.
 * - Netwatch per link (recursive failover only: its ping goes through the
 *   link's host route): log lines when it drops and comes back, and removing
 *   its marked connections then, so apps reconnect instead of hanging on a
 *   NAT that no longer works.
 *
 * Pure functions; the UI shows the text and its notes.
 */

import { parseTarget } from "./bulk"
import { rosRate, rosString } from "./routeros"

export type Classifier = "src-address" | "both-addresses" | "both-addresses-and-ports"
export const CLASSIFIERS: Classifier[] = ["src-address", "both-addresses", "both-addresses-and-ports"]
export type Failover = "recursive" | "gateway"
export type WanType = "static" | "dhcp" | "pppoe"
export const WAN_TYPES: WanType[] = ["dhcp", "static", "pppoe"]

export type Wan = {
  /** Short name used in marks and tables (WAN1…). */
  name: string
  /** How the link gets its address. */
  type: WanType
  /** Interface the link comes in on: the port with the DHCP client or the fixed IP (ether1, sfp-sfpplus1…), or the pppoe-out interface. */
  iface: string
  /** ISP gateway IP (fixed IP only). */
  gateway: string
  /** Contracted link speed, Mbps. */
  mbps: number
  /** What the link really gives (a speed test through it), Mbps; null = not measured. Used for weights and capacity when set. */
  measuredMbps: number | null
  /** Upload when it differs from the download, Mbps; null = same as the download (measured when known). */
  upMbps: number | null
  /** The provider is CGNAT itself (its gateway is in 100.64/10): 100.64 isn't dropped on this link. */
  upstreamCgnat: boolean
  /** Public IP watched through this link (recursive failover). */
  monitor: string
}

export type BalanceOptions = {
  wans: Wan[]
  /** Client networks to balance (CIDR). */
  clients: string[]
  classifier: Classifier
  failover: Failover
  /** How fast a dead link is noticed. */
  speed: FailoverSpeed
  nat: boolean
  queues: LinkQueues
}

/** Queues and Netwatch per link. */
export type LinkQueues = {
  /** Shape each link to `sharePct` % of its real speed, both directions. */
  shape: boolean
  sharePct: number
  /** Short connections and small UDP packets first. */
  prio: boolean
  /** Log lines when a link drops and comes back (Netwatch). */
  alerts: boolean
  /** Remove a link's connections when it drops and comes back (Netwatch). */
  flush: boolean
}
export const DEFAULT_LINK_QUEUES: LinkQueues = { shape: true, sharePct: 95, prio: true, alerts: true, flush: true }
/** The first bytes of a connection that count as interactive. */
export const PRIO_BYTES = 500_000
/** UDP packets up to this size count as interactive (games, calls). */
export const PRIO_UDP_SIZE = 300

export type FailoverSpeed = "normal" | "fast" | "faster"
export const FAILOVER_SPEEDS: FailoverSpeed[] = ["normal", "fast", "faster"]
/** Ping every `intervalS`, a gateway is down after `count` missed replies (1 s timeout each). normal = RouterOS defaults. */
export const DETECTION: Record<FailoverSpeed, { intervalS: number; count: number }> = {
  normal: { intervalS: 10, count: 2 },
  fast: { intervalS: 5, count: 2 },
  faster: { intervalS: 2, count: 3 },
}
/** About how long a dead link takes to be noticed, s. */
export const detectionSeconds = (s: FailoverSpeed) => DETECTION[s].intervalS * DETECTION[s].count

/** The speed a link is weighted and modeled with: measured when known. */
export const linkSpeed = (w: Pick<Wan, "mbps" | "measuredMbps">) => (w.measuredMbps !== null && w.measuredMbps > 0 ? w.measuredMbps : w.mbps)
/** Its upload: the one entered, or the same as the download. */
export const upSpeed = (w: Pick<Wan, "mbps" | "measuredMbps" | "upMbps">) => (w.upMbps !== null && w.upMbps > 0 ? w.upMbps : linkSpeed(w))
/** What a link carries in a direction, after its queue when the links are shaped. */
export function usableSpeed(w: Pick<Wan, "mbps" | "measuredMbps" | "upMbps">, direction: "down" | "up", q: LinkQueues): number {
  const raw = direction === "up" ? upSpeed(w) : linkSpeed(w)
  return q.shape ? shaped(raw, q) : raw
}
/** Whole Mbps a little below the link (at least 1). */
const shaped = (mbps: number, q: LinkQueues) => Math.max(1, Math.floor((mbps * q.sharePct) / 100))

/** Public IPs to watch, one per link: anycast resolvers that answer ping. */
export const DEFAULT_MONITORS = ["1.1.1.1", "8.8.8.8", "9.9.9.9", "208.67.222.222", "1.0.0.1", "8.8.4.4", "149.112.112.112", "208.67.220.220"]

/** Private and CGNAT ranges: never balanced (local traffic). */
export const LOCAL_RANGES = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "100.64.0.0/10"]

/** Most PCC slots (one mangle rule each). */
export const MAX_SLOTS = 24

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

/**
 * Whole PCC slots per link in proportion to its speed: 1G/1G/1G → 1/1/1,
 * 1G/1G/500M → 2/2/1. Capped at MAX_SLOTS (rounded, at least 1 each).
 */
export function pccWeights(mbps: number[]): number[] {
  if (mbps.length === 0) return []
  const ints = mbps.map((m) => Math.max(1, Math.round(m)))
  const g = ints.reduce((a, b) => gcd(a, b))
  let w = ints.map((x) => x / g)
  const sum = w.reduce((a, b) => a + b, 0)
  if (sum > MAX_SLOTS) {
    w = w.map((x) => Math.max(1, Math.round((x * MAX_SLOTS) / sum)))
    // Rounding can go one or two over: take them from the biggest links.
    while (w.reduce((a, b) => a + b, 0) > MAX_SLOTS && Math.max(...w) > 1) w[w.indexOf(Math.max(...w))]--
  }
  return w
}

/** Each link's PCC buckets as "first–last" (or one number), out of the total: 300/300/200/100/100 → 0–2, 3–5, 6–7, 8, 9. */
export function pccBuckets(wans: Pick<Wan, "mbps" | "measuredMbps">[]): { buckets: string[]; total: number } {
  const w = pccWeights(wans.map(linkSpeed))
  let next = 0
  const buckets = w.map((n) => {
    const first = next
    next += n
    return n === 1 ? String(first) : `${first}–${next - 1}`
  })
  return { buckets, total: next }
}

export type BalanceIssueCode =
  | "oneLink"
  | "missingIface"
  | "duplicateIface"
  | "missingMonitor"
  | "duplicateMonitor"
  | "badMonitor"
  | "missingGateway"
  | "badGateway"
  | "pppoeIface"
  | "badClients"
  | "noClients"
  | "unevenSlots"
  | "shapeNominal"
  | "netwatchRecursive"
export type BalanceIssue = { code: BalanceIssueCode; level: "error" | "warn" | "info"; wan?: string; value?: string }

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
const PHYSICAL = /^(ether|sfp|qsfp|combo|wlan|bridge|vlan)/i
const isIp = (s: string) => IPV4.test(s.trim()) && s.trim().split(".").every((o) => Number(o) <= 255)

export function checkBalance(o: BalanceOptions): BalanceIssue[] {
  const out: BalanceIssue[] = []
  if (o.wans.length < 2) out.push({ code: "oneLink", level: "info" })
  const ifaces = new Set<string>()
  const monitors = new Set<string>()
  for (const w of o.wans) {
    const iface = w.iface.trim()
    if (!iface) out.push({ code: "missingIface", level: "error", wan: w.name })
    else if (ifaces.has(iface)) out.push({ code: "duplicateIface", level: "error", wan: w.name, value: iface })
    ifaces.add(iface)
    if (w.type === "static") {
      if (!w.gateway.trim()) out.push({ code: "missingGateway", level: "error", wan: w.name })
      else if (!isIp(w.gateway)) out.push({ code: "badGateway", level: "error", wan: w.name, value: w.gateway })
    }
    // PPPoE routes go out the pppoe-out interface, not the physical port under it.
    if (w.type === "pppoe" && PHYSICAL.test(iface)) out.push({ code: "pppoeIface", level: "warn", wan: w.name, value: iface })
    if (o.failover === "recursive") {
      const m = w.monitor.trim()
      if (!m) out.push({ code: "missingMonitor", level: "error", wan: w.name })
      else if (!isIp(m)) out.push({ code: "badMonitor", level: "error", wan: w.name, value: m })
      else if (monitors.has(m)) out.push({ code: "duplicateMonitor", level: "error", wan: w.name, value: m })
      monitors.add(m)
    }
  }
  const nets = o.clients.map((c) => c.trim()).filter(Boolean)
  if (nets.length === 0) out.push({ code: "noClients", level: "error" })
  for (const n of nets) if (!parseTarget(n)) out.push({ code: "badClients", level: "error", value: n })
  // Rounded slots that don't follow the speeds closely.
  const w = pccWeights(o.wans.map(linkSpeed))
  const sumW = w.reduce((a, b) => a + b, 0)
  const sumM = o.wans.reduce((a, b) => a + Math.max(0, linkSpeed(b)), 0)
  if (sumW > 0 && sumM > 0 && o.wans.some((x, k) => Math.abs(w[k] / sumW - linkSpeed(x) / sumM) > 0.05)) out.push({ code: "unevenSlots", level: "warn" })
  // A queue above what the link really gives doesn't keep the line out of the modem.
  if (o.queues.shape) for (const x of o.wans) if (x.measuredMbps === null) out.push({ code: "shapeNominal", level: "info", wan: x.name })
  if ((o.queues.alerts || o.queues.flush) && o.failover !== "recursive") out.push({ code: "netwatchRecursive", level: "info" })
  return out
}

/** Routing table name of a link. */
export const tableOf = (w: Wan) => `to-${w.name}`

const DIRS = ["down", "up"] as const
const DIR_ES = { down: "bajada", up: "subida" } as const
/** Packet mark of a link's traffic in a direction (interactive or the rest). */
const mark = (w: Wan, dir: "down" | "up", prio: boolean) => `LB-${w.name}-${DIR_ES[dir]}${prio ? "-prioridad" : ""}`

/** The gateway as RouterOS takes it; DHCP reads what the client holds now (its lease script keeps it current). */
function gw(w: Wan): string {
  if (w.type === "static") return w.gateway.trim()
  if (w.type === "pppoe") return w.iface.trim()
  return `[/ip dhcp-client get [find where interface=${rosString(w.iface.trim())}] gateway]`
}

/** Comments of the routes, shared by the routes and the DHCP lease scripts that update them. */
const comments = {
  watch: (v: Wan) => `vigila ${v.name}`,
  table: (w: Wan, v: Wan) => `${tableOf(w)} ${v === w ? "por" : "respaldo"} ${v.name}`,
  main: (v: Wan) => `main por ${v.name}`,
}

/**
 * Lease script of a DHCP link: when it has a lease, the routes that go
 * straight to its gateway take the new one. Everything else is left alone
 * (a lost lease makes those routes unreachable, so the failover takes over).
 */
export function leaseScript(v: Wan, routeComments: string[]): string {
  const find = routeComments.map((c) => `comment=${rosString(`LB: ${c}`)}`).join(" or ")
  return `:if ([:tostr $bound] = "1") do={/ip route set [find where ${find}] gateway=$"gateway-address"}`
}

/** The RouterOS v7 script. Empty when there are errors. */
export function balanceScript(o: BalanceOptions): string {
  if (checkBalance(o).some((i) => i.level === "error") || o.wans.length === 0) return ""
  const wans = o.wans
  const weights = pccWeights(wans.map(linkSpeed))
  const slots = weights.reduce((a, b) => a + b, 0)
  const lines: string[] = []
  const add = (...l: string[]) => lines.push(...l)
  const c = (text: string) => `comment=${rosString(`LB: ${text}`)}`

  add("/routing table", ...wans.map((w) => `add name=${rosString(tableOf(w))} fib ${c(`tabla ${w.name}`)}`))

  add("/ip firewall address-list")
  for (const n of o.clients.map((x) => x.trim()).filter(Boolean)) add(`add list=LB-clientes address=${parseTarget(n)?.replace(/\/32$/, "")} ${c("clientes")}`)
  for (const r of LOCAL_RANGES) add(`add list=LB-locales address=${r} ${c("redes locales")}`)

  add("/ip firewall mangle")
  add(`add chain=prerouting action=accept src-address-list=LB-clientes dst-address-list=LB-locales ${c("trafico local sin balancear")}`)
  // Connections that start on a link (from the internet) answer through it. Only new ones: the replies to the
  // router's own pings would otherwise mark them, and when that link dies Netwatch would follow its table to a
  // backup link and still get an answer.
  for (const w of wans)
    add(
      `add chain=prerouting action=mark-connection in-interface=${rosString(w.iface.trim())} connection-state=new connection-mark=no-mark new-connection-mark=${rosString(w.name)} passthrough=yes ${c(`entra por ${w.name}`)}`
    )
  // New client connections: PCC slots in proportion to speed.
  let r = 0
  wans.forEach((w, k) => {
    for (let j = 0; j < weights[k]; j++, r++) {
      add(
        `add chain=prerouting action=mark-connection src-address-list=LB-clientes dst-address-type=!local connection-mark=no-mark connection-state=new per-connection-classifier=${o.classifier}:${slots}/${r} new-connection-mark=${rosString(w.name)} passthrough=yes ${c(`reparto a ${w.name}`)}`
      )
    }
  })
  for (const w of wans)
    add(`add chain=prerouting action=mark-routing src-address-list=LB-clientes connection-mark=${rosString(w.name)} new-routing-mark=${rosString(tableOf(w))} passthrough=no ${c(`clientes por ${w.name}`)}`)
  for (const w of wans)
    add(`add chain=output action=mark-routing connection-mark=${rosString(w.name)} new-routing-mark=${rosString(tableOf(w))} passthrough=no ${c(`respuestas del router por ${w.name}`)}`)

  // Link queues: packet marks by the link's interface (in = download, out = upload); interactive first.
  const q = o.queues
  if (q.shape) {
    for (const w of wans) {
      for (const dir of DIRS) {
        const side = `${dir === "down" ? "in" : "out"}-interface=${rosString(w.iface.trim())}`
        if (q.prio) {
          add(`add chain=forward action=mark-packet ${side} connection-bytes=0-${PRIO_BYTES} new-packet-mark=${rosString(mark(w, dir, true))} passthrough=no ${c(`${DIR_ES[dir]} ${w.name} prioridad`)}`)
          add(
            `add chain=forward action=mark-packet ${side} protocol=udp packet-size=0-${PRIO_UDP_SIZE} new-packet-mark=${rosString(mark(w, dir, true))} passthrough=no ${c(`${DIR_ES[dir]} ${w.name} prioridad`)}`
          )
        }
        add(`add chain=forward action=mark-packet ${side} new-packet-mark=${rosString(mark(w, dir, false))} passthrough=no ${c(`${DIR_ES[dir]} ${w.name}`)}`)
      }
    }
  }

  if (o.nat) add("/ip firewall nat", ...wans.map((w) => `add chain=srcnat action=masquerade out-interface=${rosString(w.iface.trim())} ${c(`NAT ${w.name}`)}`))

  add("/ip route")
  if (o.failover === "recursive") {
    // Each link watches its public IP; the routes resolve through those host routes.
    for (const w of wans) add(`add dst-address=${w.monitor.trim()}/32 gateway=${gw(w)} scope=10 ${c(comments.watch(w))}`)
    for (const w of wans) {
      for (const v of wans)
        add(
          `add dst-address=0.0.0.0/0 gateway=${v.monitor.trim()}@main routing-table=${rosString(tableOf(w))} distance=${v === w ? 1 : 2} target-scope=11 check-gateway=ping ${c(comments.table(w, v))}`
        )
    }
    for (const v of wans) add(`add dst-address=0.0.0.0/0 gateway=${v.monitor.trim()} distance=1 target-scope=11 check-gateway=ping ${c(comments.main(v))}`)
  } else {
    for (const w of wans) {
      for (const v of wans)
        add(`add dst-address=0.0.0.0/0 gateway=${gw(v)} routing-table=${rosString(tableOf(w))} distance=${v === w ? 1 : 2} check-gateway=ping ${c(comments.table(w, v))}`)
    }
    for (const v of wans) add(`add dst-address=0.0.0.0/0 gateway=${gw(v)} distance=1 check-gateway=ping ${c(comments.main(v))}`)
  }

  // DHCP links, after the routes (they read the gateway while the lease is there): the client stops
  // adding its own default route and keeps ours on the provider's current gateway.
  const dhcp = wans.filter((w) => w.type === "dhcp")
  if (dhcp.length > 0) {
    add("/ip dhcp-client")
    for (const v of dhcp) {
      const routes = o.failover === "recursive" ? [comments.watch(v)] : [...wans.map((w) => comments.table(w, v)), comments.main(v)]
      // rosString escapes the code's quotes and $ so nothing expands when it's pasted.
      add(`set [find where interface=${rosString(v.iface.trim())}] add-default-route=no script=${rosString(leaseScript(v, routes))}`)
    }
  }

  if (q.shape) {
    // CAKE leaves: fair per client (by destination going down, by source going up, behind the NAT).
    add(
      "/queue type",
      `add name=LB-bajada kind=cake cake-flowmode=dual-dsthost`,
      `add name=LB-subida kind=cake cake-flowmode=dual-srchost cake-nat=yes`,
      "/queue tree"
    )
    for (const w of wans) {
      for (const dir of DIRS) {
        const limit = rosRate(usableSpeed(w, dir, q))
        const name = `LB-${w.name}-${DIR_ES[dir]}`
        const type = `queue=${dir === "down" ? "LB-bajada" : "LB-subida"}`
        if (q.prio) {
          add(`add name=${rosString(name)} parent=global max-limit=${limit} ${c(`${DIR_ES[dir]} ${w.name}`)}`)
          add(`add name=${rosString(`${name}-prioridad`)} parent=${rosString(name)} packet-mark=${rosString(mark(w, dir, true))} priority=1 ${type} ${c(`${DIR_ES[dir]} ${w.name} prioridad`)}`)
          add(`add name=${rosString(`${name}-resto`)} parent=${rosString(name)} packet-mark=${rosString(mark(w, dir, false))} priority=8 ${type} ${c(`${DIR_ES[dir]} ${w.name} resto`)}`)
        } else {
          add(`add name=${rosString(name)} parent=global packet-mark=${rosString(mark(w, dir, false))} max-limit=${limit} ${type} ${c(`${DIR_ES[dir]} ${w.name}`)}`)
        }
      }
    }
  }

  // Netwatch through each link's host route: log lines and fresh connections when it drops or comes back.
  if ((q.alerts || q.flush) && o.failover === "recursive") {
    add("/tool netwatch")
    for (const w of wans) {
      const code = (event: "down" | "up") =>
        [q.alerts ? `:log warning ${rosString(`LB: ${w.name} ${event === "down" ? "sin internet" : "volvio"}`)}` : "", q.flush ? `/ip firewall connection remove [find where connection-mark=${rosString(w.name)}]` : ""]
          .filter(Boolean)
          .join("; ")
      add(
        `add host=${w.monitor.trim()} type=simple interval=${DETECTION[o.speed].intervalS}s down-script=${rosString(code("down"))} up-script=${rosString(code("up"))} ${c(`aviso ${w.name}`)}`
      )
    }
  }

  // Faster detection: router-wide timers for every route with check-gateway.
  if (o.speed !== "normal") {
    const d = DETECTION[o.speed]
    add("/routing settings", `set check-gateway-ping-interval=${d.intervalS}s check-gateway-ping-timeout=1s check-gateway-ping-count=${d.count}`)
  }
  return lines.join("\n")
}

/** The undo commands; with faster detection they also put the RouterOS default timers back. */
export function balanceUndo(speed: FailoverSpeed): string {
  if (speed === "normal") return BALANCE_UNDO
  const d = DETECTION.normal
  return `${BALANCE_UNDO}\n/routing settings set check-gateway-ping-interval=${d.intervalS}s check-gateway-ping-timeout=1s check-gateway-ping-count=${d.count}`
}

/** Commands that undo the script (everything it adds carries an "LB: " comment, queue types an "LB-" name; DHCP clients get their default route back). */
export const BALANCE_UNDO = [
  '/ip dhcp-client set [find where script~"LB: "] add-default-route=yes script=""',
  '/tool netwatch remove [find where comment~"^LB: "]',
  '/queue tree remove [find where comment~"^LB: "]',
  '/queue type remove [find where name~"^LB-"]',
  '/ip route remove [find where comment~"^LB: "]',
  '/ip firewall nat remove [find where comment~"^LB: "]',
  '/ip firewall mangle remove [find where comment~"^LB: "]',
  '/ip firewall address-list remove [find where comment~"^LB: "]',
  '/routing table remove [find where comment~"^LB: "]',
].join("\n")

/** Example links: the owner's 3 × 1 Gbps over DHCP (interfaces to fill in). */
export function defaultWans(n = 3): Wan[] {
  return Array.from({ length: n }, (_, k) => ({
    name: `WAN${k + 1}`,
    type: "dhcp" as const,
    iface: `ether${k + 1}`,
    gateway: "",
    mbps: 1000,
    measuredMbps: null,
    upMbps: null,
    upstreamCgnat: false,
    monitor: DEFAULT_MONITORS[k % DEFAULT_MONITORS.length],
  }))
}
