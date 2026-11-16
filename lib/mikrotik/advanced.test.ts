import { describe, expect, it } from "vitest"
import {
  DEFAULT_BACKUP_ROUTER,
  DEFAULT_BGP,
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
  boostedPlans,
  clientCommands,
  dnsFilterScript,
  monitorScript,
  morososScript,
  parseBgpPeers,
  remoteScript,
  routeScript,
  shieldScript,
  upgradeCommands,
  urlHost,
  usageScript,
  type AdvContext,
} from "./advanced"
import { initialState } from "./state"
import { DEFAULT_SETUP } from "./setup"

const base = initialState()
const ctx = (patch: Partial<AdvContext["setup"]> = {}): AdvContext => ({ name: "Torre A", setup: { ...DEFAULT_SETUP, alert: "telegram", telegramChat: "1", ...patch }, wans: base.wans })
const codes = (r: { issues: { code: string }[] }) => r.issues.map((i) => i.code)

describe("unpaid clients", () => {
  const r = morososScript(ctx(), { ...DEFAULT_MOROSOS, noticeUrl: "https://gigafazt.com/aviso", allow: "pagos.example.com, 203.0.113.10" })
  it("profiles put the session in an address list; raw keeps DNS, the notice and payments, then cuts", () => {
    expect(r.script).toContain('name="DSX-suspendido"')
    expect(r.script).toContain("address-list=DSX-morosos")
    expect(r.script).toContain('rate-limit="1M/2M"')
    expect(r.script).toContain("add list=DSX-aviso address=gigafazt.com")
    expect(r.script).toContain("add list=DSX-aviso address=203.0.113.10")
    const raw = r.script.split("\n").filter((l) => l.startsWith("add chain=prerouting src-address-list=DSX-morosos"))
    expect(raw.at(-1)).toContain("action=drop")
    expect(r.script).toContain('action=redirect action-data="https://gigafazt.com/aviso"')
    // The proxy accept goes before the base firewall's drop of clients to the router.
    expect(r.script).toContain('place-before=[:pick $d 0]')
  })
  it("its profiles match the plan profiles (session log, DNS, pool)", () => {
    expect(r.script).toContain("remote-address=DS-clientes")
    expect(r.script).toContain("DS-sesion alta")
  })
  it("undo removes only its own lines", () => {
    expect(r.undo).toContain('/ip firewall raw remove [find where comment~"^DSX morosos: "]')
    expect(r.undo).toContain("/ip proxy set enabled=no")
    expect(r.undo).not.toContain('"^DS: "')
  })
  it("needs a notice URL and valid hosts", () => {
    expect(codes(morososScript(ctx(), DEFAULT_MOROSOS))).toContain("noticeUrl")
    expect(codes(morososScript(ctx(), { ...DEFAULT_MOROSOS, noticeUrl: "https://x.com", allow: "no valido" }))).toContain("badHost")
    expect(urlHost("http://Pagos.Example.com:8080/a")).toBe("pagos.example.com")
  })
  it("per-client commands: suspend, and restore only to a known plan", () => {
    const plans = ["plan-200M", "plan-500M"]
    expect(clientCommands("suspend", "juan\nmaria,plan-500M", plans).script).toBe(
      ['/ppp secret set [find where name="juan"] profile="DSX-suspendido"', '/ppp active remove [find where name="juan"]', '/ppp secret set [find where name="maria"] profile="DSX-suspendido"', '/ppp active remove [find where name="maria"]'].join("\n")
    )
    const back = clientCommands("restore", "juan,plan-500M\nmaria\npedro,plan-9G", plans)
    expect(back.script).toContain('profile="plan-500M"')
    expect(back.errors.map((e) => e.code)).toEqual(["noPlan", "unknownPlan"])
  })
})

