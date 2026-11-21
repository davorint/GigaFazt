/**
 * Live router control (WispDavor phase 3, owner 2026-11-21: "Router pulls"; automatic with a switch per router; every
 * action logged). Pure rules shared by the agent endpoint, the staff pages and the tests.
 *
 * The MikroTik runs `agentScript` every 2 minutes (a scheduler): it POSTs a report and gets back up to MAX_ACTIONS
 * actions. Nothing reaches the router from outside and the router opens no port.
 *
 * Report lines (text, one per line, fields separated by ";"):
 *   s;user;profile;disabled;active;rx;tx   a PPPoE secret: its profile, disabled (true/false), connected (1/0) and,
 *                                          when connected, its session's byte counters (rx = from the client = upload)
 *   S;user;profile;disabled                the same without traffic, when the report would pass fetch's 64 KB
 *   h;name;uptime;bytes                    a hotspot user WispDavor added (comment "WispDavor")
 *   d;actionId;ok|err                      the result of an action received earlier
 *   g;ip;sent;received;avgRtt              a carrier gateway's ping (phase 4, lib/wispdavor/monitor.ts)
 *   o;user;sent;received;avgRtt            a connected client's ONT ping (phase 4, a slice per visit)
 * Action lines back: "id,kind,user,arg1,arg2,arg3,arg4" (commas: the router splits them with :toarray, so values are
 * checked to never contain one). Kinds: profile (set the secret's profile and drop the session), create, disable,
 * enable, hsprofile (hotspot user profile with a rate limit), voucher, unvoucher.
 *
 * The desired state of each PPPoE user comes from Clientes + Cobranza (the same rules as WispDavor → Cortes): a late
 * client without a standing promise → the suspended profile (DSX-suspendido, the "morosos" script); otherwise → the
 * plan (the MikroTik profile name); a cancelled service → disabled. With the router's switch on, the differences become
 * actions by themselves; off, staff send them.
 */
import type { Client } from "../clients/model"
import { ledger, type Payment } from "../payments/model"
import { ONT_SLICE, parsePing, type GatewayPing, type OntPing } from "./monitor"

export const SUSPENDED_PROFILE = "DSX-suspendido"
export const MAX_ACTIONS = 20
export const POLL_MINUTES = 2
/** An action not reported back within this is sent again (the router may have missed it). */
export const RESEND_MINUTES = 10
export const ACTION_KINDS = ["profile", "create", "disable", "enable", "hsprofile", "voucher", "unvoucher"] as const
export type ActionKind = (typeof ACTION_KINDS)[number]

/** A value safe in an action line and as a RouterOS name: no commas, quotes, spaces or semicolons. */
export const SAFE = /^[\w.@:/+-]{1,64}$/
export const safe = (s: string) => SAFE.test(s)

/** stateOnly: from a report too big for traffic ("S;user;profile;disabled"): connection and counters are left as they were. */
export type Secret = { user: string; profile: string; disabled: boolean; active: boolean; rx: number; tx: number; stateOnly?: boolean }
export type HotspotUse = { name: string; uptime: string; bytes: number }
export type Report = { secrets: Secret[]; hotspot: HotspotUse[]; done: { id: number; ok: boolean }[]; gateways: GatewayPing[]; onts: OntPing[] }

const num = (s: string) => {
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
}

/** The router's report, line by line; anything malformed is skipped. */
export function parseReport(text: string): Report {
  const out: Report = { secrets: [], hotspot: [], done: [], gateways: [], onts: [] }
  for (const raw of text.split(/\r?\n/).slice(0, 20000)) {
    const f = raw.split(";")
    if (f[0] === "s" && f.length >= 7 && f[1]) out.secrets.push({ user: f[1].slice(0, 64), profile: f[2].slice(0, 64), disabled: f[3] === "true" || f[3] === "yes", active: f[4] === "1", rx: num(f[5]), tx: num(f[6]) })
    else if (f[0] === "S" && f.length >= 4 && f[1]) out.secrets.push({ user: f[1].slice(0, 64), profile: f[2].slice(0, 64), disabled: f[3] === "true" || f[3] === "yes", active: false, rx: 0, tx: 0, stateOnly: true })
    else if (f[0] === "h" && f.length >= 4 && f[1]) out.hotspot.push({ name: f[1].slice(0, 64), uptime: f[2].slice(0, 32), bytes: num(f[3]) })
    else if (f[0] === "d" && f.length >= 3 && /^\d+$/.test(f[1])) out.done.push({ id: Number(f[1]), ok: f[2] === "ok" })
    else if ((f[0] === "g" || f[0] === "o") && f.length >= 5 && f[1]) {
      const ping = parsePing(f[2], f[3], f[4])
      if (!ping) continue
      if (f[0] === "g" && /^[\d.]{7,15}$/.test(f[1]) && out.gateways.length < 32) out.gateways.push({ ip: f[1], ...ping })
      if (f[0] === "o" && safe(f[1])) out.onts.push({ user: f[1].slice(0, 64), ...ping })
    }
  }
  return out
}

