/**
 * Third set of expert scripts (owner, 2026-11-17: "do 1 to 5", after a web search for scripts other ISPs run): a client
 * sheet for technicians, stuck and flapping PPPoE sessions, the client pool filling up, the connection table filling
 * up (with the clients that hold the most), and the health of the router's ports and SFP optics.
 *
 * Same conventions as advanced.ts: comments "DSX <module>: …", DSX- names, each with its undo; alerts go through the
 * base's DS-aviso (Telegram or e-mail). Field reports behind each one: stale sessions that keep a client out with
 * "already active" (CCR2216, RouterOS 7.21.4, MikroTik forum), PPPoE servers whose pool ran out, "connection tracking
 * table full" on CGNAT routers, SFP receive power read with `/interface ethernet monitor … once as-value`. Menus and
 * properties checked against the RouterOS 7.25 CLI reference; none of it was run on a real router.
 */
import { rosString } from "./routeros"
import { GUARD, STMT, comment, done, dropScripts, fail, hasError, nets, removeAll, step, type AdvContext, type AdvIssue, type AdvResult } from "./advanced"

/** One-line RouterOS source from statements. */
const src = (parts: string[]) => parts.join(STMT).replace(/\{; /g, "{").replace(/; \}/g, "}")
/** A message to the phone through the base's DS-aviso, or the log when the deployment has no alerts. */
const tell = (alerts: boolean, expr: string) => (alerts ? `:global DSmsg (${expr}); /system script run DS-aviso` : `:log warning (${expr})`)
const hasAlerts = (ctx: AdvContext) => ctx.setup.alert !== "none"
const stored = (name: string, body: string, what: string, c: (t: string) => string) => `add name=${name} policy=read,write,test dont-require-permissions=yes source=${rosString(body)} ${c(what)}`
const int = (v: number, min: number, max: number) => Number.isInteger(v) && v >= min && v <= max

// ── 1 Client sheet for technicians ──────────────────────────────────────────

/** Name of the global function the sheet defines (called from the terminal as `$DSXficha usuario`). */
export const SHEET_FN = "DSXficha"
/** The terminal line that shows one client's sheet. */
export const sheetCommand = (user: string) => `:global ${SHEET_FN}; $${SHEET_FN} ${rosString(user.trim() || "usuario")}`

/**
 * `$DSXficha usuario` prints, for one client: the account (plan, speed, disabled), the last disconnect (when, why, from
 * which ONT), and when online the session (uptime, address, ONT MAC), the speed right now, the open connections and a
 * ping to the ONT. Defined at startup by a stored script, the way eworm's routeros-scripts define their functions.
 */
export function sheetScript(ctx: AdvContext): AdvResult {
  const issues: AdvIssue[] = []
  if (!nets(ctx, issues)) return fail(issues)
  const c = comment("ficha")
  const fn = src([
    `:global ${SHEET_FN} do={:local u [:tostr $1]`,
    ':if ([:len $u] = 0) do={:put "uso: escribe el usuario PPPoE despues del nombre"; :return ""}',
    ":local s [/ppp secret find where name=$u]",
    ':if ([:len $s] = 0) do={:put ("no hay cuenta PPPoE " . $u); :return ""}',
    ":local pr [/ppp secret get $s profile]; :local rl [/ppp profile get [/ppp profile find where name=$pr] rate-limit]",
    ':put ("cuenta " . $u . " | plan " . $pr . " | velocidad " . $rl)',
    ':if ([/ppp secret get $s disabled]) do={:put "LA CUENTA ESTA DESACTIVADA"}',
    ':put ("ultima salida: " . [/ppp secret get $s last-logged-out] . " | motivo: " . [/ppp secret get $s last-disconnect-reason] . " | equipo: " . [/ppp secret get $s last-caller-id])',
    ":local a [/ppp active find where name=$u]",
    ':if ([:len $a] = 0) do={:put "SIN CONEXION AHORA"; :return ""}',
    ":local ip [/ppp active get $a address]",
    ':put ("conectado hace " . [/ppp active get $a uptime] . " | IP " . $ip . " | ONT " . [/ppp active get $a caller-id])',
    ':local i ("<pppoe-" . $u . ">")',
    ':if ([:len [/interface find where name=$i]] > 0) do={:local m [/interface monitor-traffic $i once as-value]; :put ("ahora: baja " . (($m->"tx-bits-per-second") / 1000000) . " Mbps | sube " . (($m->"rx-bits-per-second") / 1000000) . " Mbps")}',
    ':put ("conexiones abiertas: " . [/ip firewall connection print count-only where src-address~("^" . $ip . ":")])',
    ':put ("ping al ONT: " . [/tool ping address=$ip count=5 interval=200ms] . " de 5")}',
  ])
  const drop = dropScripts("^DSX-ficha$")
  return done(
    [
      step("script", [GUARD.base, ...drop, "/system script", stored("DSX-ficha", fn, "ficha del cliente", c), "/system script run DSX-ficha"], sheetCommand("usuario")),
      step("inicio", ["/system scheduler", `add name=DSX-ficha start-time=startup on-event=DSX-ficha ${c("al arrancar")}`], '/system scheduler print where name="DSX-ficha"'),
    ],
    [...drop, `:do {/system script environment remove [find where name="${SHEET_FN}"]} on-error={}`],
    issues
  )
}

