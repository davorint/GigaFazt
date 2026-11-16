import { plans } from "../plans"
import { DEFAULT_RULE, KINDS, planDefaults, type Pattern, type PatternKind, type PlanRule, type QueueParams } from "./burst"
import {
  CLASSIFIERS,
  DEFAULT_LINK_QUEUES,
  DEFAULT_MONITORS,
  defaultWans,
  FAILOVER_SPEEDS,
  WAN_TYPES,
  type Classifier,
  type Failover,
  type FailoverSpeed,
  type LinkQueues,
  type Wan,
  type WanType,
} from "./balance"
import { DEFAULT_PON_EFFICIENCY, type PonTech } from "./capacity"
import { OLT_MODELS, type OltModelId, type OltTech } from "./olt"
import { QUEUE_KINDS, type Pair, type QueueKind } from "./routeros"
import { ALERT_MODES, BACKUP_MODES, DEFAULT_SETUP, DNS_MODES, MAX_PLANS, NAT_MODES, type NatMode, type SetupPlan, type SetupState } from "./setup"

/**
 * State of the /mikrotik burst tool and its share link (#hash, so nothing
 * reaches the server or its logs). Plan presets read `lib/plans.ts`.
 */

export type Direction = "down" | "up"

export type LabState = {
  /** Plan id from lib/plans.ts, or "custom". */
  preset: string
  /** Plan speed: the most the client may get (burst-limit and max-limit stay at or under it). null = not checked. */
  planMbps: number | null
  /** One set of values for both directions. */
  symmetric: boolean
  down: QueueParams
  up: QueueParams
  /** Direction shown in the simulator. */
  view: Direction
  pattern: Pattern
  durationS: number
  /** Physical access cap, Mbps (null = none). */
  lineCapMbps: number | null
  /** Several clients under one parent queue. */
  group: GroupState
  /** How a plan speed becomes queue values (plan presets, compare, shared, capacity, bulk). */
  rule: PlanRule
  /** Busiest-hour capacity model. */
  capacity: CapacityState
  /** Household traffic already running when the customer runs a speed test, Mbps. */
  backgroundMbps: number
  /** Queue type the exports give the client queues. */
  queueKind: QueueKind
  /** Name of the deployment modeled: one OLT and its router, with its own internet providers. */
  deployment: string
  /** Whether it already serves clients (measured data) or is being planned. */
  status: DeploymentStatus
  /** That router's internet links (load balancing and the capacity model). */
  wans: Wan[]
  balance: BalanceState
  /** VLANs, PPPoE and OLT settings for setting the deployment up. */
  setup: SetupState
}

export type DeploymentStatus = "existing" | "planned"

/** What belongs to one deployment (saved in the browser, carried by the share link). */
export type DeploymentFields = Pick<LabState, "deployment" | "status" | "capacity" | "wans" | "balance" | "setup">

export type BalanceState = {
  classifier: Classifier
  failover: Failover
  /** How fast a dead link is noticed. */
  speed: FailoverSpeed
  nat: boolean
  /** Queues and Netwatch per link. */
  queues: LinkQueues
  /** Client networks to balance, CIDR. */
  clients: string[]
}

export const DEFAULT_BALANCE: BalanceState = {
  classifier: "src-address",
  failover: "recursive",
  speed: "normal",
  nat: true,
  queues: DEFAULT_LINK_QUEUES,
  clients: ["10.0.0.0/8", "100.64.0.0/10"],
}

export type CapacityState = {
  /** Uplink (parent queue) max-limit, Mbps. */
  parentMbps: number
  /** Clients per plan, in PRESETS order. */
  clients: number[]
  /** Direction modeled. */
  direction: Direction
  /** Busy-hour average per client, Mbps (download and upload). */
  avgDownMbps: number
  avgUpMbps: number
  /** Share of the download average that is video, 0..1. */
  videoShare: number
  /** Bitrate of one stream, Mbps. */
  videoMbps: number
  /** Mean size of the other downloads, MB. */
  fileMB: number
  /** PON type of the deployment's OLT; "none" = no PON layer (the internet side alone). */
  pon: PonTech
  homesPerPort: number
  /** Usable share of the PON line rate, 0..1. */
  ponEfficiency: number
  /** The deployment's OLT (limits in olt.ts) and its uplink to the router, Mbps (0 = no limit). */
  oltModel: OltModelId
  oltUplinkMbps: number
  /** Internet side: the router's links (wans) or one uplink of parentMbps. */
  internet: "links" | "single"
  /** Deployments that already run: PON ports in use (null = from the clients per port). */
  portsInUse: number | null
  /** Deployments that already run: all the router's traffic at the busy hour, Mbps (null = not measured: the average per client is an input). */
  measuredDownMbps: number | null
  measuredUpMbps: number | null
  /** The OLT built for this deployment on /olt ("Arma tu OLT"): its share code and the PON ports it gives each ONT type. */
  oltBuild: OltBuild | null
}

