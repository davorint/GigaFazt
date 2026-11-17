import { describe, expect, it } from "vitest"
import { adviceFor } from "./advice"
import { DEFAULT_RULE, RULES } from "./burst"
import { checkSetup, DEFAULT_PLANS, DEFAULT_SETUP, mikrotikSetup, SECRET, setupParts, setupPlans, setupUndo, type SetupParts, type SetupState } from "./setup"
import { decodeState, deploymentFields, encodeState, initialState } from "./state"

const ctx = { clients: 600, wanIfaces: ["ether1", "ether2", "ether3"], balanced: null, name: "Norte", plans: setupPlans(DEFAULT_PLANS, DEFAULT_RULE) }
const parts = (over: Partial<SetupState> = {}) => setupParts({ ...DEFAULT_SETUP, ...over }, ctx) as SetupParts
const codes = (over: Partial<SetupState> = {}) => checkSetup({ ...DEFAULT_SETUP, ...over }, ctx).map((i) => i.code)

describe("router services: DNS, timeouts", () => {
  it("router DNS sized for an ISP; direct mode hands the resolvers to the clients", () => {
    const r = parts()
    expect(r.pppoe).toContain("set allow-remote-requests=yes servers=9.9.9.10,149.112.112.10 cache-size=20480 max-concurrent-queries=1000 max-concurrent-tcp-sessions=100")
    expect(r.pppoe).toContain("dns-server=100.64.0.1")
    expect(r.hardening).toContain('comment="DS: DNS de los clientes"')
    const d = parts({ dnsMode: "direct" })
    expect(d.pppoe).toContain("set allow-remote-requests=no servers=9.9.9.10,149.112.112.10")
    expect(d.pppoe).toContain("dns-server=9.9.9.10,149.112.112.10")
    expect(d.hardening).not.toContain("DNS de los clientes")
    // Without the firewall and with direct DNS there's no resolver to protect.
    expect(parts({ dnsMode: "direct", firewall: false }).pppoe).not.toContain("DNS solo para los clientes")
  })
  it("TCP established timeout is RFC 5382's minimum for a NAT", () => {
    expect(parts().hardening).toContain("tcp-established-timeout=2h4m ")
  })
})

