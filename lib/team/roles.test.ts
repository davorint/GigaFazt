import { describe, expect, it } from "vitest"
import { areaAllowed, decodeRole, kindAllowed, pageAllowed } from "./roles"

const admin = { admin: true, role: "tecnico" as const }
const oficina = { admin: false, role: "oficina" as const }
const tecnico = { admin: false, role: "tecnico" as const }
const cobranza = { admin: false, role: "cobranza" as const }

describe("Phase 14: roles", () => {
  it("unknown roles fall back to oficina", () => {
    expect(decodeRole("tecnico")).toBe("tecnico")
    expect(decodeRole("root")).toBe("oficina")
  })
  it("records each role syncs", () => {
    expect(kindAllowed(admin, "payments")).toBe(true)
    expect(kindAllowed(oficina, "contratos")).toBe(true)
    expect(kindAllowed(tecnico, "stock")).toBe(true)
    expect(kindAllowed(tecnico, "payments")).toBe(false)
    expect(kindAllowed(tecnico, "porpagar")).toBe(false)
    expect(kindAllowed(cobranza, "payments")).toBe(true)
    expect(kindAllowed(cobranza, "stock")).toBe(false)
    expect(kindAllowed(cobranza, "porpagar")).toBe(false)
  })
  it("server areas", () => {
    expect(areaAllowed(admin, "activity")).toBe(true)
    expect(areaAllowed(oficina, "activity")).toBe(false)
    expect(areaAllowed(oficina, "backup")).toBe(true)
    expect(areaAllowed(cobranza, "whatsapp")).toBe(true)
    expect(areaAllowed(cobranza, "files")).toBe(false)
    expect(areaAllowed(tecnico, "whatsapp")).toBe(false)
  })
  it("pages, with or without the locale and in any capitalization", () => {
    expect(pageAllowed(tecnico, "/es/interno")).toBe(true)
    expect(pageAllowed(tecnico, "/interno/admin")).toBe(true)
    expect(pageAllowed(tecnico, "/interno/Tecnico")).toBe(true)
    expect(pageAllowed(tecnico, "/es/interno/materiales/compras")).toBe(true)
    expect(pageAllowed(tecnico, "/interno/admin/cuentas-por-pagar")).toBe(false)
    expect(pageAllowed(tecnico, "/interno/software/wispdavor/pagos")).toBe(false)
    expect(pageAllowed(tecnico, "/interno/software/wispdavor/red")).toBe(true)
    expect(pageAllowed(cobranza, "/interno/software/wispdavor/alta")).toBe(true)
    expect(pageAllowed(cobranza, "/interno/materiales")).toBe(false)
    expect(pageAllowed(oficina, "/interno/admin/usuarios")).toBe(false)
    expect(pageAllowed(oficina, "/interno/admin/actividad/")).toBe(false)
    expect(pageAllowed(oficina, "/interno/admin/legal/contratos")).toBe(true)
    expect(pageAllowed(admin, "/interno/admin/actividad")).toBe(true)
  })
})
