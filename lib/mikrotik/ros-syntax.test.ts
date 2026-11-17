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
  it("reads commands inside one-liners, substitutions and stored scripts", () => {
    expect(checkScript(':if ([:len [/ip pool find where nam="x"]] = 0) do={/ip pool add name=x rangez=1.1.1.1}').map((i) => i.item)).toEqual(["nam", "rangez"])
    expect(checkScript('/system script add name=x source="/ip route add dst-adress=0.0.0.0/0"').map((i) => i.item)).toEqual(["dst-adress"])
    expect(checkScript("/ip firewall filter\nadd chain=input actoin=drop").map((i) => i.item)).toEqual(["actoin"])
    expect(checkScript('/system scheduler add name=y on-event=":delay 1s; /system script run x"')).toEqual([])
  })
})
