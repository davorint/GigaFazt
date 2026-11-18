import { describe, expect, it } from "vitest"
import { newClient, newService } from "../clients/model"
import { newReport } from "../reports/model"
import { newSite } from "../sites/model"
import { newTool } from "../tools/model"
import { searchAll, type SearchData } from "./search"

const empty: SearchData = { clients: [], sites: [], reports: [], tools: [], providers: [], items: [], units: [], surveys: [], notes: [] }

describe("search across sections", () => {
  const site = newSite({ id: "site-0001", name: "Be Grand Pedregal" })
  const client = newClient({ id: "cli-00001", name: "José Pérez", phone: "55 1234 5678", siteId: site.id, apartment: "4B", services: [newService("internet", { pppoeUser: "jperez4b", ontSn: "HWTC1234ABCD" })] })
  const d: SearchData = {
    ...empty,
    sites: [site],
    clients: [client],
    tools: [newTool({ id: "tool-0001", name: "Fusionadora", serial: "FS-778", holderKind: "tecnico", holder: "José" })],
    reports: [newReport({ id: "rep-00001", name: "Jose Perez", phone: "5512345678" })],
  }
  it("ignores accents and case; every word must match", () => {
    const hits = searchAll(d, "jose perez")
    expect(hits.map((h) => h.kind)).toEqual(["clients", "reports"])
    expect(hits[0]).toMatchObject({ label: "José Pérez", href: "/interno/admin/clientes?c=cli-00001" })
    expect(hits[0].detail).toContain("Be Grand Pedregal")
  })
  it("phones match without spaces; PPPoE user, ONT serial and tool serial are searchable", () => {
    expect(searchAll(d, "5512345678").map((h) => h.kind)).toEqual(["clients", "reports"])
    expect(searchAll(d, "jperez4b")[0].kind).toBe("clients")
    expect(searchAll(d, "hwtc1234")[0].kind).toBe("clients")
    expect(searchAll(d, "fs-778")[0]).toMatchObject({ kind: "tools", href: "/interno/admin/herramientas?h=tool-0001" })
  })
  it("nothing for one letter or no match", () => {
    expect(searchAll(d, "j")).toEqual([])
    expect(searchAll(d, "zzz")).toEqual([])
  })
})
