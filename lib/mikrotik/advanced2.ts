/**
 * Second set of advanced generators (owner, 2026-11-16: "do all of them"): quality failover with two probes and
 * hold-down plus a last-resort LTE link, the OLT uplink bond (LACP), restoring on a spare router of another model,
 * traffic filtering (anti-spoofing, abused ports, UDP and DNS limits, IPv6), operational alerts (config changes, new
 * RouterOS, PPPoE login failures), DSCP priority for calls and games, and fixed public IPs for business clients.
 *
 * Same conventions as advanced.ts: comments "DSX <module>: …", DSX- names, each with its undo. RouterOS 7.25 CLI
 * reference checked (netwatch ICMP thresholds, bonding, package update, file contents ≤ 61439 bytes, export where);
 * the Huawei link-aggregation line comes from third-party guides. None of it was run on a real router.
 */
import type { Wan } from "./balance"
import { tableOf } from "./balance"
import { rosString } from "./routeros"
import { parseCidr } from "./setup"
import { GUARD, SECRET, STMT, comment, done, dropScripts, fail, hasError, nets, removeAll, step, user, type AdvContext, type AdvIssue, type AdvResult, type Step } from "./advanced"

/** One-line RouterOS source from statements. */
const src = (parts: string[]) => parts.join(STMT).replace(/\{; /g, "{").replace(/; \}/g, "}")
const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/

// ── Quality failover and a last-resort LTE link ─────────────────────────────

/** Second probe per link, by default: public resolvers of other providers than the usual monitors. */
export const SECOND_PROBES = ["208.67.222.222", "208.67.220.220", "4.2.2.2", "4.2.2.1", "1.0.0.1", "8.8.4.4", "149.112.112.112", "64.6.64.6"]

export type FailoverOptions = {
  /** Second watched IP per link name (the first is the link's monitor from Varios enlaces). */
  probes: Record<string, string>
  /** A probe fails when it loses this % of its pings… */
  lossPct: number
  /** …or their average round trip goes over this, ms. */
  avgMs: number
  /** Minutes a recovered link must stay good before it takes clients again. */
  holdMin: number
  /** Last-resort cellular link: its interface (empty = none) and a cap so it doesn't burn the data plan. */
  lte: string
  lteMbps: number
}
export const DEFAULT_FAILOVER: FailoverOptions = { probes: {}, lossPct: 20, avgMs: 150, holdMin: 5, lte: "", lteMbps: 20 }
export const FAILOVER_EVERY_S = 10

export function defaultProbes(wans: Wan[], used: string[]): Record<string, string> {
  const free = SECOND_PROBES.filter((p) => !used.includes(p))
  return Object.fromEntries(wans.map((w, k) => [w.name, free[k % free.length]]))
}

/**
 * Each link gets two ICMP Netwatch probes with loss and latency thresholds: its monitor (already pinned to the link by
 * the balancing's "vigila" host route) and a second IP pinned by a route that follows the same gateway. Every 10 s
 * DSX-failover looks at both: when both fail, the link's balancing routes are disabled (only the default routes, so
 * the probes keep measuring through the link) and its connections are cleared; when they're good again for the hold
 * time, the routes come back. The last working link is never disabled. The optional LTE link sits under every table at
 * distance 3: it only carries traffic when all the carriers are down.
 */