describe("router services: alerts, backups, SNMP", () => {
  it("defaults: a local daily backup, no alerts, no SNMP", () => {
    const ops = parts().ops
    expect(ops).toContain("add name=DS-respaldo policy=ftp,read,write,policy,test,sensitive dont-require-permissions=yes source=")
    expect(ops).toContain(`/system backup save name=DS-respaldo password=\\"${SECRET.backup}\\"`)
    expect(ops).toContain('add name=DS-respaldo start-time=03:30:00 interval=1d on-event="/system script run DS-respaldo" comment="DS: respaldo diario"')
    expect(ops).not.toContain("DS-aviso")
    expect(ops).not.toContain("/snmp")
    expect(parts({ backup: "none" }).ops).toBe("")
    expect(codes()).toContain("secretsPending")
    expect(codes({ backup: "none" })).not.toContain("secretsPending")
    // The whole script carries the ops part last.
    expect(mikrotikSetup(DEFAULT_SETUP, ctx).trimEnd().endsWith('comment="DS: respaldo diario"')).toBe(true)
  })
  it("Telegram: the alert script posts JSON with the chat id; startup and CPU schedulers call it", () => {
    const ops = parts({ alert: "telegram", telegramChat: "-1001234567890" }).ops
    expect(ops).toContain(`https://api.telegram.org/bot${SECRET.telegram}/sendMessage`)
    // Inside the source string: \\\" in the paste becomes \" in the script, a " inside its JSON.
    expect(ops).toContain('http-data=(\\"{\\\\\\"chat_id\\\\\\":\\\\\\"-1001234567890\\\\\\",\\\\\\"text\\\\\\":\\\\\\"\\" . \\$m . \\"\\\\\\"}\\")')
    expect(ops).toContain("add name=DS-arranque start-time=startup")
    expect(ops).toContain("add name=DS-cpu interval=1m")
    expect(ops).toContain("cpu-load] > 85")
    expect(codes({ alert: "telegram", telegramChat: "abc" })).toContain("badChat")
    expect(codes({ alert: "telegram", telegramChat: "-1001234567890" })).not.toContain("badChat")
  })
  it("e-mail: one mail setup for alerts and backups", () => {
    const mail = { mailServer: "smtp.gmail.com", mailFrom: "router@gigafazt.com", mailTo: "noc@gigafazt.com" }
    const ops = parts({ alert: "email", backup: "email", ...mail }).ops
    expect(ops.match(/\/tool e-mail\n/g)?.length).toBe(1)
    expect(ops).toContain(`set server=smtp.gmail.com port=587 tls=starttls from="router@gigafazt.com" user="router@gigafazt.com" password="${SECRET.mail}"`)
    expect(ops).toContain("file=DS-respaldo.backup,DS-respaldo.rsc")
    expect(codes({ alert: "email" })).toContain("badMail")
    expect(codes({ alert: "email", ...mail })).not.toContain("badMail")
  })
  it("SFTP backup: both files, dated, in the folder", () => {
    const ops = parts({ backup: "sftp", backupHost: "10.0.0.5", backupUser: "respaldos", backupPath: "norte/" }).ops
    expect(ops).toContain(`mode=sftp address=10.0.0.5 user=respaldos password=\\"${SECRET.sftp}\\" src-path=DS-respaldo.backup dst-path=(\\"norte/\\" . \\$n . \\"-\\" . \\$d . \\".backup\\")`)
    expect(ops).toContain("src-path=DS-respaldo.rsc")
    expect(codes({ backup: "sftp" })).toContain("badBackup")
    expect(codes({ backup: "sftp", backupHost: "10.0.0.5", backupUser: "respaldos", backupPath: 'a"b' })).toContain("badBackup")
  })
  it("SNMP: read-only, from management only", () => {
    const ops = parts({ snmp: true }).ops
    expect(ops).toContain(`set [find default=yes] name="${SECRET.snmp}" addresses=172.26.10.0/24 read-access=yes write-access=no`)
    expect(ops).toContain('/snmp set enabled=yes contact="GigaFazt" location="Norte"')
  })
  it("undo removes the DS- scripts and schedulers and gives discovery back before the lists go", () => {
    const undo = setupUndo(DEFAULT_SETUP).split("\n")
    expect(undo).toContain('/system scheduler remove [find where name~"^DS-"]')
    expect(undo).toContain('/system script remove [find where name~"^DS-"]')
    expect(undo.indexOf("/ip neighbor discovery-settings set discover-interface-list=all")).toBeLessThan(undo.indexOf('/interface list remove [find where comment~"^DS: "]'))
  })
  it("share link keeps every new option", () => {
    const setup: SetupState = {
      ...DEFAULT_SETUP,
      dnsMode: "direct",
      alert: "email",
      telegramChat: "-100",
      mailServer: "smtp.gmail.com",
      mailFrom: "a@b.co",
      mailTo: "c@d.co",
      backup: "sftp",
      backupHost: "10.0.0.5",
      backupUser: "r",
      backupPath: "x/y",
      snmp: true,
    }
    expect(decodeState(encodeState({ ...initialState(), setup }))?.setup).toEqual(setup)
  })
})

describe("guide advice", () => {
  const base = deploymentFields(initialState())
  it("example deployment: links busy, plan over one link, low sustained share, CCR2116, ops to do", () => {
    const f = { ...base, capacity: { ...base.capacity, internet: "links" as const } }
    const a = adviceFor(f)
    // 600 clients × 3.4 Mbps ≈ 2 Gbps over 3 × 950 Mbps.
    expect(a.capacity.demandMbps).toBeCloseTo(2040, 0)
    expect(a.capacity.internetMbps).toBe(2850)
    expect(a.capacity.level).toBe("warn")
    expect(a.capacity.planOverLink).toBe(true)
    expect(a.burst).toMatchObject({ level: "warn", sustainedPct: 20, topPlanMbps: 1000, sustainedMbps: 200 })
    expect(a.router).toMatchObject({ level: "bad", model: "ccr2116" })
    expect(a.ops).toMatchObject({ level: "warn", alerts: false, backupOff: true, snmp: false })
  })
  it("a 10 Gbps uplink and an 80 % rule clear capacity and burst; per-connection balancing never flags one link", () => {
    const f = { ...base, capacity: { ...base.capacity, internet: "single" as const, parentMbps: 10_000 }, setup: { ...base.setup, rule: RULES.s80 } }
    const a = adviceFor(f)
    expect(a.capacity.level).toBe("ok")
    expect(a.burst.level).toBe("ok")
    const perConn = adviceFor({ ...base, capacity: { ...base.capacity, internet: "links" as const }, balance: { ...base.balance, classifier: "both-addresses-and-ports" } })
    expect(perConn.capacity.planOverLink).toBe(false)
  })
  it("ops are ok with alerts, an off-router backup and SNMP", () => {
    const a = adviceFor({ ...base, setup: { ...base.setup, alert: "telegram", backup: "sftp", snmp: true } })
    expect(a.ops.level).toBe("ok")
  })
})
