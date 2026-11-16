/**
 * Advanced script generators for /mikrotik (owner, 2026-11-16: run everything by hand, no billing system): unpaid
 * clients, remote access, DNS filtering, per-client usage, infected clients and DDoS, scheduled speeds, BGP, monitoring
 * without a server, a backup router and a fixed exit per destination.
 *
 * Each generator works on the open deployment (its pool, plans, links, management network) and returns a script, an
 * undo and its issues. Everything it adds carries the comment "DSX <module>: …" (or a DSX- name), so its undo removes
 * only its own lines and the base setup's undo ("DS: …", "DS-…") never touches them. Menus and properties checked
 * against the RouterOS 7.25 CLI reference (2026-11-16); none of this was run on a real router.
 */
import type { Wan } from "./balance"
import { tableOf } from "./balance"
import { rateLimit, rosRate, rosString, upsert, type QueueKind } from "./routeros"
import { cidrText, intToIp, parseCidr, profileProps, setupPlans, size, vlanName, type Cidr, type SetupPlan, type SetupState } from "./setup"
import type { PlanRule } from "./burst"

export type AdvContext = {
  /** Deployment name (router identity). */
  name: string
  setup: SetupState
  wans: Wan[]
  queue?: QueueKind
  /** How the balancing watches the links (Varios enlaces). */
  failover?: "recursive" | "gateway"
}

export type AdvIssue = { code: string; level: "error" | "warn" | "info"; value?: string }
export type AdvResult = { script: string; undo: string; issues: AdvIssue[] }

export const SECRET = (what: string) => `PEGA-AQUI-${what}`
export const comment = (mod: string) => (text: string) => `comment=${rosString(`DSX ${mod}: ${text}`)}`
/** Removes every line of a module from the given menus. */
export const removeAll = (mod: string, menus: string[]) => menus.map((m) => `${m} remove [find where comment~${rosString(`^DSX ${mod}: `)}]`)
/** Statements of a one-line RouterOS script: "; " between them, none right after "{" or before "}". */
export const STMT = "; "
export const fail = (issues: AdvIssue[]): AdvResult => ({ script: "", undo: "", issues })
export const hasError = (issues: AdvIssue[]) => issues.some((i) => i.level === "error")

export type Net = { pool: Cidr; poolText: string; local: string; mgmt: Cidr; mgmtText: string }
export function nets(ctx: AdvContext, issues: AdvIssue[]): Net | null {
  const pool = parseCidr(ctx.setup.pool)
  const mgmt = parseCidr(ctx.setup.mgmtNet)
  if (!pool) issues.push({ code: "noPool", level: "error" })
  if (!mgmt) issues.push({ code: "noMgmt", level: "error" })
  if (!pool || !mgmt) return null
  return { pool, poolText: cidrText(pool), local: intToIp(pool.net + 1), mgmt, mgmtText: cidrText(mgmt) }
}

const plansOf = (ctx: AdvContext) => setupPlans(ctx.setup.plans, ctx.setup.rule)
/** A secret's username as RouterOS text. */
export const user = (u: string) => rosString(u.trim())
/** Hostname of an http(s) URL, or null. */
export function urlHost(url: string): string | null {
  const m = /^https?:\/\/([a-z0-9.-]+)(?::\d+)?(?:\/.*)?$/i.exec(url.trim())
  return m ? m[1].toLowerCase() : null
}
export const list = (text: string) =>
  text
    .split(/[\s,;]+/)
    .map((x) => x.trim())
    .filter(Boolean)
export const HOST = /^(?:[a-z0-9-]+\.)+[a-z]{2,}$|^\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?$/i

// ── 1 Unpaid clients ────────────────────────────────────────────────────────

export type MorososOptions = {
  /** Page shown to suspended clients (http or https). */
  noticeUrl: string
  /** Other sites they can still open (payment, bank), domains or IPs. */
  allow: string
  /** "Reducido" stage, Mbps. */
  reducedDown: number
  reducedUp: number
}
export const DEFAULT_MOROSOS: MorososOptions = { noticeUrl: "", allow: "", reducedDown: 2, reducedUp: 1 }
export const NOTICE_PORT = 8080
const SUSPENDED_RATE = "512k/512k"

/**
 * The deployment's profile properties without IPv6. Address lists (suspension, families) only hold the session's IPv4
 * address, so a profile that must be filtered can't give IPv6: it would be a way around the filter.
 */
export const v4Only = (props: string[]) => [...props.filter((x) => !/^(use-ipv6|dhcpv6-pd-pool|remote-ipv6-prefix-pool)=/.test(x)), "use-ipv6=no"]

/**
 * Two PPP profiles: DSX-reducido (low speed, still browses) and DSX-suspendido (only the notice page, payment sites
 * and DNS). The profile's address-list puts the session's address in DSX-morosos while it lasts; raw drops the rest,
 * plain-HTTP goes through the router's web proxy, which answers with a redirect (307) to the notice page. Phones and
 * computers open the notice by themselves (their connectivity check is plain HTTP); HTTPS sites just don't load.
 */