export function failoverScript(ctx: AdvContext, o: FailoverOptions): AdvResult {
  const issues: AdvIssue[] = []
  if ((ctx.failover ?? "recursive") !== "recursive") issues.push({ code: "needsRecursive", level: "error" })
  if (ctx.wans.length < 2) issues.push({ code: "needsBalance", level: "error" })
  if (!(o.lossPct >= 1 && o.lossPct <= 100)) issues.push({ code: "lossPct", level: "error" })
  if (!(o.avgMs >= 10 && o.avgMs <= 2000)) issues.push({ code: "avgMs", level: "error" })
  if (!(o.holdMin >= 0 && o.holdMin <= 60)) issues.push({ code: "holdMin", level: "error" })
  const monitors = ctx.wans.map((w) => w.monitor.trim())
  const second = ctx.wans.map((w) => (o.probes[w.name] ?? "").trim())
  second.forEach((p, k) => {
    if (!IPV4.test(p)) issues.push({ code: "badProbe", level: "error", value: ctx.wans[k].name })
    else if (monitors.includes(p) || second.indexOf(p) !== k) issues.push({ code: "probeTwice", level: "error", value: p })
  })
  const dns = ctx.setup.dns.split(/[\s,;]+/).filter(Boolean)
  for (const p of second) if (dns.includes(p)) issues.push({ code: "probeIsDns", level: "error", value: p })
  const lte = o.lte.trim()
  if (lte && !(o.lteMbps > 0)) issues.push({ code: "lteMbps", level: "error" })
  if (hasError(issues)) return fail(issues)
  const c = comment("failover")
  const hold = Math.max(1, Math.ceil((o.holdMin * 60) / FAILOVER_EVERY_S))
  // Re-pasting replaces: the check stops first, routes it left off come back, its own pieces go.
  const clean = [
    GUARD.watch,
    ...dropScripts("^DSX-failover$"),
    '/ip route enable [find where comment~"^LB: " and disabled=yes]',
    '/tool netwatch remove [find where name~"^DSX-fo-"]',
    ...removeAll("failover", ["/ip route", "/ip firewall nat", "/queue simple"]),
  ]
  const out: string[] = ["/ip route"]
  ctx.wans.forEach((w, k) =>
    out.push(`add dst-address=${second[k]}/32 gateway=[/ip route get [find where comment=${rosString(`LB: vigila ${w.name}`)}] gateway] scope=10 ${c(`segunda IP de ${w.name}`)}`)
  )
  const probes: string[] = ["/tool netwatch"]
  ctx.wans.forEach((w, k) => {
    for (const [tag, host] of [
      ["a", w.monitor.trim()],
      ["b", second[k]],
    ])
      probes.push(`add name=${rosString(`DSX-fo-${w.name}-${tag}`)} host=${host} type=icmp interval=${FAILOVER_EVERY_S}s packet-count=10 thr-loss-percent=${o.lossPct} thr-avg=${o.avgMs}ms`)
  })
  // The check, per link. Routes of a link: "LB: <table> por|respaldo <link>" and "LB: main por <link>".
  const alerts = ctx.setup.alert !== "none"
  const say = (text: string) => (alerts ? `; :global DSmsg ${text}; :do {/system script run DS-aviso} on-error={}` : "")
  const parts = [':global DSXfo; :if ([:typeof $DSXfo] != "array") do={:set DSXfo [:toarray ""]}']
  for (const w of ctx.wans) {
    const n = rosString(w.name)
    const own = rosString(`^LB: .+ (por|respaldo) ${w.name}$`)
    parts.push(
      `{:local g [/ip route get [find where comment=${rosString(`LB: vigila ${w.name}`)}] gateway]; :local r [/ip route find where comment=${rosString(`DSX failover: segunda IP de ${w.name}`)}]; :if ([:len $r] > 0) do={:if ([/ip route get $r gateway] != $g) do={/ip route set $r gateway=$g}}` +
        `; :local a [/tool netwatch get [find where name=${rosString(`DSX-fo-${w.name}-a`)}] status]; :local b [/tool netwatch get [find where name=${rosString(`DSX-fo-${w.name}-b`)}] status]` +
        `; :local off [/ip route get [find where comment=${rosString(`LB: main por ${w.name}`)}] disabled]` +
        `; :if (($a = "down") && ($b = "down")) do={:set ($DSXfo->${n}) 0; :if ((!$off) && ([:len [/ip route find where comment~"^LB: main por " and disabled=no and comment!=${rosString(`LB: main por ${w.name}`)}]] > 0)) do={/ip route disable [find where comment~${own}]; /ip firewall connection remove [find where connection-mark=${n}]; :log warning ${rosString(`DSX failover: ${w.name} fuera (perdida o latencia)`)}${say(rosString(`${w.name} fuera por mala calidad: sus clientes pasaron a los otros enlaces`))}}}` +
        ` else={:if ([:typeof ($DSXfo->${n})] != "num") do={:set ($DSXfo->${n}) 0}; :set ($DSXfo->${n}) (($DSXfo->${n}) + 1); :if ($off && (($DSXfo->${n}) >= ${hold})) do={/ip route enable [find where comment~${own}]; /ip firewall connection remove [find where connection-mark=${n}]; :log warning ${rosString(`DSX failover: ${w.name} de vuelta`)}${say(rosString(`${w.name} estable de nuevo: regreso al reparto`))}}}}`
    )
  }
  if (lte) {
    parts.push(
      `{:global DSXlte; :local on [/ip route get [find where comment="DSX failover: main por LTE"] active]; :if ($on && ($DSXlte != "on")) do={:set DSXlte "on"; :log warning "DSX failover: todo por LTE"${say('"todos los carriers caidos: el despliegue sale por LTE"')}}; :if ((!$on) && ($DSXlte = "on")) do={:set DSXlte "off"${say('"volvio un carrier: LTE en espera"')}}}`
    )
  }
  const lteLines: string[] = []
  if (lte) {
    const l = rosString(lte)
    lteLines.push(
      "/interface lte apn",
      "set [find] add-default-route=no use-peer-dns=no",
      "/ip route",
      ...ctx.wans.map((w) => `add dst-address=0.0.0.0/0 gateway=${l} routing-table=${rosString(tableOf(w))} distance=3 ${c(`${tableOf(w)} por LTE`)}`),
      `add dst-address=0.0.0.0/0 gateway=${l} distance=3 ${c("main por LTE")}`,
      "/ip firewall nat",
      `add chain=srcnat out-interface=${l} action=masquerade ${c("salida por LTE")}`,
      "/queue simple",
      `add name=DSX-lte target=${l} max-limit=${o.lteMbps}M/${o.lteMbps}M ${c("tope del plan de datos")}`
    )
    issues.push({ code: "lteNote", level: "info" })
  }
  const check = [
    "/system script",
    `add name=DSX-failover policy=read,write,test dont-require-permissions=yes source=${rosString(src(parts))} ${c("revisa la calidad de los enlaces")}`,
    "/system scheduler",
    `add name=DSX-failover interval=${FAILOVER_EVERY_S}s on-event=DSX-failover ${c(`cada ${FAILOVER_EVERY_S} s`)}`,
  ]
  issues.push({ code: "foHow", level: "info", value: String(o.holdMin) })
  const undo = [
    ':do {/system scheduler remove [find where name="DSX-failover"]} on-error={}',
    ':do {/system script remove [find where name="DSX-failover"]} on-error={}',
    // Routes the check may have left off come back first.
    '/ip route enable [find where comment~"^LB: " and disabled=yes]',
    '/tool netwatch remove [find where name~"^DSX-fo-"]',
    ...removeAll("failover", ["/ip route", "/ip firewall nat", "/queue simple"]),
  ]
  const steps: Step[] = [
    step("segundas", [...clean, ...out], '/ip route print where comment~"^DSX failover"'),
    step("pruebas", probes, "/tool netwatch print where name~\"^DSX-fo-\""),
    ...(lte ? [step("lte", lteLines, '/ip route print where comment~"LTE"')] : []),
    step("revision", check, '/system scheduler print where name="DSX-failover"'),
  ]
  return done(steps, undo, issues)
}