export type OltBuild = { code: string; ports: Record<OltTech, number> }

/** A client in the shared-parent simulation. */
export type GroupMember = {
  /** Plan id from lib/plans.ts (preset burst values), or "current" (the parameters above). */
  plan: string
  limitAt: number
  /** 1 (highest) … 8 (lowest). */
  priority: number
  kind: PatternKind
  startS: number
}

export type GroupState = {
  /** Parent queue max-limit (the shared link), Mbps. */
  parentMbps: number
  durationS: number
  members: GroupMember[]
}

export const MAX_MEMBERS = 6

export const DEFAULT_GROUP: GroupState = {
  parentMbps: 1000,
  durationS: 60,
  members: [
    { plan: "fibra-500", limitAt: 50, priority: 8, kind: "download", startS: 0 },
    { plan: "fibra-500", limitAt: 0, priority: 8, kind: "video", startS: 4 },
    { plan: "fibra-1g", limitAt: 0, priority: 8, kind: "speedtest", startS: 12 },
    { plan: "fibra-200", limitAt: 20, priority: 8, kind: "web", startS: 0 },
  ],
}

export type Preset = { id: string; downMbps: number; upMbps: number }

export const PRESETS: Preset[] = plans.map((p) => ({ id: p.id, downMbps: p.downMbps, upMbps: p.upMbps }))

/**
 * Example busiest-hour setup: 600 clients split evenly (the split per plan is
 * not known), GPON (what the owner runs today) with 32 homes per port
 * (example split). Averages per client from OpenVault 1Q25 (1.544 GB/h down,
 * 0.096 GB/h up per residential subscriber at the busiest hour). Video share,
 * bitrate and download size are assumptions.
 */
export const DEFAULT_CAPACITY: CapacityState = {
  parentMbps: 10_000,
  clients: PRESETS.map(() => Math.round(600 / Math.max(1, PRESETS.length))),
  direction: "down",
  avgDownMbps: 3.4,
  avgUpMbps: 0.21,
  videoShare: 0.5,
  videoMbps: 5,
  fileMB: 50,
  pon: "gpon",
  homesPerPort: 32,
  ponEfficiency: DEFAULT_PON_EFFICIENCY,
  // One OLT and one router per deployment (owner, 2026-11-15). The uplink is an example (one 10GE port).
  oltModel: "ma5608t",
  oltUplinkMbps: 10_000,
  internet: "links",
  portsInUse: null,
  measuredDownMbps: null,
  measuredUpMbps: null,
  oltBuild: null,
}

export const DEFAULT_PATTERN: Pattern = {
  kind: "sustained",
  demandMbps: null,
  startS: 2,
  onS: 8,
  offS: 12,
  testS: 15,
  fileMB: 2000,
  videoMbps: 25,
  pageMB: 3,
}

export function presetState(preset: Preset, base?: LabState): LabState {
  const rule = base?.rule ?? DEFAULT_RULE
  return {
    preset: preset.id,
    planMbps: preset.downMbps,
    symmetric: preset.downMbps === preset.upMbps,
    down: planDefaults(preset.downMbps, rule),
    up: planDefaults(preset.upMbps, rule),
    view: base?.view ?? "down",
    pattern: base?.pattern ?? DEFAULT_PATTERN,
    durationS: base?.durationS ?? 60,
    lineCapMbps: base?.lineCapMbps ?? null,
    group: base?.group ?? DEFAULT_GROUP,
    rule,
    capacity: base?.capacity ?? DEFAULT_CAPACITY,
    backgroundMbps: base?.backgroundMbps ?? 0,
    queueKind: base?.queueKind ?? "default",
    deployment: base?.deployment ?? "",
    status: base?.status ?? "planned",
    wans: base?.wans ?? defaultWans(3),
    balance: base?.balance ?? DEFAULT_BALANCE,
    setup: base?.setup ?? DEFAULT_SETUP,
  }
}