export function morososScript(ctx: AdvContext, o: MorososOptions): AdvResult {
  const issues: AdvIssue[] = []
  const n = nets(ctx, issues)
  const host = urlHost(o.noticeUrl)
  if (!host) issues.push({ code: "noticeUrl", level: "error" })
  const allow = list(o.allow)
  const bad = allow.find((h) => !HOST.test(h))
  if (bad) issues.push({ code: "badHost", level: "error", value: bad })
  if (!(o.reducedDown > 0 && o.reducedUp > 0)) issues.push({ code: "reducedRate", level: "error" })
  if (!n || hasError(issues)) return fail(issues)
  const c = comment("morosos")
  const s = ctx.setup
  const out: string[] = [
    "/ppp profile",
    upsert("/ppp profile", "DSX-reducido", [...profileProps(s, `${rosRate(o.reducedUp)}/${rosRate(o.reducedDown)}`, ctx.queue), "address-list=DSX-reducidos", c("velocidad reducida")], [
      "name=DSX-reducido",
      ...profileProps(s, `${rosRate(o.reducedUp)}/${rosRate(o.reducedDown)}`, ctx.queue),
      "address-list=DSX-reducidos",
      c("velocidad reducida"),
    ]),
    upsert("/ppp profile", "DSX-suspendido", [...v4Only(profileProps(s, SUSPENDED_RATE, ctx.queue)), "address-list=DSX-morosos", c("solo el aviso de pago")], [
      "name=DSX-suspendido",
      ...v4Only(profileProps(s, SUSPENDED_RATE, ctx.queue)),
      "address-list=DSX-morosos",
      c("solo el aviso de pago"),
    ]),
    "/ip firewall address-list",
    ...[host as string, ...allow].map((h) => `add list=DSX-aviso address=${h} ${c("se puede abrir suspendido")}`),
    // Raw runs before NAT and the filter: what a suspended client may reach, in order.
    "/ip firewall raw",
    `add chain=prerouting src-address-list=DSX-morosos dst-address-type=local action=accept ${c("al router (DNS y aviso)")}`,
    `add chain=prerouting src-address-list=DSX-morosos protocol=udp dst-port=53 action=accept ${c("DNS")}`,
    `add chain=prerouting src-address-list=DSX-morosos protocol=tcp dst-port=53 action=accept ${c("DNS")}`,
    `add chain=prerouting src-address-list=DSX-morosos dst-address-list=DSX-aviso action=accept ${c("aviso y pagos")}`,
    `add chain=prerouting src-address-list=DSX-morosos protocol=tcp dst-port=80 action=accept ${c("web sin cifrar: va al aviso")}`,
    `add chain=prerouting src-address-list=DSX-morosos action=drop ${c("lo demas, cortado")}`,
    "/ip firewall nat",
    `add chain=dstnat src-address-list=DSX-morosos dst-address-list=!DSX-aviso protocol=tcp dst-port=80 action=redirect to-ports=${NOTICE_PORT} ${c("web al aviso")}`,
    "/ip proxy",
    `set enabled=yes port=${NOTICE_PORT}`,
    "/ip proxy access",
    `add src-address=${n.poolText} dst-host=${host} action=allow ${c("el aviso")}`,
    `add src-address=${n.poolText} action=redirect action-data=${rosString(o.noticeUrl.trim())} ${c("todo lo demas al aviso")}`,
    `add action=deny ${c("nadie mas usa el proxy")}`,
    // The basic firewall drops everything from the clients to the router: let the suspended ones reach the proxy first.
    `{ :local d [/ip firewall filter find where comment="DS: los clientes no administran el router"]; :if ([:len $d] > 0) do={/ip firewall filter add chain=input src-address-list=DSX-morosos protocol=tcp dst-port=${NOTICE_PORT} action=accept ${c("aviso por el proxy")} place-before=[:pick $d 0]} else={/ip firewall filter add chain=input src-address-list=DSX-morosos protocol=tcp dst-port=${NOTICE_PORT} action=accept ${c("aviso por el proxy")}} }`,
    "/ip firewall filter",
    `add chain=input in-interface-list=DS-WAN protocol=tcp dst-port=${NOTICE_PORT} action=drop ${c("el proxy no se abre a internet")}`,
  ]
  if (o.noticeUrl.trim().startsWith("http://")) issues.push({ code: "noticeHttp", level: "info" })
  if (s.ipv6Pd.trim()) issues.push({ code: "suspendedNoV6", level: "info" })
  issues.push({ code: "httpsNote", level: "info" }, { code: "repasteBase", level: "warn" })
  const undo = [
    ...removeAll("morosos", ["/ip firewall raw", "/ip firewall nat", "/ip firewall filter", "/ip firewall address-list", "/ip proxy access"]),
    "/ip proxy set enabled=no",
    // A profile in use can't be removed: reactivate everyone first.
    ':do {/ppp profile remove [find where name~"^DSX-(reducido|suspendido)$"]} on-error={:log warning "DSX: reactiva a los clientes antes de borrar los perfiles"}',
  ]
  return { script: out.join("\n"), undo: undo.join("\n"), issues }
}

export type ClientAction = "reduce" | "suspend" | "restore"
export type ClientLine = { user: string; plan?: string }
export type ClientCommands = { script: string; errors: { line: number; code: string; value?: string }[] }

/** "usuario" or "usuario,plan" per line (plan needed to restore). */
export function parseClientLines(text: string): { lines: ClientLine[]; errors: ClientCommands["errors"] } {
  const lines: ClientLine[] = []
  const errors: ClientCommands["errors"] = []
  text.split(/\r?\n/).forEach((raw, k) => {
    const t = raw.trim()
    if (!t) return
    const [u, plan] = t.split(/[,;\t]/).map((x) => x.trim())
    if (!u || /\s/.test(u)) errors.push({ line: k + 1, code: "badUser", value: t })
    else lines.push({ user: u, plan: plan || undefined })
  })
  return { lines, errors }
}

/** Change each client's profile and drop its session (the profile applies when it reconnects, in seconds). */
export function clientCommands(action: ClientAction, text: string, planList: string[]): ClientCommands {
  const plans = withFamily(planList)
  const { lines, errors } = parseClientLines(text)
  const out: string[] = []
  for (const l of lines) {
    let profile = action === "reduce" ? "DSX-reducido" : action === "suspend" ? "DSX-suspendido" : (l.plan ?? "")
    if (action === "restore" && !profile) {
      errors.push({ line: 0, code: "noPlan", value: l.user })
      continue
    }
    if (action === "restore" && !plans.includes(profile)) {
      errors.push({ line: 0, code: "unknownPlan", value: `${l.user},${profile}` })
      continue
    }
    profile = rosString(profile)
    out.push(`/ppp secret set [find where name=${user(l.user)}] profile=${profile}`, `/ppp active remove [find where name=${user(l.user)}]`)
  }
  return { script: out.join("\n"), errors }
}

// ── 2 Remote access ─────────────────────────────────────────────────────────

export type RemoteMode = "bth" | "hub"
export type RemoteOptions = {
  mode: RemoteMode
  /** Back To Home: one user per person/phone. */
  users: string
  /** Hub: address and port of the hub (a router or VPS with a public IP), tunnel network and this router's host number. */
  hub: string
  hubPort: number
  tunnel: string
  host: number
}
export const DEFAULT_REMOTE: RemoteOptions = { mode: "bth", users: "oficina, celular", hub: "", hubPort: 13231, tunnel: "10.255.0.0/24", host: 2 }
/** Back To Home's own network (RouterOS 7.25 ip/cloud). */
export const BTH_NET = "192.168.216.0/24"

