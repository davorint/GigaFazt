/**
 * The DavorOLT tools (owner, 2026-11-21): one per task of the owner's list (taken from AdminOLT/SmartOLT), each a form
 * that writes the commands for the MA5608T. Text (names, labels, notes) lives in messages/internal/davorolt.es.json;
 * this file only builds commands.
 *
 * Sources: the project's manual, docs/smartax_ma5603t.pdf = "SmartAX MA5600T/MA5603T/MA5608T V800R015C00 Commissioning
 * and Configuration Guide" (2014); `pages` are its printed PDF pages. Commands the manual doesn't show (it's a
 * configuration guide, not the command reference, and two versions older than the owner's V800R018) go in `verify`:
 * the page shows them to be checked on the OLT (`?` after the command) before relying on them.
 */
import { FIRST_ID, NO_LIMIT_TABLE, MAX_ONT_ID, MAX_PON_PORT, oltKbps, parseCidr, isIp, type OltSettings } from "./settings"

export type FieldKind = "text" | "number" | "select" | "secret" | "plan"
export type Field = { key: string; kind: FieldKind; options?: readonly string[]; def?: string; optional?: boolean }
export type Values = Record<string, string>
export type Block = { label?: string; code: string }
/** What a tool gives: command blocks, prompts to answer, commands to check, manual pages. */
export type Out = { blocks: Block[]; answers?: { prompt: string; value: string }[]; verify: string[]; pages: number[] }
export type Result = Out | { error: string; field?: string }

/** A tool; its place, address and group are in lib/davorolt/catalog.ts. */
export type Tool = { id: string; fields: Field[]; build?: (v: Values, s: OltSettings) => Result }

/** Index of the traffic table for IPTV (unlimited, priority 4; manual p642 uses index 8). */
export const IPTV_TABLE = 9

// ── Field sets ─────────────────────────────────────────────────────────────

const SLOT: Field = { key: "slot", kind: "select", options: ["0", "1"], def: "1" }
const PORT: Field = { key: "port", kind: "number", def: "0" }
const ONT: Field = { key: "ontId", kind: "number", def: "0" }
const SN: Field = { key: "sn", kind: "text" }
const LOC = [SLOT, PORT, ONT]
const PLAN: Field = { key: "plan", kind: "plan", def: "0" }
const SP: Field = { key: "spIndex", kind: "number", optional: true }

// ── Reading values ─────────────────────────────────────────────────────────

class Bad extends Error {
  constructor(public field: string) {
    super(field)
  }
}
const n = (v: Values, k: string, lo: number, hi: number) => {
  const x = Number(v[k])
  if (v[k] === undefined || v[k].trim() === "" || !Number.isInteger(x) || x < lo || x > hi) throw new Bad(k)
  return x
}
const opt = (v: Values, k: string, lo: number, hi: number) => (v[k]?.trim() ? n(v, k, lo, hi) : null)
const where = (v: Values) => ({ slot: n(v, "slot", 0, 1), port: n(v, "port", 0, MAX_PON_PORT), ont: n(v, "ontId", 0, MAX_ONT_ID) })
type Loc = ReturnType<typeof where>

