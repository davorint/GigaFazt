import { describe, expect, it } from "vitest"
import { matchInternal } from "../internal-pages"
import { decodeDeployment, encodeDeployment, initialState } from "../mikrotik/state"
import { decodeItem } from "../materials/catalog"
import { decodeSurvey, newSurvey } from "../survey/model"
import { RFC, decodeProvider, mergeProviders, newProvider, providersFile, readProvidersFile } from "./model"

describe("providers", () => {
  it("file round trip", () => {
    const p = { ...newProvider("carrier", "Carrier Uno"), legalName: "Carrier Uno SA de CV", rfc: "CUN010101AB1", kinds: ["carrier", "service"] as ("carrier" | "service")[] }
    p.carrier.offers.push({ id: "offer-0001", mbps: 1000, monthly: 4500, notes: "simétrico" })
    p.contacts.push({ id: "contact-001", name: "Rosa", role: "Ventas", phone: "5512345678", whatsapp: "", email: "rosa@example.com" })
    expect(readProvidersFile(providersFile([p]))).toEqual([p])
    expect(readProvidersFile("{}")).toBeNull()
  })
  it("hostile input: unknown kinds dropped (never empty), scores 1–5, uppercase RFC, unknown IP", () => {
    const p = decodeProvider({ kinds: ["hack"], rfc: "abc010101ab1", rating: { quality: 7, response: 3 }, carrier: { ip: "maybe", offers: [{ mbps: -1 }] } })!
    expect(p.kinds).toEqual(["other"])
    expect(p.rfc).toBe("ABC010101AB1")
    expect(p.rating).toEqual({ quality: null, response: 3, price: null })
    expect(p.carrier.ip).toBe("")
    expect(p.carrier.offers[0].mbps).toBeNull()
    expect(decodeProvider(null)).toBeNull()
  })
  it("RFC: companies (3 letters) and people (4)", () => {
    expect(["ABC010101AB1", "ABCD010101AB1", "Ñ&A010101123"].map((x) => RFC.test(x))).toEqual([true, true, true])
    expect(["ABC01010AB1", "AB010101AB1", "abc010101ab1"].map((x) => RFC.test(x))).toEqual([false, false, false])
  })
  it("import: an older copy never undoes newer work", () => {
    const a = { ...newProvider("material", "A"), updatedAt: "2026-11-17T10:00:00.000Z" }
    const r = mergeProviders([a], [{ ...a, tradeName: "viejo", updatedAt: "2026-11-17T09:00:00.000Z" }, { ...newProvider("other", "B") }])
    expect([r.added, r.replaced, r.kept]).toEqual([1, 0, 1])
    expect(r.list[0].tradeName).toBe("A")
  })
})

describe("used by the other sections", () => {
  it("materials keep their supplier id; a bad one is dropped", () => {
    expect(decodeItem({ name: "X", supplierId: "prov-12345" })?.supplierId).toBe("prov-12345")
    expect(decodeItem({ name: "X", supplierId: "<script>" })?.supplierId).toBe("")
  })
  it("survey carriers keep their provider id", () => {
    const s = newSurvey()
    s.carriers.push({ id: "carrier-01", providerId: "prov-12345", name: "Carrier Uno", available: "si", mbps: 1000, leadDays: 15, ip: "nat", entry: "", notes: "" })
    expect(decodeSurvey(JSON.parse(JSON.stringify(s)))?.carriers[0].providerId).toBe("prov-12345")
  })
  it("a MikroTik link keeps its carrier through the deployment's encoding; older links have none", () => {
    const st = initialState()
    const withCarrier = { ...st, wans: st.wans.map((w, k) => (k === 0 ? { ...w, carrierId: "prov-12345" } : w)) }
    const back = decodeDeployment(encodeDeployment(withCarrier))
    expect(back?.wans[0].carrierId).toBe("prov-12345")
    expect(back?.wans[1].carrierId).toBeUndefined()
    const old = decodeDeployment(encodeDeployment(st))
    expect(old?.wans.every((w) => w.carrierId === undefined)).toBe(true)
  })
})

describe("admin routes", () => {
  it("/interno/admin and its pages, any capitalization; the old /interno/materiales is gone", () => {
    expect(matchInternal("/interno/admin")).toEqual({ rewriteTo: "/es/interno/admin", open: false })
    expect(matchInternal("/interno/admin/proveedores")).toEqual({ rewriteTo: "/es/interno/admin/proveedores", open: false })
    expect(matchInternal("/INTERNO/Materiales/En-Existencia")).toEqual({ rewriteTo: "/es/interno/materiales/en-existencia", open: false })
    expect(matchInternal("/interno/admin/proveedores.rsc")?.rewriteTo).toBe("/es/interno/admin/proveedores.rsc")
    // Not a known page: kept as typed, the app answers 404.
    expect(matchInternal("/interno/materiales")?.rewriteTo).toBe("/es/interno/materiales")
  })
})