export function remoteScript(ctx: AdvContext, o: RemoteOptions): AdvResult & { hubSide: string } {
  const issues: AdvIssue[] = []
  const n = nets(ctx, issues)
  const c = comment("acceso")
  if (o.mode === "bth") {
    const users = list(o.users)
    if (!users.length) issues.push({ code: "noUsers", level: "error" })
    if (!n || hasError(issues)) return { ...fail(issues), hubSide: "" }
    const from = `${n.mgmtText},${BTH_NET}`
    const out = [
      // Works without a public IP: MikroTik's relay connects the phone and the router.
      "/ip cloud set back-to-home-vpn=enabled",
      ":delay 15s",
      "/ip cloud back-to-home-user",
      ...users.map((u) => `add name=${rosString(u)} allow-lan=yes`),
      `/ip service set winbox available-from=${from}`,
      `/ip service set ssh available-from=${from}`,
      ...users.map((u) => `/ip cloud back-to-home-user show-client-config [find where name=${rosString(u)}]`),
    ]
    issues.push({ code: "bthApp", level: "info" }, { code: "repasteBase", level: "warn" })
    const undo = ["/ip cloud set back-to-home-vpn=revoked-and-disabled", `/ip service set winbox available-from=${n.mgmtText}`, `/ip service set ssh available-from=${n.mgmtText}`]
    return { script: out.join("\n"), undo: undo.join("\n"), issues, hubSide: "" }
  }
  const tunnel = parseCidr(o.tunnel)
  if (!o.hub.trim() || !HOST.test(o.hub.trim())) issues.push({ code: "hub", level: "error" })
  if (!tunnel || tunnel.prefix > 30) issues.push({ code: "tunnel", level: "error" })
  if (tunnel && !(o.host >= 2 && o.host < size(tunnel) - 1)) issues.push({ code: "host", level: "error" })
  if (!(o.hubPort > 0 && o.hubPort < 65536)) issues.push({ code: "hubPort", level: "error" })
  if (!n || !tunnel || hasError(issues)) return { ...fail(issues), hubSide: "" }
  const ip = intToIp(tunnel.net + o.host)
  const tun = cidrText(tunnel)
  const name = ctx.name.trim() || "despliegue"
  const out = [
    "/interface wireguard",
    `add name=DSX-wg listen-port=${o.hubPort} ${c("tunel a la oficina")}`,
    "/interface wireguard peers",
    `add interface=DSX-wg name=hub public-key=${rosString(SECRET("clave-publica-del-hub"))} endpoint-address=${o.hub.trim()} endpoint-port=${o.hubPort} allowed-address=${tun} persistent-keepalive=25s ${c("el hub")}`,
    "/ip address",
    `add address=${ip}/${tunnel.prefix} interface=DSX-wg ${c("tunel a la oficina")}`,
    `/ip service set winbox available-from=${n.mgmtText},${tun}`,
    `/ip service set ssh available-from=${n.mgmtText},${tun}`,
    ":put [/interface wireguard get [find where name=DSX-wg] public-key]",
  ]
  // On the hub: this router as a peer, and its management network (the OLT) through it.
  const hubSide = [
    "/interface wireguard peers",
    `add interface=wg-hub name=${rosString(name)} public-key=${rosString(SECRET(`clave-publica-de-${name}`))} allowed-address=${ip}/32,${n.mgmtText} ${c(name)}`,
    "/ip route",
    `add dst-address=${n.mgmtText} gateway=wg-hub ${c(`gestion de ${name}`)}`,
  ].join("\n")
  issues.push({ code: "mgmtUnique", level: "info" }, { code: "repasteBase", level: "warn" })
  const undo = [`/ip service set winbox available-from=${n.mgmtText}`, `/ip service set ssh available-from=${n.mgmtText}`, ...removeAll("acceso", ["/ip address", "/interface wireguard peers", "/interface wireguard"])]
  return { script: out.join("\n"), undo: undo.join("\n"), issues, hubSide }
}

// ── 3 DNS filtering ─────────────────────────────────────────────────────────

export type DnsFilterOptions = { ads: boolean; adult: boolean; force: boolean; family: boolean }
export const DEFAULT_DNS_FILTER: DnsFilterOptions = { ads: true, adult: false, force: true, family: true }
/** StevenBlack hosts lists (GitHub, 2026-11-15): unified = ads + malware (~76k names), porn-only (~77k). */
export const ADLISTS = {
  ads: "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts",
  adult: "https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn-only/hosts",
}
/** Cloudflare for Families: malware + adult content blocked. */
export const FAMILY_DNS = ["1.1.1.3", "1.0.0.3"]
export const familyName = (plan: string) => `${plan}-familia`
/** The plan profiles plus their -familia twins (both are valid targets for a client). */
export const withFamily = (plans: string[]) => [...plans, ...plans.map(familyName)]

export function dnsFilterScript(ctx: AdvContext, o: DnsFilterOptions): AdvResult {
  const issues: AdvIssue[] = []
  const n = nets(ctx, issues)
  const routerDns = ctx.setup.dnsMode === "router"
  if ((o.ads || o.adult || o.force) && !routerDns) issues.push({ code: "needsRouterDns", level: "error" })
  if (!o.ads && !o.adult && !o.force && !o.family) issues.push({ code: "nothing", level: "error" })
  if (!n || hasError(issues)) return fail(issues)
  const c = comment("dns")
  const out: string[] = []
  const urls = [...(o.ads ? [ADLISTS.ads] : []), ...(o.adult ? [ADLISTS.adult] : [])]
  if (urls.length) out.push("/ip dns adlist", ...urls.map((u) => `add url=${u} ssl-verify=yes`))
  out.push("/ip firewall nat")
  // Families first: their DNS goes to the family resolver whatever the device asks.
  if (o.family)
    for (const proto of ["udp", "tcp"])
      out.push(`add chain=dstnat src-address-list=DSX-familia protocol=${proto} dst-port=53 action=dst-nat to-addresses=${FAMILY_DNS[0]} to-ports=53 ${c("familias al DNS con filtro")}`)
  if (o.force)
    for (const proto of ["udp", "tcp"])
      out.push(`add chain=dstnat src-address=${n.poolText} dst-address=!${n.local} protocol=${proto} dst-port=53 action=redirect to-ports=53 ${c("todo el DNS al router")}`)
  if (o.force && ctx.setup.ipv6Pd.trim())
    out.push("/ipv6 firewall nat", ...["udp", "tcp"].map((proto) => `add chain=dstnat in-interface-list=DS-LAN protocol=${proto} dst-port=53 action=redirect to-ports=53 ${c("todo el DNS IPv6 al router")}`))
  if (o.family) {
    const s = ctx.setup
    out.push("/ppp profile")
    for (const p of plansOf(ctx)) {
      const name = familyName(p.name)
      const props = [...v4Only(profileProps(s, rateLimit(p.pair), ctx.queue)), "address-list=DSX-familia", c(`plan ${p.name} con filtro`)]
      out.push(upsert("/ppp profile", name, props, [`name=${rosString(name)}`, ...props]))
    }
  }
  if (urls.length) issues.push({ code: "cache", level: "info" })
  if (o.force) issues.push({ code: "doh", level: "info" })
  if (o.family && ctx.setup.ipv6Pd.trim()) issues.push({ code: "familyNoV6", level: "info" })
  const undo = [
    ...removeAll("dns", ["/ip firewall nat", "/ipv6 firewall nat"]),
    ...urls.map((u) => `/ip dns adlist remove [find where url=${rosString(u)}]`),
    ...(o.family ? [':do {/ppp profile remove [find where name~"-familia$"]} on-error={:log warning "DSX: regresa a los clientes a su plan antes de borrar los perfiles -familia"}'] : []),
  ]
  return { script: out.join("\n"), undo: undo.join("\n"), issues }
}

// ── 4 Per-client usage ──────────────────────────────────────────────────────

export type UsageOptions = {
  /** Fair use: monthly download cap in GB (0 = none); over it, the client goes to DSX-reducido. */
  capGb: number
  /** Daily top-N report through DS-aviso (0 = none). */
  top: number
  reportTime: string
}
export const DEFAULT_USAGE: UsageOptions = { capGb: 0, top: 5, reportTime: "08:00:00" }
export const USAGE_EVERY_MIN = 10
/** Hours between writes of the totals into the accounts: every write goes to flash, so not too often. */
export const USAGE_SAVE_H = 6

/**
 * Every 10 minutes, DSX-uso adds what each PPPoE session moved since the last run (its interface counters; a counter
 * lower than the last one means the session started again). Every hour DSX-uso-guardar writes the month's totals in MB
 * into the account's comment: "[uso 2026-11 12345/678 MB]" (download/upload), kept with the configuration and visible in
 * Winbox. A new month starts from zero and logs the old line. After a reboot every session is new, so nothing is lost
 * beyond the last 10 minutes.
 */