// ── 2 Stuck and flapping PPPoE sessions ─────────────────────────────────────

export type SessionsOptions = {
  /** Remove sessions left without an address or interface (they keep the client out with "already active"). */
  stale: boolean
  /** Report clients that reconnected at least this many times in an hour (0 = no report). */
  flaps: number
}
export const DEFAULT_SESSIONS: SessionsOptions = { stale: true, flaps: 4 }
/** Minutes between passes over the sessions; a reconnection is a new session-id since the last pass. */
export const SESSIONS_EVERY_MIN = 2
/** Above this many flapping clients in one hour it's the building, the OLT or the power, not one ONT. */
export const MASS_FLAPS = 30

export function sessionsScript(ctx: AdvContext, o: SessionsOptions): AdvResult {
  const issues: AdvIssue[] = []
  if (!int(o.flaps, 0, 100)) issues.push({ code: "flaps", level: "error" })
  if (!o.stale && !o.flaps) issues.push({ code: "nothing", level: "error" })
  if (!nets(ctx, issues)) return fail(issues)
  if (hasError(issues)) return fail(issues)
  const alerts = hasAlerts(ctx)
  if (!alerts) issues.push({ code: "logOnly", level: "info" })
  const c = comment("sesiones")
  const stale = o.stale
    ? ':if (([/ppp active get $a uptime] > 2m) && (([:len [:tostr [/ppp active get $a address]]] = 0) || ([:len [/interface find where name=("<pppoe-" . $u . ">") running]] = 0))) do={/ppp active remove $a; :set gone ($gone + 1); :log warning ("DSX sesiones: quite la sesion colgada de " . $u)} else={'
    : "{"
  const watch = src([
    ":global DSXses; :global DSXflap; :local gone 0",
    ':if ([:typeof $DSXses] != "array") do={:set DSXses [:toarray ""]}',
    ':if ([:typeof $DSXflap] != "array") do={:set DSXflap [:toarray ""]}',
    `:foreach a in=[/ppp active find where service=pppoe] do={:local u [/ppp active get $a name]; :local k [:tostr [/ppp active get $a session-id]]; ${stale}:local w [:tostr ($DSXses->$u)]; :if (([:len $w] > 0) && ($w != $k)) do={:local n ($DSXflap->$u); :if ([:typeof $n] != "num") do={:set n 0}; :set ($DSXflap->$u) ($n + 1)}; :set ($DSXses->$u) $k}}`,
    `:if ($gone > 0) do={${tell(alerts, '$gone . " sesiones PPPoE colgadas quitadas (sin IP o sin interfaz): esos clientes ya pueden volver a entrar"')}}`,
  ])
  const hour = src([
    ':global DSXflap; :local msg ""; :local n 0',
    `:if ([:typeof $DSXflap] = "array") do={:foreach u,k in=$DSXflap do={:if ($k >= ${o.flaps}) do={:set n ($n + 1); :if ($n <= 10) do={:set msg ($msg . " " . $u . " (" . $k . ")")}}}}`,
    ':set DSXflap [:toarray ""]',
    `:if ($n >= ${MASS_FLAPS}) do={${tell(alerts, `$n . " clientes se reconectaron ${o.flaps} veces o mas en la ultima hora: a tantos a la vez suele ser la OLT, un splitter o la corriente del edificio"`)}} else={:if ($n > 0) do={${tell(alerts, `$n . " clientes se reconectaron ${o.flaps} veces o mas en la ultima hora:" . $msg . ". Revisa su ONT, el conector y la corriente; ficha: DSXficha usuario"`)}}}`,
  ])
  const drop = dropScripts("^DSX-sesiones")
  const scripts = [stored("DSX-sesiones", watch, "sesiones colgadas y reconexiones", c), ...(o.flaps ? [stored("DSX-sesiones-hora", hour, "reporte de reconexiones", c)] : [])]
  const sched = [
    `add name=DSX-sesiones interval=${SESSIONS_EVERY_MIN}m on-event=DSX-sesiones ${c(`cada ${SESSIONS_EVERY_MIN} min`)}`,
    ...(o.flaps ? [`add name=DSX-sesiones-hora interval=1h on-event=DSX-sesiones-hora ${c("cada hora")}`] : []),
  ]
  return done(
    [
      step("scripts", [GUARD.base, ...(alerts ? [GUARD.alerts] : []), ...drop, "/system script", ...scripts], '/system script print where name~"^DSX-sesiones"'),
      step("programar", ["/system scheduler", ...sched], '/system scheduler print where name~"^DSX-sesiones"'),
    ],
    drop,
    issues
  )
}