// ── OLT uplink bond (LACP) ──────────────────────────────────────────────────

export type BondOptions = { ports: string; oltPorts: string }
export const DEFAULT_BOND: BondOptions = { ports: "", oltPorts: "" }
const FSP = /^\d+\/\d+\/\d+$/

/**
 * Two cables between the OLT and the router as one 802.3ad (LACP) bond: a bad cable, SFP or port no longer takes the
 * building down. The VLANs that sat on the router's OLT port move to the bond in the same line. On the OLT, the two
 * uplink ports (on two control boards when the chassis has them) join one static-LACP group.
 */
export function bondScript(ctx: AdvContext, o: BondOptions): { router: string; olt: string; undo: string; issues: AdvIssue[]; steps: Step[] } {
  const issues: AdvIssue[] = []
  const ports = o.ports.split(/[\s,;]+/).filter(Boolean)
  const olt = o.oltPorts.split(/[\s,;]+/).filter(Boolean)
  const first = ctx.setup.oltPort.trim()
  if (ports.length !== 2 || ports[0] === ports[1]) issues.push({ code: "twoPorts", level: "error" })
  else if (!ports.includes(first)) issues.push({ code: "bondHasOltPort", level: "error", value: first })
  if (olt.length !== 2 || olt.some((p) => !FSP.test(p)) || olt[0] === olt[1]) issues.push({ code: "twoOltPorts", level: "error" })
  if (hasError(issues)) return { router: "", olt: "", undo: "", issues, steps: [] }
  const c = comment("bond")
  const router = [
    // One line: the OLT's management and the clients' VLANs come back on the bond in the same step.
    // A port with VLANs on it may not join a bond: they wait on a temporary bridge, the bond is made, they move to it.
    // Only once: on a second paste the bond is already there.
    `:if ([:len [/interface bonding find where name="DSX-bond-olt"]] = 0) do={ :local v [/interface vlan find where interface=${rosString(first)}]; /interface bridge add name=DSX-espera ${c("temporal")}; /interface vlan set $v interface=DSX-espera; :do {/interface bonding add name=DSX-bond-olt slaves=${ports.map((p) => rosString(p)).join(",")} mode=802.3ad lacp-rate=1sec transmit-hash-policy=layer-2-and-3 ${c("dos cables a la OLT")}; /interface vlan set $v interface=DSX-bond-olt} on-error={/interface vlan set $v interface=${rosString(first)}; :log error "DSX: no se pudo crear el bond, las VLAN regresaron al puerto"}; /interface bridge remove [find where name="DSX-espera"] }`,
    ':do {/queue interface set [find where interface="DSX-bond-olt"] queue=DS-fq-codel} on-error={}',
  ].join("\n")
  const [a, b] = olt.map((p) => {
    const [f, s, port] = p.split("/")
    return `${f}/${s} ${port}`
  })
  const oltText = ["config", `link-aggregation ${a} ${b} egress-ingress workmode lacp-static`, "display link-aggregation all", "save"].join("\n")
  const sameBoard = olt[0].split("/").slice(0, 2).join("/") === olt[1].split("/").slice(0, 2).join("/")
  if (sameBoard) issues.push({ code: "sameBoard", level: "warn" })
  issues.push({ code: "bondWindow", level: "info" }, { code: "bondSetup", level: "info" })
  // The same dance backwards: the port is still in the bond until the bond goes.
  const undo = `{ :local v [/interface vlan find where interface="DSX-bond-olt"]; /interface bridge add name=DSX-espera; /interface vlan set $v interface=DSX-espera; /interface bonding remove [find where name="DSX-bond-olt"]; /interface vlan set $v interface=${rosString(first)}; /interface bridge remove [find where name="DSX-espera"] }`
  return { router, olt: oltText, undo, issues, steps: [step("router", [router], "/interface bonding monitor DSX-bond-olt once")] }
}