export function usageScript(ctx: AdvContext, o: UsageOptions): AdvResult {
  const issues: AdvIssue[] = []
  if (!(o.capGb >= 0)) issues.push({ code: "cap", level: "error" })
  if (o.top > 0 && !/^\d{2}:\d{2}:\d{2}$/.test(o.reportTime)) issues.push({ code: "time", level: "error" })
  const alerts = ctx.setup.alert !== "none"
  if (o.top > 0 && !alerts) issues.push({ code: "noAlerts", level: "warn" })
  if (hasError(issues)) return fail(issues)
  const c = comment("uso")
  // Router rx on the session = client upload; tx = client download.
  const count = [
    ":global DSXrx; :global DSXtx; :global DSXdn; :global DSXup",
    ':if ([:typeof $DSXrx] != "array") do={:set DSXrx [:toarray ""]; :set DSXtx [:toarray ""]; :set DSXdn [:toarray ""]; :set DSXup [:toarray ""]}',
    ":foreach s in=[/interface pppoe-server find] do={",
    ":local u [/interface pppoe-server get $s user]; :local n [/interface pppoe-server get $s name]",
    ":local i [/interface find where name=$n]",
    ':if ([:len $i] > 0) do={:local rx [/interface get $i rx-byte]; :local tx [/interface get $i tx-byte]; :local dr $rx; :local dt $tx',
    ':if ([:typeof ($DSXrx->$u)] = "num") do={:if ($rx >= ($DSXrx->$u)) do={:set dr ($rx - ($DSXrx->$u))}}',
    ':if ([:typeof ($DSXtx->$u)] = "num") do={:if ($tx >= ($DSXtx->$u)) do={:set dt ($tx - ($DSXtx->$u))}}',
    ":set ($DSXrx->$u) $rx; :set ($DSXtx->$u) $tx",
    ':if ([:typeof ($DSXup->$u)] != "num") do={:set ($DSXup->$u) 0}; :if ([:typeof ($DSXdn->$u)] != "num") do={:set ($DSXdn->$u) 0}',
    ":set ($DSXup->$u) (($DSXup->$u) + $dr); :set ($DSXdn->$u) (($DSXdn->$u) + $dt)}}",
  ].join(STMT).replace(/\{; /g, "{").replace(/; \}/g, "}")
  const cap = Math.round(o.capGb * 1024)
  const save = [
    ":global DSXdn; :global DSXup",
    ':if ([:typeof $DSXdn] = "array") do={',
    ":local m [:pick [/system clock get date] 0 7]",
    ":foreach u,b in=$DSXdn do={",
    ":local id [/ppp secret find where name=$u]",
    ":if ([:len $id] > 0) do={",
    ':local c [/ppp secret get $id comment]; :local k [:find $c " [uso "]; :local base $c; :local d 0; :local up 0',
    ':if ([:typeof $k] = "num") do={:set base [:pick $c 0 $k]; :local tag [:pick $c ($k + 6) [:len $c]]',
    ':if ([:pick $tag 0 7] = $m) do={:local sl [:find $tag "/"]; :local sp [:find $tag " MB"]; :set d [:tonum [:pick $tag 8 $sl]]; :set up [:tonum [:pick $tag ($sl + 1) $sp]]} else={:log info ("DSX-uso mes usuario=" . $u . " " . $tag)}}',
    ":local bu ($DSXup->$u); :set d ($d + ($b / 1048576)); :set up ($up + ($bu / 1048576))",
    ":set ($DSXdn->$u) ($b % 1048576); :set ($DSXup->$u) ($bu % 1048576)",
    '/ppp secret set $id comment=($base . " [uso " . $m . " " . $d . "/" . $up . " MB]")',
    ...(cap > 0
      ? [
          `:if (($d > ${cap}) && ([:pick [/ppp secret get $id profile] 0 4] != "DSX-") && ([:len [/ppp profile find where name="DSX-reducido"]] > 0)) do={/ppp secret set $id profile=DSX-reducido; /ppp active remove [find where name=$u]; :log warning ("DSX-uso tope usuario=" . $u . " " . $d . " MB")${alerts ? '; :global DSmsg ("tope de uso: " . $u . " paso de ' + o.capGb + ' GB, quedo en velocidad reducida"); /system script run DS-aviso' : ""}}`,
        ]
      : []),
    "}}}",
  ].join(STMT).replace(/\{; /g, "{").replace(/; \}/g, "}")
  const report = [
    ":local m [:pick [/system clock get date] 0 7]; :local best [:toarray \"\"]",
    ':foreach id in=[/ppp secret find where comment~" \\\\[uso "] do={',
    ':local c [/ppp secret get $id comment]; :local k [:find $c " [uso "]; :local tag [:pick $c ($k + 6) [:len $c]]',
    ':if ([:pick $tag 0 7] = $m) do={:local d [:tonum [:pick $tag 8 [:find $tag "/"]]]; :set ($best->[/ppp secret get $id name]) $d}}',
    ':local msg ("mas uso del mes (MB de bajada):"); :for i from=1 to=' + o.top + ' do={:local top ""; :local max -1',
    ':foreach u,d in=$best do={:if ($d > $max) do={:set max $d; :set top $u}}',
    ':if ($max >= 0) do={:set msg ($msg . " " . $top . "=" . $max); :set ($best->$top) -2}}',
    ":global DSmsg $msg; /system script run DS-aviso",
  ].join(STMT).replace(/\{; /g, "{").replace(/; \}/g, "}")
  const out = [
    "/system script",
    `add name=DSX-uso policy=read,write,test dont-require-permissions=yes source=${rosString(count)} ${c("cuenta el trafico por sesion")}`,
    `add name=DSX-uso-guardar policy=read,write,test dont-require-permissions=yes source=${rosString(save)} ${c("totales del mes en el comentario")}`,
    ...(o.top > 0 && alerts ? [`add name=DSX-uso-reporte policy=read,write,test dont-require-permissions=yes source=${rosString(report)} ${c("los que mas usan")}`] : []),
    "/system scheduler",
    `add name=DSX-uso interval=${USAGE_EVERY_MIN}m on-event=DSX-uso ${c("cada 10 min")}`,
    `add name=DSX-uso-guardar interval=${USAGE_SAVE_H}h start-time=00:05:00 on-event=DSX-uso-guardar ${c(`cada ${USAGE_SAVE_H} h`)}`,
    ...(o.top > 0 && alerts ? [`add name=DSX-uso-reporte interval=1d start-time=${o.reportTime} on-event=DSX-uso-reporte ${c("reporte diario")}`] : []),
  ]
  if (cap > 0) issues.push({ code: "capNeedsMorosos", level: "info" })
  const undo = [
    ':do {/system scheduler remove [find where name~"^DSX-uso"]} on-error={}',
    ':do {/system script remove [find where name~"^DSX-uso"]} on-error={}',
    // Comments keep the totals: strip them only on purpose.
    ':foreach id in=[/ppp secret find where comment~" \\\\[uso "] do={:local c [/ppp secret get $id comment]; /ppp secret set $id comment=[:pick $c 0 [:find $c " [uso "]]}',
  ]
  return { script: out.join("\n"), undo: undo.join("\n"), issues }
}

// ── 5 Infected clients and DDoS ─────────────────────────────────────────────

