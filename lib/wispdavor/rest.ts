/**
 * The RouterOS REST API (owner, 2026-11-21: "connect to the routers via the REST API" and "a READ ONLY mode"): the
 * site calls https://<host>:<port>/rest/... with HTTP basic auth. The agent (lib/wispdavor/routers.ts) keeps doing the
 * automatic work; REST is for staff: live view, client lookup, staff actions and config backups (owner's choices).
 *
 * Read only, twice over (owner: "per-router switch + read-only user"):
 * - every request is classed here as reading or writing; reading always goes with the read-only RouterOS user (group
 *   "read"), writing only when the router's "Solo lectura" switch is off and a write user is set;
 * - so even a mistake on the site can't change a router in read-only mode: its user can't write.
 *
 * RouterOS REST (MikroTik docs, RouterOS 7): GET reads (filters as query parameters), PATCH changes a record by its .id,
 * PUT adds one, DELETE removes one, POST runs a command (…/print, monitor-traffic, execute). Exact behavior of
 * monitor-traffic's "once" and of execute with as-string on the owner's version: VERIFICAR.
 */

export type RestMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE"

/** POST commands that only read (print with filters, live interface rates). */
const READ_COMMANDS = [/\/print$/, /^\/interface\/monitor-traffic$/]
/** The config export runs as a script: only this exact one counts as reading. */
export const EXPORT_SCRIPT = "/export terse"

/** Whether a request only reads (can go in read-only mode with the read user). */
export function isReadRequest(method: RestMethod, path: string, body?: unknown): boolean {
  if (method === "GET") return true
  if (method !== "POST") return false
  if (READ_COMMANDS.some((re) => re.test(path))) return true
  return path === "/execute" && typeof body === "object" && body !== null && (body as Record<string, unknown>).script === EXPORT_SCRIPT
}

/** A path under /rest: letters, digits, dashes, slashes and RouterOS ids (*1F); never "..". */
export const safePath = (p: string) => /^\/[\w\-/*]{1,120}$/.test(p) && !p.includes("..")

/** A hostname (Dynu, MikroTik cloud, any DNS name) or an IPv4 address. */
export const validHost = (h: string) => /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(h) || /^(\d{1,3}\.){3}\d{1,3}$/.test(h)

/** A SHA-256 certificate fingerprint in any common form → 64 lowercase hex characters, or "" when not one. */
export function normalizeFingerprint(s: string): string {
  const hex = s.replace(/^sha256[:=]?/i, "").replace(/[\s:]/g, "").toLowerCase()
  return /^[0-9a-f]{64}$/.test(hex) ? hex : ""
}

export type RestStatus = "off" | "ready" | "no-key"

/** The RouterOS commands to set a router up for the site, shown in WispDavor (owner to run them in Winbox/terminal). */
export function setupCommands(o: { port: number; dnsName: string }): string {
  const dns = o.dnsName || "router.ejemplo.dynu.net"
  return [
    "# WispDavor: acceso REST (RouterOS 7). Corre esto en la terminal del router.",
    "# 1) Certificado: Let's Encrypt para el nombre DDNS (necesita el puerto 80 abierto un momento) …",
    `/certificate enable-ssl-certificate dns-name=${dns}`,
    "# … o uno propio (luego copia su huella SHA-256 en WispDavor):",
    `# /certificate add name=wispdavor common-name=${dns} days-valid=3650 key-size=2048; /certificate sign wispdavor`,
    `# /certificate print detail where name=wispdavor   (campo fingerprint)`,
    "# 2) Servicio HTTPS en un puerto no estándar; HTTP apagado.",
    `/ip service set www-ssl disabled=no port=${o.port} certificate=[/certificate find where common-name="${dns}"]`,
    "/ip service set www disabled=yes",
    "# 3) Usuario de solo lectura (siempre) y, si vas a hacer cambios desde WispDavor, uno de escritura.",
    "/user add name=wispdavor-lectura group=read password=CAMBIA-ESTA-CONTRASENA",
    "/user group add name=wispdavor-escritura policy=read,write,test,api,rest-api,policy",
    "/user add name=wispdavor-escritura group=wispdavor-escritura password=OTRA-CONTRASENA",
    "# VERIFICAR en tu versión: que el grupo read incluya rest-api (/user group print).",
  ].join("\n")
}

export const bps = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} Gbps` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} Mbps` : n >= 1e3 ? `${(n / 1e3).toFixed(0)} kbps` : `${n} bps`)

/** RouterOS gives numbers and booleans as strings. */
export const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
export const bool = (v: unknown) => v === true || v === "true" || v === "yes"
