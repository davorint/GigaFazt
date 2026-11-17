/**
 * Every RouterOS script the tools write, with the options that add lines turned on, for the syntax check
 * (ros-syntax.test.ts). Not used by the pages.
 */
import {
  DEFAULT_BACKUP_ROUTER,
  DEFAULT_BOOST,
  DEFAULT_DNS_FILTER,
  DEFAULT_MONITOR,
  DEFAULT_MOROSOS,
  DEFAULT_REMOTE,
  DEFAULT_SHIELD,
  DEFAULT_USAGE,
  backupRouterScripts,
  bgpScript,
  boostScript,
  clientCommands,
  dnsFilterScript,
  monitorScript,
  morososScript,
  remoteScript,
  routeScript,
  shieldScript,
  upgradeCommands,
  usageScript,
  type AdvContext,
} from "./advanced"
import { DEFAULT_ALERTS, DEFAULT_FAILOVER, DEFAULT_FILTERS, alertsScript, bondScript, defaultProbes, failoverScript, filtersScript, fullExportScript, priorityScript, profileSyncScripts, publicIpScript } from "./advanced2"
import { balanceScript, balanceUndo, type Wan } from "./balance"
import { bulkScript, type BulkRow } from "./bulk"
import { DEFAULT_RULE, planDefaults } from "./burst"
import { guideScripts } from "./guide-scripts"
import { hotspotProfile, pcqTypes, pppProfile, queueTree, sharedPpp, sharedSimpleQueues, simpleQueue, userManagerPlans } from "./routeros"
import { DEFAULT_SETUP, setupPlans, setupUndo, type SetupState } from "./setup"
import { initialState, type LabState } from "./state"

export type CorpusEntry = { name: string; script: string }

const WANS: Wan[] = [
  { name: "WAN1", type: "dhcp", iface: "ether1", gateway: "", mbps: 1000, measuredMbps: 940, upMbps: 500, upstreamCgnat: false, providerNat: true, monitor: "1.1.1.1", natIps: "" },
  { name: "WAN2", type: "static", iface: "ether2", gateway: "203.0.113.1", mbps: 1000, measuredMbps: null, upMbps: null, upstreamCgnat: true, providerNat: false, monitor: "8.8.8.8", natIps: "203.0.113.10-203.0.113.11" },
  { name: "WAN3", type: "pppoe", iface: "pppoe-out1", gateway: "", mbps: 500, measuredMbps: null, upMbps: null, upstreamCgnat: false, providerNat: true, monitor: "9.9.9.9", natIps: "" },
]

/** Setups that together turn on every option. */
const SETUPS: SetupState[] = [
  {
    ...DEFAULT_SETUP,
    collector: "172.26.10.50",
    natMode: "fixed",
    ipv6Pd: "2001:db8:100::/40",
    ipv6Wan: "2001:db8:200::/40",
    alert: "telegram",
    telegramChat: "12345",
    backup: "sftp",
    backupHost: "172.26.10.60",
    backupUser: "respaldos",
    backupPath: "/srv/mk",
    snmp: true,
  },
  { ...DEFAULT_SETUP, firewall: false, mtu1500: false, isolate: false, blockSmtp: false, dnsMode: "direct", alert: "email", mailServer: "smtp.example.com", mailFrom: "router@example.com", mailTo: "noc@example.com", backup: "email", sessionLog: false, pitp: false },
]

const state = (setup: SetupState, patch: Partial<LabState> = {}): LabState => {
  const s = initialState()
  return { ...s, deployment: "Torre Norte", wans: WANS, setup, ...patch }
}

