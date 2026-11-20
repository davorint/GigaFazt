/**
 * AsterNOS-VPP configuration for a deployment (owner, 2026-11-20: AsterNOS replaces the MikroTik as the PPPoE gateway).
 *
 * Every command comes from docs.asternos.com (Routing & Gateway, AsterNOS-VPP); each block lists the pages it uses
 * (DOCS) and says whether it relies on something the docs don't show, to check on the device before a building.
 * Design (owner): local PPPoE users; one VLAN per plan from the OLT, each with its own PPPoE server instance (0–7) and
 * address pool; every address of a plan's pool gets its own burst policer (lib/asternos/burst.ts), so whoever gets an
 * address from the 200M pool gets the 200M plan. Pure functions: text only, nothing sent anywhere.
 */
import { planDefaults, type PlanRule } from "../mikrotik/burst"
import { asterBurst, carKBps, hqosBps, SMALL_BUCKET, type AsterBurst, type BurstDesign } from "./burst"

const BASE = "https://docs.asternos.com/routing"
/** The documentation pages each block relies on. */
export const DOCS = {
  firstUse: `${BASE}/configuration-guide/first-use/`,
  cli: `${BASE}/command-line-reference/basic-configuration/enter-the-command-line-configuration-interface/`,
  device: `${BASE}/command-line-reference/device-management/device-configuration/`,
  ntp: `${BASE}/command-line-reference/device-management/ntp-configuration/`,
  users: `${BASE}/command-line-reference/user-access-and-authentication/local-user-configuration/`,
  iface: `${BASE}/command-line-reference/interface-management/interface-basic-configuration/`,
  subIface: `${BASE}/command-line-reference/interface-management/sub-interface-configuration/`,
  lag: `${BASE}/command-line-reference/ethernet-switching/link-aggregation-configuration/`,
  ipv4: `${BASE}/command-line-reference/ip-service/ipv4-configuration/`,
  pppoeServer: `${BASE}/command-line-reference/ip-service/pppoe-server-configuration/`,
  pppoeGuide: `${BASE}/user-case/pppoe-server-configuration-guide/`,
  staticRoute: `${BASE}/command-line-reference/ip-unicast-routing/static-route-configuration/`,
  pbr: `${BASE}/command-line-reference/ip-unicast-routing/policy-route-configuration/`,
  sla: `${BASE}/command-line-reference/reliability-configuration/12-3-sla-configuration/`,
  track: `${BASE}/command-line-reference/reliability-configuration/12-4-track-configuration/`,
  nat: `${BASE}/command-line-reference/ip-service/nat-configuration/`,
  natGuide: `${BASE}/configuration-guide/nat-configuration-guide/`,
  acl: `${BASE}/command-line-reference/security-configuration/acl-configuration/`,
  car: `${BASE}/command-line-reference/qos-configuration/traffic-regulation/`,
  qosCase: `${BASE}/user-case/qos-vpp-case/`,
  hqos: `${BASE}/command-line-reference/hqos-configuration/`,
  hqosCase: `${BASE}/user-case/hqos-vpp-case/`,
  upgrade: `${BASE}/configuration-guide/system-configuration-guide/`,
  status: `${BASE}/command-line-reference/device-management/device-status/`,
} as const
export type DocKey = keyof typeof DOCS

// ── The deployment ──────────────────────────────────────────────────────────