export type ShieldOptions = {
  /** New connections per second one client may open before it's flagged. */
  rate: number
  /** Port-scan detection on the clients' side (psd). */
  scan: boolean
  /** Cut flagged clients (otherwise alert only). */
  block: boolean
  /** MikroTik's DDoS rules for traffic from the internet (useful once the router has public IPs). */
  inbound: boolean
}
export const DEFAULT_SHIELD: ShieldOptions = { rate: 200, scan: true, block: false, inbound: false }

export function shieldScript(ctx: AdvContext, o: ShieldOptions): AdvResult {
  const issues: AdvIssue[] = []
  const n = nets(ctx, issues)
  if (!(o.rate >= 20 && o.rate <= 5000)) issues.push({ code: "rate", level: "error" })
  if (!n || hasError(issues)) return fail(issues)
  const c = comment("escudo")
  const alerts = ctx.setup.alert !== "none"
  const out: string[] = [
    // A client that opens new connections far faster than a person does: malware, a bot or a scanner.
    "/ip firewall filter",
    `add chain=forward action=jump jump-target=DSX-salida connection-state=new src-address=${n.poolText} ${c("conexiones nuevas de los clientes")}`,
    `add chain=DSX-salida action=return dst-limit=${o.rate},${o.rate * 2},src-address/1m ${c("ritmo normal")}`,
    `add chain=DSX-salida action=add-src-to-address-list address-list=DSX-infectados address-list-timeout=1h ${c("ritmo de bot")}`,
  ]
  if (o.scan) out.push("/ip firewall raw", `add chain=prerouting in-interface-list=DS-LAN psd=21,3s,3,1 action=add-src-to-address-list address-list=DSX-infectados address-list-timeout=1h ${c("escaneo de puertos")}`)
  if (o.block) out.push("/ip firewall raw", `add chain=prerouting in-interface-list=DS-LAN src-address-list=DSX-infectados dst-address-type=!local action=drop ${c("cliente marcado, cortado 1 h")}`)
  if (o.inbound)
    out.push(
      // MikroTik's "DDoS Protection" guide (7.25), from the internet side: SYNs counted in raw, before the filter drops them.
      "/ip firewall raw",
      `add chain=prerouting in-interface-list=DS-WAN protocol=tcp tcp-flags=syn,!ack action=jump jump-target=DSX-ddos ${c("SYN desde internet")}`,
      `add chain=DSX-ddos action=return dst-limit=32,32,src-and-dst-addresses/10s ${c("ritmo normal")}`,
      `add chain=DSX-ddos action=add-dst-to-address-list address-list=DSX-ddos-objetivos address-list-timeout=10m ${c("objetivo")}`,
      `add chain=DSX-ddos action=add-src-to-address-list address-list=DSX-ddos-atacantes address-list-timeout=10m ${c("atacante")}`,
      `add chain=prerouting action=drop src-address-list=DSX-ddos-atacantes dst-address-list=DSX-ddos-objetivos ${c("ataque cortado")}`
    )
  if (alerts) {
    const watch = [
      ":global DSXvistos; :if ([:typeof $DSXvistos] != \"array\") do={:set DSXvistos [:toarray \"\"]}; :local msg \"\"",
      ':foreach e in=[/ip firewall address-list find where list="DSX-infectados"] do={:local a [/ip firewall address-list get $e address]',
      ':if (($DSXvistos->$a) != 1) do={:set ($DSXvistos->$a) 1; :local u [/ppp active find where address=$a]; :local who $a; :if ([:len $u] > 0) do={:set who ([/ppp active get [:pick $u 0] name] . " (" . $a . ")")}; :set msg ($msg . " " . $who)}}',
      ':if ([:len $msg] > 0) do={:global DSmsg ("cliente(s) con trafico de bot:" . $msg); /system script run DS-aviso}',
      ':foreach a,v in=$DSXvistos do={:if ([:len [/ip firewall address-list find where list="DSX-infectados" and address=$a]] = 0) do={:set ($DSXvistos->$a) 0}}',
    ].join(STMT).replace(/\{; /g, "{").replace(/; \}/g, "}")
    out.push(
      "/system script",
      `add name=DSX-escudo policy=read,write,test dont-require-permissions=yes source=${rosString(watch)} ${c("avisa de clientes marcados")}`,
      "/system scheduler",
      `add name=DSX-escudo interval=5m on-event=DSX-escudo ${c("cada 5 min")}`
    )
  } else issues.push({ code: "noAlerts", level: "warn" })
  issues.push({ code: "behindNat", level: "info" })
  const undo = [
    ':do {/system scheduler remove [find where name="DSX-escudo"]} on-error={}',
    ':do {/system script remove [find where name="DSX-escudo"]} on-error={}',
    // Jumps first, then their chains.
    '/ip firewall filter remove [find where comment~"^DSX escudo: " and chain!="DSX-salida"]',
    '/ip firewall filter remove [find where chain="DSX-salida"]',
    '/ip firewall raw remove [find where comment~"^DSX escudo: " and chain!="DSX-ddos"]',
    '/ip firewall raw remove [find where chain="DSX-ddos"]',
    '/ip firewall address-list remove [find where list~"^DSX-(infectados|ddos-)"]',
  ]
  return { script: out.join("\n"), undo: undo.join("\n"), issues }
}

// ── 6 Scheduled speeds ──────────────────────────────────────────────────────

export type BoostOptions = { factor: number; start: string; end: string; capMbps: number; reconnect: boolean }
export const DEFAULT_BOOST: BoostOptions = { factor: 2, start: "00:00:00", end: "06:00:00", capMbps: 1000, reconnect: true }
export const TIME = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/

/** The plans with their speeds multiplied (capped), same names and burst rule. */
export function boostedPlans(plans: SetupPlan[], rule: PlanRule, o: BoostOptions) {
  const normal = setupPlans(plans, rule)
  const scaled = setupPlans(
    plans.map((p) => ({ ...p, down: Math.min(o.capMbps, p.down * o.factor), up: Math.min(o.capMbps, p.up * o.factor) })),
    rule
  )
  return normal.map((p, k) => ({ name: p.name, normal: rateLimit(p.pair), boost: rateLimit(scaled[k].pair), down: scaled[k].down, up: scaled[k].up }))
}

/**
 * Night boost: at the start the plan profiles take faster rate limits, at the end they go back. A profile change only
 * reaches a session when it reconnects, so the scripts can drop the sessions of each plan (they come back in seconds,
 * possibly with another address). At startup the router puts the profiles in the state that matches the hour.
 */