export function rosCorpus(): CorpusEntry[] {
  const out: CorpusEntry[] = []
  const add = (name: string, script: string | undefined | null) => {
    if (script && script.trim()) out.push({ name, script })
  }

  SETUPS.forEach((setup, k) => {
    const s = state(setup)
    const g = guideScripts(s)
    for (const st of g.steps) add(`guide${k}:${st.id}`, st.script)
    add(`guide${k}:undo`, g.undo)
    add(`setupUndo${k}`, setupUndo(setup))
    const ctx: AdvContext = { name: "Torre Norte", setup, wans: WANS, queue: "cake", failover: "recursive" }
    const plans = setupPlans(setup.plans, setup.rule).map((p) => p.name)
    const results = {
      morosos: morososScript(ctx, { ...DEFAULT_MOROSOS, noticeUrl: "https://gigafazt.com/aviso", allow: "pagos.example.com, 203.0.113.10" }),
      bth: remoteScript(ctx, DEFAULT_REMOTE),
      hub: remoteScript(ctx, { ...DEFAULT_REMOTE, mode: "hub", hub: "vpn.example.com" }),
      dns: dnsFilterScript(ctx, { ...DEFAULT_DNS_FILTER, ads: true, adult: true, force: true, family: true }),
      uso: usageScript(ctx, { ...DEFAULT_USAGE, capGb: 500, top: 5 }),
      escudo: shieldScript(ctx, { ...DEFAULT_SHIELD, scan: true, block: true, inbound: true }),
      velocidad: boostScript(ctx, { ...DEFAULT_BOOST, reconnect: true, start: "22:00:00", end: "06:00:00" }),
      monitoreo: monitorScript(ctx, { ...DEFAULT_MONITOR, graphs: true, watchdog: true, dropAlert: 50 }),
      destinos: routeScript(ctx, [{ wan: "WAN2", dest: "tv.example.com, 198.51.100.0/24" }]),
      bgp: bgpScript({ asn: 273000, routerId: "203.0.113.1", prefixes: "203.0.113.0/24, 2001:db8::/32", peers: "carrierA,198.51.100.1,65010,2\ncarrierB6,2001:db8:ffff::1,65020" }),
      failover: failoverScript(ctx, { ...DEFAULT_FAILOVER, probes: defaultProbes(WANS, WANS.map((w) => w.monitor)), lte: "lte1", lteMbps: 50 }),
      filtros: filtersScript(ctx, { ...DEFAULT_FILTERS, spoof: true, smb: true, ssdp: true, telnet: true }),
      alertas: alertsScript(ctx, { ...DEFAULT_ALERTS, config: true, version: true, pppFails: 100 }),
      prioridad: priorityScript(ctx),
      ippublica: publicIpScript(ctx, [{ user: "empresa1", ip: "203.0.113.20", wan: "WAN2" }]),
      repuesto: fullExportScript(ctx),
    }
    for (const [n, r] of Object.entries(results)) {
      for (const st of r.steps) add(`${n}${k}:${st.id}`, st.script)
      add(`${n}${k}:undo`, r.undo)
    }
    const br = backupRouterScripts(ctx, DEFAULT_BACKUP_ROUTER)
    for (const st of [...br.mainSteps, ...br.backupSteps]) add(`respaldo${k}:${st.id}`, st.script)
    add(`respaldo${k}:undo`, br.undoMain)
    const sync = profileSyncScripts("sync", "172.26.10.4")
    add(`sync${k}:main`, sync.main)
    add(`sync${k}:backup`, sync.backup)
    const bond = bondScript(ctx, { ports: "sfp-sfpplus2, sfp-sfpplus3", oltPorts: "0/2/0, 0/3/0" })
    add(`bond${k}`, bond.router)
    add(`bond${k}:undo`, bond.undo)
    for (const a of ["reduce", "suspend", "restore"] as const) add(`clientes${k}:${a}`, clientCommands(a, `juan\nmaria,${plans[1]}`, plans).script)
    add(`upgrade${k}`, upgradeCommands({ user: "juan", to: plans.at(-1) ?? "", back: plans[0] ?? "", date: "2026-12-01", time: "00:00:00" }, plans).script)
  })

  // Balancing: both failovers, every detection speed, every classifier.
  const base = initialState().balance
  for (const failover of ["recursive", "gateway"] as const)
    for (const speed of ["normal", "fast", "faster"] as const)
      for (const classifier of ["src-address", "both-addresses", "both-addresses-and-ports"] as const) {
        add(`balance:${failover}:${speed}:${classifier}`, balanceScript({ ...base, failover, speed, classifier, wans: WANS }))
        add(`balanceUndo:${speed}`, balanceUndo(speed))
      }

  // Exports for one plan, every queue type.
  const q = planDefaults(500, DEFAULT_RULE)
  const pair = { up: q, down: q }
  for (const queue of ["default", "fq-codel", "cake"] as const) {
    add(`simple:${queue}`, simpleQueue(pair, { name: "plan-500M", target: "100.64.0.2/32", queue }))
    add(`tree:${queue}`, queueTree(pair, { name: "plan-500M", parent: "global", markUp: "up", markDown: "down", queue }))
    add(`ppp:${queue}`, pppProfile(pair, { name: "plan-500M", queue }))
    add(`shared:${queue}`, sharedSimpleQueues({ parent: "edificio", target: "100.64.0.0/22", maxLimit: 1000, children: [{ pair, priority: 2, name: "a", target: "100.64.0.2/32" }], queue }))
    const sp = sharedPpp({ parent: "edificio", target: "100.64.0.0/22", maxLimit: 1000, children: [{ pair, priority: 2 }], queue })
    for (const v of Object.values(sp)) if (typeof v === "string") add(`sharedPpp:${queue}`, v)
  }
  add("pcq", pcqTypes(pair, { name: "plan-500M" }))
  add("hotspot", hotspotProfile(pair, { name: "plan-500M" }))
  add("usermanager", userManagerPlans([{ name: "plan-500M", pair }]))
  add("usermanager:upsert", userManagerPlans([{ name: "plan-500M", pair }], { upsert: true }))

  // Many clients, every method, with and without update.
  const rows: BulkRow[] = [
    { line: 1, name: "Juan Pérez", id: "100.64.0.2", planMbps: 500, password: "abc123def", profile: "plan-500M" },
    { line: 2, name: "Ana", id: "100.64.0.3", planMbps: 200, password: "xyz789uvw", profile: "plan-200M" },
  ]
  for (const method of ["simple", "pppoe", "usermanager", "pcq"] as const)
    for (const upsert of [false, true]) {
      const r = method === "pppoe" || method === "usermanager" ? rows.map((x) => ({ ...x, id: x.name === "Ana" ? "ana" : "juan" })) : rows
      add(`bulk:${method}:${upsert}`, bulkScript(r, method, { rule: DEFAULT_RULE, parent: method === "pcq" ? undefined : "edificio", upsert, queue: "cake" }))
    }
  return out
}