export type AsterPlan = {
  name: string
  mbps: number
  /** The VLAN this plan's ONTs use (OLT service port / ONT WAN). */
  vlan: number
  /** The plan's PPPoE address pool, e.g. 100.64.1.0/24 (gateway = first address). */
  pool: string
}
export type AsterCarrier = {
  name: string
  /** Ethernet port number (1, 2…). */
  port: number
  mode: "dhcp" | "static"
  /** Static: the port's address with prefix (e.g. 200.10.10.2/30) and the carrier's gateway. */
  address: string
  gateway: string
  /** What the carrier gives, Mbps (for the HQoS totals). */
  mbps: number
}
export type AsterDeployment = {
  hostname: string
  adminUser: string
  /** Management port (ethernet), its address with prefix and gateway (optional). */
  mgmtPort: number
  mgmtAddress: string
  mgmtGateway: string
  ntp: string
  dns: string
  /** Ports to the OLT; two or more become a LACP link aggregation. */
  oltPorts: number[]
  plans: AsterPlan[]
  carriers: AsterCarrier[]
  /** balance: traffic shared among the carriers; failover: the first carrier, the others as backup. */
  wanMode: "balance" | "failover"
  /** Address the failover checks ping through each carrier. */
  probe: string
  design: BurstDesign
  rule: PlanRule
}

export type Block = {
  id: string
  code: string
  docs: DocKey[]
  /** Relies on something the docs don't show: to check on the device first. */
  verify: boolean
}

// ── Addresses ───────────────────────────────────────────────────────────────

/** "a.b.c.d/n" → its usable hosts as numbers, or null. */
export function poolHosts(cidr: string): { gateway: string; first: string; last: string; hosts: string[]; prefix: number; mask: string } | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(cidr.trim())
  if (!m) return null
  const o = m.slice(1, 5).map(Number)
  const prefix = Number(m[5])
  if (o.some((x) => x > 255) || prefix < 20 || prefix > 30) return null
  const ip = ((o[0] << 24) >>> 0) + (o[1] << 16) + (o[2] << 8) + o[3]
  const size = 2 ** (32 - prefix)
  const net = ip - (ip % size)
  const str = (n: number) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".")
  const maskN = (0xffffffff << (32 - prefix)) >>> 0
  // Gateway = first usable, clients = the rest.
  const hosts: string[] = []
  for (let n = net + 2; n < net + size - 1; n++) hosts.push(str(n))
  return { gateway: str(net + 1), first: hosts[0], last: hosts[hosts.length - 1], hosts, prefix, mask: str(maskN) }
}

/** ACL rule ids go 0–500 per table (AsterNOS ACL reference): a plan's pool can't have more clients than that. */
export const MAX_RULES = 500

export type DeploymentIssue =
  | { code: "plans" }
  | { code: "tooManyPlans" }
  | { code: "pool"; plan: string }
  | { code: "poolSize"; plan: string; n: number }
  | { code: "vlan"; plan: string }
  | { code: "carriers" }
  | { code: "carrierStatic"; carrier: string }
  | { code: "balanceGateway"; carrier: string }
  | { code: "olt" }

/** What would make the generated configuration wrong or incomplete. */
export function deploymentIssues(d: AsterDeployment): DeploymentIssue[] {
  const out: DeploymentIssue[] = []
  if (!d.plans.length) out.push({ code: "plans" })
  if (d.plans.length > 8) out.push({ code: "tooManyPlans" })
  const vlans = new Set<number>()
  for (const p of d.plans) {
    const h = poolHosts(p.pool)
    if (!h) out.push({ code: "pool", plan: p.name })
    else if (h.hosts.length > MAX_RULES) out.push({ code: "poolSize", plan: p.name, n: h.hosts.length })
    if (!(p.vlan >= 2 && p.vlan <= 4094) || vlans.has(p.vlan)) out.push({ code: "vlan", plan: p.name })
    vlans.add(p.vlan)
  }
  if (!d.carriers.length) out.push({ code: "carriers" })
  for (const c of d.carriers) {
    if (c.mode === "static" && (!c.address || !c.gateway)) out.push({ code: "carrierStatic", carrier: c.name })
    // Balancing and failover checks send traffic to each carrier's gateway: a DHCP carrier's isn't known in advance.
    if (c.mode === "dhcp" && d.carriers.length > 1) out.push({ code: "balanceGateway", carrier: c.name })
  }
  if (!d.oltPorts.length) out.push({ code: "olt" })
  return out
}

