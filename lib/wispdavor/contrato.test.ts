import { describe, expect, it } from "vitest"
import { newClient, newService } from "../clients/model"
import { simplePdf, wrapText } from "../pdf/simple"
import { contractLines, decodeTemplate, fillTemplate, hasTemplate, validSigner } from "./contrato"

const client = { ...newClient(), name: "Ana López", whatsapp: "5512345678", building: "Torre Sol", tower: "B", apartment: "1204", services: [{ ...newService("internet"), plan: "500M", monthly: 496, status: "activo" as const }, { ...newService("iptv"), plan: "TV", monthly: 250, status: "activo" as const }] }

describe("Phase 15: client contract", () => {
  it("no text, no contract", () => {
    expect(hasTemplate(decodeTemplate(undefined))).toBe(false)
    expect(hasTemplate(decodeTemplate({ title: "Contrato", body: "x", version: 1 }))).toBe(true)
  })
  it("the client's data in the fields; unknown fields stay visible", () => {
    const s = fillTemplate("Yo, {{nombre}}, en {{direccion}}, contrato {{plan}} por {{precio}} al mes ({{ telefono }}, {{fecha}}). {{otro}}", client, "2026-11-22")
    expect(s).toBe("Yo, Ana López, en Torre Sol, Torre B, Depto. 1204, contrato 500M + TV por $746.00 al mes (5512345678, 22 de noviembre de 2026). {{otro}}")
  })
  it("a full name to sign", () => {
    expect(validSigner("Ana López")).toBe(true)
    expect(validSigner("Ana")).toBe(false)
    expect(validSigner("A B")).toBe(false)
  })
  it("long text wraps and goes on to more pages", () => {
    const lines = wrapText("palabra ".repeat(2000), 10)
    expect(lines.every((l) => l.length <= 95)).toBe(true)
    const pdf = new TextDecoder("latin1").decode(simplePdf(contractLines("Contrato", "palabra ".repeat(3000), { name: "Ana López", at: "2026-11-22T18:00:00Z", ipHash: "abc", hash: "f".repeat(64), version: 1 })))
    expect(pdf.startsWith("%PDF-1.4")).toBe(true)
    expect(Number(/\/Count (\d+)/.exec(pdf)?.[1])).toBeGreaterThan(2)
    expect(pdf).toContain("Firmó: Ana López")
    expect(pdf).toMatch(/%%EOF\n$/)
  })
})