export function initialState(): LabState {
  const preset = PRESETS.find((p) => p.id === "fibra-500") ?? PRESETS[0]
  return presetState(preset)
}

/** Parameters the simulator shows (download when symmetric). */
export function viewParams(s: LabState): QueueParams {
  return s.symmetric || s.view === "down" ? s.down : s.up
}

/** Queue values a plan preset starts with under a rule (download speed). */
export function presetParams(id: string, rule: PlanRule = DEFAULT_RULE): QueueParams | null {
  const preset = PRESETS.find((p) => p.id === id)
  return preset ? planDefaults(preset.downMbps, rule) : null
}

/** Queue and traffic of one shared-parent client. */
export function memberSetup(s: LabState, m: GroupMember): { params: QueueParams; pattern: Pattern } {
  const base = (m.plan === "current" ? null : presetParams(m.plan, s.rule)) ?? viewParams(s)
  return {
    params: { ...base, limitAt: m.limitAt },
    pattern: { ...s.pattern, kind: m.kind, startS: m.startS, demandMbps: null },
  }
}

/** Both directions of a shared-parent client, for the export (limit-at on both). */
export function memberPair(s: LabState, m: GroupMember): Pair {
  const preset = PRESETS.find((p) => p.id === m.plan)
  if (preset) {
    return {
      down: { ...planDefaults(preset.downMbps, s.rule), limitAt: m.limitAt },
      up: { ...planDefaults(preset.upMbps, s.rule), limitAt: m.limitAt },
    }
  }
  return { down: { ...s.down, limitAt: m.limitAt }, up: { ...(s.symmetric ? s.down : s.up), limitAt: m.limitAt } }
}

// ── Share link ──────────────────────────────────────────────────────────────

const num = (v: number) => String(Math.round(v * 1000) / 1000)
const q = (p: QueueParams) => [p.maxLimit, p.burstLimit, p.burstThreshold, p.burstTime, p.limitAt].map(num).join(",")

export function encodeState(s: LabState): string {
  const h = new URLSearchParams()
  h.set("p", s.preset)
  h.set("m", s.planMbps ? num(s.planMbps) : "")
  h.set("d", q(s.down))
  if (!s.symmetric) h.set("u", q(s.up))
  h.set("v", s.view)
  const pt = s.pattern
  h.set("t", [pt.kind, pt.demandMbps ?? "", pt.startS, pt.onS, pt.offS, pt.testS, pt.fileMB, pt.videoMbps, pt.pageMB].map(String).join(","))
  h.set("s", num(s.durationS))
  if (s.lineCapMbps) h.set("c", num(s.lineCapMbps))
  const g = s.group
  h.set("g", [[g.parentMbps, g.durationS].map(num).join(","), ...g.members.map((m) => [m.plan, num(m.limitAt), m.priority, m.kind, num(m.startS)].join(","))].join("~"))
  h.set("r", [s.rule.sustained, s.rule.threshold, s.rule.burstTime].map(num).join(","))
  setDeploymentParams(h, s)
  if (s.backgroundMbps > 0) h.set("b", num(s.backgroundMbps))
  if (s.queueKind !== "default") h.set("q", s.queueKind)
  return h.toString()
}

const opt = (v: number | null) => (v === null ? "" : num(v))