// ── Spare router: restore on another model ──────────────────────────────────

/** Interface names a RouterOS export uses (ethernet, SFP, QSFP, combo, wireless). */
export function exportInterfaces(text: string): string[] {
  const found = text.match(/(?<![\w-])(?:ether\d+|sfp\d+|sfp-sfpplus\d+|sfp28-\d+|qsfp28-\d+-\d+|qsfpplus\d+-\d+|combo\d+|wlan\d+|wifi\d+)(?![\w-])/g) ?? []
  return [...new Set(found)].sort((x, y) => x.localeCompare(y, "en", { numeric: true }))
}

/** The export with its interfaces renamed for the new router (whole names only: ether1 never touches ether10). */
export function remapExport(text: string, map: Record<string, string>): string {
  const pairs = Object.entries(map).filter(([from, to]) => from && to.trim() && from !== to.trim())
  if (!pairs.length) return text
  const re = new RegExp(`(?<![\\w-])(${pairs.map(([f]) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\w-])`, "g")
  const to = new Map(pairs.map(([f, t]) => [f, t.trim()]))
  return text.replace(re, (m) => to.get(m) ?? m)
}

/** Weekly full export with passwords to the SFTP server (the daily one leaves them out, and an encrypted .backup only restores on the same model). */
export function fullExportScript(ctx: AdvContext): AdvResult {
  const s = ctx.setup
  if (s.backup !== "sftp" || !s.backupHost.trim()) return fail([{ code: "needsSftp", level: "error" }])
  const c = comment("repuesto")
  const path = `${s.backupPath.trim().replace(/\/+$/, "")}${s.backupPath.trim() ? "/" : ""}`
  const body = src([
    ":local n [/system identity get name]",
    ":local d [:pick [/system clock get date] 0 10]",
    "/export show-sensitive file=DSX-completo",
    ":delay 10s",
    // The file holds every password: it's removed even when the upload fails (and the failure is logged).
    `:do {/tool fetch upload=yes mode=sftp address=${s.backupHost.trim()} user=${s.backupUser.trim()} password="${SECRET("sftp")}" src-path=DSX-completo.rsc dst-path=("${path}" . $n . "-completo-" . $d . ".rsc")} on-error={:log warning "DSX: no se pudo subir el export completo"}`,
    '/file remove [find where name="DSX-completo.rsc"]',
  ])
  const lines = [
    ...dropScripts("^DSX-completo$"),
    "/system script",
    `add name=DSX-completo policy=ftp,read,write,policy,test,sensitive dont-require-permissions=yes source=${rosString(body)} ${c("export completo para otro equipo")}`,
      "/system scheduler",
    `add name=DSX-completo start-time=04:00:00 interval=7d on-event=DSX-completo ${c("cada semana")}`,
  ]
  return done([step("copia", lines, '/system scheduler print where name="DSX-completo"')], [...dropScripts("^DSX-completo$"), '/file remove [find where name="DSX-completo.rsc"]'], [{ code: "passwordsFile", level: "warn" }])
}

// ── Profile sync to the backup router ───────────────────────────────────────

/**
 * Lines added to the backup-router pair: every hour the main router writes "set rate-limit" commands for its DS/DSX
 * profiles into a small file (each wrapped so a missing profile doesn't stop the import) and sends it with the
 * accounts; the backup applies it. New profiles still go on both routers from Configuración.
 */
