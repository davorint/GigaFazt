/**
 * Fixed CGNAT (port blocks): every client address always leaves a link through the same public IP and the same
 * port range, so "public IP + port" gives back the client without a NAT log (RFC 7422; MikroTik's NAT manual,
 * section "CGNAT (NAT444)", builds the same thing with jump chains and src-nat to-ports).
 *
 * Each link maps the whole pool (any client can end up on any link: balancing and failover move them).
 */
import { rosString } from "./routeros"

/** Ports handed out: 1024–65535 (below 1024 stays out). */
export const PORT_FIRST = 1024
export const PORT_COUNT = 65536 - PORT_FIRST
/** Client addresses per jump chain: a new connection checks at most pool/64 jumps + 128 rules. */
export const GROUP = 64
/** Below this many ports per client, warn (a port is reused for different destinations, so it's the cap on connections to one server). */
/** Ports per client below which the fixed blocks warn: 1,024 is the usual starting point (MikroTik's ISP guide gives 1,000–4,000 by profile; RFC 6888 only requires a configurable limit). */
export const MIN_PORTS = 1024
export const MAX_PUBLIC_IPS = 256

const ipToInt = (ip: string) => ip.split(".").reduce((a, o) => a * 256 + Number(o), 0)
export const intToIp = (n: number) => [24, 16, 8, 0].map((s) => Math.floor(n / 2 ** s) % 256).join(".")
const isIp = (s: string) => /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(s) && s.split(".").every((o) => Number(o) <= 255)

/** Consecutive public IPs: one address or "first-last". */
export type PublicIps = { first: number; count: number }

/** "" = the link's own address (masquerade, works with DHCP and PPPoE); null = not valid. */
export function parsePublicIps(text: string): PublicIps | "own" | null {
  const t = text.trim()
  if (!t) return "own"
  const [a, b] = t.split("-").map((x) => x.trim())
  if (!isIp(a) || (b !== undefined && !isIp(b))) return null
  const first = ipToInt(a)
  const last = b === undefined ? first : ipToInt(b)
  const count = last - first + 1
  return count >= 1 && count <= MAX_PUBLIC_IPS ? { first, count } : null
}

export type NatLink = { name: string; iface: string; natIps: string }

/** How one link hands out its ports. */
export type NatLayout = {
  link: string
  iface: string
  /** null = the link's own address. */
  ips: PublicIps | null
  /** First client address (the pool's .2) and how many. */
  base: number
  hosts: number
  /** Clients that share one public IP, and the ports each gets. */
  perIp: number
  block: number
}

/** The pool: router .1, clients from .2 to the one before the broadcast (as the PPPoE pool hands them out). */
export function natLayout(pool: { net: number; prefix: number }, link: NatLink): NatLayout | null {
  const ips = parsePublicIps(link.natIps)
  if (ips === null) return null
  const hosts = Math.max(0, 2 ** (32 - pool.prefix) - 3)
  const count = ips === "own" ? 1 : ips.count
  const perIp = Math.max(1, Math.ceil(hosts / count))
  return { link: link.name, iface: link.iface.trim(), ips: ips === "own" ? null : ips, base: pool.net + 2, hosts, perIp, block: Math.floor(PORT_COUNT / perIp) }
}

/** Where client number k (0 = the pool's .2) leaves. */
export function natOf(l: NatLayout, k: number): { address: string; ip: string | null; from: number; to: number } {
  const from = PORT_FIRST + (k % l.perIp) * l.block
  return { address: intToIp(l.base + k), ip: l.ips ? intToIp(l.ips.first + Math.floor(k / l.perIp)) : null, from, to: from + l.block - 1 }
}

/** The client behind a public IP and port on a link; null = no client has that port. ip ignored for the link's own address. */
export function natLookup(l: NatLayout, ip: string, port: number): { address: string; from: number; to: number; ip: string | null } | null {
  if (!Number.isInteger(port) || port < PORT_FIRST || port > 65535) return null
  const slot = Math.floor((port - PORT_FIRST) / l.block)
  if (slot >= l.perIp) return null
  let index = 0
  if (l.ips) {
    if (!isIp(ip.trim())) return null
    index = ipToInt(ip.trim()) - l.ips.first
    if (index < 0 || index >= l.ips.count) return null
  }
  const k = index * l.perIp + slot
  return k < l.hosts ? natOf(l, k) : null
}

/**
 * RouterOS v7: a jump from srcnat (moved to the top, ahead of the balancing's masquerade), one chain per 64 clients,
 * a TCP and a UDP rule per client, and the rest of the protocols (ping…) at the end. Written as a loop, like the
 * manual's example, so it pastes in seconds; wrapped in { } so its :local variables live through the paste.
 */
export function natScript(l: NatLayout, poolText: string): string {
  const tag = `DS: CGNAT ${l.link}`
  const chain = `DS-cg-${l.link}`
  const c = rosString(tag)
  const to = (proto: string) =>
    l.ips
      ? `action=src-nat to-addresses=($pub + ($k / $per)) to-ports="$p-$q" protocol=${proto} src-address=$a comment=${c}`
      : `action=masquerade to-ports="$p-$q" protocol=${proto} src-address=$a comment=${c}`
  return [
    "/ip firewall nat",
    `add chain=srcnat action=jump jump-target=${rosString(chain)} out-interface=${rosString(l.iface)} src-address=${poolText} comment=${c}`,
    `:do {/ip firewall nat move [find where chain=srcnat and comment=${c}] destination=0} on-error={}`,
    "{",
    `:local base ${intToIp(l.base)}`,
    `:local hosts ${l.hosts}`,
    `:local per ${l.perIp}`,
    `:local block ${l.block}`,
    ...(l.ips ? [`:local pub ${intToIp(l.ips.first)}`] : []),
    ":for k from=0 to=($hosts - 1) do={",
    `  :local g ($k / ${GROUP})`,
    "  :local a ($base + $k)",
    `  :if (($k % ${GROUP}) = 0) do={/ip firewall nat add chain="${chain}" action=jump jump-target="${chain}-$g" src-address="$a-$($a + ${GROUP - 1})" comment=${c}}`,
    `  :local p (${PORT_FIRST} + (($k % $per) * $block))`,
    "  :local q ($p + $block - 1)",
    `  /ip firewall nat add chain="${chain}-$g" ${to("tcp")}`,
    `  /ip firewall nat add chain="${chain}-$g" ${to("udp")}`,
    "}",
    "}",
    l.ips
      ? `/ip firewall nat add chain=${rosString(chain)} action=src-nat to-addresses=${intToIp(l.ips.first)} comment=${rosString(`${tag} otros protocolos`)}`
      : `/ip firewall nat add chain=${rosString(chain)} action=masquerade comment=${rosString(`${tag} otros protocolos`)}`,
  ].join("\n")
}