/** The deployment's part of the share link: `h=`, `o=`, `n=`, `st=`, `w=`. */
function setDeploymentParams(h: URLSearchParams, f: DeploymentFields) {
  const c = f.capacity
  h.set(
    "h",
    [num(c.parentMbps), c.direction, num(c.avgDownMbps), num(c.avgUpMbps), num(c.videoShare), num(c.videoMbps), num(c.fileMB), c.pon, num(c.homesPerPort), ...c.clients.map(num)].join(",")
  )
  // Rows split by "|", fields by ",": both are always escaped inside URI-encoded text.
  h.set("o", [num(c.ponEfficiency), c.internet, c.oltModel, num(c.oltUplinkMbps), opt(c.portsInUse), opt(c.measuredDownMbps), opt(c.measuredUpMbps)].join(","))
  if (c.oltBuild) {
    h.set("ob", c.oltBuild.code)
    h.set("obp", OLT_TECHS.map((k) => num(c.oltBuild?.ports[k] ?? 0)).join(","))
  }
  if (f.deployment) h.set("n", f.deployment)
  if (f.status === "existing") h.set("st", "existing")
  const enc = encodeURIComponent
  h.set("w", [f.balance.classifier, f.balance.failover, f.balance.nat ? "1" : "0", f.balance.clients.map(enc).join(","), ...f.wans.map((w) => [enc(w.name), enc(w.iface), enc(w.gateway), num(w.mbps), enc(w.monitor), w.type, opt(w.measuredMbps), opt(w.upMbps), w.upstreamCgnat ? "1" : "0", enc(w.natIps), w.providerNat ? "1" : "0"].join(","))].join("|"))
  if (f.balance.speed !== "normal") h.set("lf", f.balance.speed)
  const st = f.setup
  h.set(
    "ds",
    [
      st.oltPort,
      num(st.internetVlan),
      num(st.mgmtVlan),
      st.mgmtNet,
      st.pool,
      st.dns,
      st.service,
      st.firewall ? "1" : "0",
      st.oltUplink,
      st.collector,
      st.mtu1500 ? "1" : "0",
      st.isolate ? "1" : "0",
      st.blockSmtp ? "1" : "0",
      st.ontMode,
      [st.rule.sustained, st.rule.threshold, st.rule.burstTime].map(num).join(";"),
      st.plans.map((p) => [p.name, num(p.down), num(p.up)].join(":")).join(";"),
      st.natMode,
      st.sessionLog ? "1" : "0",
      st.pitp ? "1" : "0",
      st.ipv6Pd,
      num(st.ipv6PdLength),
      st.ipv6Wan,
      st.dnsMode,
      st.alert,
      st.telegramChat,
      st.mailServer,
      st.mailFrom,
      st.mailTo,
      st.backup,
      st.backupHost,
      st.backupUser,
      st.backupPath,
      st.snmp ? "1" : "0",
    ]
      .map(encodeURIComponent)
      .join("|")
  )
  const lq = f.balance.queues
  h.set("lq", [lq.shape, num(lq.sharePct), lq.prio, lq.alerts, lq.flush].map((x) => (x === true ? "1" : x === false ? "0" : x)).join(","))
}

export function deploymentFields(s: LabState): DeploymentFields {
  return { deployment: s.deployment, status: s.status, capacity: s.capacity, wans: s.wans, balance: s.balance, setup: s.setup }
}

/** Setup settings (`ds=`); absent or malformed = the defaults (checks run on what's shown). */
function decodeSetup(v: string | null): SetupState {
  if (!v) return DEFAULT_SETUP
  const parts = v.split("|").map((x) => {
    try {
      return decodeURIComponent(x)
    } catch {
      return null
    }
  })
  // 9 fields before the checklist options (collector, MTU, isolation, SMTP, ONT mode), 14 before the plans: those take the defaults.
  // 22 with NAT mode, session log, PITP and IPv6; 33 with DNS mode, alerts, backups and SNMP.
  if (![9, 14, 16, 22, 33].includes(parts.length) || parts.some((x) => x === null)) return DEFAULT_SETUP
  const [oltPort, inet, mgmtVlan, mgmtNet, pool, dns, service, firewall, oltUplink, collector, mtu1500, isolate, blockSmtp, ontMode, rule, plans, natMode, sessionLog, pitp, ipv6Pd, pdLen, ipv6Wan] =
    parts as string[]
  const [dnsMode, alert, telegramChat, mailServer, mailFrom, mailTo, backup, backupHost, backupUser, backupPath, snmp] = parts.slice(22) as string[]
  const pick = <T extends string>(x: string | undefined, all: readonly T[], fallback: T) => (all.includes(x as T) ? (x as T) : fallback)
  const text = (x: string | undefined, fallback: string) => (x ?? fallback).slice(0, 64)
  const flag = (x: string | undefined, fallback: boolean) => (x === "1" ? true : x === "0" ? false : fallback)
  const vlan = (x: string) => finite(x, 1, 4094)
  if (vlan(inet) === null || vlan(mgmtVlan) === null || (firewall !== "0" && firewall !== "1")) return DEFAULT_SETUP
  const cut = (x: string) => x.slice(0, 64)
  return {
    oltPort: cut(oltPort),
    internetVlan: Math.round(vlan(inet) as number),
    mgmtVlan: Math.round(vlan(mgmtVlan) as number),
    mgmtNet: cut(mgmtNet),
    pool: cut(pool),
    dns: cut(dns),
    service: cut(service),
    firewall: firewall === "1",
    oltUplink: cut(oltUplink),
    collector: cut(collector ?? DEFAULT_SETUP.collector),
    mtu1500: flag(mtu1500, DEFAULT_SETUP.mtu1500),
    isolate: flag(isolate, DEFAULT_SETUP.isolate),
    blockSmtp: flag(blockSmtp, DEFAULT_SETUP.blockSmtp),
    // Links from before the ONT mode existed (9 fields) meant bridge; the rest take the default.
    ontMode: ontMode === "router" ? "router" : ontMode === "bridge" ? "bridge" : parts.length === 9 ? "bridge" : DEFAULT_SETUP.ontMode,
    rule: decodeSetupRule(rule) ?? DEFAULT_SETUP.rule,
    plans: decodePlans(plans) ?? DEFAULT_SETUP.plans,
    natMode: NAT_MODES.includes(natMode as NatMode) ? (natMode as NatMode) : DEFAULT_SETUP.natMode,
    sessionLog: flag(sessionLog, DEFAULT_SETUP.sessionLog),
    pitp: flag(pitp, DEFAULT_SETUP.pitp),
    ipv6Pd: (ipv6Pd ?? DEFAULT_SETUP.ipv6Pd).slice(0, 64),
    ipv6PdLength: Math.round(finite(pdLen, 16, 128) ?? DEFAULT_SETUP.ipv6PdLength),
    ipv6Wan: (ipv6Wan ?? DEFAULT_SETUP.ipv6Wan).slice(0, 64),
    dnsMode: pick(dnsMode, DNS_MODES, DEFAULT_SETUP.dnsMode),
    alert: pick(alert, ALERT_MODES, DEFAULT_SETUP.alert),
    telegramChat: text(telegramChat, DEFAULT_SETUP.telegramChat),
    mailServer: text(mailServer, DEFAULT_SETUP.mailServer),
    mailFrom: text(mailFrom, DEFAULT_SETUP.mailFrom),
    mailTo: text(mailTo, DEFAULT_SETUP.mailTo),
    backup: pick(backup, BACKUP_MODES, DEFAULT_SETUP.backup),
    backupHost: text(backupHost, DEFAULT_SETUP.backupHost),
    backupUser: text(backupUser, DEFAULT_SETUP.backupUser),
    backupPath: text(backupPath, DEFAULT_SETUP.backupPath),
    snmp: flag(snmp, DEFAULT_SETUP.snmp),
  }
}

