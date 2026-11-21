/**
 * Staff access to the routers (owner, 2026-11-21: "connect to the routers via the REST API", "a READ ONLY mode", then
 * "make both MIKROTIK API and REST API available" with "a toggle to specify the connection mode"): each router is
 * reached by its REST API (HTTPS, www-ssl) or by the MikroTik API over TLS (api-ssl), as its toggle says. The agent
 * (lib/wispdavor/routers.ts) keeps the automatic work.
 *
 * Both speak the same operations here (print, set, remove, add, a command), so the read-only rules are one:
 * - every operation is classed as reading or writing; reading always goes with the read-only RouterOS user, writing
 *   only when the router's "Solo lectura" switch is off and a write user is set;
 * - the read-only user's group has only read, api and rest-api (the built-in "read" group also has reboot and
 *   sensitive: MikroTik manual, REST API), so the router itself refuses any change made with it.
 *
 * From the MikroTik manual (manual.mikrotik.com, RouterOS 7.26, read 2026-11-21):
 * - REST: GET = print (query parameters filter, exact match), PATCH = set (URL + item id, "*" not encoded), PUT = add,
 *   DELETE = remove, POST = any command with a JSON body (Content-Type: application/json, else 415); every value comes
 *   back as a string; errors are {error, message, detail}; a request is cut at 60 s; the group needs rest-api AND api.
 * - API: words with a length prefix, a sentence ends with an empty word; commands like /ppp/secret/print, attributes
 *   =name=value, queries ?name=value (print only), replies !re / !done / !trap (=message=) / !fatal / !empty; login is
 *   /login =name= =password= in plain text, so only api-ssl (8729) with a certificate is used here.
 * - /execute with as-string waits and returns the script's output; running /export that way: VERIFICAR (the manual's
 *   export over REST writes a file, which needs more than read).
 */

export type Protocol = "rest" | "api"
export const PROTOCOLS = ["rest", "api"] as const

/** One operation on a router, the same over REST and the API. `menu` is like "/ppp/secret". */
export type Op =
  | { kind: "print"; menu: string; where?: Record<string, string>; proplist?: string[] }
  | { kind: "set"; menu: string; id: string; props: Record<string, string> }
  | { kind: "remove"; menu: string; id: string }
  | { kind: "add"; menu: string; props: Record<string, string> }
  | { kind: "cmd"; menu: string; cmd: string; params: Record<string, string>; proplist?: string[] }

/** The config export runs as a script: only this exact one counts as reading. */
export const EXPORT_SCRIPT = "/export terse"

/** Whether an operation only reads (can go in read-only mode with the read user). */
export function isReadOp(op: Op): boolean {
  if (op.kind === "print") return true
  if (op.kind !== "cmd") return false
  if (op.menu === "/interface" && op.cmd === "monitor-traffic") return true
  return op.menu === "" && op.cmd === "execute" && op.params.script === EXPORT_SCRIPT
}

/** A menu path: lowercase words and dashes between slashes ("" = the root, for /execute). */
export const safeMenu = (m: string) => m === "" || /^(\/[a-z0-9-]{1,40}){1,6}$/.test(m)
const safeKey = (k: string) => /^\.?[a-z0-9-]{1,40}$/.test(k)
/** A RouterOS item id (*1F). */
export const safeId = (id: string) => /^\*[0-9A-F]{1,8}$/.test(id)
/** Values: no control characters (an API word could carry them; a REST body never needs them). */
const safeValue = (v: string) => !/[\x00-\x1f]/.test(v) && v.length <= 1000

/** Checks an operation before it leaves; answers what's wrong, or "" when fine. */
export function opProblem(op: Op): string {
  if (!safeMenu(op.menu)) return "menu"
  const kv = (o: Record<string, string> = {}) => Object.entries(o).every(([k, v]) => safeKey(k) && safeValue(v))
  if (op.kind === "print") return kv(op.where) && (op.proplist ?? []).every(safeKey) ? "" : "value"
  if (op.kind === "set" || op.kind === "remove") {
    if (!safeId(op.id)) return "id"
    return op.kind === "set" && !kv(op.props) ? "value" : ""
  }
  if (op.kind === "add") return kv(op.props) ? "" : "value"
  return /^[a-z0-9-]{1,40}$/.test(op.cmd) && kv(op.params) && (op.proplist ?? []).every(safeKey) ? "" : "value"
}