export function boostScript(ctx: AdvContext, o: BoostOptions): AdvResult {
  const issues: AdvIssue[] = []
  if (!(o.factor > 1 && o.factor <= 10)) issues.push({ code: "factor", level: "error" })
  if (!TIME.test(o.start) || !TIME.test(o.end) || o.start === o.end) issues.push({ code: "window", level: "error" })
  if (!(o.capMbps > 0)) issues.push({ code: "capMbps", level: "error" })
  const plans = boostedPlans(ctx.setup.plans, ctx.setup.rule, o)
  if (!plans.length) issues.push({ code: "noPlans", level: "error" })
  if (hasError(issues)) return fail(issues)
  const c = comment("velocidad")
  const kick = (plan: string) =>
    o.reconnect ? `; :foreach s in=[/ppp secret find where profile=${rosString(plan)}] do={/ppp active remove [find where name=[/ppp secret get $s name]]}` : ""
  // Each plan and its -familia twin (DNS filter), when it exists: a set on an empty find does nothing.
  const apply = (which: "boost" | "normal") =>
    plans.flatMap((p) => [p.name, familyName(p.name)].map((name) => `/ppp profile set [find where name=${rosString(name)}] rate-limit=${rosString(p[which])}${kick(name)}`)).join("; ")
  // HH:MM:SS compares as text; the window may cross midnight.
  const inside = o.start < o.end ? `(($t >= "${o.start}") && ($t < "${o.end}"))` : `(($t >= "${o.start}") || ($t < "${o.end}"))`
  const check = `:local t [:pick [/system clock get time] 0 8]; :if ${inside} do={/system script run DSX-noche-inicio} else={/system script run DSX-noche-fin}`
  const out = [
    "/system script",
    `add name=DSX-noche-inicio policy=read,write,test dont-require-permissions=yes source=${rosString(apply("boost"))} ${c("sube las velocidades")}`,
    `add name=DSX-noche-fin policy=read,write,test dont-require-permissions=yes source=${rosString(apply("normal"))} ${c("regresa las velocidades")}`,
    `add name=DSX-noche-revisar policy=read,write,test dont-require-permissions=yes source=${rosString(check)} ${c("al arrancar")}`,
    "/system scheduler",
    `add name=DSX-noche-inicio start-time=${o.start} interval=1d on-event=DSX-noche-inicio ${c("inicio")}`,
    `add name=DSX-noche-fin start-time=${o.end} interval=1d on-event=DSX-noche-fin ${c("fin")}`,
    `add name=DSX-noche-revisar start-time=startup on-event=${rosString(":delay 30s; /system script run DSX-noche-revisar")} ${c("al arrancar")}`,
  ]
  if (o.reconnect) issues.push({ code: "reconnect", level: "info" })
  const undo = [
    ':do {/system scheduler remove [find where name~"^DSX-noche"]} on-error={}',
    ":do {/system script run DSX-noche-fin} on-error={}",
    ':do {/system script remove [find where name~"^DSX-noche"]} on-error={}',
  ]
  return { script: out.join("\n"), undo: undo.join("\n"), issues }
}

export type UpgradeInput = { user: string; to: string; back: string; date: string; time: string }

/** A temporary plan change that reverts by itself on the date given. */
export function upgradeCommands(u: UpgradeInput, planList: string[]): { script: string; issues: AdvIssue[] } {
  const plans = withFamily(planList)
  const issues: AdvIssue[] = []
  if (!u.user.trim() || /\s/.test(u.user.trim())) issues.push({ code: "badUser", level: "error" })
  if (!plans.includes(u.to)) issues.push({ code: "unknownPlan", level: "error", value: u.to })
  if (!plans.includes(u.back)) issues.push({ code: "unknownPlan", level: "error", value: u.back })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(u.date) || !TIME.test(u.time)) issues.push({ code: "when", level: "error" })
  if (hasError(issues)) return { script: "", issues }
  const name = `DSX-regresa-${u.user.trim().replace(/[^\w.-]/g, "_")}`
  const back = `/ppp secret set [find where name=${user(u.user)}] profile=${rosString(u.back)}; /ppp active remove [find where name=${user(u.user)}]; /system scheduler remove [find where name=${rosString(name)}]`
  return {
    script: [
      `/ppp secret set [find where name=${user(u.user)}] profile=${rosString(u.to)}`,
      `/ppp active remove [find where name=${user(u.user)}]`,
      `/system scheduler add name=${rosString(name)} start-date=${u.date} start-time=${u.time} on-event=${rosString(back)} comment=${rosString(`DSX velocidad: regresa a ${u.back}`)}`,
    ].join("\n"),
    issues,
  }
}

// ── 7 BGP ───────────────────────────────────────────────────────────────────

export type BgpPeer = { name: string; address: string; as: number; prepend: number }
export type BgpOptions = { asn: number; routerId: string; prefixes: string; peers: string }
export const DEFAULT_BGP: BgpOptions = { asn: 0, routerId: "", prefixes: "", peers: "" }
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/
const IPV6 = /^[0-9a-f:]+$/i
const asnOk = (n: number) => Number.isInteger(n) && n >= 1 && n <= 4294967295
const privateAsn = (n: number) => (n >= 64512 && n <= 65534) || (n >= 4200000000 && n <= 4294967294)

/** "nombre,ip,as[,prepend]" per line. */
export function parseBgpPeers(text: string): { peers: BgpPeer[]; bad: string[] } {
  const peers: BgpPeer[] = []
  const bad: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim()
    if (!t) continue
    const [name, address, as, prepend] = t.split(",").map((x) => x.trim())
    const a = Number(as)
    const p = prepend ? Number(prepend) : 0
    if (!name || !/^[\w-]+$/.test(name) || !(IPV4.test(address ?? "") || (address?.includes(":") && IPV6.test(address))) || !asnOk(a) || !(Number.isInteger(p) && p >= 0 && p <= 5)) bad.push(t)
    else peers.push({ name, address, as: a, prepend: p })
  }
  return { peers, bad }
}

/**
 * For when the company has its own ASN and address blocks: the BGP instance, the blocks announced (blackhole routes so
 * they exist in the table), per-carrier filters (in: only a default route; out: only our blocks, with optional
 * prepending) and the sessions. Filter rules use the 7.25 route-filter language.
 */