function decodeSetupRule(v: string | undefined): PlanRule | null {
  if (!v) return null
  const [sustained, threshold, burstTime] = v.split(";").map((x) => finite(x, 0, 3600))
  if (sustained === null || threshold === null || burstTime === null) return null
  if (!(sustained >= 0.01 && sustained <= 1) || !(threshold >= 0.01 && threshold <= 2) || !(burstTime >= 1)) return null
  return { sustained, threshold, burstTime: Math.round(burstTime) }
}

function decodePlans(v: string | undefined): SetupPlan[] | null {
  if (!v) return null
  const out: SetupPlan[] = []
  for (const row of v.split(";").slice(0, MAX_PLANS)) {
    const [name, down, up] = row.split(":")
    const d = finite(down, 0.001, 1e6)
    const u = finite(up, 0.001, 1e6)
    if (d === null || u === null) return null
    out.push({ name: (name ?? "").slice(0, 32), down: d, up: u })
  }
  return out.length ? out : null
}

/** A deployment as text (how the browser and the backup file keep it). */
export function encodeDeployment(f: DeploymentFields): string {
  const h = new URLSearchParams()
  setDeploymentParams(h, f)
  return h.toString()
}

/** A saved deployment back; null when the text isn't one. */
export function decodeDeployment(text: string): DeploymentFields | null {
  const h = new URLSearchParams(text)
  const lines = decodeWans(h)
  if (!decodeCapacity(h.get("h")) || !lines) return null
  return { capacity: decodeCapacityAll(h, DEFAULT_CAPACITY), deployment: nameOf(h), status: statusOf(h), ...lines, setup: decodeSetup(h.get("ds")) }
}

const nameOf = (h: URLSearchParams) => (h.get("n") ?? "").slice(0, MAX_NAME)
const statusOf = (h: URLSearchParams): DeploymentStatus => (h.get("st") === "existing" ? "existing" : "planned")

const finite = (v: string | undefined, min = 0, max = 1e6): number | null => {
  if (v === undefined || v.trim() === "") return null
  const n = Number(v)
  return Number.isFinite(n) && n >= min && n <= max ? n : null
}