/** The REST request for an operation (path after /rest). */
export function opToRest(op: Op): { method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; path: string; body?: Record<string, string> } {
  if (op.kind === "print") {
    const q = new URLSearchParams({ ...(op.where ?? {}), ...(op.proplist?.length ? { ".proplist": op.proplist.join(",") } : {}) }).toString()
    return { method: "GET", path: `${op.menu}${q ? `?${q}` : ""}` }
  }
  if (op.kind === "set") return { method: "PATCH", path: `${op.menu}/${op.id}`, body: op.props }
  if (op.kind === "remove") return { method: "DELETE", path: `${op.menu}/${op.id}` }
  if (op.kind === "add") return { method: "PUT", path: op.menu, body: op.props }
  return { method: "POST", path: `${op.menu}/${op.cmd}`, body: { ...op.params, ...(op.proplist?.length ? { ".proplist": op.proplist.join(",") } : {}) } }
}

/** The API sentence (words) for an operation. */
export function opToApi(op: Op): string[] {
  const attrs = (o: Record<string, string> = {}) => Object.entries(o).map(([k, v]) => `=${k}=${v}`)
  const props = (p?: string[]) => (p?.length ? [`=.proplist=${p.join(",")}`] : [])
  if (op.kind === "print") return [`${op.menu}/print`, ...props(op.proplist), ...Object.entries(op.where ?? {}).map(([k, v]) => `?${k}=${v}`)]
  if (op.kind === "set") return [`${op.menu}/set`, `=.id=${op.id}`, ...attrs(op.props)]
  if (op.kind === "remove") return [`${op.menu}/remove`, `=.id=${op.id}`]
  if (op.kind === "add") return [`${op.menu}/add`, ...attrs(op.props)]
  return [`${op.menu}/${op.cmd}`, ...attrs(op.params), ...props(op.proplist)]
}

/** A hostname (Dynu, MikroTik cloud, any DNS name) or an IPv4 address. */
export const validHost = (h: string) => /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(h) || /^(\d{1,3}\.){3}\d{1,3}$/.test(h)

/** A SHA-256 certificate fingerprint in any common form → 64 lowercase hex characters, or "" when not one. */
export function normalizeFingerprint(s: string): string {
  const hex = s.replace(/^sha256[:=]?/i, "").replace(/[\s:]/g, "").toLowerCase()
  return /^[0-9a-f]{64}$/.test(hex) ? hex : ""
}

/** The RouterOS commands to set a router up for the site, shown in WispDavor (owner to run them in the terminal). */
export function setupCommands(o: { restPort: number; apiPort: number; dnsName: string }): string {
  const dns = o.dnsName || "router.ejemplo.dynu.net"
  return [
    "# WispDavor: acceso REST y API (RouterOS 7). Corre esto en la terminal del router.",
    "# 1) Certificado (sin certificado www-ssl y api-ssl solo ofrecen cifrados anónimos y no conectan):",
    "#    Let's Encrypt para el nombre DDNS (necesita el puerto 80 abierto mientras se emite) …",
    `/certificate enable-ssl-certificate dns-name=${dns}`,
    "#    … o uno propio (luego copia su huella SHA-256 en WispDavor):",
    `# /certificate add name=wispdavor common-name=${dns} days-valid=3650 key-size=2048; /certificate sign wispdavor`,
    "# /certificate print detail where name=wispdavor   (campo fingerprint)",
    "# 2) Servicios con certificado, en puertos no estándar; HTTP y API sin cifrar apagados.",
    `/ip service set www-ssl disabled=no port=${o.restPort} certificate=[/certificate find where common-name="${dns}"]`,
    `/ip service set api-ssl disabled=no port=${o.apiPort} certificate=[/certificate find where common-name="${dns}"]`,
    "/ip service set www disabled=yes",
    "/ip service set api disabled=yes",
    "# 3) Grupos propios (los grupos read/write/full de fábrica incluyen reboot y sensitive: no los uses).",
    "/user group add name=wispdavor-lectura policy=read,api,rest-api",
    "/user group add name=wispdavor-escritura policy=read,write,api,rest-api",
    "/user add name=wispdavor-lectura group=wispdavor-lectura password=CAMBIA-ESTA-CONTRASENA",
    "# Solo si vas a hacer cambios desde WispDavor:",
    "/user add name=wispdavor-escritura group=wispdavor-escritura password=OTRA-CONTRASENA",
  ].join("\n")
}

export const bps = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} Gbps` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} Mbps` : n >= 1e3 ? `${(n / 1e3).toFixed(0)} kbps` : `${n} bps`)

/** RouterOS gives numbers and booleans as strings. */
export const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
export const bool = (v: unknown) => v === true || v === "true" || v === "yes"
