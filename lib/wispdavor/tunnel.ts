/**
 * Reaching the routers without a public IP (WispDavor phase 11, owner 2026-11-22: "do all"). The carrier links have no
 * public IP, so Router en vivo (REST / MikroTik API) can't reach a MikroTik directly. Each MikroTik dials a small server
 * of the owner's (a VPS with a public IP) over WireGuard; the VPS forwards one public TCP port per router service to
 * that router's address inside the tunnel. The site then connects to <VPS>:<port>, and TLS still goes end to end to the
 * router (its certificate pinned by SHA-256): the VPS only passes bytes, never sees passwords.
 *
 * Addresses: 10.77.0.1 = the VPS; routers from 10.77.0.2 up (one each). Ports on the VPS: BASE_PORT + 2·n (REST) and
 * BASE_PORT + 2·n + 1 (API), n = the router's number in the tunnel. Pure generators here; storage in tunnel-server.ts.
 */

export const TUNNEL_NET = "10.77.0"
export const VPS_TUNNEL_IP = `${TUNNEL_NET}.1`
export const WG_PORT = 51820
export const BASE_PORT = 20000
export const WG_IFACE = "wg-gigafazt"
/** Routers in the tunnel: .2 to .254. */
export const MAX_PEERS = 253

export type TunnelSettings = { host: string; publicKey: string; port: number }
export const EMPTY_SETTINGS: TunnelSettings = { host: "", publicKey: "", port: WG_PORT }

export type Peer = { routerId: string; name: string; n: number; publicKey: string; restPort: number; apiPort: number }

/** A WireGuard key as wg prints it: 32 bytes in base64 (44 characters ending in "="). */
export const validKey = (k: string) => /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/.test(k.trim())
/** A host name or IPv4 the VPS answers on. */
export const validHost = (h: string) => /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/i.test(h) || /^(\d{1,3})(\.\d{1,3}){3}$/.test(h)

export const peerIp = (n: number) => `${TUNNEL_NET}.${n + 1}`
export const forwardPorts = (n: number) => ({ rest: BASE_PORT + 2 * n, api: BASE_PORT + 2 * n + 1 })

export function decodeSettings(v: unknown): TunnelSettings {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>
  const host = typeof o.host === "string" && validHost(o.host.trim().toLowerCase()) ? o.host.trim().toLowerCase() : ""
  const publicKey = typeof o.publicKey === "string" && validKey(o.publicKey) ? o.publicKey.trim() : ""
  const port = typeof o.port === "number" && Number.isInteger(o.port) && o.port >= 1 && o.port <= 65535 ? o.port : WG_PORT
  return { host, publicKey, port }
}

/** The lowest free number for a new router in the tunnel (null = full). */
export function nextNumber(used: number[]): number | null {
  const set = new Set(used)
  for (let n = 1; n <= MAX_PEERS; n++) if (!set.has(n)) return n
  return null
}

const q = (s: string) => `"${s.replace(/[\\"$]/g, (c) => `\\${c}`)}"`

/**
 * The MikroTik's side (RouterOS 7): its WireGuard interface (the router makes its own private key), the VPS as its only
 * peer (keepalive every 25 s keeps the carrier's NAT open), its address in the tunnel, and a firewall rule that lets
 * only the VPS reach the REST / API ports through the tunnel. Last line prints the router's public key to paste back.
 */
export function routerScript(s: TunnelSettings, p: Pick<Peer, "n" | "name">, ports: { rest: number; api: number }): string {
  return [
    `# WispDavor: túnel WireGuard hacia el servidor (${p.name}). RouterOS 7. Pega todo en la terminal del router.`,
    `/interface wireguard add name=${WG_IFACE} listen-port=13231 comment="WispDavor"`,
    `/interface wireguard peers add interface=${WG_IFACE} public-key=${q(s.publicKey || "LLAVE-PUBLICA-DEL-SERVIDOR")} endpoint-address=${s.host || "servidor.ejemplo.com"} endpoint-port=${s.port} allowed-address=${VPS_TUNNEL_IP}/32 persistent-keepalive=25s comment="WispDavor"`,
    `/ip address add address=${peerIp(p.n)}/24 interface=${WG_IFACE} comment="WispDavor"`,
    // place-before=0 fails on a router without filter rules (then nothing is blocked and the rule just goes in).
    `:if ([:len [/ip firewall filter find]] > 0) do={ /ip firewall filter add chain=input in-interface=${WG_IFACE} src-address=${VPS_TUNNEL_IP} protocol=tcp dst-port=${ports.rest},${ports.api} action=accept place-before=0 comment="WispDavor: REST y API por el tunel" } else={ /ip firewall filter add chain=input in-interface=${WG_IFACE} src-address=${VPS_TUNNEL_IP} protocol=tcp dst-port=${ports.rest},${ports.api} action=accept comment="WispDavor: REST y API por el tunel" }`,
    "# Copia esta llave pública y pégala en WispDavor → Túnel:",
    `:put [/interface wireguard get [find name=${WG_IFACE}] public-key]`,
  ].join("\n")
}