function decodeQueue(v: string | null): QueueParams | null {
  if (!v) return null
  const parts = v.split(",").map((x) => finite(x))
  if (parts.length !== 5 || parts.some((x) => x === null)) return null
  const [maxLimit, burstLimit, burstThreshold, burstTime, limitAt] = parts as number[]
  if (!(maxLimit > 0)) return null
  return { maxLimit, burstLimit, burstThreshold, burstTime: Math.round(burstTime), limitAt }
}

function decodeGroup(v: string | null): GroupState | null {
  if (!v) return null
  const [head, ...rows] = v.split("~")
  const [parent, duration] = head.split(",")
  const parentMbps = finite(parent, 0.001)
  const durationS = finite(duration, 1, MAX_DURATION_S)
  if (parentMbps === null || durationS === null || rows.length === 0 || rows.length > MAX_MEMBERS) return null
  const members: GroupMember[] = []
  for (const row of rows) {
    const [plan, limitAt, priority, kind, startS] = row.split(",")
    const m = {
      plan: plan === "current" || PRESETS.some((p) => p.id === plan) ? plan : null,
      limitAt: finite(limitAt),
      priority: finite(priority, 1, 8),
      kind: KINDS.includes(kind as PatternKind) ? (kind as PatternKind) : null,
      startS: finite(startS, 0, 3600),
    }
    if (m.plan === null || m.limitAt === null || m.priority === null || m.kind === null || m.startS === null) return null
    members.push({ plan: m.plan, limitAt: m.limitAt, priority: Math.round(m.priority), kind: m.kind, startS: m.startS })
  }
  return { parentMbps, durationS, members }
}

function decodeRule(v: string | null): PlanRule | null {
  if (!v) return null
  const [sustained, threshold, burstTime] = v.split(",").map((x) => finite(x))
  if (sustained === null || threshold === null || burstTime === null) return null
  if (!(sustained >= 0.01 && sustained <= 1) || !(threshold >= 0.01 && threshold <= 2) || !(burstTime >= 1 && burstTime <= 3600)) return null
  return { sustained, threshold, burstTime: Math.round(burstTime) }
}

const PON_TECHS: PonTech[] = ["none", "gpon", "xgpon", "xgspon"]

/** OLT and internet side (`o=`). Ports in use and measured traffic came later: absent or empty = not set. */
function decodeOlt(
  v: string | null
): Pick<CapacityState, "ponEfficiency" | "internet" | "oltModel" | "oltUplinkMbps" | "portsInUse" | "measuredDownMbps" | "measuredUpMbps"> | null {
  if (!v) return null
  const [eff, internet, model, uplink, ports, measuredDown, measuredUp] = v.split(",")
  const ponEfficiency = finite(eff, 0.5, 1)
  const oltUplinkMbps = finite(uplink, 0, 1e6)
  if (ponEfficiency === null || oltUplinkMbps === null || (internet !== "links" && internet !== "single") || !OLT_MODELS.includes(model as OltModelId)) return null
  const portsInUse = finite(ports, 1, MAX_PORTS)
  return {
    ponEfficiency,
    internet,
    oltModel: model as OltModelId,
    oltUplinkMbps,
    portsInUse: portsInUse === null ? null : Math.round(portsInUse),
    measuredDownMbps: finite(measuredDown, 0, 1e6),
    measuredUpMbps: finite(measuredUp, 0, 1e6),
  }
}

/**
 * Links saved before the connection type: a gateway IP was a fixed IP; an
 * empty one meant "the interface", right for pppoe-out but not for an
 * Ethernet port, where the provider's DHCP is the likely case.
 */
function legacyType(gateway: string, iface: string): WanType {
  if (gateway.trim()) return "static"
  return /^pppoe/i.test(iface.trim()) ? "pppoe" : "dhcp"
}

/** Link queues and Netwatch (`lq=`): shape, share %, priority, alerts, flush. Absent or malformed = the defaults. */
function decodeQueues(v: string | null): LinkQueues {
  const [shape, pct, prio, alerts, flush] = (v ?? "").split(",")
  const flag = (x: string | undefined) => (x === "1" ? true : x === "0" ? false : null)
  const q = { shape: flag(shape), sharePct: finite(pct, 50, 100), prio: flag(prio), alerts: flag(alerts), flush: flag(flush) }
  if (Object.values(q).some((x) => x === null)) return DEFAULT_LINK_QUEUES
  return q as LinkQueues
}

