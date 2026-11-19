import { describe, expect, it } from "vitest"
import { matchInternal } from "../internal-pages"
import { decodeItem, effectiveOffer, newItem, newOffer } from "../materials/catalog"
import { starterTools } from "../tools/model"
import { bestOffer, buyIntoTools, buyTotal, decodeToolBuy, isOpen, newBuyOffer, newToolBuy } from "./model"

describe("tool buying options", () => {
  it("decodes anything without throwing, keeping only valid values", () => {
    for (const v of [null, 1, "x", [], {}]) expect(() => decodeToolBuy(v)).not.toThrow()
    const x = decodeToolBuy({ id: "opt-000001", need: "OTDR", status: "nope", priority: "urgente", quantity: -3, offers: [{ store: "A", price: -5, url: "javascript:alert(1)" }, "bad"], offerId: "missing" })!
    expect(x).toMatchObject({ id: "opt-000001", need: "OTDR", status: "idea", priority: "media", quantity: 1, offerId: "" })
    expect(x.offers).toHaveLength(1)
    expect(x.offers[0]).toMatchObject({ store: "A", price: null, url: "" })
  })

  it("the chosen offer wins, else the cheapest priced one; total is per piece × quantity", () => {
    const a = newBuyOffer({ store: "A", price: 900 })
    const b = newBuyOffer({ store: "B", price: 700 })
    const c = newBuyOffer({ store: "C", price: null })
    const x = newToolBuy({ offers: [a, b, c], quantity: 2 })
    expect(bestOffer(x)?.store).toBe("B")
    expect(buyTotal(x)).toBe(1400)
    expect(bestOffer({ ...x, offerId: a.id })?.store).toBe("A")
    expect(buyTotal(newToolBuy({ offers: [c] }))).toBeNull()
    expect(isOpen({ status: "aprobado" })).toBe(true)
    expect(isOpen({ status: "comprado" })).toBe(false)
  })

  it("bought: fills the empty starter tool with the same name, or adds a new one", () => {
    const tools = starterTools()
    const opt = newToolBuy({ need: "fusionadora de fibra optica", brand: "Signal Fire", model: "AI-9", quantity: 1, offers: [newBuyOffer({ store: "Amazon México", price: 18699 })] })
    const r = buyIntoTools(opt, tools, "2026-11-18")
    expect(r.tool.id).toBe("starter-fusionadora-de-fibra-optica")
    expect(r.tool).toMatchObject({ brand: "Signal Fire", model: "AI-9", quantity: 1, price: 18699, supplier: "Amazon México", purchaseDate: "2026-11-18" })
    expect(r.option).toMatchObject({ status: "comprado", toolId: r.tool.id })
    // A tool already owned (quantity > 0) isn't overwritten: a new record is added.
    const owned = tools.map((t) => (t.id === r.tool.id ? { ...t, quantity: 1 } : t))
    const again = buyIntoTools(opt, owned, "2026-11-18")
    expect(again.tool.id).not.toBe(r.tool.id)
    expect(again.tool).toMatchObject({ name: "fusionadora de fibra optica", category: "otros", quantity: 1 })
  })
})

describe("material offers: link and status", () => {
  it("sold-out or discarded offers don't set the price unless chosen", () => {
    const cheap = newOffer({ supplier: "A", price: 100, status: "agotada" })
    const mid = newOffer({ supplier: "B", price: 150 })
    const it = newItem({ offers: [cheap, mid] })
    expect(effectiveOffer(it)?.supplier).toBe("B")
    expect(effectiveOffer({ ...it, offerId: cheap.id })?.supplier).toBe("A")
    expect(effectiveOffer(newItem({ offers: [newOffer({ price: 5, status: "descartada" })] }))).toBeNull()
  })
  it("old offers read as current, links are http(s) only", () => {
    const it = decodeItem({ name: "x", offers: [{ id: "of-000001", supplier: "A", price: 10 }, { supplier: "B", url: "javascript:x" }, { supplier: "C", url: "https://tienda.mx/p" }] })!
    expect(it.offers.map((o) => o.status)).toEqual(["vigente", "vigente", "vigente"])
    expect(it.offers.map((o) => o.url)).toEqual(["", "", "https://tienda.mx/p"])
  })
})

describe("routes", () => {
  it("the two buying pages and their other spellings", () => {
    expect(matchInternal("/interno/admin/compras-materiales")?.rewriteTo).toBe("/es/interno/admin/compras-materiales")
    expect(matchInternal("/INTERNO/Admin/Compras-Herramientas")?.rewriteTo).toBe("/es/interno/admin/compras-herramientas")
    expect(matchInternal("/interno/admin/materiales-compras")?.rewriteTo).toBe("/es/interno/admin/compras-materiales")
    expect(matchInternal("/interno/admin/opciones-herramientas")?.rewriteTo).toBe("/es/interno/admin/compras-herramientas")
    expect(matchInternal("/interno/admin/precios")?.rewriteTo).toBe("/es/interno/admin/compras-materiales")
  })
})