/** A GPON serial as the OLT takes it: 16 hex digits, or the vendor's 4 letters and 8 hex digits (HWTC1A2B3C4D). */
export function readSn(raw: string): string | null {
  const s = raw.trim().toUpperCase().replace(/^([A-Z0-9]{4})-/, "$1")
  if (/^[0-9A-F]{16}$/.test(s)) return s
  if (/^[A-Z]{4}[0-9A-F]{8}$/.test(s)) {
    // Vendor letters to hex (HWTC → 48575443), the form `display ont autofind` shows.
    return [...s.slice(0, 4)].map((c) => c.charCodeAt(0).toString(16).toUpperCase()).join("") + s.slice(4)
  }
  return null
}
const sn = (v: Values, k = "sn") => {
  const s = readSn(v[k] ?? "")
  if (!s) throw new Bad(k)
  return s
}
/** A description the CLI takes in quotes: no quotes or backslashes, at most 64. */
const desc = (v: Values, k = "desc") => (v[k] ?? "").replace(/["\\?]/g, "").trim().slice(0, 64) || "cliente"
const ip = (v: Values, k: string) => {
  if (!isIp(v[k] ?? "")) throw new Bad(k)
  return v[k].trim()
}
/** A PPPoE user or password for the CLI: no spaces or quotes (the OLT can't take them in this command). */
const cred = (v: Values, k: string) => {
  const x = v[k] ?? ""
  if (!x || /[\s"'?\\]/.test(x) || x.length > 64) throw new Bad(k)
  return x
}
const plan = (v: Values, s: OltSettings) => {
  const k = n(v, "plan", 0, s.plans.length - 1)
  return { k, p: s.plans[k], id: FIRST_ID + k }
}
const fsp = (l: Loc) => `0/${l.slot}/${l.port}`

// ── Shared blocks ──────────────────────────────────────────────────────────

/** The VLAN a plan's internet goes in: its own (VLAN per plan) or the shared internet VLAN. */
export const planVlan = (s: OltSettings, k: number) => (s.planMode === "vlan" ? s.plans[k].vlan : s.internetVlan)
/** Service profile of a plan: one per plan for bridges (the ONT port's VLAN), one shared for routers. */
export const srvId = (s: OltSettings, k: number) => (s.ontMode === "bridge" ? FIRST_ID + k : FIRST_ID)
/** The service-port's traffic table: the plan's (speed on the OLT) or Huawei's unlimited one (speed on the gateway). */
const table = (s: OltSettings, k: number) => (s.planMode === "priority" ? FIRST_ID + k : NO_LIMIT_TABLE)
const internetVlans = (s: OltSettings) => (s.planMode === "vlan" ? s.plans.map((p) => p.vlan) : [s.internetVlan])

/** Traffic tables (speed on the OLT), DBA, line and service profiles for every plan (manual p607–612, p641–643). */
export function profilesBlock(s: OltSettings, mode = s.planMode): string[] {
  const t = { ...s, planMode: mode }
  const out: string[] = []
  t.plans.forEach((p, k) => {
    const id = FIRST_ID + k
    if (mode === "priority") out.push(`traffic table ip index ${id} cir ${oltKbps(p.mbps)} priority 0 priority-policy local-setting`)
    out.push(`dba-profile add profile-id ${id} type4 max ${oltKbps(p.mbps)}`)
  })
  t.plans.forEach((p, k) => {
    out.push(`ont-lineprofile gpon profile-id ${FIRST_ID + k} profile-name "${p.name.replace(/"/g, "")}"`, ` tcont 1 dba-profile-id ${FIRST_ID + k}`, " gem add 1 eth tcont 1", ` gem mapping 1 0 vlan ${planVlan(t, k)}`)
    if (t.iptvVlan) out.push(" gem add 2 eth tcont 1", ` gem mapping 2 1 vlan ${t.iptvVlan}`)
    out.push(" commit", " quit")
  })
  const srv = (id: number, name: string, vlan: number | null) => {
    out.push(`ont-srvprofile gpon profile-id ${id} profile-name "${name}"`, " ont-port eth adaptive pots adaptive")
    if (vlan !== null) out.push(` port vlan eth 1 ${vlan}`)
    if (t.iptvVlan) out.push(` port vlan eth ${t.iptvEth} ${t.iptvVlan}`, " multicast-forward untag")
    out.push(" commit", " quit")
  }
  if (t.ontMode === "bridge") t.plans.forEach((p, k) => srv(FIRST_ID + k, `puente-${p.name.replace(/"/g, "")}`, planVlan(t, k)))
  else srv(FIRST_ID, "router", null)
  return out
}

/** The internet service-port of one ONT (manual p612, p643: `rx-cttr`/`tx-cttr` = traffic table both ways). */
const servicePort = (s: OltSettings, l: Loc, k: number, idx: number | null) => {
  const v = planVlan(s, k)
  return `service-port ${idx === null ? "" : `${idx} `}vlan ${v} gpon ${fsp(l)} ont ${l.ont} gemport 1 multi-service user-vlan ${v} rx-cttr ${table(s, k)} tx-cttr ${table(s, k)}`
}

/** PPPoE on a router ONT, sent from the OLT (OMCI). Not in the R015 manual. */
const pppoeLines = (l: Loc, vlan: number, user: string, pass: string) => [
  ` ont ipconfig ${l.port} ${l.ont} ip-index 0 pppoe vlan ${vlan} priority 0 user-account username ${user} password ${pass}`,
  ` ont internet-config ${l.port} ${l.ont} ip-index 0`,
  ` ont wan-config ${l.port} ${l.ont} ip-index 0 profile-id 0`,
]
const PPPOE_VERIFY = ["ont ipconfig … ip-index 0 pppoe … user-account", "ont internet-config", "ont wan-config"]

/** IPTV for one ONT: STB port in the multicast VLAN, its service-port and the multicast user (manual p642–644). */
const iptvOnt = (s: OltSettings, l: Loc, idx: number) => ({
  inGpon: [` ont port native-vlan ${l.port} ${l.ont} eth ${s.iptvEth} vlan ${s.iptvVlan}`],
  after: [
    `service-port ${idx} vlan ${s.iptvVlan} gpon ${fsp(l)} ont ${l.ont} gemport 2 multi-service user-vlan ${s.iptvVlan} rx-cttr ${IPTV_TABLE} tx-cttr ${IPTV_TABLE}`,
    "btv",
    ` igmp user add service-port ${idx}`,
    " quit",
    `multicast-vlan ${s.iptvVlan}`,
    ` igmp multicast-vlan member service-port ${idx}`,
    " quit",
  ],
})

/** Taking an ONT off: its service-ports, then the ONT. */
const removeLines = (l: Loc) => [`undo service-port port ${fsp(l)} ont ${l.ont}`, `interface gpon 0/${l.slot}`, ` ont delete ${l.port} ${l.ont}`, " quit"]
const REMOVE_VERIFY = ["undo service-port port … ont …", "ont delete"]

/** Registering an ONT with its plan (confirm a discovered one, or add it before it's connected), WAN and IPTV. */
function register(v: Values, s: OltSettings, how: "confirm" | "add", l: Loc): { code: string[]; verify: string[] } {
  const serial = sn(v)
  const { k, id } = plan(v, s)
  const idx = opt(v, "spIndex", 0, 65535)
  const vlan = planVlan(s, k)
  const verify: string[] = []
  const code = [`interface gpon 0/${l.slot}`]
  if (how === "confirm") code.push(` display ont autofind ${l.port}`, ` ont confirm ${l.port} ontid ${l.ont} sn-auth ${serial} omci ont-lineprofile-id ${id} ont-srvprofile-id ${srvId(s, k)} desc "${desc(v)}"`)
  else code.push(` ont add ${l.port} ${l.ont} sn-auth ${serial} omci ont-lineprofile-id ${id} ont-srvprofile-id ${srvId(s, k)} desc "${desc(v)}"`)
  if (s.ontMode === "bridge") code.push(` ont port native-vlan ${l.port} ${l.ont} eth 1 vlan ${vlan}`)
  else if (v.pppoeUser?.trim() || v.pppoePass?.trim()) {
    code.push(...pppoeLines(l, vlan, cred(v, "pppoeUser"), cred(v, "pppoePass")))
    verify.push(...PPPOE_VERIFY)
  }
  if (v.iptv === "si" && !s.iptvVlan) throw new Bad("iptv")
  const tvIdx = v.iptv === "si" ? n(v, "iptvIndex", 0, 65535) : null
  // The internet and TV service-ports can't share an index.
  if (tvIdx !== null && idx === tvIdx) throw new Bad("iptvIndex")
  const tv = tvIdx !== null ? iptvOnt(s, l, tvIdx) : null
  if (tv) code.push(...tv.inGpon)
  code.push(" quit", servicePort(s, l, k, idx))
  if (tv) code.push(...tv.after)
  code.push("save")
  return { code, verify }
}

const ok = (code: string[], pages: number[], verify: string[] = [], more: Partial<Out> = {}): Out => ({ blocks: [{ code: code.join("\n") }], pages, verify, ...more })

/** Takes an ONU off its port and adds it on another port (same card) or card of the same OLT. */
function moveTo(v: Values, s: OltSettings, slotOf: (from: Loc) => number): Out {
  const from = where(v)
  const to = { slot: slotOf(from), port: n(v, "toPort", 0, MAX_PON_PORT), ont: n(v, "toOntId", 0, MAX_ONT_ID) }
  if (to.slot === from.slot && to.port === from.port) throw new Bad("toPort")
  const r = register(v, s, "add", to)
  return ok(["config", ...removeLines(from), ...r.code], [206, 609, 612], [...REMOVE_VERIFY, ...r.verify])
}

/** Runs a builder; a bad field comes back as which one. */
export function run(tool: Tool, v: Values, s: OltSettings): Result | null {
  if (!tool.build) return null
  try {
    return tool.build(v, s)
  } catch (e) {
    if (e instanceof Bad) return { error: "field", field: e.field }
    throw e
  }
}

const TV_FIELDS: Field[] = [{ key: "iptv", kind: "select", options: ["no", "si"], def: "no" }, { key: "iptvIndex", kind: "number", optional: true }]
const REGISTER_FIELDS: Field[] = [...LOC, SN, { key: "desc", kind: "text", optional: true }, PLAN, SP, { key: "pppoeUser", kind: "text", optional: true }, { key: "pppoePass", kind: "secret", optional: true }, ...TV_FIELDS]

// ── The tools ──────────────────────────────────────────────────────────────

export const TOOLS: Tool[] = [
  // Configuración inicial de la OLT
  {
    id: "inicial",
    fields: [{ key: "ntp", kind: "text", optional: true }],
    build: (v, s) => {
      const m = parseCidr(s.mgmtAddress)
      if (!m || !isIp(s.mgmtGateway)) return { error: "settings" }
      const ntp = v.ntp?.trim() ? ip(v, "ntp") : ""
      return ok(
        [
          "enable",
          "config",
          `sysname ${s.sysname}`,
          "timezone GMT- 6:00",
          `vlan ${s.mgmtVlan} standard`,
          `port vlan ${s.mgmtVlan} 0/${s.uplinkSlot} ${s.uplinkPort}`,
          `interface vlanif ${s.mgmtVlan}`,
          ` ip address ${m.ip} ${m.prefix}`,
          " quit",
          `ip route-static 0.0.0.0 0 ${s.mgmtGateway}`,
          ...(ntp ? [`ntp-service unicast-server ${ntp} source-interface vlanif ${s.mgmtVlan}`] : []),
          "save",
        ],
        [60, 89, 90, 91, 154]
      )
    },
  },
  {
    id: "usuario",
    fields: [{ key: "user", kind: "text" }, { key: "info", kind: "text", optional: true }],
    build: (v) => {
      const user = (v.user ?? "").trim()
      if (!/^[A-Za-z0-9_.-]{6,15}$/.test(user) || user === "all" || user === "online") throw new Bad("user")
      return ok(["config", "terminal user name"], [67, 93, 94, 95], [], {
        answers: [
          { prompt: "User Name(length<6,15>)", value: user },
          { prompt: "User Password(length<6,15>)", value: "‹contraseña›" },
          { prompt: "Confirm Password", value: "‹contraseña›" },
          { prompt: "User profile name(<=15 chars)[root]", value: "Enter" },
          { prompt: "User's Level", value: "Administrator" },
          { prompt: "Permitted Reenter Number(0--4)", value: "2" },
          { prompt: "User's Appended Info(<=30 chars)", value: (v.info ?? "").slice(0, 30) || "Enter" },
          { prompt: "Repeat this operation? (y/n)[n]", value: "n" },
        ],
      })
    },
  },
  {
    id: "acceso",
    fields: [{ key: "user", kind: "text" }, { key: "community", kind: "text", optional: true }],
    build: (v) => {
      const user = (v.user ?? "").trim()
      if (!/^[A-Za-z0-9_.-]{6,15}$/.test(user)) throw new Bad("user")
      const c = (v.community ?? "").trim()
      if (c && !/^[A-Za-z0-9_.-]{8,32}$/.test(c)) throw new Bad("community")
      return ok(["config", "rsa local-key-pair create", `ssh user ${user} authentication-type password`, ...(c ? [`snmp-agent community read ${c}`] : []), "save"], [67, 68, 163], [], {
        answers: [{ prompt: "Input the bits in the modulus[default = 512]", value: "2048" }],
      })
    },
  },
  {
    id: "sinIp",
    fields: [{ key: "wgPort", kind: "number", def: "13231" }, { key: "wgNet", kind: "text", def: "10.99.0.1/24" }, { key: "peerKey", kind: "text" }, { key: "peerIp", kind: "text", def: "10.99.0.2" }],
    build: (v) => {
      const port = n(v, "wgPort", 1024, 65535)
      if (!parseCidr(v.wgNet ?? "")) throw new Bad("wgNet")
      const key = (v.peerKey ?? "").trim()
      if (!/^[A-Za-z0-9+/]{42,43}=$/.test(key)) throw new Bad("peerKey")
      const peer = ip(v, "peerIp")
      return {
        blocks: [
          {
            label: "mikrotik",
            code: [
              `/interface wireguard add name=wg-olt listen-port=${port} comment="DavorOLT"`,
              `/ip address add address=${v.wgNet.trim()} interface=wg-olt comment="DavorOLT"`,
              `/interface wireguard peers add interface=wg-olt public-key="${key}" allowed-address=${peer}/32 comment="DavorOLT: equipo del NOC"`,
              `/ip firewall filter add chain=input protocol=udp dst-port=${port} action=accept comment="DavorOLT: WireGuard" place-before=0`,
            ].join("\n"),
          },
        ],
        pages: [],
        verify: [],
      }
    },
  },
  {
    id: "redireccion",
    fields: [{ key: "wan", kind: "text", def: "ether1" }, { key: "extPort", kind: "number", def: "2222" }, { key: "proto", kind: "select", options: ["ssh", "telnet"], def: "ssh" }, { key: "adminIp", kind: "text" }],
    build: (v, s) => {
      const m = parseCidr(s.mgmtAddress)
      if (!m) return { error: "settings" }
      const wan = (v.wan ?? "").trim()
      if (!/^[\w.-]{1,40}$/.test(wan)) throw new Bad("wan")
      const ext = n(v, "extPort", 1024, 65535)
      const admin = ip(v, "adminIp")
      const to = v.proto === "telnet" ? 23 : 22
      return {
        blocks: [
          {
            label: "mikrotik",
            code: [
              `/ip firewall address-list add list=davorolt-admin address=${admin} comment="DavorOLT"`,
              `/ip firewall nat add chain=dstnat in-interface=${wan} protocol=tcp dst-port=${ext} src-address-list=davorolt-admin action=dst-nat to-addresses=${m.ip} to-ports=${to} comment="DavorOLT: ${v.proto === "telnet" ? "Telnet" : "SSH"} a la OLT"`,
              `/ip firewall filter add chain=forward connection-nat-state=dstnat dst-address=${m.ip} protocol=tcp dst-port=${to} src-address-list=davorolt-admin action=accept comment="DavorOLT" place-before=0`,
            ].join("\n"),
          },
        ],
        pages: [],
        verify: [],
      }
    },
  },
  {
    id: "mikrotik",
    fields: [{ key: "routerPort", kind: "text", def: "ether2" }],
    build: (v, s) => {
      const m = parseCidr(s.mgmtAddress)
      if (!m || !isIp(s.mgmtGateway)) return { error: "settings" }
      const port = (v.routerPort ?? "").trim()
      if (!/^[\w.-]{1,40}$/.test(port)) throw new Bad("routerPort")
      return {
        blocks: [
          {
            label: "mikrotik",
            code: [
              `/interface vlan add name=olt-admin vlan-id=${s.mgmtVlan} interface=${port} comment="DavorOLT: administración de la OLT"`,
              `/ip address add address=${s.mgmtGateway}/${m.prefix} interface=olt-admin comment="DavorOLT"`,
            ].join("\n"),
          },
        ],
        pages: [],
        verify: [],
      }
    },
  },
  {
    id: "vlan",
    fields: [{ key: "vlan", kind: "number" }, { key: "vlanType", kind: "select", options: ["smart", "standard"], def: "smart" }],
    build: (v, s) => {
      const id = n(v, "vlan", 2, 4094)
      return ok(["config", `vlan ${id} ${v.vlanType === "standard" ? "standard" : "smart"}`, `port vlan ${id} 0/${s.uplinkSlot} ${s.uplinkPort}`, "save"], [60, 612])
    },
  },
  {
    id: "pon",
    fields: [SLOT, { key: "ports", kind: "select", options: ["8", "16"], def: "16" }],
    build: (v) => {
      const slot = n(v, "slot", 0, 1)
      const count = v.ports === "8" ? 8 : 16
      return ok(["config", `interface gpon 0/${slot}`, ...Array.from({ length: count }, (_, p) => ` port ${p} ont-auto-find enable`), " display port state all", " quit", "save"], [101, 609])
    },
  },
  {
    id: "uplink",
    fields: [],
    build: (_v, s) =>
      ok(
        [
          "config",
          ...[s.mgmtVlan, ...internetVlans(s), ...(s.iptvVlan ? [s.iptvVlan] : [])].map((id) => `port vlan ${id} 0/${s.uplinkSlot} ${s.uplinkPort}`),
          `interface mcu 0/${s.uplinkSlot}`,
          " display port state all",
          " quit",
          "save",
        ],
        [60, 100, 612]
      ),
  },
  { id: "tarjeta", fields: [], build: () => ok(["config", "display board 0", "board confirm 0", "display board 0", "save"], [98, 99]) },
  {
    id: "seguridad",
    fields: [],
    build: () =>
      ok(
        ["config", "terminal user password", "security anti-macspoofing enable", "security anti-ipspoofing enable", "security anti-macduplicate enable", "security anti-dos enable", "security anti-ipattack enable", "save"],
        [95, 96],
        ["security anti-macspoofing / anti-ipspoofing / anti-macduplicate / anti-dos / anti-ipattack"]
      ),
  },
  { id: "perfiles", fields: [], build: (_v, s) => ok(["config", ...profilesBlock(s), "save"], [607, 608, 609, 611, 612, 1772]) },
  {
    id: "backup",
    fields: [{ key: "how", kind: "select", options: ["ftp", "tftp"], def: "ftp" }, { key: "server", kind: "text" }, { key: "file", kind: "text", def: "olt-config.txt" }],
    build: (v) => {
      const server = ip(v, "server")
      const file = (v.file ?? "").trim()
      if (!/^[\w.-]{1,60}$/.test(file)) throw new Bad("file")
      const how = v.how === "tftp" ? "tftp" : "ftp"
      return ok(["config", "save", `backup configuration ${how} ${server} ${file}`, "autosave type all", "autosave interval on", "autosave interval 1440"], [152, 154, 156, 157, 159], [
        ...(how === "tftp" ? ["backup configuration tftp"] : []),
        "autosave interval on / autosave interval 1440",
      ])
    },
  },
  {
    id: "todo",
    fields: [{ key: "slots", kind: "select", options: ["1", "0", "01"], def: "1" }, { key: "ports", kind: "select", options: ["8", "16"], def: "16" }, { key: "ntp", kind: "text", optional: true }],
    build: (v, s) => {
      const base = TOOLS.find((t) => t.id === "inicial")!.build!(v, s)
      if ("error" in base) return base
      const head = base.blocks[0].code.split("\n").filter((l) => l !== "save")
      const slots = v.slots === "01" ? [0, 1] : [v.slots === "0" ? 0 : 1]
      const vlans = [...internetVlans(s), ...(s.iptvVlan ? [s.iptvVlan] : [])]
      return ok(
        [
          ...head,
          "board confirm 0",
          ...vlans.flatMap((id) => [`vlan ${id} smart`, `port vlan ${id} 0/${s.uplinkSlot} ${s.uplinkPort}`]),
          ...slots.flatMap((sl) => [`interface gpon 0/${sl}`, ...Array.from({ length: v.ports === "8" ? 8 : 16 }, (_, p) => ` port ${p} ont-auto-find enable`), " quit"]),
          ...profilesBlock(s),
          ...(s.iptvVlan ? iptvGlobal(s) : []),
          "save",
        ],
        [60, 89, 90, 98, 101, 607, 608, 609, 612, 641, 642, 643, 644]
      )
    },
  },

  // Administrar ONUs
  {
    id: "autorizar",
    fields: REGISTER_FIELDS,
    build: (v, s) => {
      const r = register(v, s, "confirm", where(v))
      return ok(r.code, [609, 610, 612, ...(v.iptv === "si" ? [642, 643, 644] : [])], r.verify)
    },
  },
  {
    id: "preautorizar",
    fields: REGISTER_FIELDS,
    build: (v, s) => {
      const r = register(v, s, "add", where(v))
      return ok(r.code, [206, 609, 612], r.verify)
    },
  },
  { id: "eliminar", fields: LOC, build: (v) => ok(["config", ...removeLines(where(v)), "save"], [], REMOVE_VERIFY) },
  {
    id: "reiniciar",
    fields: LOC,
    build: (v) => {
      const l = where(v)
      return ok(["config", `interface gpon 0/${l.slot}`, ` ont reset ${l.port} ${l.ont}`, " quit"], [], ["ont reset"])
    },
  },
  {
    id: "plan",
    fields: [...LOC, PLAN, { key: "spIndex", kind: "number" }],
    build: (v, s) => {
      const l = where(v)
      const { k, id } = plan(v, s)
      const idx = n(v, "spIndex", 0, 65535)
      const bridge = s.ontMode === "bridge"
      return ok(
        [
          "config",
          `display service-port port ${fsp(l)} ont ${l.ont}`,
          `undo service-port ${idx}`,
          `interface gpon 0/${l.slot}`,
          // Bridges have a service profile per plan (the port's VLAN) and, with a VLAN per plan, a new native VLAN.
          ` ont modify ${l.port} ${l.ont} ont-lineprofile-id ${id}${bridge ? ` ont-srvprofile-id ${srvId(s, k)}` : ""}`,
          ...(bridge ? [` ont port native-vlan ${l.port} ${l.ont} eth 1 vlan ${planVlan(s, k)}`] : []),
          " quit",
          servicePort(s, l, k, idx),
          "save",
        ],
        [612],
        ["undo service-port <índice>", `ont modify … ont-lineprofile-id${bridge ? " … ont-srvprofile-id" : ""}`]
      )
    },
  },
  {
    id: "detalles",
    fields: LOC,
    build: (v) => {
      const l = where(v)
      return ok(
        ["config", `interface gpon 0/${l.slot}`, ` display ont info ${l.port} ${l.ont}`, ` display ont optical-info ${l.port} ${l.ont}`, ` display ont wan-info ${l.port} ${l.ont}`, ` display ont capability ${l.port} ${l.ont}`, " quit", `display service-port port ${fsp(l)} ont ${l.ont}`],
        [610, 610],
        ["display ont optical-info", "display ont wan-info", "display service-port port … ont …"]
      )
    },
  },
  {
    id: "activar",
    fields: [...LOC, { key: "state", kind: "select", options: ["activate", "deactivate"], def: "deactivate" }],
    build: (v) => {
      const l = where(v)
      return ok(["config", `interface gpon 0/${l.slot}`, ` ont ${v.state === "activate" ? "activate" : "deactivate"} ${l.port} ${l.ont}`, " quit", "save"], [207, 610], ["ont activate / ont deactivate <puerto> <ont-id>"])
    },
  },
  {
    id: "editar",
    fields: [...LOC, { key: "desc", kind: "text" }],
    build: (v) => {
      const l = where(v)
      return ok(["config", `interface gpon 0/${l.slot}`, ` ont modify ${l.port} ${l.ont} desc "${desc(v)}"`, " quit", "save"], [], ["ont modify … desc"])
    },
  },
  {
    id: "puerto",
    fields: [...LOC, { key: "toPort", kind: "number" }, { key: "toOntId", kind: "number" }, SN, { key: "desc", kind: "text", optional: true }, PLAN, SP, ...TV_FIELDS],
    build: (v, s) => moveTo(v, s, (from) => from.slot),
  },
  {
    id: "slot",
    fields: [...LOC, { key: "toSlot", kind: "select", options: ["0", "1"], def: "0" }, { key: "toPort", kind: "number" }, { key: "toOntId", kind: "number" }, SN, { key: "desc", kind: "text", optional: true }, PLAN, SP, ...TV_FIELDS],
    build: (v, s) => moveTo(v, s, () => n(v, "toSlot", 0, 1)),
  },
  {
    id: "verConfig",
    fields: LOC,
    build: (v) => {
      const l = where(v)
      return ok(["config", `display current-configuration ont ${fsp(l)} ${l.ont}`, `display service-port port ${fsp(l)} ont ${l.ont}`], [], ["display current-configuration ont", "display service-port port … ont …"])
    },
  },
  {
    id: "herramientas",
    fields: LOC,
    build: (v) => {
      const l = where(v)
      return ok(
        ["config", `interface gpon 0/${l.slot}`, ` display ont optical-info ${l.port} ${l.ont}`, ` display ont port state ${l.port} ${l.ont} eth-port all`, ` display ont wan-info ${l.port} ${l.ont}`, ` display ont version ${l.port} ${l.ont}`, " quit", `display ont alarm-state ${fsp(l)} ${l.ont}`],
        [],
        ["display ont optical-info", "display ont port state … eth-port all", "display ont wan-info", "display ont version", "display ont alarm-state"]
      )
    },
  },
  {
    id: "autorizadas",
    fields: [SLOT, { key: "port", kind: "number", optional: true }],
    build: (v) => {
      const slot = n(v, "slot", 0, 1)
      const port = opt(v, "port", 0, MAX_PON_PORT)
      return ok(["config", `interface gpon 0/${slot}`, ` display ont info ${port ?? "all"} all`, " quit"], [610], ["display ont info <puerto|all> all"])
    },
  },
  {
    id: "noAutorizadas",
    fields: [SLOT, { key: "port", kind: "number", optional: true }],
    build: (v) => {
      const slot = n(v, "slot", 0, 1)
      const port = opt(v, "port", 0, MAX_PON_PORT)
      return port === null ? ok(["config", "display ont autofind all"], [], ["display ont autofind all"]) : ok(["config", `interface gpon 0/${slot}`, ` display ont autofind ${port}`, " quit"], [609])
    },
  },
  {
    id: "migrar",
    fields: [...LOC, { key: "toSlot", kind: "select", options: ["0", "1"], def: "1" }, { key: "toPort", kind: "number" }, { key: "toOntId", kind: "number" }, SN, { key: "desc", kind: "text", optional: true }, PLAN, SP, ...TV_FIELDS],
    build: (v, s) => {
      const from = where(v)
      const to = { slot: n(v, "toSlot", 0, 1), port: n(v, "toPort", 0, MAX_PON_PORT), ont: n(v, "toOntId", 0, MAX_ONT_ID) }
      const r = register(v, s, "add", to)
      return { blocks: [{ label: "origen", code: ["config", ...removeLines(from), "save"].join("\n") }, { label: "destino", code: ["config", ...r.code].join("\n") }], pages: [206, 609, 612], verify: [...REMOVE_VERIFY, ...r.verify] }
    },
  },
  {
    id: "porSn",
    fields: [SN, { key: "slot", kind: "select", options: ["0", "1"], def: "1", optional: true }, { key: "port", kind: "number", optional: true }, { key: "ontId", kind: "number", optional: true }, { key: "newSn", kind: "text", optional: true }],
    build: (v) => {
      const serial = sn(v)
      const code = ["config", `display ont info by-sn ${serial}`]
      const verify = ["display ont info by-sn"]
      if (v.newSn?.trim()) {
        const l = where(v)
        code.push(`interface gpon 0/${l.slot}`, ` ont modify ${l.port} ${l.ont} sn-auth ${sn(v, "newSn")}`, " quit", "save")
        verify.push("ont modify … sn-auth")
      }
      return ok(code, [], verify)
    },
  },
  {
    id: "catv",
    fields: [...LOC, { key: "state", kind: "select", options: ["on", "off"], def: "on" }],
    build: (v) => {
      const l = where(v)
      return ok(["config", `interface gpon 0/${l.slot}`, ` ont port attribute ${l.port} ${l.ont} catv 1 operational-state ${v.state === "off" ? "off" : "on"}`, " quit", "save"], [652], ["ont port attribute … catv 1 operational-state"])
    },
  },
  {
    id: "reiniciarPon",
    fields: [SLOT, PORT],
    build: (v) => {
      const slot = n(v, "slot", 0, 1)
      const port = n(v, "port", 0, MAX_PON_PORT)
      return ok(["config", `interface gpon 0/${slot}`, ` shutdown ${port}`, ` undo shutdown ${port}`, " quit"], [], ["shutdown / undo shutdown <puerto> en interface gpon"])
    },
  },
  {
    id: "importar",
    fields: [],
    build: () => ok(["config", "display board 0", "display ont info 0 all", "display service-port all", "display current-configuration"], [98], ["display ont info 0 all", "display current-configuration"]),
  },
  { id: "wifi", fields: [] },
  { id: "otraMarca", fields: [] },

  // Instalación y servicios
  {
    id: "instalar",
    fields: [SLOT, { key: "port", kind: "number", optional: true }],
    build: (v) => {
      const slot = n(v, "slot", 0, 1)
      const port = opt(v, "port", 0, MAX_PON_PORT)
      return ok(["config", `interface gpon 0/${slot}`, ` display ont autofind ${port ?? "all"}`, " quit"], [609], port === null ? ["display ont autofind all"] : [])
    },
  },
  { id: "pasos", fields: [] },
  {
    id: "pppoe",
    fields: [...LOC, PLAN, { key: "pppoeUser", kind: "text" }, { key: "pppoePass", kind: "secret" }],
    build: (v, s) => {
      const l = where(v)
      const { k } = plan(v, s)
      return ok(["config", `interface gpon 0/${l.slot}`, ...pppoeLines(l, planVlan(s, k), cred(v, "pppoeUser"), cred(v, "pppoePass")), " quit", "save"], [], PPPOE_VERIFY)
    },
  },
  {
    id: "estatica",
    fields: [...LOC, PLAN, { key: "ip", kind: "text" }, { key: "mask", kind: "text", def: "255.255.255.248" }, { key: "gateway", kind: "text" }, { key: "dns1", kind: "text", def: "1.1.1.1" }, { key: "dns2", kind: "text", def: "8.8.8.8" }],
    build: (v, s) => {
      const l = where(v)
      const { k } = plan(v, s)
      return ok(
        ["config", `interface gpon 0/${l.slot}`, ` ont ipconfig ${l.port} ${l.ont} ip-index 0 static ip-address ${ip(v, "ip")} mask ${ip(v, "mask")} gateway ${ip(v, "gateway")} pri-dns ${ip(v, "dns1")} slave-dns ${ip(v, "dns2")} vlan ${planVlan(s, k)} priority 0`, ` ont internet-config ${l.port} ${l.ont} ip-index 0`, ` ont wan-config ${l.port} ${l.ont} ip-index 0 profile-id 0`, " quit", "save"],
        [203],
        ["ont ipconfig … ip-index 0 static … gateway … pri-dns … slave-dns", "ont internet-config", "ont wan-config"]
      )
    },
  },
  {
    id: "estaticaPuente",
    fields: [...LOC, PLAN, { key: "eth", kind: "number", def: "1" }],
    build: (v, s) => {
      const l = where(v)
      const { k } = plan(v, s)
      return ok(["config", `interface gpon 0/${l.slot}`, ` ont port native-vlan ${l.port} ${l.ont} eth ${n(v, "eth", 1, 4)} vlan ${planVlan(s, k)}`, " quit", "save"], [612])
    },
  },
  {
    id: "dhcp",
    fields: [...LOC, PLAN],
    build: (v, s) => {
      const l = where(v)
      const { k } = plan(v, s)
      return ok(["config", `interface gpon 0/${l.slot}`, ` ont ipconfig ${l.port} ${l.ont} ip-index 0 dhcp vlan ${planVlan(s, k)} priority 0`, ` ont internet-config ${l.port} ${l.ont} ip-index 0`, ` ont wan-config ${l.port} ${l.ont} ip-index 0 profile-id 0`, " quit", "save"], [625], [
        "ont ipconfig … ip-index 0 dhcp",
        "ont internet-config",
        "ont wan-config",
      ])
    },
  },
  {
    id: "gestion",
    fields: [...LOC, { key: "vlan", kind: "number" }, { key: "how", kind: "select", options: ["dhcp", "static"], def: "dhcp" }, { key: "ip", kind: "text", optional: true }, { key: "mask", kind: "text", optional: true }],
    build: (v) => {
      const l = where(v)
      const vlan = n(v, "vlan", 2, 4094)
      const line = v.how === "static" ? ` ont ipconfig ${l.port} ${l.ont} static ip-address ${ip(v, "ip")} mask ${ip(v, "mask")} vlan ${vlan}` : ` ont ipconfig ${l.port} ${l.ont} dhcp vlan ${vlan}`
      return ok(["config", `interface gpon 0/${l.slot}`, line, " quit", "save"], [203, 625])
    },
  },
  {
    id: "eth",
    fields: [...LOC, { key: "eth", kind: "number", def: "1" }, { key: "state", kind: "select", options: ["on", "off"], def: "on" }, { key: "vlan", kind: "number", optional: true }],
    build: (v) => {
      const l = where(v)
      const eth = n(v, "eth", 1, 4)
      const vlan = opt(v, "vlan", 2, 4094)
      return ok(
        ["config", `interface gpon 0/${l.slot}`, ` ont port attribute ${l.port} ${l.ont} eth ${eth} operational-state ${v.state === "off" ? "off" : "on"}`, ...(vlan ? [` ont port native-vlan ${l.port} ${l.ont} eth ${eth} vlan ${vlan}`] : []), " quit", "save"],
        [612, 652],
        ["ont port attribute … eth … operational-state"]
      )
    },
  },
  { id: "planesPrioridad", fields: [], build: (_v, s) => ok(["config", ...profilesBlock(s, "priority"), "save"], [607, 608, 611, 612, 1772]) },
  { id: "planesVlan", fields: [], build: (_v, s) => ok(["config", ...profilesBlock(s, "vlan"), ...s.plans.flatMap((p) => [`vlan ${p.vlan} smart`, `port vlan ${p.vlan} 0/${s.uplinkSlot} ${s.uplinkPort}`]), "save"], [607, 608, 612, 1772]) },
  {
    id: "iptv",
    fields: [...LOC, { key: "iptvIndex", kind: "number" }],
    build: (v, s) => {
      if (!s.iptvVlan) return { error: "noIptv" }
      const l = where(v)
      const tv = iptvOnt(s, l, n(v, "iptvIndex", 0, 65535))
      return {
        blocks: [
          { label: "iptvGlobal", code: ["config", ...iptvGlobal(s), "save"].join("\n") },
          { label: "iptvOnt", code: ["config", `interface gpon 0/${l.slot}`, ...tv.inGpon, " quit", ...tv.after, "save"].join("\n") },
        ],
        pages: [641, 642, 643, 644],
        verify: [],
      }
    },
  },
  {
    id: "catvTriple",
    fields: [...LOC],
    build: (v) => {
      const l = where(v)
      return ok(["config", `interface gpon 0/${l.slot}`, ` ont port attribute ${l.port} ${l.ont} catv 1 operational-state on`, " quit", "save"], [652], ["ont port attribute … catv 1 operational-state"])
    },
  },
  { id: "ipv6", fields: [] },
  { id: "xml", fields: [] },
]

/** IPTV once per OLT (manual p641–644): its traffic table, VLAN on the uplink, multicast VLAN with IGMP proxy. */
function iptvGlobal(s: OltSettings): string[] {
  const up = `0/${s.uplinkSlot}/${s.uplinkPort}`
  return [
    `traffic table ip index ${IPTV_TABLE} cir off priority 4 priority-policy local-setting`,
    `vlan ${s.iptvVlan} smart`,
    `port vlan ${s.iptvVlan} 0/${s.uplinkSlot} ${s.uplinkPort}`,
    `multicast-vlan ${s.iptvVlan}`,
    " igmp version v2",
    " igmp mode off",
    " igmp match mode disable",
    " igmp mode proxy",
    ` igmp uplink-port ${up}`,
    " btv",
    " igmp uplink-port-mode default",
    " quit",
  ]
}

export const toolById = (id: string) => TOOLS.find((t) => t.id === id)