export type Desired = { user: string; clientId: string; serviceId: string; profile: string; disabled: boolean; suspended: boolean; plan: string }

/** What each PPPoE user of these clients should be on the router (internet services with a user and a plan). */
export function desiredUsers(clients: Client[], payments: Payment[], today: string): Desired[] {
  const out: Desired[] = []
  for (const c of clients) {
    const l = ledger(c, payments, today)
    const cut = l.status === "atrasado" && !(c.promiseDate && c.promiseDate >= today)
    // A manual hold (not for debt) stays suspended whatever the balance says.
    for (const s of c.services) {
      const user = s.pppoeUser.trim()
      if (s.type !== "internet" || !user || !safe(user)) continue
      const plan = s.plan.trim()
      if (s.status === "cancelado") out.push({ user, clientId: c.id, serviceId: s.id, profile: "", disabled: true, suspended: false, plan })
      else if (plan && safe(plan)) {
        const off = cut || (s.status === "suspendido" && s.hold)
        out.push({ user, clientId: c.id, serviceId: s.id, profile: off ? SUSPENDED_PROFILE : plan, disabled: false, suspended: off, plan })
      }
    }
  }
  return out
}

/** Internet services WispDavor can't manage on a router, and why (so staff fix them instead of them being skipped silently). */
export type Unmanaged = { user: string; clientId: string; reason: "user" | "plan" }

export function unmanagedUsers(clients: Client[]): Unmanaged[] {
  const out: Unmanaged[] = []
  for (const c of clients)
    for (const s of c.services) {
      const user = s.pppoeUser.trim()
      if (s.type !== "internet" || !user || s.status === "cancelado") continue
      if (!safe(user)) out.push({ user, clientId: c.id, reason: "user" })
      else if (!s.plan.trim() || !safe(s.plan.trim())) out.push({ user, clientId: c.id, reason: "plan" })
    }
  return out
}

export type Diff = { kind: "profile" | "disable" | "enable"; user: string; profile: string; clientId: string; serviceId: string; suspended: boolean }

/**
 * The changes that bring the router to the desired state. Users the router doesn't have are left for staff to create
 * (`missing`): creating one needs a password that also goes into the ONT. Users the router has and Clientes doesn't
 * are never touched.
 */
export function diffRouter(desired: Desired[], actual: Pick<Secret, "user" | "profile" | "disabled">[]): { changes: Diff[]; missing: Desired[] } {
  const has = new Map(actual.map((a) => [a.user, a]))
  const changes: Diff[] = []
  const missing: Desired[] = []
  for (const d of desired) {
    const a = has.get(d.user)
    if (!a) {
      if (!d.disabled) missing.push(d)
      continue
    }
    const base = { user: d.user, clientId: d.clientId, serviceId: d.serviceId, suspended: d.suspended }
    if (d.disabled) {
      if (!a.disabled) changes.push({ ...base, kind: "disable", profile: "" })
      continue
    }
    if (a.disabled) changes.push({ ...base, kind: "enable", profile: d.profile })
    if (a.profile !== d.profile) changes.push({ ...base, kind: "profile", profile: d.profile })
  }
  return { changes, missing }
}

export type Action = { id: number; kind: ActionKind; user: string; arg1: string; arg2: string; arg3: string; arg4: string }

/** One action line for the router, or null when a value isn't safe to send. */
export function actionLine(a: Action): string | null {
  const vals = [a.user, a.arg1, a.arg2, a.arg3, a.arg4]
  if (!(ACTION_KINDS as readonly string[]).includes(a.kind) || vals.some((v) => v !== "" && !safe(v))) return null
  // No empty trailing fields: RouterOS's :toarray may drop empty values and shift the rest.
  while (vals.length && vals[vals.length - 1] === "") vals.pop()
  return [String(a.id), a.kind, ...vals].join(",")
}

/** Uptime limits for a voucher ("2h", "1d", "0s" = no limit) and bytes (0 = no limit), as RouterOS takes them. */
export const uptimeLimit = (minutes: number) => (minutes > 0 ? `${Math.round(minutes)}m` : "0s")

