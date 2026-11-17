import { describe, expect, it } from "vitest"
import { parseScript } from "./ros-parse"
import { rosCorpus } from "./ros-corpus"
import { checkScript, ROS_VERSION } from "./ros-syntax"

const show = (name: string, issues: ReturnType<typeof checkScript>) => issues.map((i) => `${name}:${i.line} ${i.kind} ${i.menu}${i.verb ? ` ${i.verb}` : ""} → ${i.item}`)

describe(`RouterOS ${ROS_VERSION} syntax of every generated script`, () => {
  const corpus = rosCorpus()
  it("the corpus covers every generator", () => {
    const names = new Set(corpus.map((e) => e.name.replace(/\d*(:.*)?$/, "")))
    for (const n of ["guide", "morosos", "bth", "hub", "dns", "uso", "escudo", "velocidad", "monitoreo", "destinos", "bgp", "failover", "filtros", "alertas", "prioridad", "ippublica", "repuesto", "respaldo", "sync", "bond", "clientes", "upgrade", "balance", "simple", "tree", "ppp", "shared", "pcq", "hotspot", "usermanager", "bulk"])
      expect(names, n).toContain(n)
    expect(corpus.reduce((a, e) => a + parseScript(e.script).length, 0)).toBeGreaterThan(1500)
  })
  it("every menu, property and command exists in the reference", () => {
    const issues = corpus.flatMap((e) => show(e.name, checkScript(e.script)))
    expect(issues).toEqual([])
  })
})

describe("the checker", () => {
  it("catches an unknown menu, property or command", () => {
    expect(checkScript("/ip firewall mangel add chain=forward").map((i) => i.kind)).toEqual(["menu"])
    expect(checkScript("/ip cloud set ddns-enable=no").map((i) => i.item)).toEqual(["ddns-enable"])
    expect(checkScript("/ip service set winbox available-form=10.0.0.0/8").map((i) => i.item)).toEqual(["available-form"])
    expect(checkScript("/tool e-mail send to=a@b.c sujeto=x").map((i) => i.item)).toEqual(["sujeto"])
    expect(checkScript("/queue tree explode").map((i) => i.kind)).toEqual(["menu"])
    expect(checkScript("/ip cloud back-to-home-user show-config x").map((i) => i.kind)).toEqual(["menu"])
    expect(checkScript("/system backup load name=x").map((i) => i.kind)).toEqual(["command"])
  })
  it("catches values outside the reference's choices", () => {
    // RouterOS 7.25 takes auto|yes here (an older script wrote "no").
    expect(checkScript("/ip cloud set ddns-enabled=no").map((i) => `${i.kind} ${i.item}`)).toEqual(["value ddns-enabled=no"])
    expect(checkScript("/ip firewall filter add chain=input action=dorp").map((i) => i.item)).toEqual(["action=dorp"])
    expect(checkScript("/ip firewall filter add chain=forward connection-state=established,relatd action=accept").map((i) => i.item)).toEqual(["connection-state=established,relatd"])
    expect(checkScript("/ppp profile add name=x use-encryption=si").map((i) => i.item)).toEqual(["use-encryption=si"])
    expect(checkScript("/ip firewall filter add chain=forward connection-state=!established,related action=drop")).toEqual([])
    expect(checkScript("/interface bonding add name=b mode=802.3ad slaves=ether1,ether2")).toEqual([])
    // Variables and expressions aren't judged.
    expect(checkScript(":local a drop; /ip firewall filter add chain=input action=$a")).toEqual([])
  })
  it("reads commands inside one-liners, substitutions and stored scripts", () => {
    expect(checkScript(':if ([:len [/ip pool find where nam="x"]] = 0) do={/ip pool add name=x rangez=1.1.1.1}').map((i) => i.item)).toEqual(["nam", "rangez"])
    expect(checkScript('/system script add name=x source="/ip route add dst-adress=0.0.0.0/0"').map((i) => i.item)).toEqual(["dst-adress"])
    expect(checkScript("/ip firewall filter\nadd chain=input actoin=drop").map((i) => i.item)).toEqual(["actoin"])
    expect(checkScript('/system scheduler add name=y on-event=":delay 1s; /system script run x"')).toEqual([])
  })
})