// ── Names ───────────────────────────────────────────────────────────────────

const safe = (s: string) => s.replace(/[^A-Za-z0-9]/g, "").slice(0, 12) || "P"
const planTag = (p: AsterPlan, i: number) => `${safe(p.name)}${i}`
/** Interface the plan's clients arrive on: the OLT port (or link aggregation) sub-interface for its VLAN. */
const vlanIface = (d: AsterDeployment, p: AsterPlan) => `sub-ethernet ${d.oltPorts.length > 1 ? "lag1" : (d.oltPorts[0] ?? 1)}.${p.vlan}`
const wanIface = (c: AsterCarrier) => `ethernet ${c.port}`
const lastOctets = (ip: string) => ip.split(".").slice(2).join("_")

// ── Blocks ──────────────────────────────────────────────────────────────────

/** 1. First access: name, a named admin account, NTP. (Change the default admin/asteros password first.) */
export function accessBlock(d: AsterDeployment): Block {
  const lines = ["configure terminal", `hostname ${safe(d.hostname) || "gigafazt"}`, `local-user name ${d.adminUser || "noc"} passwd <CONTRASENA_SEGURA>`, "local-user retry-count 5", "local-user block-time 15"]
  if (d.mgmtAddress) lines.push(`interface ethernet ${d.mgmtPort}`, d.mgmtGateway ? `ip address ${d.mgmtAddress} ${d.mgmtGateway}` : `ip address ${d.mgmtAddress}`, "exit")
  if (d.ntp) lines.push(`ntp server ${d.ntp} prefer`)
  lines.push("end", "write")
  return { id: "access", code: lines.join("\n"), docs: ["firstUse", "device", "users", "ntp", "cli"], verify: false }
}

/** 2. The OLT: its port(s) (LACP when two or more) and one sub-interface per plan VLAN. */
export function oltBlock(d: AsterDeployment): Block {
  const lines = ["configure terminal"]
  if (d.oltPorts.length > 1) {
    lines.push("interface link-aggregation 1", "mode dynamic", "commit", "exit")
    for (const port of d.oltPorts) lines.push(`interface ethernet ${port}`, "description OLT", "link-aggregation-group 1", "no shutdown", "exit")
  } else {
    lines.push(`interface ethernet ${d.oltPorts[0] ?? 1}`, "description OLT", "no shutdown", "exit")
  }
  for (const p of d.plans) lines.push(`interface ${vlanIface(d, p)}`, `description PLAN-${safe(p.name)}-VLAN${p.vlan}`, "exit")
  lines.push("end", "write")
  // The sub-interface page doesn't show how its VLAN is set (the number after the dot is assumed to be it), nor
  // sub-interfaces on a link aggregation.
  return { id: "olt", code: lines.join("\n"), docs: ["iface", "lag", "subIface"], verify: true }
}

/** 3. One PPPoE server per plan: its pool, gateway, DNS, bound to the plan's VLAN. */
export function pppoeBlock(d: AsterDeployment): Block {
  const lines = ["configure terminal", "pppoe-server enable"]
  d.plans.forEach((p, i) => {
    const h = poolHosts(p.pool)
    if (!h) return
    const tag = planTag(p, i)
    lines.push(`ip-pool POOL-${tag}`, `ip-range ${h.first} ${h.last}`, "exit")
    lines.push(`interface pppoe-server ${i}`, `ac-name ${safe(d.hostname) || "gigafazt"}-${tag}`, `local-ip ${h.gateway} ${h.mask}`, `remote-ip-pool POOL-${tag}`, `dns-server ${d.dns || h.gateway}`, "keepalive 20", "exit")
    lines.push(`interface ${vlanIface(d, p)}`, `pppoe-server ${i}`, "exit")
  })
  lines.push("end", "write")
  // Documented on a physical port; on a VLAN sub-interface it isn't shown.
  return { id: "pppoe", code: lines.join("\n"), docs: ["pppoeServer", "pppoeGuide"], verify: true }
}