describe("remote access", () => {
  it("Back To Home: users with LAN access, management services open to its network", () => {
    const r = remoteScript(ctx(), DEFAULT_REMOTE)
    expect(r.script).toContain("/ip cloud set back-to-home-vpn=enabled")
    expect(r.script).toContain('add name="oficina" allow-lan=yes')
    expect(r.script).toContain("available-from=192.168.10.0/24,192.168.216.0/24")
    expect(r.undo).toContain("back-to-home-vpn=revoked-and-disabled")
  })
  it("hub: the tunnel and the hub's side with the OLT network behind it", () => {
    const r = remoteScript(ctx(), { ...DEFAULT_REMOTE, mode: "hub", hub: "vpn.example.com" })
    expect(r.script).toContain("endpoint-address=vpn.example.com endpoint-port=13231 allowed-address=10.255.0.0/24 persistent-keepalive=25s")
    expect(r.script).toContain("add address=10.255.0.2/24 interface=DSX-wg")
    expect(r.hubSide).toContain("allowed-address=10.255.0.2/32,192.168.10.0/24")
    expect(codes(remoteScript(ctx(), { ...DEFAULT_REMOTE, mode: "hub", hub: "" }))).toContain("hub")
  })
})

describe("DNS filtering", () => {
  it("adlists, families to the filtered resolver before forcing DNS to the router, family profiles per plan", () => {
    const r = dnsFilterScript(ctx(), DEFAULT_DNS_FILTER)
    expect(r.script).toContain("add url=https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts ssl-verify=yes")
    const nat = r.script.split("\n").filter((l) => l.includes("chain=dstnat"))
    expect(nat[0]).toContain("to-addresses=1.1.1.3")
    expect(nat.at(-1)).toContain("action=redirect to-ports=53")
    expect(r.script).toContain('name="plan-200M-familia"')
    expect(r.script).toContain("address-list=DSX-familia")
  })
  it("blocklists need the router to answer DNS", () => {
    expect(codes(dnsFilterScript(ctx({ dnsMode: "direct" }), DEFAULT_DNS_FILTER))).toContain("needsRouterDns")
    expect(dnsFilterScript(ctx({ dnsMode: "direct" }), { ads: false, adult: false, force: false, family: true }).script).toContain("1.1.1.3")
  })
})

describe("per-client usage", () => {
  const r = usageScript(ctx(), { ...DEFAULT_USAGE, capGb: 500 })
  it("counts per session, keeps the month in the account comment, caps at the GB given", () => {
    expect(r.script).toContain("name=DSX-uso ")
    expect(r.script).toContain("/interface pppoe-server get \\$s user")
    expect(r.script).toContain("rx-byte")
    // The regex " \[uso " survives two layers of quoting.
    expect(r.script).toContain('comment~\\" \\\\\\\\[uso \\"')
    expect(r.script).toContain("(\\$d > 512000)")
    expect(r.script).toContain("start-time=08:00:00")
  })
  it("without alerts there's no report", () => {
    const n = usageScript(ctx({ alert: "none" }), DEFAULT_USAGE)
    expect(n.script).not.toContain("DSX-uso-reporte")
    expect(codes(n)).toContain("noAlerts")
  })
})

describe("infected clients and DDoS", () => {
  it("flags clients opening connections at bot speed, with scan detection and MikroTik's inbound rules", () => {
    const r = shieldScript(ctx(), { ...DEFAULT_SHIELD, inbound: true, block: true })
    expect(r.script).toContain("dst-limit=200,400,src-address/1m")
    expect(r.script).toContain("psd=21,3s,3,1")
    expect(r.script).toContain("dst-limit=32,32,src-and-dst-addresses/10s")
    expect(r.script).toContain("src-address-list=DSX-infectados dst-address-type=!local action=drop")
    expect(r.undo).toContain('/ip firewall filter remove [find where chain="DSX-salida"]')
  })
})