export function profileSyncScripts(syncUser: string, backupIp: string): { main: string; backup: string } {
  const c = comment("respaldo")
  // Inside the generated file: :do {/ppp profile set [find where name="x"] rate-limit="y"} on-error={}
  const write = src([
    ':local s ""',
    ':foreach p in=[/ppp profile find where comment~"^DS"] do={:set s ($s . ":do {/ppp profile set [find where name=\\"" . [/ppp profile get $p name] . "\\"] rate-limit=\\"" . [/ppp profile get $p rate-limit] . "\\"} on-error={}\\n")}',
    '/file remove [find where name="DSX-perfiles.rsc"]',
    "/file add name=DSX-perfiles.rsc contents=$s",
    ":delay 2s",
    `/tool fetch upload=yes mode=sftp address=${backupIp} user=${syncUser} password="${SECRET("clave-de-sincronizacion")}" src-path=DSX-perfiles.rsc dst-path=DSX-perfiles.rsc`,
  ])
  const apply = ':if ([:len [/file find where name="DSX-perfiles.rsc"]] > 0) do={/import file-name=DSX-perfiles.rsc; /file remove [find where name="DSX-perfiles.rsc"]; :log info "DSX: velocidades copiadas del principal"}'
  return {
    main: [
      ...dropScripts("^DSX-sync-perfiles$"),
      "/system script",
      `add name=DSX-sync-perfiles policy=ftp,read,write,test,sensitive dont-require-permissions=yes source=${rosString(write)} ${c("copia las velocidades de los planes")}`,
      "/system scheduler",
      `add name=DSX-sync-perfiles interval=1h start-time=00:12:00 on-event=DSX-sync-perfiles ${c("cada hora")}`,
    ].join("\n"),
    backup: [
      ...dropScripts("^DSX-sync-perfiles-importar$"),
      "/system script",
      `add name=DSX-sync-perfiles-importar policy=read,write,test dont-require-permissions=yes source=${rosString(apply)} ${c("aplica las velocidades copiadas")}`,
      "/system scheduler",
      `add name=DSX-sync-perfiles-importar interval=1h start-time=00:22:00 on-event=DSX-sync-perfiles-importar ${c("cada hora")}`,
    ].join("\n"),
  }
}

// ── Traffic filtering ───────────────────────────────────────────────────────

export type FilterOptions = {
  /** Anti-spoofing (BCP 38): only the pool (and fixed public IPs) may be a client's source. */
  spoof: boolean
  /** Windows file sharing / NetBIOS toward the internet (worms). */
  smb: boolean
  /** SSDP/UPnP discovery toward the internet (reflection attacks). */
  ssdp: boolean
  /** Telnet toward the internet (Mirai-style IoT bots). */
  telnet: boolean
  /** UDP connections per client (0 = no limit). */
  udpLimit: number
  /** DNS queries per second per client (0 = no limit). */
  dnsRate: number
}
export const DEFAULT_FILTERS: FilterOptions = { spoof: true, smb: true, ssdp: true, telnet: true, udpLimit: 500, dnsRate: 50 }

