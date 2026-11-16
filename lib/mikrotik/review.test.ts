import { describe, expect, it } from "vitest"
import { adviceFor } from "./advice"
import { checkBalance, DEFAULT_LINK_QUEUES, defaultWans } from "./balance"
import { DEFAULT_RULE } from "./burst"
import { bulkScript, fillPasswords, matchProfile, parseBulk } from "./bulk"
import { DEFAULT_PLANS, DEFAULT_SETUP, ontInstall, setupParts, setupPlans, setupUndo, type SetupParts } from "./setup"
import { deploymentFields, initialState } from "./state"

// The deployment's profiles: the three site plans and a custom asymmetric one.
const plans = setupPlans([...DEFAULT_PLANS, { name: "empresa-300", down: 300, up: 100 }], DEFAULT_RULE)
const profiles = plans.map((p) => ({ name: p.name, down: p.down }))

describe("Varios clientes → PPPoE uses the deployment's profiles", () => {
  it("matches a line's plan by profile name or by download speed", () => {
    expect(matchProfile("EMPRESA-300", profiles)).toEqual({ name: "empresa-300", down: 300 })
    expect(matchProfile("500M", profiles)).toEqual({ name: "plan-500M", down: 500 })
    expect(matchProfile("1G", profiles)).toEqual({ name: "plan-1000M", down: 1000 })
    expect(matchProfile("750", profiles)).toBeNull()
    expect(matchProfile("300", [...profiles, { name: "otro-300", down: 300 }])).toBe("ambiguous")
  })
  it("writes only secrets, after checking each profile exists; never a bare profile", () => {
    const text = "Juan, juan01, empresa-300, Abc123\nAna, ana02, 500, Xyz789"
    const parsed = parseBulk(text, "pppoe", [], profiles)
    expect(parsed.errors).toEqual([])
    expect(parsed.rows.map((r) => r.profile)).toEqual(["empresa-300", "plan-500M"])
    const script = bulkScript(parsed.rows, "pppoe", { rule: DEFAULT_RULE }).split("\n")
    expect(script[0]).toBe(':if ([:len [/ppp profile find where name="empresa-300"]] = 0) do={:error "Falta el perfil empresa-300: pega antes la configuracion del despliegue"}')
    expect(script).toContain('add name="juan01" password="Abc123" service=pppoe profile="empresa-300" comment="Juan"')
    expect(script.some((l) => /\/ppp profile$|^add name="plan-/.test(l))).toBe(false)
    // Update mode only changes the profile of an existing secret.
    const up = bulkScript(parsed.rows, "pppoe", { rule: DEFAULT_RULE, upsert: true })
    expect(up).toContain(':if ([:len [/ppp secret find where name="ana02"]] > 0) do={/ppp secret set [find where name="ana02"] profile="plan-500M"}')
    // A parent queue goes on the profiles in use.
    expect(bulkScript(parsed.rows, "pppoe", { rule: DEFAULT_RULE, parent: "torre-B" })).toContain('set [find where name="empresa-300"] parent-queue="torre-B"')
  })
  it("unknown or ambiguous plans are line errors; passwords still fill", () => {
    // (An unreadable first line is taken as a header, so the bad lines come after a good one.)
    const parsed = parseBulk("Eva, eva00, 200, c\nJuan, juan01, 750, a\nAna, ana02, 300, b", "pppoe", [], [...profiles, { name: "otro-300", down: 300 }])
    expect(parsed.errors).toEqual([
      { line: 2, code: "plan" },
      { line: 3, code: "planAmbiguous" },
    ])
    expect(fillPasswords("Juan, juan01, empresa-300", "pppoe", [], () => "Pw1", profiles)).toBe("Juan, juan01, empresa-300, Pw1")
  })
})

describe("links: names must be unique and present", () => {
  it("flags a repeated or empty link name", () => {
    const wans = defaultWans(3)
    const opts = (w = wans) => ({ wans: w, clients: ["100.64.0.0/10"], classifier: "src-address" as const, failover: "recursive" as const, speed: "normal" as const, nat: true, queues: DEFAULT_LINK_QUEUES })
    const codes = (w: typeof wans) => checkBalance(opts(w)).map((i) => i.code)
    expect(codes(wans)).not.toContain("duplicateName")
    expect(codes([wans[0], { ...wans[1], name: "wan1" }, wans[2]])).toContain("duplicateName")
    expect(codes([wans[0], { ...wans[1], name: "" }, wans[2]])).toContain("missingName")
  })
})

describe("IPv6 closes what IPv4 already closes", () => {
  const ctx = { clients: 600, wanIfaces: ["ether1", "ether2"], balanced: null, name: "Norte", plans: setupPlans(DEFAULT_PLANS, DEFAULT_RULE) }
  const v6 = { ...DEFAULT_SETUP, ipv6Pd: "2001:db8:100::/44", ipv6Wan: "2001:db8:200::/52" }
  it("blackholes the client and WAN prefixes", () => {
    const pp = (setupParts(v6, ctx) as SetupParts).pppoe
    expect(pp).toContain('/ipv6 route\nadd dst-address=2001:db8:100::/44 blackhole comment="DS: prefijos de clientes sin uso"\nadd dst-address=2001:db8:200::/52 blackhole comment="DS: prefijos WAN sin uso"')
    expect(setupUndo(v6)).toContain('/ipv6 route remove [find where comment~"^DS: "]')
  })
  it("SMTP block and isolation over IPv6 too, even without the basic firewall", () => {
    const hd = (setupParts({ ...v6, firewall: false }, ctx) as SetupParts).hardening
    expect(hd).toContain('add chain=forward action=drop in-interface-list=DS-LAN protocol=tcp dst-port=25 comment="DS: sin SMTP directo de los clientes"')
    expect(hd).toContain('add chain=forward action=drop in-interface-list=DS-LAN out-interface-list=DS-LAN comment="DS: clientes aislados entre si"')
    expect(hd).not.toContain("DHCPv6 del proveedor")
    const off = (setupParts({ ...v6, blockSmtp: false, isolate: false }, ctx) as SetupParts).hardening
    expect(off).not.toContain("sin SMTP directo de los clientes\"\nadd chain=forward action=drop in-interface-list=DS-LAN")
    expect((setupParts(DEFAULT_SETUP, ctx) as SetupParts).hardening).not.toContain("/ipv6")
  })
})

describe("advice wording follows the balancing", () => {
  it("one speed test stays on one link with both-addresses too", () => {
    const base = deploymentFields(initialState())
    const f = { ...base, capacity: { ...base.capacity, internet: "links" as const }, balance: { ...base.balance, classifier: "both-addresses" as const } }
    expect(adviceFor(f).capacity.planOverLink).toBe(true)
  })
})

describe("ONT install sheet", () => {
  it("router mode: route WAN PPPoE on the internet VLAN, MTU, IPv6 when on, then security", () => {
    const keys = (s: Parameters<typeof ontInstall>[0]) => ontInstall(s).map((i) => i.key)
    expect(ontInstall(DEFAULT_SETUP)).toContainEqual({ key: "vlan", value: 100 })
    expect(keys(DEFAULT_SETUP)).toEqual(["wanMode", "service", "vlan", "priority", "nat", "account", "mtu1500", "adminPassword", "wifi", "remoteAccess"])
    expect(keys({ ...DEFAULT_SETUP, mtu1500: false, ipv6Pd: "2001:db8:100::/44" })).toEqual(["wanMode", "service", "vlan", "priority", "nat", "account", "mtu1492", "ipv6", "adminPassword", "wifi", "remoteAccess"])
  })
  it("bridge mode: bridge WAN, LAN 1, the client's router dials", () => {
    expect(ontInstall({ ...DEFAULT_SETUP, ontMode: "bridge", internetVlan: 200 })).toEqual([{ key: "bridgeWan" }, { key: "vlan", value: 200 }, { key: "bridgePort" }, { key: "clientRouter" }])
  })
})
