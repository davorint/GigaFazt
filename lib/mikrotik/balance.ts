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
 * - How each link gets its address: a fixed IP (its gateway typed in), DHCP
 *   (the routes take the gateway the DHCP client holds when the script is
 *   pasted; the client stops adding its own default route and gets a lease
 *   script that sets the new gateway on exactly those routes when the
 *   provider changes it: `$bound`, `$"gateway-address"`, help.mikrotik.com
 *   DHCP), or PPPoE (the pppoe-out interface is the gateway).
 *
 * Pure functions; the UI shows the text and its notes.
 */

import { parseTarget } from "./bulk"
import { rosString } from "./routeros"

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
  /** Link speed, Mbps (PCC weight). */
  mbps: number
  /** Public IP watched through this link (recursive failover). */
  monitor: string
}

export type BalanceOptions = {
  wans: Wan[]
  /** Client networks to balance (CIDR). */
  clients: string[]
  classifier: Classifier
  failover: Failover
  nat: boolean
}

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
  if (sum > MAX_SLOTS) w = w.map((x) => Math.max(1, Math.round((x * MAX_SLOTS) / sum)))
  return w
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
  const w = pccWeights(o.wans.map((x) => x.mbps))
  const sumW = w.reduce((a, b) => a + b, 0)
  const sumM = o.wans.reduce((a, b) => a + Math.max(0, b.mbps), 0)
  if (sumW > 0 && sumM > 0 && o.wans.some((x, k) => Math.abs(w[k] / sumW - x.mbps / sumM) > 0.05)) out.push({ code: "unevenSlots", level: "warn" })
  return out
}

/** Routing table name of a link. */
export const tableOf = (w: Wan) => `to-${w.name}`

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
  const weights = pccWeights(wans.map((w) => w.mbps))
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
  // Connections that arrive on a link answer through it.
  for (const w of wans)
    add(`add chain=prerouting action=mark-connection in-interface=${rosString(w.iface.trim())} connection-mark=no-mark new-connection-mark=${rosString(w.name)} passthrough=yes ${c(`entra por ${w.name}`)}`)
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
  return lines.join("\n")
}

/** Commands that undo the script (everything it adds carries an "LB: " comment; DHCP clients get their default route back). */
export const BALANCE_UNDO = [
  '/ip dhcp-client set [find where script~"LB: "] add-default-route=yes script=""',
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
    monitor: DEFAULT_MONITORS[k % DEFAULT_MONITORS.length],
  }))
}