/** Internet links and balancing (`w=`). */
function decodeWans(h: URLSearchParams): { wans: Wan[]; balance: BalanceState } | null {
  const v = h.get("w")
  const speed = h.get("lf")
  if (!v) return null
  const [classifier, failover, nat, clients, ...rows] = v.split("|")
  if (!CLASSIFIERS.includes(classifier as Classifier) || (failover !== "recursive" && failover !== "gateway") || (nat !== "0" && nat !== "1")) return null
  if (rows.length === 0 || rows.length > MAX_WANS) return null
  const dec = (x: string | undefined) => {
    try {
      return decodeURIComponent(x ?? "")
    } catch {
      return null
    }
  }
  const wans: Wan[] = []
  for (const [k, row] of rows.entries()) {
    const [name, iface, gateway, mbps, monitor, type, measured, up, cgnat, natIps, providerNat] = row.split(",")
    const w = { name: dec(name), iface: dec(iface), gateway: dec(gateway), mbps: finite(mbps, 1, 1e6), monitor: dec(monitor) }
    if (Object.values(w).some((x) => x === null)) return null
    wans.push({
      name: (w.name as string).slice(0, 24) || `WAN${k + 1}`,
      type: WAN_TYPES.includes(type as WanType) ? (type as WanType) : legacyType(w.gateway as string, w.iface as string),
      iface: (w.iface as string).slice(0, 64),
      gateway: (w.gateway as string).slice(0, 64),
      mbps: w.mbps as number,
      measuredMbps: finite(measured, 1, 1e6),
      upMbps: finite(up, 1, 1e6),
      upstreamCgnat: cgnat === "1",
      // Links from before this field: the owner's providers do NAT (no public IP yet); a CGNAT provider always does.
      providerNat: cgnat === "1" || providerNat !== "0",
      monitor: (w.monitor as string).slice(0, 64),
      natIps: (dec(natIps) ?? "").slice(0, 40),
    })
  }
  const nets = (clients ?? "").split(",").map(dec)
  if (nets.some((x) => x === null)) return null
  return {
    wans,
    balance: {
      classifier: classifier as Classifier,
      failover: failover as Failover,
      // `lf=` came later: absent = the RouterOS default timers.
      speed: FAILOVER_SPEEDS.includes(speed as FailoverSpeed) ? (speed as FailoverSpeed) : "normal",
      nat: nat === "1",
      clients: (nets as string[]).filter(Boolean).slice(0, 32),
      queues: decodeQueues(h.get("lq")),
    },
  }
}

export const MAX_WANS = 16
/** Public IP to watch for a new link (the next unused default). */
export function nextMonitor(wans: Wan[]): string {
  return DEFAULT_MONITORS.find((m) => !wans.some((w) => w.monitor === m)) ?? ""
}

/** Capacity settings (`h=`). Links from before the size-based model (`k=`) get the defaults. */
function decodeCapacity(v: string | null): CapacityState | null {
  if (!v) return null
  const [parent, direction, avgDown, avgUp, videoShare, videoMbps, fileMB, pon, homes, ...counts] = v.split(",")
  const c = {
    parentMbps: finite(parent, 0.001, 1e7),
    direction: direction === "up" ? "up" : direction === "down" ? "down" : null,
    avgDownMbps: finite(avgDown, 0, 1e4),
    avgUpMbps: finite(avgUp, 0, 1e4),
    videoShare: finite(videoShare, 0, 1),
    videoMbps: finite(videoMbps, 0.001, 1e4),
    fileMB: finite(fileMB, 0.001, 1e6),
    pon: PON_TECHS.includes(pon as PonTech) ? (pon as PonTech) : null,
    homesPerPort: finite(homes, 1, 1024),
  }
  const clients = counts.map((x) => finite(x, 0, MAX_CLIENTS_PER_PLAN))
  if (Object.values(c).some((x) => x === null)) return null
  if (clients.length !== PRESETS.length || clients.some((x) => x === null)) return null
  return {
    ...DEFAULT_CAPACITY,
    parentMbps: c.parentMbps as number,
    direction: c.direction as Direction,
    avgDownMbps: c.avgDownMbps as number,
    avgUpMbps: c.avgUpMbps as number,
    videoShare: c.videoShare as number,
    videoMbps: c.videoMbps as number,
    fileMB: c.fileMB as number,
    pon: c.pon as PonTech,
    homesPerPort: Math.round(c.homesPerPort as number),
    clients: (clients as number[]).map(Math.round),
  }
}