export function bgpScript(o: BgpOptions): AdvResult {
  const issues: AdvIssue[] = []
  if (!asnOk(o.asn)) issues.push({ code: "asn", level: "error" })
  else if (privateAsn(o.asn)) issues.push({ code: "privateAsn", level: "warn" })
  if (!IPV4.test(o.routerId.trim())) issues.push({ code: "routerId", level: "error" })
  const prefixes = list(o.prefixes)
  const v4 = prefixes.filter((p) => parseCidr(p))
  const v6 = prefixes.filter((p) => p.includes(":") && /^[0-9a-f:]+\/\d{1,3}$/i.test(p))
  const badPrefix = prefixes.find((p) => !v4.includes(p) && !v6.includes(p))
  if (!prefixes.length) issues.push({ code: "noPrefixes", level: "error" })
  if (badPrefix) issues.push({ code: "badPrefix", level: "error", value: badPrefix })
  for (const p of v4) if ((parseCidr(p) as Cidr).prefix > 24) issues.push({ code: "longPrefix", level: "warn", value: p })
  for (const p of v6) if (Number(p.split("/")[1]) > 48) issues.push({ code: "longPrefix", level: "warn", value: p })
  const { peers, bad } = parseBgpPeers(o.peers)
  if (!peers.length) issues.push({ code: "noPeers", level: "error" })
  for (const b of bad) issues.push({ code: "badPeer", level: "error", value: b })
  if (hasError(issues)) return fail(issues)
  const c = comment("bgp")
  const out: string[] = ["/routing bgp instance", `add name=DSX-bgp as=${o.asn} router-id=${o.routerId.trim()}`]
  if (v4.length) out.push("/ip firewall address-list", ...v4.map((p) => `add list=DSX-bgp-propios address=${p} ${c("bloque propio")}`), "/ip route", ...v4.map((p) => `add dst-address=${p} blackhole ${c("bloque propio")}`))
  if (v6.length) out.push("/ipv6 firewall address-list", ...v6.map((p) => `add list=DSX-bgp-propios6 address=${p} ${c("bloque propio")}`), "/ipv6 route", ...v6.map((p) => `add dst-address=${p} blackhole ${c("bloque propio")}`))
  out.push("/routing filter rule")
  for (const p of peers) {
    const six = p.address.includes(":")
    const own = six ? "DSX-bgp-propios6" : "DSX-bgp-propios"
    const def = six ? "::/0" : "0.0.0.0/0"
    out.push(
      `add chain=${rosString(`DSX-entrada-${p.name}`)} rule=${rosString(`if (dst in ${def} && dst-len in 0-0) { accept }`)} ${c(`solo la ruta por defecto de ${p.name}`)}`,
      `add chain=${rosString(`DSX-salida-${p.name}`)} rule=${rosString(`if (dst in ${own} && dst-len < ${six ? 128 : 32}) { ${p.prepend ? `set bgp-path-prepend ${p.prepend}; ` : ""}accept }`)} ${c(`solo nuestros bloques a ${p.name}`)}`
    )
  }
  out.push("/routing bgp connection")
  for (const p of peers) {
    const six = p.address.includes(":")
    out.push(
      `add name=${rosString(`DSX-${p.name}`)} instance=DSX-bgp remote.address=${p.address} remote.as=${p.as} local.role=ebgp afi=${six ? "ipv6" : "ip"} output.network=${six ? "DSX-bgp-propios6" : "DSX-bgp-propios"} output.filter-chain=${rosString(`DSX-salida-${p.name}`)} input.filter=${rosString(`DSX-entrada-${p.name}`)} ${c(p.name)}`
    )
    if (six && !v6.length) issues.push({ code: "v6PeerNoPrefix", level: "warn", value: p.name })
  }
  issues.push({ code: "prepare", level: "info" })
  const undo = [
    ...removeAll("bgp", ["/routing bgp connection", "/routing filter rule", "/ip route", "/ipv6 route", "/ip firewall address-list", "/ipv6 firewall address-list"]),
    '/routing bgp instance remove [find where name="DSX-bgp"]',
  ]
  return { script: out.join("\n"), undo: undo.join("\n"), issues }
}

// ── 8 Monitoring without a server ───────────────────────────────────────────

export type MonitorOptions = { graphs: boolean; watchdog: boolean; dropAlert: number; dropPct: number; summaryTime: string }
export const DEFAULT_MONITOR: MonitorOptions = { graphs: true, watchdog: true, dropAlert: 20, dropPct: 20, summaryTime: "07:30:00" }

export function monitorScript(ctx: AdvContext, o: MonitorOptions): AdvResult {
  const issues: AdvIssue[] = []
  const n = nets(ctx, issues)
  const alerts = ctx.setup.alert !== "none"
  if (o.summaryTime && !TIME.test(o.summaryTime)) issues.push({ code: "time", level: "error" })
  if (!(o.dropAlert >= 0) || !(o.dropPct >= 0 && o.dropPct <= 100)) issues.push({ code: "drop", level: "error" })
  if (!alerts && (o.dropAlert > 0 || o.summaryTime)) issues.push({ code: "noAlerts", level: "warn" })
  if (!n || hasError(issues)) return fail(issues)
  const c = comment("monitoreo")
  const out: string[] = []
  const ifaces = [...ctx.wans.map((w) => w.iface.trim()).filter(Boolean), ctx.setup.oltPort.trim()].filter(Boolean)
  if (o.graphs)
    out.push(
      "/tool graphing set store-every=5min",
      "/tool graphing interface",
      ...ifaces.map((i) => `add interface=${rosString(i)} allow-address=${n.mgmtText} store-on-disk=yes`),
      "/tool graphing resource",
      `add allow-address=${n.mgmtText} store-on-disk=yes`,
      // The graphs are served by the www service: only to the management network.
      `/ip service set www disabled=no available-from=${n.mgmtText}`
    )
  // Hardware watchdog only: with a ping target it would reboot the router whenever the internet goes down.
  if (o.watchdog) out.push("/system watchdog set watchdog-timer=yes automatic-supout=yes watch-address=none")
  if (alerts && o.dropAlert > 0) {
    const drop = `:global DSXses; :local n [/ppp active print count-only]; :if ([:typeof $DSXses] = "num") do={:local d ($DSXses - $n); :if (($d >= ${o.dropAlert}) && (($d * 100) >= ($DSXses * ${o.dropPct}))) do={:global DSmsg ("se cayeron " . $d . " sesiones PPPoE en un minuto, quedan " . $n . ": revisa la OLT o un puerto PON"); /system script run DS-aviso}}; :set DSXses $n`
    out.push("/system script", `add name=DSX-caida policy=read,write,test dont-require-permissions=yes source=${rosString(drop)} ${c("caida masiva")}`, "/system scheduler", `add name=DSX-caida interval=1m on-event=DSX-caida ${c("cada minuto")}`)
  }
  if (alerts && o.summaryTime) {
    const sum = `:global DSmsg ("resumen: " . [/ppp active print count-only] . " sesiones PPPoE, CPU " . [/system resource get cpu-load] . " %, memoria libre " . ([/system resource get free-memory] / 1048576) . " MB, encendido " . [/system resource get uptime]); /system script run DS-aviso`
    out.push("/system script", `add name=DSX-resumen policy=read,write,test dont-require-permissions=yes source=${rosString(sum)} ${c("resumen diario")}`, "/system scheduler", `add name=DSX-resumen start-time=${o.summaryTime} interval=1d on-event=DSX-resumen ${c("resumen diario")}`)
  }
  if (!out.length) issues.push({ code: "nothing", level: "error" })
  if (hasError(issues)) return fail(issues)
  if (o.graphs) issues.push({ code: "graphsUrl", level: "info", value: intToIp(n.mgmt.net + 1) }, { code: "repasteBase", level: "warn" })
  const undo = [
    ':do {/system scheduler remove [find where name~"^DSX-(caida|resumen)$"]} on-error={}',
    ':do {/system script remove [find where name~"^DSX-(caida|resumen)$"]} on-error={}',
    ...(o.graphs ? [`/tool graphing interface remove [find where allow-address=${n.mgmtText}]`, `/tool graphing resource remove [find where allow-address=${n.mgmtText}]`, "/ip service set www disabled=yes"] : []),
  ]
  return { script: out.join("\n"), undo: undo.join("\n"), issues }
}

// ── 9 Backup router ─────────────────────────────────────────────────────────

export type BackupRouterOptions = { vrid: number; padoDelay: number; syncUser: string }
export const DEFAULT_BACKUP_ROUTER: BackupRouterOptions = { vrid: 10, padoDelay: 300, syncUser: "DSX-sync" }

/**
 * Two routers per deployment, both answering PPPoE: the main one first, the backup after pado-delay, each from its own
 * half of the pool (no address is handed out twice). If the main router dies, the ONTs dial again and the backup takes
 * them. The management gateway the OLT uses (.1) becomes a VRRP address; the routers keep .3 (main) and .4 (backup).
 * The accounts are copied every hour from the main router to the backup by SFTP over the management network.
 */
