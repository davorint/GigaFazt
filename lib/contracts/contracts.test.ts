import { describe, expect, it } from "vitest"
import { cleanName, sniffMime } from "./files"
import { contractStatus, decodeContract, newContract } from "./model"
import { matchInternal } from "../internal-pages"
import { todaySummary } from "../interno/today"

const base = { reports: [], clients: [], payments: [], tools: [], items: [], moves: [], units: [], notes: [] }

describe("Contratos (owner, 2026-11-21)", () => {
  it("status from its own dates: notice period, automatic renewal, ended by hand", () => {
    const c = newContract({ endDate: "2026-12-31", noticeDays: 30 })
    expect(contractStatus(c, [], "2026-11-21").status).toBe("vigente")
    expect(contractStatus(c, [], "2026-12-05").status).toBe("por-vencer")
    expect(contractStatus(c, [], "2027-01-02").status).toBe("vencido")
    expect(contractStatus({ ...c, renewal: "automatica" }, [], "2027-01-02")).toMatchObject({ status: "renovado", end: "2027-12-31" })
    expect(contractStatus({ ...c, ended: true }, [], "2027-01-02").status).toBe("terminado")
    expect(contractStatus(newContract(), [], "2026-11-21").status).toBe("sin-fecha")
  })
  it("a building contract tied to a deployment takes the deployment's agreement", () => {
    const c = newContract({ kind: "edificio", siteId: "site-001", endDate: "2030-01-01" })
    const sites = [{ id: "site-001", contractEnd: "2026-12-01", renewal: "" as const, noticeDays: null }]
    expect(contractStatus(c, sites, "2026-11-21")).toMatchObject({ status: "por-vencer", end: "2026-12-01" })
  })
  it("decodes safely", () => {
    expect(decodeContract(null)).toBeNull()
    const d = decodeContract({ id: "abc123", kind: "nada", noticeDays: 9999, monthly: -5, files: [{ id: "f00001", name: "a.pdf", size: 10, mime: "text/html" }, { id: "f00001" }] })!
    expect(d).toMatchObject({ kind: "otro", noticeDays: 730, monthly: 0 })
    expect(d.files).toHaveLength(1)
    expect(d.files[0].mime).toBe("application/pdf")
  })
  it("files: type from the bytes, names without paths", () => {
    expect(sniffMime(new TextEncoder().encode("%PDF-1.7"))).toBe("application/pdf")
    expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg")
    expect(sniffMime(new TextEncoder().encode("<html>"))).toBeNull()
    expect(cleanName(String.raw`C:\fotos\contrato "final".pdf`)).toBe("contrato final.pdf")
    expect(cleanName("")).toBe("archivo")
  })
  it("Hoy lists contracts to renew, not the building ones the agreements already list", () => {
    const s = todaySummary(
      {
        ...base,
        contracts: [
          newContract({ id: "c00001", title: "Enlace", kind: "carrier", party: "Izzi", endDate: "2026-12-01" }),
          newContract({ id: "c00002", title: "Azotea", kind: "edificio", siteId: "site-001", endDate: "2026-12-01" }),
          newContract({ id: "c00003", title: "Viejo", endDate: "2026-01-01", ended: true }),
        ],
      },
      "2026-11-21"
    )
    expect(s.contracts).toEqual([{ id: "c00001", label: "Enlace · Izzi", end: "2026-12-01", ended: false }])
  })
  it("routes: /interno/admin/legal/contratos in any case; acuerdos is gone", () => {
    expect(matchInternal("/Interno/Admin/Legal/Contratos")).toEqual({ rewriteTo: "/es/interno/admin/legal/contratos", open: false })
    expect(matchInternal("/es/interno/admin/legal/contratos")).toEqual({ rewriteTo: null, open: false })
  })
})