// ── 3 Client pool filling up ────────────────────────────────────────────────

export type PoolOptions = { pct: number }
export const DEFAULT_POOL: PoolOptions = { pct: 90 }
/** Points below the alert level before the "back to normal" message (so it doesn't repeat every check). */
export const POOL_HYSTERESIS = 5

/**
 * Every 5 minutes: addresses handed out from DS-clientes ÷ the pool's size, read from its ranges on the router (with
 * the backup router each router holds half). One alert when it crosses the level, one when it's back below.
 */
export function poolScript(ctx: AdvContext, o: PoolOptions): AdvResult {
  const issues: AdvIssue[] = []
  if (!hasAlerts(ctx)) issues.push({ code: "needsAlerts", level: "error" })
  if (!int(o.pct, 50, 99)) issues.push({ code: "poolPct", level: "error" })
  if (!nets(ctx, issues)) return fail(issues)
  if (hasError(issues)) return fail(issues)
  const c = comment("pool")
  const body = src([
    ":global DSXpool; :local total 0",
    ':foreach r in=[/ip pool get [/ip pool find where name="DS-clientes"] ranges] do={:local s [:tostr $r]; :local d [:find $s "-"]; :if ([:typeof $d] = "num") do={:set total ($total + ([:toip [:pick $s ($d + 1) [:len $s]]] - [:toip [:pick $s 0 $d]]) + 1)} else={:set total ($total + 1)}}',
    ':local used [:len [/ip pool used find where pool="DS-clientes"]]',
    `:if ($total > 0) do={:local p ($used * 100 / $total); :if (($p >= ${o.pct}) && ($DSXpool != "lleno")) do={:set DSXpool "lleno"; ${tell(true, '"el pool de clientes va en " . $p . "% (" . $used . " de " . $total . "): cuando se llene, los ONT que se reconecten no reciben IP. Revisa sesiones colgadas o amplia el pool"')}}; :if (($p < ${o.pct - POOL_HYSTERESIS}) && ($DSXpool = "lleno")) do={:set DSXpool ""; ${tell(true, '"el pool de clientes bajo a " . $p . "% (" . $used . " de " . $total . ")"')}}}`,
  ])
  const drop = dropScripts("^DSX-pool$")
  return done(
    [
      step("script", [GUARD.base, GUARD.alerts, ...drop, "/system script", stored("DSX-pool", body, "pool de clientes casi lleno", c)], '/system script run DSX-pool; /ip pool print where name="DS-clientes"'),
      step("programar", ["/system scheduler", `add name=DSX-pool interval=5m on-event=DSX-pool ${c("cada 5 min")}`], '/system scheduler print where name="DSX-pool"'),
    ],
    drop,
    issues
  )
}

// ── 4 Connection table filling up ───────────────────────────────────────────

export type ConntrackOptions = { warn: number; crit: number; perClient: number }
export const DEFAULT_CONNTRACK: ConntrackOptions = { warn: 80, crit: 95, perClient: 1000 }
export const HEAVY_LIST = "DSX-muchas-conexiones"

/**
 * A mangle rule at the top of prerouting lists for 15 minutes every client that opens a connection while it already
 * has more than `perClient` (connection-limit counts per /32; the base drops above 2,000). Every minute the table's
 * total-entries ÷ max-entries is compared with two levels; on each change of level one alert names up to five of the
 * listed clients by their PPPoE account.
 */