export function filtersScript(ctx: AdvContext, o: FilterOptions): AdvResult {
  const issues: AdvIssue[] = []
  const n = nets(ctx, issues)
  if (!(o.udpLimit === 0 || (o.udpLimit >= 50 && o.udpLimit <= 10000))) issues.push({ code: "udpLimit", level: "error" })
  if (!(o.dnsRate === 0 || (o.dnsRate >= 5 && o.dnsRate <= 1000))) issues.push({ code: "dnsRate", level: "error" })
  if (!n || hasError(issues)) return fail(issues)
  const c = comment("filtros")
  const s = ctx.setup
  const v6 = s.ipv6Pd.trim()
  const out: string[] = []
  const ports_: string[] = []
  const limits: string[] = []
  if (o.spoof) {
    out.push("/ip firewall address-list", `add list=DSX-origen-valido address=${n.poolText} ${c("pool de clientes")}`)
    out.push("/ip firewall raw", `add chain=prerouting in-interface-list=DS-LAN src-address-list=!DSX-origen-valido action=drop ${c("origen falso (BCP 38)")}`)
    if (v6)
      out.push(
        "/ipv6 firewall address-list",
        `add list=DSX-origen-valido6 address=${v6} ${c("prefijos de clientes")}`,
        ...(s.ipv6Wan.trim() ? [`add list=DSX-origen-valido6 address=${s.ipv6Wan.trim()} ${c("prefijos WAN de clientes")}`] : []),
        `add list=DSX-origen-valido6 address=fe80::/10 ${c("enlace local (DHCPv6 y vecinos)")}`,
        "/ipv6 firewall raw",
        `add chain=prerouting in-interface-list=DS-LAN src-address-list=!DSX-origen-valido6 action=drop ${c("origen falso (BCP 38)")}`
      )
  }
  const ports: { proto: string; ports: string; why: string }[] = []
  if (o.smb) ports.push({ proto: "tcp", ports: "135-139,445", why: "Windows y NetBIOS a internet" }, { proto: "udp", ports: "135-139,445", why: "Windows y NetBIOS a internet" })
  if (o.ssdp) ports.push({ proto: "udp", ports: "1900", why: "SSDP/UPnP a internet" })
  if (o.telnet) ports.push({ proto: "tcp", ports: "23,2323", why: "telnet a internet (bots)" })
  if (ports.length || o.udpLimit) {
    ports_.push("/ip firewall filter")
    for (const p of ports) ports_.push(`add chain=forward src-address=${n.poolText} out-interface-list=DS-WAN protocol=${p.proto} dst-port=${p.ports} action=drop ${c(p.why)}`)
    if (o.udpLimit)
      limits.push("/ip firewall filter", `add chain=forward src-address=${n.poolText} protocol=udp connection-state=new connection-limit=${o.udpLimit},32 action=drop ${c("tope de conexiones UDP por cliente")}`)
    if (v6 && ports.length) {
      ports_.push("/ipv6 firewall filter")
      for (const p of ports) ports_.push(`add chain=forward in-interface-list=DS-LAN out-interface-list=DS-WAN protocol=${p.proto} dst-port=${p.ports} action=drop ${c(p.why)}`)
    }
  }
  if (o.dnsRate)
    // Raw, before the DNS redirect and the filter: a client within the rate goes on, the rest of its queries are dropped.
    limits.push(
      "/ip firewall raw",
      `add chain=prerouting src-address=${n.poolText} protocol=udp dst-port=53 dst-limit=${o.dnsRate},${o.dnsRate * 2},src-address/1m action=accept ${c("DNS a ritmo normal")}`,
      `add chain=prerouting src-address=${n.poolText} protocol=udp dst-port=53 action=drop ${c("DNS por encima del tope")}`
    )
  if (!out.length && !ports_.length && !limits.length) return fail([{ code: "nothing", level: "error" }])
  issues.push({ code: "rpFilter", level: "info" })
  const undo = removeAll("filtros", ["/ip firewall raw", "/ip firewall filter", "/ip firewall address-list", ...(v6 ? ["/ipv6 firewall raw", "/ipv6 firewall filter", "/ipv6 firewall address-list"] : [])])
  // Re-pasting replaces: everything it made goes first (in the first step that runs).
  const head = [GUARD.base, ...undo]
  const parts: [string, string[], string][] = [
    ["origen", out, '/ip firewall raw print where comment~"^DSX filtros"'],
    ["puertos", ports_, '/ip firewall filter print where comment~"^DSX filtros"'],
    ["topes", limits, '/ip firewall raw print where comment~"DNS"'],
  ]
  const used = parts.filter(([, lines]) => lines.length)
  return done(
    used.map(([id, lines, verify], k) => step(id, k === 0 ? [...head, ...lines] : lines, verify)),
    undo,
    issues
  )
}

// ── Operational alerts ──────────────────────────────────────────────────────

export type AlertsOptions = { config: boolean; version: boolean; pppFails: number }
export const DEFAULT_ALERTS: AlertsOptions = { config: true, version: true, pppFails: 20 }
/** Menus whose export size is compared (not PPP accounts or profiles: the usage counter and the night boost change those). */
export const WATCHED_MENUS = ["/ip firewall", "/ip address", "/ip route", "/ip service", "/ip pool", "/user", "/interface", "/routing", "/system scheduler", "/system script", "/tool netwatch", "/snmp"]