/** 4. Carriers: addresses, NAT out of each, default routes, balancing or failover. */
export function carriersBlock(d: AsterDeployment): Block {
  const lines = ["configure terminal", "nat enable"]
  d.carriers.forEach((c, i) => {
    lines.push(`interface ${wanIface(c)}`, `description WAN-${safe(c.name)}`, c.mode === "dhcp" ? "ip address dhcp-alloc" : `ip address ${c.address}`, "nat-zone 1", "no shutdown", "exit")
    if (c.mode === "static" && c.address) {
      const ip = c.address.split("/")[0]
      lines.push(`nat pool WAN${i + 1} ${ip}`, `nat binding NAT-WAN${i + 1} WAN${i + 1}`)
    }
  })
  const gws = d.carriers.filter((c) => c.mode === "static" && c.gateway)
  if (gws.length === 1 || d.wanMode === "failover") {
    // Failover: one default route per carrier, the first preferred (lower distance).
    // With several, the first preferred (distance; its exact position in the command is to verify).
    gws.forEach((c, i) => lines.push(gws.length > 1 ? `ip route 0.0.0.0/0 ${c.gateway} ${(i + 1) * 10}` : `ip route 0.0.0.0/0 ${c.gateway}`))
  }
  if (d.wanMode === "balance" && gws.length > 1) {
    lines.push("nexthop-group CARRIERS")
    for (const c of gws) lines.push(`nexthop ${c.gateway}`)
    lines.push("exit", "pbr-map BALANCE seq 10", "set nexthop-group CARRIERS", "exit")
    for (const p of d.plans) lines.push(`interface ${vlanIface(d, p)}`, "pbr-policy BALANCE", "exit")
  }
  lines.push("end", "write")
  // NAT with several carriers, the route distance position and PBR on sub-interfaces aren't shown in the docs.
  return { id: "carriers", code: lines.join("\n"), docs: ["ipv4", "nat", "natGuide", "staticRoute", "pbr"], verify: d.carriers.length > 1 }
}

/** 5. Failover checks: a ping per carrier; when it fails, its routes are withdrawn until it answers again. */
export function failoverBlock(d: AsterDeployment): Block {
  const lines = ["configure terminal"]
  d.carriers
    .filter((c) => c.mode === "static" && c.gateway)
    .forEach((c, i) => {
      lines.push(`sla ${i + 1} icmp-echo dst-ip ${d.probe || "1.1.1.1"} src-port ethernet ${c.port} timeout 2 frequency 5`)
      lines.push(`track ${i + 1}`, `sla ${i + 1}`, `route 0.0.0.0/0 ${c.gateway}`, "exit")
    })
  lines.push("end", "write", "show sla brief", "show track brief")
  return { id: "failover", code: lines.join("\n"), docs: ["sla", "track"], verify: true }
}

/** 6. Basic client filters (same idea as the MikroTik's): Windows file sharing and NetBIOS never leave to the internet. */
export function filtersBlock(d: AsterDeployment): Block {
  const lines = ["configure terminal", "access-list L3 FILTRO-CLIENTES ingress"]
  const ports: [number, number][] = [
    [6, 135],
    [6, 139],
    [6, 445],
    [17, 137],
    [17, 138],
  ]
  ports.forEach(([proto, port], k) => lines.push(`rule ${500 - k} ip-protocol ${proto} dst-port ${port} packet-action deny`))
  lines.push("exit")
  for (const p of d.plans) lines.push(`interface ${vlanIface(d, p)}`, "acl FILTRO-CLIENTES priority 100", "exit")
  lines.push("end", "write")
  return { id: "filters", code: lines.join("\n"), docs: ["acl"], verify: true }
}

/** The AsterNOS settings of each plan (from the MikroTik rule). */
export function planBursts(d: AsterDeployment): { plan: AsterPlan; burst: AsterBurst }[] {
  return d.plans.map((plan) => ({ plan, burst: asterBurst(planDefaults(plan.mbps, d.rule)) }))
}

