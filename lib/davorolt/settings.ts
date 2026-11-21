/**
 * DavorOLT (owner, 2026-11-21): command tools for the owner's Huawei MA5608T (V800R018), in the spirit of AdminOLT and
 * SmartOLT but as a command generator: each tool writes the CLI to paste over Telnet/SSH (owner: "command generator",
 * "just forms", no records of ONUs). These settings are the OLT's data every tool shares; they stay in this browser
 * (components/davorolt/useOltSettings.ts). Passwords are never part of them.
 *
 * MA5608T layout (Huawei Hardware Description, lib/olt-kb.ts): service slots 0 and 1 (GPON boards), control boards in
 * slots 2 and 3 with the uplink ports on them (`interface mcu 0/2`).
 */

/** How plans reach the client (owner: "not decided yet"; both offered, see the settings copy). */
export const PLAN_MODES = ["priority", "vlan"] as const
export type PlanMode = (typeof PLAN_MODES)[number]

export type OltPlan = { name: string; mbps: number; vlan: number }

export type OltSettings = {
  sysname: string
  /** Management VLAN and the OLT's address in it (CIDR), with its gateway. */
  mgmtVlan: number
  mgmtAddress: string
  mgmtGateway: string
  /** Uplink port on the control board (slot 2 or 3). */
  uplinkSlot: number
  uplinkPort: number
  /**
   * priority: one internet VLAN, each plan's speed set on the OLT (traffic table + DBA, "line profile priority");
   * vlan: one VLAN per plan, the speed set on the gateway (AsterNOS/MikroTik), "line profile VLAN".
   */
  planMode: PlanMode
  internetVlan: number
  plans: OltPlan[]
  /** IPTV (owner: TV is IPTV): its multicast VLAN, 0 = no IPTV. */
  iptvVlan: number
  /** The ONT's LAN port for the set-top box. */
  iptvEth: number
  /** ONTs as routers dialing PPPoE (the owner's EG8145B7-50s) or bridges. */
  ontMode: "router" | "bridge"
}

/** First id of the profiles and traffic tables DavorOLT writes (Huawei's defaults sit below; same as the MikroTik scripts). */
export const FIRST_ID = 10
/** The OLT's rate on top of the plan, like the MikroTik scripts (lib/mikrotik/setup.ts OLT_HEADROOM). */
export const HEADROOM = 1.1
/** Huawei's traffic table without a limit (manual p608: profile 6 = no rate limitation). */
export const NO_LIMIT_TABLE = 6

/** Starting values: placeholders to replace with the owner's own (the plans are the public lineup). */
export const DEFAULT_SETTINGS: OltSettings = {
  sysname: "OLT-1",
  mgmtVlan: 10,
  mgmtAddress: "192.168.10.2/24",
  mgmtGateway: "192.168.10.1",
  uplinkSlot: 2,
  uplinkPort: 0,
  planMode: "priority",
  internetVlan: 100,
  plans: [
    { name: "200M", mbps: 200, vlan: 200 },
    { name: "500M", mbps: 500, vlan: 500 },
    { name: "1G", mbps: 1000, vlan: 1000 },
  ],
  iptvVlan: 300,
  iptvEth: 2,
  ontMode: "router",
}

export const SERVICE_SLOTS = [0, 1] as const
export const CONTROL_SLOTS = [2, 3] as const
export const MAX_PON_PORT = 15
export const MAX_ONT_ID = 127

const int = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : d)
const text = (v: unknown, max: number, d: string) => (typeof v === "string" ? v.slice(0, max) : d)

export function decodeSettings(v: unknown): OltSettings {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {}
  const d = DEFAULT_SETTINGS
  const plans = Array.isArray(o.plans)
    ? o.plans
        .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
        .slice(0, 8)
        .map((p) => ({ name: text(p.name, 20, "Plan"), mbps: int(p.mbps, 1, 10000, 100), vlan: int(p.vlan, 2, 4094, 100) }))
    : d.plans
  return {
    sysname: text(o.sysname, 40, d.sysname),
    mgmtVlan: int(o.mgmtVlan, 2, 4094, d.mgmtVlan),
    mgmtAddress: text(o.mgmtAddress, 20, d.mgmtAddress),
    mgmtGateway: text(o.mgmtGateway, 15, d.mgmtGateway),
    uplinkSlot: int(o.uplinkSlot, 2, 3, d.uplinkSlot),
    uplinkPort: int(o.uplinkPort, 0, 3, d.uplinkPort),
    planMode: o.planMode === "vlan" ? "vlan" : "priority",
    internetVlan: int(o.internetVlan, 2, 4094, d.internetVlan),
    plans: plans.length ? plans : d.plans,
    iptvVlan: int(o.iptvVlan, 0, 4094, d.iptvVlan),
    iptvEth: int(o.iptvEth, 1, 4, d.iptvEth),
    ontMode: o.ontMode === "bridge" ? "bridge" : "router",
  }
}

/** Problems with the settings that would make wrong commands. */
export function settingsIssues(s: OltSettings): string[] {
  const out: string[] = []
  if (!parseCidr(s.mgmtAddress)) out.push("mgmtAddress")
  if (!isIp(s.mgmtGateway)) out.push("mgmtGateway")
  const vlans = [s.mgmtVlan, ...(s.planMode === "vlan" ? s.plans.map((p) => p.vlan) : [s.internetVlan]), ...(s.iptvVlan ? [s.iptvVlan] : [])]
  if (new Set(vlans).size !== vlans.length) out.push("vlanRepeated")
  if (!/^[\w.-]{1,40}$/.test(s.sysname)) out.push("sysname")
  return out
}

export const isIp = (s: string) => /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(s.trim())

export function parseCidr(s: string): { ip: string; prefix: number; mask: string } | null {
  const m = /^(\S+)\/(\d{1,2})$/.exec(s.trim())
  if (!m || !isIp(m[1])) return null
  const prefix = Number(m[2])
  if (prefix < 8 || prefix > 30) return null
  const n = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  return { ip: m[1], prefix, mask: [24, 16, 8, 0].map((sh) => (n >>> sh) & 255).join(".") }
}

/** kbit/s for the OLT with headroom, a multiple of 64 (as the MikroTik scripts). */
export const oltKbps = (mbps: number) => Math.ceil((mbps * 1000 * HEADROOM) / 64) * 64