export function conntrackScript(ctx: AdvContext, o: ConntrackOptions): AdvResult {
  const issues: AdvIssue[] = []
  if (!hasAlerts(ctx)) issues.push({ code: "needsAlerts", level: "error" })
  if (!int(o.warn, 50, 99) || !int(o.crit, 50, 99) || o.crit <= o.warn) issues.push({ code: "ctLevels", level: "error" })
  if (!int(o.perClient, 100, 100000)) issues.push({ code: "perClient", level: "error" })
  const n = nets(ctx, issues)
  if (!n || hasError(issues)) return fail(issues)
  const c = comment("conexiones")
  const rule = `chain=prerouting src-address=${n.poolText} connection-state=new connection-limit=${o.perClient},32 action=add-src-to-address-list address-list=${HEAVY_LIST} address-list-timeout=15m ${c(`clientes con mas de ${o.perClient} conexiones`)}`
  const body = src([
    ":global DSXct; :if ([:typeof $DSXct] != \"str\") do={:set DSXct \"\"}",
    ":local t [:tonum [/ip firewall connection tracking get total-entries]]; :local m [:tonum [/ip firewall connection tracking get max-entries]]",
    `:if ([:typeof $m] = "num") do={:if ($m > 0) do={:local p ($t * 100 / $m); :local lvl ""; :if ($p >= ${o.warn}) do={:set lvl "alta"}; :if ($p >= ${o.crit}) do={:set lvl "critica"}; :if (($lvl = "") && ($DSXct != "") && ($p >= ${o.warn - POOL_HYSTERESIS})) do={:set lvl $DSXct}; :if ($lvl != $DSXct) do={:set DSXct $lvl; :if ($lvl = "") do={${tell(true, '"la tabla de conexiones bajo a " . $p . "% (" . $t . " de " . $m . ")"')}} else={:local who ""; :local k 0; :foreach e in=[/ip firewall address-list find where list="${HEAVY_LIST}"] do={:local ip [/ip firewall address-list get $e address]; :local a [/ppp active find where address=[:toip $ip]]; :set k ($k + 1); :if ($k <= 5) do={:if ([:len $a] > 0) do={:set who ($who . " " . [/ppp active get [:pick $a 0] name])} else={:set who ($who . " " . $ip)}}}; :if ($k = 0) do={:set who " ninguno"}; ${tell(true, `"tabla de conexiones " . $lvl . ": " . $t . " de " . $m . " (" . $p . "%). Clientes con mas de ${o.perClient} conexiones:" . $who . ". Ficha: DSXficha usuario"`)}}}}}`,
  ])
  const drop = dropScripts("^DSX-conexiones$")
  return done(
    [
      step(
        "lista",
        [
          GUARD.base,
          GUARD.alerts,
          ...removeAll("conexiones", ["/ip firewall mangle"]),
          `{ :local p [/ip firewall mangle find]; :if ([:len $p] > 0) do={/ip firewall mangle add ${rule} place-before=[:pick $p 0]} else={/ip firewall mangle add ${rule}} }`,
        ],
        '/ip firewall mangle print where comment~"^DSX conexiones: "'
      ),
      step("script", [...drop, "/system script", stored("DSX-conexiones", body, "tabla de conexiones casi llena", c)], "/ip firewall connection tracking print"),
      step("programar", ["/system scheduler", `add name=DSX-conexiones interval=1m on-event=DSX-conexiones ${c("cada minuto")}`], '/system scheduler print where name="DSX-conexiones"'),
    ],
    [...drop, ...removeAll("conexiones", ["/ip firewall mangle"]), `/ip firewall address-list remove [find where list="${HEAVY_LIST}"]`],
    issues
  )
}

// ── 5 Ports and SFP optics ──────────────────────────────────────────────────

export type PortsOptions = {
  /** Ethernet/SFP ports to watch (names on the router), comma separated. */
  ports: string
  /** Alert when an SFP receives this many dB less than when the script started. */
  dropDb: number
  /** Alert when an SFP module is hotter than this (°C). */
  tempC: number
}
export const DEFAULT_PORTS: PortsOptions = { ports: "", dropDb: 3, tempC: 70 }
const PORT_NAME = /^[A-Za-z0-9][\w.\-/]*$/
/** Temperatures from here up are read errors (some SFP-RJ45 modules showed 255 °C on RouterOS 7.10). */
const TEMP_GLITCH = 200

/** The ports to watch by default: the one toward the OLT and the carriers' Ethernet ports (not PPPoE clients). */
export function defaultPorts(ctx: AdvContext): string {
  const names = [ctx.setup.oltPort.trim(), ...ctx.wans.filter((w) => w.type !== "pppoe").map((w) => w.iface.trim())].filter(Boolean)
  return [...new Set(names)].join(", ")
}

/**
 * Every 5 minutes, per port: link state and rate (alert on any change: down, or 10G that came back at 1G), and on SFPs
 * the receive power (alert when it falls `dropDb` below its first reading, again when it recovers) and the module's
 * temperature. Ports that aren't on /interface ethernet (VLANs, PPPoE clients) are skipped.
 */