/**
 * 7. Plans with burst, one policer per address of each plan's pool, both directions.
 * Download: matched by destination address on the carrier side (ingress); upload: by source address on the plan VLAN.
 */
export function plansBlock(d: AsterDeployment, only?: number): Block {
  const lines = ["configure terminal"]
  const twoStage = d.design === "two-stage"
  if (twoStage) lines.push("hqos enable")
  const total = d.carriers.reduce((a, c) => a + (c.mbps || 0), 0) || d.plans.reduce((a, p) => Math.max(a, p.mbps), 0) * 4
  planBursts(d).forEach(({ plan, burst }, i) => {
    if (only !== undefined && only !== i) return
    const h = poolHosts(plan.pool)
    if (!h) return
    const tag = planTag(plan, i)
    const hosts = h.hosts.slice(0, MAX_RULES)
    lines.push(`! ── Plan ${plan.name} (${plan.mbps}M): ${hosts.length} direcciones de ${plan.pool}`)
    for (const dir of ["DL", "UL"] as const) {
      // One CAR template (traffic behavior) per address and direction: each is its own policer with its own buckets.
      hosts.forEach((ip) => {
        const name = `${dir}${tag}_${lastOctets(ip)}`
        lines.push(`traffic behavior ${name}`)
        if (!twoStage) {
          const s = burst.single
          lines.push(`car tr-tcm cir ${carKBps(s.cirMbps)} cbs ${s.cbs} pir ${carKBps(s.pirMbps)} pbs ${s.pbs} yellow-packet-action DROP red-packet-action DROP`)
        } else {
          const s = burst.twoStage
          // Over the burst (yellow) and over the peak (red) aren't dropped: they go to class 1, held to max-limit below.
          lines.push(`car tr-tcm cir ${carKBps(s.refillMbps)} cbs ${s.size} pir ${carKBps(s.pirMbps)} pbs ${s.pbs} yellow-packet-action REMARK red-packet-action REMARK remark-tc 1`)
        }
        lines.push("exit")
      })
      if (twoStage) {
        // One HQoS user per address: its total up to burst-limit, class 1 (over the burst) up to max-limit.
        hosts.forEach((ip) => {
          lines.push(`hqos-user-profile U${dir}${tag}_${lastOctets(ip)}`)
          lines.push(`tc-queue 0 mode strict shaping pir ${hqosBps(burst.twoStage.userMbps)} pbs ${SMALL_BUCKET}`)
          lines.push(`tc-queue 1 mode strict shaping pir ${hqosBps(burst.twoStage.overMbps)} pbs ${SMALL_BUCKET}`)
          lines.push("exit")
        })
        lines.push(`hqos-user-group-profile G${dir}${tag}`)
        hosts.forEach((ip) => lines.push(`user-profile U${dir}${tag}_${lastOctets(ip)} shaping pir ${hqosBps(burst.twoStage.userMbps)} pbs ${SMALL_BUCKET}`))
        lines.push("exit")
      }
      lines.push(`access-list L3 ${dir}-${tag} ingress`)
      hosts.forEach((ip, k) => {
        const name = `${dir}${tag}_${lastOctets(ip)}`
        const match = dir === "DL" ? `dst-ip ${ip}/32` : `src-ip ${ip}/32`
        lines.push(`rule ${MAX_RULES - k} ${match} packet-action permit traffic-behavior ${name}${twoStage ? ` set-hqos-user U${name}` : ""}`)
      })
      lines.push("exit")
    }
    // Download rules where traffic comes in from the carriers; upload rules where clients come in.
    for (const c of d.carriers) lines.push(`interface ${wanIface(c)}`, `acl DL-${tag} priority ${200 + i}`, "exit")
    lines.push(`interface ${vlanIface(d, plan)}`, `acl UL-${tag} priority ${200 + i}`, "exit")
  })
  if (twoStage) {
    // Download shaped leaving toward the clients (each plan VLAN); upload leaving toward the carriers.
    lines.push("hqos-profile HQ-DL", `global rate ${hqosBps(total)}`)
    d.plans.forEach((p, i) => lines.push(`user-group-profile GDL${planTag(p, i)} shaping pir ${hqosBps(total)} pbs ${SMALL_BUCKET}`))
    lines.push("exit", "hqos-profile HQ-UL", `global rate ${hqosBps(total)}`)
    d.plans.forEach((p, i) => lines.push(`user-group-profile GUL${planTag(p, i)} shaping pir ${hqosBps(total)} pbs ${SMALL_BUCKET}`))
    lines.push("exit")
    for (const p of d.plans) lines.push(`interface ${vlanIface(d, p)}`, "hqos-profile HQ-DL", "exit")
    for (const c of d.carriers) lines.push(`interface ${wanIface(c)}`, "hqos-profile HQ-UL shared", "exit")
  }
  lines.push("end", "write")
  return { id: "plans", code: lines.join("\n"), docs: twoStage ? ["car", "qosCase", "acl", "hqos", "hqosCase"] : ["car", "qosCase", "acl"], verify: true }
}