describe("scheduled speeds", () => {
  it("night boost doubles the plans (capped), reverts, and checks the hour at startup", () => {
    const plans = boostedPlans(DEFAULT_SETUP.plans, DEFAULT_SETUP.rule, DEFAULT_BOOST)
    expect(plans.map((p) => p.down)).toEqual([400, 1000, 1000])
    const r = boostScript(ctx(), DEFAULT_BOOST)
    expect(r.script).toContain("start-time=00:00:00 interval=1d on-event=DSX-noche-inicio")
    expect(r.script).toContain('((\\$t >= \\"00:00:00\\") && (\\$t < \\"06:00:00\\"))')
    expect(boostScript(ctx(), { ...DEFAULT_BOOST, start: "22:00:00", end: "06:00:00" }).script).toContain("||")
    expect(codes(boostScript(ctx(), { ...DEFAULT_BOOST, factor: 1 }))).toContain("factor")
  })
  it("a temporary upgrade reverts by itself", () => {
    const u = upgradeCommands({ user: "juan", to: "plan-1000M", back: "plan-200M", date: "2026-12-01", time: "00:00:00" }, ["plan-200M", "plan-1000M"])
    expect(u.script).toContain('name="DSX-regresa-juan" start-date=2026-12-01')
    expect(codes(upgradeCommands({ user: "juan", to: "x", back: "plan-200M", date: "2026-12-01", time: "00:00:00" }, ["plan-200M"]))).toContain("unknownPlan")
  })
})

describe("BGP", () => {
  it("instance, own blocks, filters and sessions in 7.25 syntax", () => {
    const r = bgpScript({ ...DEFAULT_BGP, asn: 273000, routerId: "203.0.113.1", prefixes: "203.0.113.0/24, 2001:db8::/32", peers: "carrierA,198.51.100.1,65010,2\ncarrierB6,2001:db8:ffff::1,65020" })
    expect(r.script).toContain("add name=DSX-bgp as=273000 router-id=203.0.113.1")
    expect(r.script).toContain('rule="if (dst in DSX-bgp-propios && dst-len < 32) { set bgp-path-prepend 2; accept }"')
    expect(r.script).toContain('rule="if (dst in 0.0.0.0/0 && dst-len in 0-0) { accept }"')
    expect(r.script).toContain("remote.address=198.51.100.1 remote.as=65010 local.role=ebgp afi=ip")
    expect(r.script).toContain("afi=ipv6 output.network=DSX-bgp-propios6")
    expect(parseBgpPeers("x,1.2.3.4,0").bad).toHaveLength(1)
    expect(codes(bgpScript({ ...DEFAULT_BGP, asn: 64600, routerId: "1.1.1.1", prefixes: "203.0.113.0/25", peers: "a,1.2.3.4,1" }))).toEqual(["privateAsn", "longPrefix", "prepare"])
  })
})

describe("monitoring and backup router", () => {
  it("graphs for the links and the OLT port, hardware watchdog only, mass-drop alert", () => {
    const r = monitorScript(ctx(), DEFAULT_MONITOR)
    expect(r.script).toContain("/system watchdog set watchdog-timer=yes automatic-supout=yes watch-address=none")
    expect(r.script).toContain('add interface="sfp-sfpplus2" allow-address=192.168.10.0/24')
    expect(r.script).toContain("(\\$d >= 20)")
  })
  it("backup router: VRRP gateway, pool halves, PPPoE delay, account sync", () => {
    const r = backupRouterScripts(ctx(), DEFAULT_BACKUP_ROUTER)
    expect(r.main).toContain("add address=192.168.10.3/24")
    expect(r.main).toContain("add address=192.168.10.1/32 interface=DSX-vrrp")
    expect(r.main).toContain("ranges=100.64.0.2-100.64.1.255")
    expect(r.backup).toContain("ranges=100.64.2.0-100.64.3.254")
    expect(r.backup).toContain("pado-delay=300")
    expect(r.main).toContain("export show-sensitive file=DSX-secretos")
    expect(codes(backupRouterScripts(ctx({ mgmtNet: "192.168.10.0/30" }), DEFAULT_BACKUP_ROUTER))).toContain("mgmtSmall")
  })
})

describe("fixed exit per destination", () => {
  it("marks those connections before the balancing", () => {
    const r = routeScript(ctx(), [{ wan: "WAN2", dest: "tv.example.com, 198.51.100.0/24" }])
    expect(r.script).toContain('add list="DSX-por-WAN2" address=tv.example.com')
    expect(r.script).toContain('new-connection-mark="WAN2"')
    expect(r.script).toContain("place-before=[:pick $p 0]")
    expect(codes(routeScript(ctx(), [{ wan: "WAN9", dest: "x.com" }]))).toContain("unknownWan")
  })
})
