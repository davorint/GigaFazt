import { describe, expect, it } from "vitest"
import { DEFAULT_SETTINGS } from "../davorolt/settings"
import { TOOLS, run } from "../davorolt/tools"
import { newClient, newService, type Client } from "../clients/model"
import { plans } from "../plans"
import { buildAlta, emptyAlta, freeOntId, oltValues, problems, profileOf, sitePorts, suggestUser } from "./alta"

const existing: Client[] = [
  { ...newClient(), id: "a", siteId: "s1", services: [{ ...newService("internet"), pppoeUser: "ana.lopez.301", ontSn: "48575443AAAA0001", oltPort: "0/1/0", ontId: 0 }] },
  { ...newClient(), id: "b", siteId: "s1", services: [{ ...newService("internet"), pppoeUser: "beto", ontSn: "48575443AAAA0002", oltPort: "0/1/0", ontId: 1 }] },
]
const input = { ...emptyAlta(), name: "Ana López", whatsapp: "55 1234 5678", siteId: "s1", apartment: "301", date: "2026-12-04", time: "10:00", pppoeUser: "ana.lopez.301.2", ontSn: "48575443aaaa0003", oltPort: "0-1-0", ontId: "2" }

describe("Phase 12: new client in one step", () => {
  it("profiles, users, free IDs, ports", () => {
    expect(plans.map(profileOf)).toEqual(["200M", "500M", "1G"])
    expect(suggestUser("Ana López Pérez", "301", existing)).toBe("ana.lopez.301.2")
    expect(suggestUser("Ñoño", "", [])).toBe("nono")
    expect(freeOntId("0/1/0", existing)).toBe("2")
    expect(freeOntId("0/1/5", existing)).toBe("0")
    expect(sitePorts("s1", existing)).toEqual(["0/1/0"])
  })
  it("what stops the form", () => {
    expect(problems(input, existing)).toEqual([])
    expect(problems({ ...input, pppoeUser: "beto", ontSn: "48575443AAAA0001", ontId: "1" }, existing)).toEqual(["userTaken", "snTaken", "idTaken"])
    expect(problems(emptyAlta(), existing)).toEqual(["name", "whatsapp", "site", "date", "user"])
    expect(problems({ ...input, oltPort: "abc", ontId: "200" }, existing)).toEqual(["port", "ontId"])
  })
  it("the client, services and the installation", () => {
    const { client, appointment } = buildAlta({ ...input, tv: true }, "Prueba")
    expect(client.services.map((s) => [s.type, s.plan, s.monthly, s.start])).toEqual([
      ["internet", "200M", 396, "2026-12-04"],
      ["iptv", "TV", 250, "2026-12-04"],
    ])
    expect(client.services[0]).toMatchObject({ pppoeUser: "ana.lopez.301.2", ontSn: "48575443AAAA0003", oltPort: "0/1/0", ontId: 2 })
    expect(appointment).toMatchObject({ kind: "instalacion", date: "2026-12-04", time: "10:00", clientId: client.id, siteId: "s1", status: "pendiente" })
  })
  it("the OLT commands come from DavorOLT's preautorizar with the PPPoE user", () => {
    const v = oltValues(input, DEFAULT_SETTINGS.plans, { user: "ana.lopez.301.2", pass: "Secreta123" })
    expect(v).toMatchObject({ slot: "1", port: "0", ontId: "2", sn: "48575443AAAA0003" })
    const r = run(TOOLS.find((t) => t.id === "preautorizar")!, v!, DEFAULT_SETTINGS)
    const code = r && "blocks" in r ? r.blocks.map((b) => b.code).join("\n") : String(r && "error" in r ? `${r.error} ${r.field}` : r)
    expect(code).toContain("ont add 0 2 sn-auth 48575443AAAA0003 omci")
    expect(oltValues({ ...input, ontSn: "" }, DEFAULT_SETTINGS.plans, null)).toBeNull()
  })
})