/** A random code for vouchers/passwords: unambiguous letters and digits. */
export function randomCode(len: number, rand: (n: number) => number = (n) => Math.floor(Math.random() * n)): string {
  const A = "abcdefghjkmnpqrstuvwxyz23456789"
  return Array.from({ length: len }, () => A[rand(A.length)]).join("")
}

/**
 * The RouterOS 7 script for a router: runs every POLL_MINUTES (scheduler "wispdavor"), reports and applies actions.
 * Values from the site are only ever used as values of fixed commands (never :parse), so nothing it receives can run
 * as code. The key is in the script: whoever reads the router's config can impersonate it (only toward WispDavor).
 */
export function agentScript(o: { url: string; routerId: string; key: string }): string {
  const lines = [
    "# WispDavor: agente del router (RouterOS 7). Reporta usuarios PPPoE, tráfico y fichas de hotspot; aplica acciones.",
    "# HTTPS checked (check-certificate=yes) against RouterOS 7's built-in trusted certificates: /certificate settings",
    "# builtin-trust-store includes fetch by default (MikroTik docs, Certificates).",
    "/system script remove [find where name=wispdavor]",
    "/system scheduler remove [find where name=wispdavor]",
    `/system script add name=wispdavor policy=read,write,test dont-require-permissions=no source={`,
    `:local url "${o.url}"`,
    `:local auth ("Authorization:Bearer ${o.routerId}.${o.key}")`,
    ":global wdDone",
    ':if ([:typeof $wdDone] != "str") do={ :set wdDone "" }',
    ":local out $wdDone",
    ':foreach s in=[/ppp secret find where (service="pppoe" or service="any")] do={',
    "  :local n [/ppp secret get $s name]",
    "  :local p [/ppp secret get $s profile]",
    "  :local d [/ppp secret get $s disabled]",
    "  :local a 0",
    "  :local rx 0",
    "  :local tx 0",
    '  :local i [/interface find where name=("<pppoe-" . $n . ">")]',
    "  :if ([:len $i] > 0) do={ :set a 1; :set rx [/interface get ($i->0) rx-byte]; :set tx [/interface get ($i->0) tx-byte] }",
    '  :set out ($out . "s;" . $n . ";" . $p . ";" . $d . ";" . $a . ";" . $rx . ";" . $tx . "\\n")',
    "}",
    ':foreach h in=[/ip hotspot user find where comment="WispDavor"] do={',
    '  :set out ($out . "h;" . [/ip hotspot user get $h name] . ";" . [/ip hotspot user get $h uptime] . ";" . ([/ip hotspot user get $h bytes-in] + [/ip hotspot user get $h bytes-out]) . "\\n")',
    "}",
    "# Phase 4: each default route's gateway (the carriers), 5 pings. flood-ping gives the latency but needs the",
    "# device-mode feature traffic-gen, off by default in every mode (MikroTik manual, Device mode); without it the",
    "# plain ping counts the replies (in a script /ping returns their number) and the latency goes empty.",
    ':local gws ""',
    "# The gateway lines are kept apart too: a report rebuilt without traffic still carries them.",
    ':local gl ""',
    ":foreach g in=[/ip route find where dst-address=0.0.0.0/0] do={",
    "  :local gs [:tostr [/ip route get $g gateway]]",
    "  # A gateway written ip%interface: the address before the %.",
    '  :local pc [:find $gs "%"]',
    '  :if ([:typeof $pc] = "num") do={ :set gs [:pick $gs 0 $pc] }',
    "  :local ip [:toip $gs]",
    '  :if ([:typeof $ip] = "ip" and [:typeof [:find $gws ("," . $ip . ",")]] = "nil") do={',
    '    :set gws ($gws . "," . $ip . ",")',
    "    :local rcv -1",
    '    :local avg ""',
    "    :do { /tool flood-ping address=$ip count=5 timeout=500ms do={ :set rcv $received; :set avg $\"avg-rtt\" } } on-error={}",
    "    # flood-ping didn't run (device-mode) or gave nothing: the plain ping (no latency).",
    '    :if ($rcv < 0) do={ :set avg ""; :do { :set rcv [/ping $ip count=5 interval=200ms] } on-error={ :set rcv 0 } }',
    '    :set gl ($gl . "g;" . $ip . ";5;" . $rcv . ";" . $avg . "\\n")',
    "  }",
    "}",
    ":set out ($out . $gl)",
    `# Phase 4: the connected clients' ONTs (their PPPoE address), ${ONT_SLICE} per visit in turn, 2 pings each.`,
    ":global wdOi",
    ':if ([:typeof $wdOi] != "num") do={ :set wdOi 0 }',
    ':local act [/ppp active find where service="pppoe"]',
    ":local na [:len $act]",
    ":if ($na > 0) do={",
    "  :if ($wdOi >= $na) do={ :set wdOi 0 }",
    `  :local stop ($wdOi + ${ONT_SLICE})`,
    "  :if ($stop > $na) do={ :set stop $na }",
    "  :for j from=$wdOi to=($stop - 1) do={",
    "    :local x ($act->$j)",
    "    :local ad [/ppp active get $x address]",
    "    :local rcv -1",
    '    :local avg ""',
    "    :do { /tool flood-ping address=$ad count=2 timeout=250ms do={ :set rcv $received; :set avg $\"avg-rtt\" } } on-error={}",
    '    :if ($rcv < 0) do={ :set avg ""; :do { :set rcv [/ping $ad count=2 interval=100ms] } on-error={ :set rcv 0 } }',
    '    :set out ($out . "o;" . [/ppp active get $x name] . ";2;" . $rcv . ";" . $avg . "\\n")',
    "  }",
    "  :set wdOi $stop",
    "}",
    "# fetch sends at most 64 KB (MikroTik docs): a bigger report goes without traffic, which is the part that can wait.",
    ":if ([:len $out] > 60000) do={",
    '  :log warning "wispdavor: reporte grande, se manda sin trafico"',
    "  :set out ($wdDone . $gl)",
    '  :foreach s in=[/ppp secret find where (service="pppoe" or service="any")] do={',
    '    :set out ($out . "S;" . [/ppp secret get $s name] . ";" . [/ppp secret get $s profile] . ";" . [/ppp secret get $s disabled] . "\\n")',
    "  }",
    "}",
    ':local r ""',
    ':do { :set r [/tool fetch url=$url check-certificate=yes http-method=post http-header-field=($auth . ",Content-Type:text/plain") http-data=$out output=user as-value] } on-error={ :log warning "wispdavor: sin conexion con el sitio" }',
    "# Without an answer the results stay in wdDone and go next time.",
    ':if ([:typeof $r] = "array") do={',
    ':set wdDone ""',
    ':local body ($r->"data")',
    ":while ([:len $body] > 0) do={",
    '  :local e [:find $body "\\n"]',
    '  :if ([:typeof $e] = "nil") do={ :set e [:len $body] }',
    "  :local f [:toarray [:pick $body 0 $e]]",
    "  :set body [:pick $body ($e + 1) [:len $body]]",
    "  :if ([:len $f] >= 2) do={",
    "    :local id ($f->0)",
    "    :local k ($f->1)",
    "    # :toarray turns digits into numbers: names and passwords back to text.",
    "    :local u [:tostr ($f->2)]",
    "    :local p [:tostr ($f->3)]",
    "    :local ok \"ok\"",
    "    :do {",
    '      :if ($k = "profile") do={ /ppp secret set [find where name=$u] profile=$p; /ppp active remove [find where name=$u] }',
    '      :if ($k = "create") do={ /ppp secret add name=$u password=[:tostr ($f->4)] profile=$p service=pppoe comment="WispDavor" }',
    '      :if ($k = "disable") do={ /ppp secret set [find where name=$u] disabled=yes; /ppp active remove [find where name=$u] }',
    '      :if ($k = "enable") do={ /ppp secret set [find where name=$u] disabled=no }',
    '      :if ($k = "hsprofile") do={ :if ([:len [/ip hotspot user profile find where name=$u]] = 0) do={ /ip hotspot user profile add name=$u rate-limit=$p } else={ /ip hotspot user profile set [find where name=$u] rate-limit=$p } }',
    '      :if ($k = "voucher") do={ /ip hotspot user add name=$u password=[:tostr ($f->4)] profile=$p limit-uptime=($f->5) limit-bytes-total=($f->6) comment="WispDavor" }',
    '      :if ($k = "unvoucher") do={ /ip hotspot user remove [find where name=$u and comment="WispDavor"] }',
    '    } on-error={ :set ok "err" }',
    '    :set wdDone ($wdDone . "d;" . $id . ";" . $ok . "\\n")',
    "  }",
    "}",
    "}",
    "}",
    `/system scheduler add name=wispdavor interval=${POLL_MINUTES}m on-event=wispdavor policy=read,write,test start-time=startup comment="WispDavor"`,
  ]
  return lines.join("\n")
}
