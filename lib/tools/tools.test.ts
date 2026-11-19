import { describe, expect, it } from "vitest"
import { matchInternal } from "../internal-pages"
import { addMonths, decodeTool, holderLabel, lastService, newServiceEntry, newTool, nextService, starterTools, toolAlerts, toolBrandOptions, toolValue, untouchedStarter } from "./model"

const TODAY = "2026-11-18"

describe("tools", () => {
  it("starter list: fixed unique ids, quantity 0, untouched until edited (updatedAt ignored)", () => {
    const a = starterTools()
    const ids = a.map((x) => x.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(starterTools().map((x) => x.id)).toEqual(ids)
    expect(a.every((x) => x.quantity === 0 && x.price === null && x.id.startsWith("starter-"))).toBe(true)
    const splicer = a.find((x) => x.name.startsWith("Fusionadora"))!
    expect(untouchedStarter({ ...splicer, updatedAt: "2026-11-18T10:00:00Z" })).toBe(true)
    expect(untouchedStarter(decodeTool(JSON.parse(JSON.stringify(splicer)))!)).toBe(true)
    expect(untouchedStarter({ ...splicer, quantity: 1 })).toBe(false)
    expect(untouchedStarter(newTool({ name: splicer.name }))).toBe(false)
  })
  it("next service from the latest log entry, else from the purchase; months keep the day or take the month's last", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28")
    expect(addMonths("2026-11-18", 12)).toBe("2027-11-18")
    const x = newTool({ serviceMonths: 6, purchaseDate: "2025-01-10" })
    expect(nextService(x)).toBe("2025-07-10")
    const y = { ...x, services: [newServiceEntry({ date: "2026-03-01" }), newServiceEntry({ date: "2026-06-15" }), newServiceEntry({ date: "" })] }
    expect(lastService(y)).toBe("2026-06-15")
    expect(nextService(y)).toBe("2026-12-15")
    expect(nextService(newTool())).toBe("")
  })
  it("alerts: service overdue / soon / unknown, counter near and at the limit, condition, warranty ending", () => {
    expect(toolAlerts(newTool({ serviceMonths: 12, purchaseDate: "2025-10-01" }), TODAY)).toEqual(["service-overdue"])
    expect(toolAlerts(newTool({ serviceMonths: 12, purchaseDate: "2025-12-01" }), TODAY)).toEqual(["service-soon"])
    expect(toolAlerts(newTool({ serviceMonths: 12 }), TODAY)).toEqual(["service-unknown"])
    expect(toolAlerts(newTool({ counterLabel: "Arcos", counter: 2700, counterLimit: 3000 }), TODAY)).toEqual(["counter-near"])
    expect(toolAlerts(newTool({ counterLabel: "Arcos", counter: 3000, counterLimit: 3000, condition: "reparacion" }), TODAY)).toEqual(["counter-limit", "condition"])
    // Counter name cleared: its fields are hidden in the editor, so no alert that couldn't be cleared.
    expect(toolAlerts(newTool({ counterLabel: " ", counter: 3000, counterLimit: 3000 }), TODAY)).toEqual([])
    expect(toolAlerts(newTool({ warrantyEnd: "2026-12-01" }), TODAY)).toEqual(["warranty-soon"])
    expect(toolAlerts(newTool({ warrantyEnd: "2026-11-01", counter: 10 }), TODAY)).toEqual([])
  })
  it("value = price per piece × pieces; holder label per kind", () => {
    expect(toolValue(newTool({ price: 150, quantity: 4 }))).toBe(600)
    expect(toolValue(newTool({ quantity: 4 }))).toBeNull()
    const kind = (k: string) => `[${k}]`
    const site = (id: string) => (id === "sitio-123" ? "Be Grand" : undefined)
    expect(holderLabel(newTool({ holderKind: "despliegue", siteId: "sitio-123" }), site, kind)).toBe("Be Grand")
    expect(holderLabel(newTool({ holderKind: "despliegue", siteId: "otro-12345" }), site, kind)).toBe("[despliegue]")
    expect(holderLabel(newTool({ holderKind: "tecnico", holder: " Juan " }), site, kind)).toBe("Juan")
    expect(holderLabel(newTool({ holderKind: "tecnico" }), site, kind)).toBe("[tecnico]")
    expect(holderLabel(newTool({ holderKind: "bodega", holder: "x" }), site, kind)).toBe("[bodega]")
  })
  it("brand suggestions: Signal Fire first for splicing tools, then brands already used", () => {
    const used = [newTool({ brand: "Fujikura" }), newTool({ brand: "signal fire" }), newTool({ brand: "Klein" }), newTool({ brand: "fujikura" })]
    expect(toolBrandOptions("empalme", used)).toEqual(["Signal Fire", "Fujikura", "Klein"])
    expect(toolBrandOptions("mano", used)).toEqual(["Fujikura", "Klein", "signal fire"])
  })
  it("reads stored values leniently", () => {
    const x = decodeTool({ name: "OTDR", category: "nave", quantity: -3, condition: "rota", holderKind: "luna", serial: "ab12", price: "100", serviceMonths: 0, purchaseDate: "1/2/2025", services: [{ date: "2026-01-01", cost: -5, what: 7 }, "x"], siteId: "../x" })!
    expect([x.category, x.quantity, x.condition, x.holderKind, x.serial, x.price, x.serviceMonths, x.purchaseDate, x.siteId]).toEqual(["otros", 1, "bien", "bodega", "AB12", null, null, "", ""])
    expect(x.services.map((s) => [s.date, s.cost, s.what])).toEqual([["2026-01-01", null, ""]])
    expect(decodeTool({ name: "Fusionadora", parts: ["item-elec1", "item-elec1", "../x", 5, "item-blade"] })!.parts).toEqual(["item-elec1", "item-blade"])
    expect(decodeTool({ name: "Fusionadora" })!.parts).toEqual([])
    expect(decodeTool(null)).toBeNull()
    expect(decodeTool([])).toBeNull()
  })
  it("/interno/admin/herramientas, and /interno/admin/tools opens it", () => {
    expect(matchInternal("/interno/admin/Herramientas")?.rewriteTo).toBe("/es/interno/admin/herramientas")
    expect(matchInternal("/interno/admin/TOOLS")?.rewriteTo).toBe("/es/interno/admin/herramientas")
  })
})