export function portsScript(ctx: AdvContext, o: PortsOptions): AdvResult {
  const issues: AdvIssue[] = []
  if (!hasAlerts(ctx)) issues.push({ code: "needsAlerts", level: "error" })
  const ports = [...new Set(o.ports.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))]
  if (!ports.length) issues.push({ code: "noPorts", level: "error" })
  if (ports.length > 16) issues.push({ code: "manyPorts", level: "error" })
  for (const p of ports) if (!PORT_NAME.test(p)) issues.push({ code: "badPort", level: "error", value: p })
  if (!int(o.dropDb, 1, 20)) issues.push({ code: "dropDb", level: "error" })
  if (!int(o.tempC, 40, 100)) issues.push({ code: "tempC", level: "error" })
  if (hasError(issues)) return fail(issues)
  issues.push({ code: "portsNote", level: "info" })
  const c = comment("puertos")
  const d10 = o.dropDb * 10
  /** "-6.234" → -62 (tenths of dBm, or °C); a value without a dot ×10. */
  const tenths = (v: string, x: string) => `:local ${x}; {:local d [:find $${v} "."]; :if ([:typeof $d] = "num") do={:set ${x} [:tonum ([:pick $${v} 0 $d] . [:pick $${v} ($d + 1) ($d + 2)])]} else={:set ${x} ([:tonum $${v}] * 10)}}`
  const body = src([
    ':global DSXport; :if ([:typeof $DSXport] != "array") do={:set DSXport [:toarray ""]}; :local msg ""',
    `:foreach p in={${ports.map((x) => rosString(x)).join(";")}} do={:if ([:len [/interface ethernet find where name=$p]] > 0) do={`,
    ':local m [/interface ethernet monitor $p once as-value]; :local now ([:tostr ($m->"status")] . " " . [:tostr ($m->"rate")])',
    ':local was [:tostr ($DSXport->($p . "-link"))]; :if (([:len $was] > 0) && ($was != $now)) do={:set msg ($msg . " " . $p . ": " . $was . " -> " . $now . ";")}; :set ($DSXport->($p . "-link")) $now',
    ':local r [:tostr ($m->"sfp-rx-power")]',
    `:if ([:len $r] > 0) do={${tenths("r", "x")}; :if ([:typeof $x] = "num") do={:local b ($DSXport->($p . "-rx")); :if ([:typeof $b] != "num") do={:set ($DSXport->($p . "-rx")) $x; :set ($DSXport->($p . "-rxs")) $r} else={:local low [:tostr ($DSXport->($p . "-low"))]; :if ((($b - $x) >= ${d10}) && ($low != "si")) do={:set ($DSXport->($p . "-low")) "si"; :set msg ($msg . " " . $p . ": recibe " . $r . " dBm, al empezar recibia " . ($DSXport->($p . "-rxs")) . " (fibra, conector o modulo);")}; :if ((($b - $x) < ${d10 - 10}) && ($low = "si")) do={:set ($DSXport->($p . "-low")) ""; :set msg ($msg . " " . $p . ": la luz volvio a " . $r . " dBm;")}}}}`,
    ':local tc [:tostr ($m->"sfp-temperature")]',
    `:if ([:len $tc] > 0) do={${tenths("tc", "y")}; :if ([:typeof $y] = "num") do={:local hot [:tostr ($DSXport->($p . "-hot"))]; :if (($y > ${o.tempC * 10}) && ($y < ${TEMP_GLITCH * 10}) && ($hot != "si")) do={:set ($DSXport->($p . "-hot")) "si"; :set msg ($msg . " " . $p . ": el modulo esta a " . $tc . " C;")}; :if (($y < ${(o.tempC - 5) * 10}) && ($hot = "si")) do={:set ($DSXport->($p . "-hot")) ""; :set msg ($msg . " " . $p . ": el modulo bajo a " . $tc . " C;")}}}`,
    "}}",
    `:if ([:len $msg] > 0) do={${tell(true, '"puertos:" . $msg')}}`,
  ])
  const drop = dropScripts("^DSX-puertos$")
  return done(
    [
      step("script", [GUARD.alerts, ...drop, "/system script", stored("DSX-puertos", body, "puertos y opticas SFP", c), "/system script run DSX-puertos"], `/interface ethernet monitor ${ports[0]} once`),
      step("programar", ["/system scheduler", `add name=DSX-puertos interval=5m on-event=DSX-puertos ${c("cada 5 min")}`], '/system scheduler print where name="DSX-puertos"'),
    ],
    [...drop, `:do {/system script environment remove [find where name="DSXport"]} on-error={}`],
    issues
  )
}