/** 8. PPPoE users (local, on the device) for each plan's server, from the pasted list. */
export function usersBlock(d: AsterDeployment, rows: { user: string; password: string; mbps: number }[]): { block: Block; unplaced: string[] } {
  const lines = ["configure terminal"]
  const unplaced: string[] = []
  d.plans.forEach((p, i) => {
    const mine = rows.filter((r) => r.mbps === p.mbps && d.plans.findIndex((x) => x.mbps === r.mbps) === i)
    if (!mine.length) return
    lines.push(`interface pppoe-server ${i}`)
    for (const r of mine) lines.push(`ppp chap username ${r.user} ${r.password}`)
    lines.push("exit")
  })
  for (const r of rows) if (!d.plans.some((p) => p.mbps === r.mbps)) unplaced.push(r.user)
  lines.push("end", "write")
  return { block: { id: "users", code: lines.join("\n"), docs: ["pppoeServer", "pppoeGuide"], verify: false }, unplaced }
}

/** Checks after installing (all documented show commands). */
export function checksBlock(): Block {
  const lines = [
    "show version",
    "show license",
    "show interface status",
    "show sub-interface status",
    "show link-aggregation summary",
    "show ip interfaces",
    "show ip route",
    "show pppoe-session",
    "show nat translations_count",
    "show sla brief",
    "show track brief",
    "show pbr map",
    "show traffic-behavior counters",
    "show acl rule",
    "show hqos-user-group-profile all",
    "show system cpu-usage",
    "show system memory-usage",
  ]
  return { id: "checks", code: lines.join("\n"), docs: ["status", "pppoeServer", "nat", "sla", "track", "pbr", "car", "acl", "hqos"], verify: false }
}

/** Save and back up: write keeps the previous file in /etc/sonic as config_db_<date> for going back. */
export function saveBlock(): Block {
  return { id: "save", code: ["write", "show running-config"].join("\n"), docs: ["firstUse", "upgrade"], verify: false }
}

/** The whole deployment, in order (users come from the Scripts page). */
export function deploymentBlocks(d: AsterDeployment): Block[] {
  return [accessBlock(d), oltBlock(d), pppoeBlock(d), carriersBlock(d), failoverBlock(d), filtersBlock(d), plansBlock(d), saveBlock()]
}

/** One file with every block, each headed by its sources. */
export function deploymentFile(d: AsterDeployment, title: (id: string) => string): string {
  return deploymentBlocks(d)
    .map((b) => [`! ═══ ${title(b.id)}${b.verify ? " · VERIFICAR EN EL EQUIPO" : ""}`, ...b.docs.map((k) => `! ${DOCS[k]}`), b.code].join("\n"))
    .join("\n\n")
}