export function backupRouterScripts(ctx: AdvContext, o: BackupRouterOptions): { main: string; backup: string; undoMain: string; backupIp: string; issues: AdvIssue[] } {
  const issues: AdvIssue[] = []
  const n = nets(ctx, issues)
  if (!(Number.isInteger(o.vrid) && o.vrid >= 1 && o.vrid <= 255)) issues.push({ code: "vrid", level: "error" })
  if (!(o.padoDelay >= 100 && o.padoDelay <= 5000)) issues.push({ code: "pado", level: "error" })
  if (!/^[\w-]+$/.test(o.syncUser)) issues.push({ code: "syncUser", level: "error" })
  if (n && n.mgmt.prefix > 29) issues.push({ code: "mgmtSmall", level: "error" })
  if (n && size(n.pool) < 16) issues.push({ code: "poolSmall", level: "error" })
  if (!n || hasError(issues)) return { main: "", backup: "", undoMain: "", backupIp: "", issues }
  const s = ctx.setup
  const c = comment("respaldo")
  const mg = vlanName(s.mgmtVlan, "gestion")
  const p = n.mgmt.prefix
  const vip = intToIp(n.mgmt.net + 1)
  const mainIp = intToIp(n.mgmt.net + 3)
  const backupIp = intToIp(n.mgmt.net + 4)
  const first = n.pool.net + 2
  const last = n.pool.net + size(n.pool) - 2
  // Halves of the block: the main router up to its middle, the backup from there.
  const mid = n.pool.net + size(n.pool) / 2 - 1
  // One line, so it runs whole on the router even when the management session drops halfway (it reconnects in seconds):
  // the router's own address first, then the old .1 moves to VRRP.
  const move = (ip: string, prio: number, what: string) =>
    `{ /ip address add address=${ip}/${p} interface=${rosString(mg)} ${c(what)}; /ip address remove [find where comment="DS: gestion de la OLT"]; /interface vrrp add name=DSX-vrrp interface=${rosString(mg)} vrid=${o.vrid} priority=${prio} ${c("gateway de la OLT")}; :delay 2s; /ip address add address=${vip}/32 interface=DSX-vrrp ${c("gateway de la OLT (VRRP)")} }`
  const main = [
    move(mainIp, 200, "gestion del principal"),
    `/ip pool set [find where name="DS-clientes"] ranges=${intToIp(first)}-${intToIp(mid)}`,
    "/system script",
    `add name=DSX-sync policy=ftp,read,write,test,sensitive dont-require-permissions=yes source=${rosString(
      `/ppp secret export show-sensitive file=DSX-secretos; :delay 5s; /tool fetch upload=yes mode=sftp address=${backupIp} user=${o.syncUser} password="${SECRET("clave-de-sincronizacion")}" src-path=DSX-secretos.rsc dst-path=DSX-secretos.rsc`
    )} ${c("copia las cuentas al respaldo")}`,
    "/system scheduler",
    `add name=DSX-sync interval=1h start-time=00:10:00 on-event=DSX-sync ${c("cada hora")}`,
  ].join("\n")
  const backup = [
    `/system identity set name=${rosString(`${ctx.name.trim() || "despliegue"}-respaldo`)}`,
    move(backupIp, 100, "gestion del respaldo"),
    `/ip pool set [find where name="DS-clientes"] ranges=${intToIp(mid + 1)}-${intToIp(last)}`,
    `/interface pppoe-server server set [find where service-name=${rosString(s.service.trim())}] pado-delay=${o.padoDelay}`,
    "/user",
    `add name=${o.syncUser} group=full address=${n.mgmtText} password="${SECRET("clave-de-sincronizacion")}" ${c("solo para copiar las cuentas")}`,
    "/system script",
    `add name=DSX-sync-importar policy=ftp,read,write,test,sensitive dont-require-permissions=yes source=${rosString(
      ':if ([:len [/file find where name="DSX-secretos.rsc"]] > 0) do={/ppp secret remove [find]; /import file-name=DSX-secretos.rsc; /file remove [find where name="DSX-secretos.rsc"]; :log info "DSX: cuentas copiadas del principal"}'
    )} ${c("aplica las cuentas copiadas")}`,
    "/system scheduler",
    `add name=DSX-sync-importar interval=1h start-time=00:20:00 on-event=DSX-sync-importar ${c("cada hora")}`,
  ].join("\n")
  const undoMain = [
    ':do {/system scheduler remove [find where name~"^DSX-sync"]} on-error={}',
    ':do {/system script remove [find where name~"^DSX-sync"]} on-error={}',
    `/ip pool set [find where name="DS-clientes"] ranges=${intToIp(first)}-${intToIp(last)}`,
    `{ /ip address remove [find where comment~"^DSX respaldo: "]; /interface vrrp remove [find where name="DSX-vrrp"]; /ip address add address=${vip}/${p} interface=${rosString(mg)} comment="DS: gestion de la OLT" }`,
  ].join("\n")
  issues.push({ code: "links", level: "info" }, { code: "sameSetup", level: "info" })
  return { main, backup, undoMain, backupIp, issues }
}

// ── 10 Fixed exit per destination ───────────────────────────────────────────

export type RouteRule = { wan: string; dest: string }

/**
 * Some services must leave through one carrier (its TV, a bank that ties the session to one IP): their addresses or
 * domains go in an address list, and a mangle rule placed before the balancing (PCC) gives those connections that
 * carrier's mark; the balancing's own rules then route them through its table (and its backups if it fails).
 */
export function routeScript(ctx: AdvContext, rules: RouteRule[]): AdvResult {
  const issues: AdvIssue[] = []
  const wans = new Map(ctx.wans.map((w) => [w.name, w]))
  if (ctx.wans.length < 2) issues.push({ code: "needsBalance", level: "error" })
  const used = rules.filter((r) => r.dest.trim())
  if (!used.length) issues.push({ code: "noRules", level: "error" })
  for (const r of used) {
    if (!wans.has(r.wan)) issues.push({ code: "unknownWan", level: "error", value: r.wan })
    const bad = list(r.dest).find((d) => !HOST.test(d))
    if (bad) issues.push({ code: "badHost", level: "error", value: bad })
  }
  if (hasError(issues)) return fail(issues)
  const c = comment("destinos")
  const out: string[] = ["/ip firewall address-list"]
  for (const r of used) for (const d of list(r.dest)) out.push(`add list=${rosString(`DSX-por-${r.wan}`)} address=${d} ${c(`sale por ${r.wan}`)}`)
  for (const wan of [...new Set(used.map((r) => r.wan))]) {
    const w = wans.get(wan) as Wan
    const rule = `chain=prerouting action=mark-connection src-address-list=LB-clientes dst-address-list=${rosString(`DSX-por-${wan}`)} connection-mark=no-mark connection-state=new new-connection-mark=${rosString(w.name)} passthrough=yes ${c(`sale por ${wan} (tabla ${tableOf(w)})`)}`
    out.push(
      `{ :local p [/ip firewall mangle find where comment~"^LB: reparto"]; :if ([:len $p] > 0) do={/ip firewall mangle add ${rule} place-before=[:pick $p 0]} else={:error "DSX: primero pega el balanceo de Varios enlaces"} }`
    )
  }
  issues.push({ code: "domains", level: "info" })
  return { script: out.join("\n"), undo: removeAll("destinos", ["/ip firewall mangle", "/ip firewall address-list"]).join("\n"), issues }
}