export function alertsScript(ctx: AdvContext, o: AlertsOptions): AdvResult {
  const issues: AdvIssue[] = []
  if (ctx.setup.alert === "none") issues.push({ code: "needsAlerts", level: "error" })
  if (!(o.pppFails >= 0 && o.pppFails <= 100000)) issues.push({ code: "pppFails", level: "error" })
  if (!o.config && !o.version && !o.pppFails) issues.push({ code: "nothing", level: "error" })
  if (hasError(issues)) return fail(issues)
  const c = comment("alertas")
  const scripts: string[] = []
  const sched: string[] = []
  if (o.config) {
    const file = (k: number) => `DSX-cfg-${k}`
    const body = src([
      ':global DSXcfg; :if ([:typeof $DSXcfg] != "array") do={:set DSXcfg [:toarray ""]}; :local msg ""',
      ...WATCHED_MENUS.map((m, k) => `${m} export file=${file(k)}`),
      ":delay 5s",
      ...WATCHED_MENUS.map(
        (m, k) =>
          `{:local f [/file find where name="${file(k)}.rsc"]; :if ([:len $f] > 0) do={:local z [/file get $f size]; :if ([:typeof ($DSXcfg->"${k}")] = "num") do={:if (($DSXcfg->"${k}") != $z) do={:set msg ($msg . " ${m}")}}; :set ($DSXcfg->"${k}") $z; /file remove $f}}`
      ),
      ':if ([:len $msg] > 0) do={:global DSmsg ("cambio la configuracion en:" . $msg); /system script run DS-aviso}',
    ])
    scripts.push(`add name=DSX-cambios policy=ftp,read,write,policy,test,sensitive dont-require-permissions=yes source=${rosString(body)} ${c("cambios de configuracion")}`)
    sched.push(`add name=DSX-cambios interval=2h on-event=DSX-cambios ${c("cada 2 h")}`)
    issues.push({ code: "configNote", level: "info" })
  }
  if (o.version) {
    const body = src([
      ":global DSXver",
      "/system package update set channel=stable",
      "/system package update check-for-updates",
      ":delay 20s",
      ":local i [/system package update get installed-version]; :local l [/system package update get latest-version]",
      ':if (([:len $l] > 0) && ($l != $i) && ($l != $DSXver)) do={:set DSXver $l; :global DSmsg ("RouterOS " . $l . " disponible (tienes " . $i . "): revisa las notas y actualiza en tu ventana de mantenimiento"); /system script run DS-aviso}',
    ])
    scripts.push(`add name=DSX-version policy=read,write,test dont-require-permissions=yes source=${rosString(body)} ${c("version nueva de RouterOS")}`)
    sched.push(`add name=DSX-version start-time=09:00:00 interval=1d on-event=DSX-version ${c("cada dia")}`)
  }
  if (o.pppFails) {
    const body = src([
      ':global DSXppp; :local t [:len [/log find where message~"(authentication|login) failed"]]',
      ':if ([:typeof $DSXppp] != "num") do={:set DSXppp $t}',
      ":local d ($t - $DSXppp); :if ($d < 0) do={:set d $t}; :set DSXppp $t",
      `:if ($d >= ${o.pppFails}) do={:global DSmsg ($d . " intentos de entrada fallidos en la ultima hora: alguien probando cuentas o un ONT con la clave equivocada"); /system script run DS-aviso}`,
    ])
    scripts.push(`add name=DSX-fallos-ppp policy=read,write,test dont-require-permissions=yes source=${rosString(body)} ${c("entradas fallidas")}`)
    sched.push(`add name=DSX-fallos-ppp interval=1h on-event=DSX-fallos-ppp ${c("cada hora")}`)
    issues.push({ code: "logText", level: "info" })
  }
  const drop = dropScripts("^DSX-(cambios|version|fallos-ppp)$")
  return done(
    [step("scripts", [GUARD.alerts, ...drop, "/system script", ...scripts], '/system script print where name~"^DSX-(cambios|version|fallos)"'), step("programar", ["/system scheduler", ...sched], '/system scheduler print where name~"^DSX-(cambios|version|fallos)"')],
    // The undo also removes the exports kept to compare the configuration.
    [...drop, '/file remove [find where name~"^DSX-cfg-"]'],
    issues
  )
}

// ── Priority for calls and games (DSCP) ─────────────────────────────────────

/** DSCP values that video calls, voice and some games set: EF (46), AF41 (34), CS4 (32), CS5 (40). */
export const PRIORITY_DSCP = [46, 34, 32, 40]

/**
 * The balancing's link queues already put the first 500 KB of each connection and small UDP first. These rules add the
 * packets that apps mark as real-time (DSCP) to the same priority, placed before each link's catch-all mark. Inside each
 * client's own queue, the client queue type (Parámetros: fq-codel or CAKE) keeps a call from waiting behind a download.
 */
export function priorityScript(ctx: AdvContext): AdvResult {
  if (ctx.wans.length < 1) return fail([{ code: "needsBalance", level: "error" }])
  // The marks go into each link's priority queue: without shaping and the priority split there's nothing to feed.
  if (ctx.linkQueues && !(ctx.linkQueues.shape && ctx.linkQueues.prio)) return fail([{ code: "needsQueues", level: "error" }])
  const c = comment("prioridad")
  const out: string[] = [GUARD.queues, ...removeAll("prioridad", ["/ip firewall mangle"])]
  for (const w of ctx.wans) {
    for (const [dir, side] of [
      ["bajada", `in-interface=${rosString(w.iface.trim())}`],
      ["subida", `out-interface=${rosString(w.iface.trim())}`],
    ]) {
      const catchAll = rosString(`LB: ${dir} ${w.name}`)
      for (const d of PRIORITY_DSCP)
        out.push(
          `{ :local p [/ip firewall mangle find where comment=${catchAll}]; :if ([:len $p] > 0) do={/ip firewall mangle add chain=forward action=mark-packet ${side} dscp=${d} new-packet-mark=${rosString(`LB-${w.name}-${dir}-prioridad`)} passthrough=no ${c(`${dir} ${w.name} DSCP ${d}`)} place-before=[:pick $p 0]} else={:error "DSX: activa las colas por enlace en Varios enlaces"} }`
        )
    }
  }
  const issues: AdvIssue[] = [{ code: "queueType", level: ctx.queue && ctx.queue !== "default" ? "info" : "warn" }]
  return done([step("marcas", out, '/ip firewall mangle print where comment~"^DSX prioridad"')], removeAll("prioridad", ["/ip firewall mangle"]), issues)
}