export const MAX_CLIENTS_PER_PLAN = 2000
/** Longest deployment name. */
export const MAX_NAME = 40
/** Most PON ports a deployment's OLT can have in use (the biggest MA5800 takes 272). */
export const MAX_PORTS = 512

/**
 * `h=` + `o=`. Links from before the OLT and the links (`h=` without `o=`)
 * modeled one uplink of parentMbps and no OLT limit: they keep that.
 */
function decodeCapacityAll(h: URLSearchParams, base: CapacityState): CapacityState {
  const cap = decodeCapacity(h.get("h"))
  const olt = decodeOlt(h.get("o"))
  const oltBuild = decodeOltBuild(h.get("ob"), h.get("obp"))
  if (cap) return { ...cap, ...(olt ?? { internet: "single", oltUplinkMbps: 0 }), oltBuild }
  return { ...base, ...(olt ?? {}), oltBuild }
}

const OLT_TECHS: OltTech[] = ["gpon", "xgpon", "xgspon"]
/** Longest build code kept (the biggest chassis, every slot filled, is ~400 characters). */
const MAX_BUILD = 600

/** `ob=` (the build's share code, read by /olt) + `obp=` (its GPON, XG-PON and XGS-PON ports). */
function decodeOltBuild(code: string | null, ports: string | null): OltBuild | null {
  if (!code || code.length > MAX_BUILD || !/^[a-z0-9-]+;/.test(code)) return null
  const p = (ports ?? "").split(",").map((x) => finite(x, 0, 1e4))
  if (p.length !== OLT_TECHS.length || p.some((x) => x === null)) return null
  return { code, ports: Object.fromEntries(OLT_TECHS.map((k, i) => [k, Math.round(p[i] as number)])) as Record<OltTech, number> }
}

/** Reads a share hash; anything malformed falls back to the defaults. */
export function decodeState(hash: string): LabState | null {
  const h = new URLSearchParams(hash.replace(/^#/, ""))
  const down = decodeQueue(h.get("d"))
  if (!down) return null
  const up = decodeQueue(h.get("u"))
  const base = initialState()
  const [kind, demand, startS, onS, offS, testS, fileMB, videoMbps, pageMB] = (h.get("t") ?? "").split(",")
  const pattern: Pattern = {
    kind: KINDS.includes(kind as PatternKind) ? (kind as PatternKind) : base.pattern.kind,
    demandMbps: finite(demand, 0.001),
    startS: finite(startS, 0, 3600) ?? base.pattern.startS,
    onS: finite(onS, 0.1, 3600) ?? base.pattern.onS,
    offS: finite(offS, 0, 3600) ?? base.pattern.offS,
    testS: finite(testS, 0.1, 3600) ?? base.pattern.testS,
    fileMB: finite(fileMB, 0.001) ?? base.pattern.fileMB,
    videoMbps: finite(videoMbps, 0.001, 1e4) ?? base.pattern.videoMbps,
    pageMB: finite(pageMB, 0.001, 1e4) ?? base.pattern.pageMB,
  }
  const preset = h.get("p") ?? "custom"
  const known = PRESETS.find((p) => p.id === preset)
  // Links from before the plan field: take the plan's speed.
  const planMbps = h.has("m") ? finite(h.get("m") ?? undefined, 0.001) : (known?.downMbps ?? null)
  return {
    preset: preset === "custom" || known ? preset : "custom",
    planMbps,
    symmetric: !up,
    down,
    up: up ?? down,
    view: h.get("v") === "up" ? "up" : "down",
    pattern,
    durationS: finite(h.get("s") ?? undefined, 1, MAX_DURATION_S) ?? base.durationS,
    lineCapMbps: finite(h.get("c") ?? undefined, 0.001),
    group: decodeGroup(h.get("g")) ?? base.group,
    // Links from before the rule field used the first tested rule.
    rule: decodeRule(h.get("r")) ?? DEFAULT_RULE,
    capacity: decodeCapacityAll(h, base.capacity),
    deployment: nameOf(h),
    status: statusOf(h),
    ...(decodeWans(h) ?? { wans: base.wans, balance: base.balance }),
    setup: decodeSetup(h.get("ds")),
    backgroundMbps: finite(h.get("b") ?? undefined, 0, 1e4) ?? 0,
    queueKind: QUEUE_KINDS.includes(h.get("q") as QueueKind) ? (h.get("q") as QueueKind) : "default",
  }
}

export const MAX_DURATION_S = 600