/**
 * The VPS's side (Ubuntu or Debian, as root): WireGuard with every router as a peer, and nftables forwarding each
 * router's two public ports to its REST / API port inside the tunnel (the router sees 10.77.0.1, which its firewall
 * rule lets in). The VPS's private key stays on it (made the first time; this script never contains it).
 */
export function vpsScript(s: TunnelSettings, peers: Peer[]): string {
  const lines = [
    "#!/bin/sh",
    "# WispDavor: servidor del túnel (Ubuntu/Debian, como root). Se puede volver a correr: rehace la configuración.",
    "set -e",
    "apt-get update -qq && apt-get install -y -qq wireguard nftables",
    "umask 077",
    "[ -f /etc/wireguard/privada ] || wg genkey > /etc/wireguard/privada",
    'echo "Llave pública del servidor (pégala en WispDavor → Túnel):"',
    "wg pubkey < /etc/wireguard/privada",
    "cat > /etc/wireguard/wg0.conf <<EOF",
    "[Interface]",
    `Address = ${VPS_TUNNEL_IP}/24`,
    `ListenPort = ${s.port}`,
    "PostUp = wg set %i private-key /etc/wireguard/privada",
    ...peers.filter((p) => validKey(p.publicKey)).flatMap((p) => ["", `# ${p.name.replace(/[\r\n]/g, " ")}`, "[Peer]", `PublicKey = ${p.publicKey}`, `AllowedIPs = ${peerIp(p.n)}/32`]),
    "EOF",
    "sysctl -w net.ipv4.ip_forward=1 >/dev/null",
    "echo net.ipv4.ip_forward=1 > /etc/sysctl.d/99-wispdavor.conf",
    "# Solo se reemplaza la tabla de WispDavor; las demás reglas del firewall del servidor se quedan como están.",
    "cat > /etc/wispdavor.nft <<EOF",
    "table ip wispdavor",
    "delete table ip wispdavor",
    "table ip wispdavor {",
    "  chain pre {",
    "    type nat hook prerouting priority dstnat;",
    ...peers.flatMap((p) => [`    tcp dport ${forwardPorts(p.n).rest} dnat to ${peerIp(p.n)}:${p.restPort}`, `    tcp dport ${forwardPorts(p.n).api} dnat to ${peerIp(p.n)}:${p.apiPort}`]),
    "  }",
    "  chain post {",
    "    type nat hook postrouting priority srcnat;",
    '    oifname "wg0" masquerade',
    "  }",
    "}",
    "EOF",
    "grep -q wispdavor.nft /etc/nftables.conf 2>/dev/null || echo 'include \"/etc/wispdavor.nft\"' >> /etc/nftables.conf",
    "nft -f /etc/wispdavor.nft",
    "systemctl enable nftables >/dev/null 2>&1 || true",
    "systemctl enable wg-quick@wg0 >/dev/null 2>&1",
    "systemctl restart wg-quick@wg0",
    "# Con ufw encendido, el tráfico reenviado se bloquea por omisión: se permite para el túnel.",
    `if command -v ufw >/dev/null && ufw status | grep -q " active"; then ufw route allow out on wg0; ufw allow ${s.port}/udp; ufw allow ${BASE_PORT}:${BASE_PORT + 2 * MAX_PEERS + 1}/tcp; fi`,
    `echo "Listo. Abre en el firewall del proveedor: UDP ${s.port} y TCP ${BASE_PORT}-${BASE_PORT + 2 * MAX_PEERS + 1}."`,
  ]
  return lines.join("\n")
}