// ── Fixed public IPs for business clients ───────────────────────────────────

export type PublicIpRow = { user: string; ip: string; wan: string }

/**
 * A client with its own public IP: the PPPoE account always gets that address; its traffic skips CGNAT (a srcnat accept
 * before the NAT rules), always leaves through the link that owns the address (marked before the balancing), and the
 * internet may open connections to it (cameras, servers). The carrier must route that IP or block to us (a business
 * service), or it's our own block announced by BGP.
 */
export function publicIpScript(ctx: AdvContext, rows: PublicIpRow[]): AdvResult {
  const issues: AdvIssue[] = []
  const n = nets(ctx, issues)
  const wans = new Map(ctx.wans.map((w) => [w.name, w]))
  const used = rows.filter((r) => r.user.trim() || r.ip.trim())
  if (!used.length) issues.push({ code: "noRows", level: "error" })
  const seen = new Set<string>()
  for (const r of used) {
    if (!r.user.trim() || /\s/.test(r.user.trim())) issues.push({ code: "badUser", level: "error", value: r.user })
    if (!IPV4.test(r.ip.trim())) issues.push({ code: "badIp", level: "error", value: r.ip })
    else {
      const ip = parseCidr(`${r.ip.trim()}/32`)
      if (n && ip && Math.floor(ip.net / 2 ** (32 - n.pool.prefix)) === Math.floor(n.pool.net / 2 ** (32 - n.pool.prefix))) issues.push({ code: "ipInPool", level: "error", value: r.ip })
      if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(r.ip.trim())) issues.push({ code: "privateIp", level: "error", value: r.ip })
      if (seen.has(r.ip.trim())) issues.push({ code: "ipTwice", level: "error", value: r.ip })
      seen.add(r.ip.trim())
    }
    if (!wans.has(r.wan)) issues.push({ code: "unknownWan", level: "error", value: r.wan })
  }
  if (!n || hasError(issues)) return fail(issues)
  const c = comment("ip-publica")
  const accounts: string[] = []
  const out: string[] = [GUARD.balance, ...removeAll("ip-publica", ["/ip firewall filter", "/ip firewall mangle", "/ip firewall nat", "/ip firewall address-list"])]
  for (const r of used) {
    const ip = r.ip.trim()
    const w = wans.get(r.wan) as Wan
    const who = `${r.user.trim()} ${ip}`
    accounts.push(`/ppp secret set [find where name=${user(r.user)}] remote-address=${ip}`, `/ppp active remove [find where name=${user(r.user)}]`)
    out.push(
      `/ip firewall address-list add list=DSX-origen-valido address=${ip} ${c(who)}`,
      `{ :local f [/ip firewall nat find where chain=srcnat]; :if ([:len $f] > 0) do={/ip firewall nat add chain=srcnat src-address=${ip} action=accept ${c(`${who} sin CGNAT`)} place-before=[:pick $f 0]} else={/ip firewall nat add chain=srcnat src-address=${ip} action=accept ${c(`${who} sin CGNAT`)}} }`,
      `{ :local p [/ip firewall mangle find where comment~"^LB: reparto"]; :if ([:len $p] > 0) do={/ip firewall mangle add chain=prerouting action=mark-connection src-address=${ip} connection-mark=no-mark new-connection-mark=${rosString(w.name)} passthrough=yes ${c(`${who} por ${w.name}`)} place-before=[:pick $p 0]; /ip firewall mangle add chain=prerouting action=mark-routing src-address=${ip} new-routing-mark=${rosString(tableOf(w))} passthrough=no ${c(`${who} por ${w.name}`)} place-before=[:pick $p 0]} else={:error "DSX: primero pega el balanceo de Varios enlaces"} }`,
      `{ :local d [/ip firewall filter find where comment="DS: nada nuevo desde internet"]; :if ([:len $d] > 0) do={/ip firewall filter add chain=forward dst-address=${ip} in-interface-list=DS-WAN connection-state=new action=accept ${c(`${who} abierto a internet`)} place-before=[:pick $d 0]} }`
    )
  }
  issues.push({ code: "routedBlock", level: "info" }, { code: "openToInternet", level: "warn" })
  const undo = [...used.map((r) => `/ppp secret set [find where name=${user(r.user)}] remote-address=""`), ...removeAll("ip-publica", ["/ip firewall filter", "/ip firewall mangle", "/ip firewall nat", "/ip firewall address-list"])]
  return done([step("rutas", out, '/ip firewall mangle print where comment~"^DSX ip-publica"'), step("cuentas", accounts, "/ppp active print")], undo, issues)
}

