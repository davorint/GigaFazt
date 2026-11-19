import { describe, expect, it } from "vitest"
import { decodeItem, effectiveOffer, newItem, newOffer, withEffective } from "../materials/catalog"
import { purchaseList } from "../survey/materials"
import { BODEGA, applyToUnits, checkMove, countAt, decodeMove, decodeUnit, newMove, newUnit, placesUsed, repeatedSerials, sitePlace, stockAt, toRecover } from "./model"

const SITE = sitePlace("sitio-arboleda")

describe("who sells each material", () => {
  it("the price comes from the chosen offer, else the cheapest priced one", () => {
    const a = newOffer({ supplierId: "prov-aaaaa", price: 120 })
    const b = newOffer({ supplierId: "prov-bbbbb", price: 95 })
    const c = newOffer({ supplier: "Ferretería", price: null })
    const it = withEffective(newItem({ name: "Drop", offers: [a, b, c] }))
    expect([it.price, it.supplierId]).toEqual([95, "prov-bbbbb"])
    expect(withEffective({ ...it, offerId: a.id }).price).toBe(120)
    expect(effectiveOffer({ offers: [c], offerId: "" })).toBe(c)
    expect(withEffective(newItem()).price).toBeNull()
  })
  it("an item saved before offers keeps its price and supplier as its first offer (stable id)", () => {
    const old = { id: "starter-drop-m", name: "Drop", unit: "m", price: 4.5, supplierId: "prov-12345", supplier: "", sku: "D-1", notes: "" }
    const x = decodeItem(old)!
    expect(x.offers).toHaveLength(1)
    expect([x.price, x.supplierId, x.sku, x.offers[0].id]).toEqual([4.5, "prov-12345", "D-1", "starter-drop-m-of1"])
    expect(decodeItem(old)!.offers[0].id).toBe(x.offers[0].id)
    expect(decodeItem({ name: "ONT", role: "ont" })!.serialized).toBe(true)
    expect(decodeItem({ name: "X", offers: [{ price: -3 }, "nope"], offerId: "otro-12345", minStock: -1 })).toMatchObject({ price: null, offerId: "", minStock: null })
  })
  it("purchase list groups the deployment's lines by supplier and adds up repeated items", () => {
    const drop = withEffective(newItem({ id: "item-drop1", name: "Drop", offers: [newOffer({ supplierId: "prov-aaaaa", price: 5 })] }))
    const box = withEffective(newItem({ id: "item-caja1", name: "Caja", offers: [newOffer({ supplierId: "prov-aaaaa", price: 300 })] }))
    const misc = newItem({ id: "item-misc1", name: "Cinchos" })
    const line = (item: typeof drop, qty: number) => ({ key: item.id + qty, item, qty, total: null })
    const groups = purchaseList({ build: [line(drop, 100), line(box, 2)], extras: [line(drop, 20), line(misc, 1)], client: [], buildTotal: 0, perClient: 0, clients: 0, clientsTotal: 0, total: 0, missing: 0 })
    expect(groups.map((g) => [g.key, g.total, g.missing])).toEqual([
      ["p:prov-aaaaa", 1200, 0],
      ["", 0, 1],
    ])
    expect(groups[0].lines.find((l) => l.item.id === "item-drop1")?.qty).toBe(120)
  })
})

describe("installation stock", () => {
  it("what a place has = in − out; adjustments can be negative", () => {
    const moves = [
      newMove({ kind: "compra", itemId: "drop-12345", qty: 300, to: BODEGA }),
      newMove({ kind: "traspaso", itemId: "drop-12345", qty: 100, from: BODEGA, to: SITE }),
      newMove({ kind: "instalacion", itemId: "drop-12345", qty: 35, from: SITE, clientId: "cliente-1234" }),
      newMove({ kind: "ajuste", itemId: "drop-12345", qty: -5, to: BODEGA }),
    ]
    expect([stockAt(moves, "drop-12345", BODEGA), stockAt(moves, "drop-12345", SITE)]).toEqual([195, 65])
    expect(placesUsed(moves, [])).toEqual([BODEGA, SITE])
  })
  it("ONTs by serial: received, moved to a room, installed, returned damaged", () => {
    let units = applyToUnits([], newMove({ kind: "compra", itemId: "ont-123456", to: BODEGA, serials: ["hwtc 0001", "HWTC0002"] }))
    expect(units.map((u) => [u.serial, u.state, u.place])).toEqual([
      ["HWTC0001", "almacen", BODEGA],
      ["HWTC0002", "almacen", BODEGA],
    ])
    const step = (m: ReturnType<typeof newMove>) => {
      const ch = applyToUnits(units, m)
      units = units.map((u) => ch.find((c) => c.id === u.id) ?? u)
    }
    step(newMove({ kind: "traspaso", itemId: "ont-123456", from: BODEGA, to: SITE, serials: ["HWTC0001"] }))
    step(newMove({ kind: "instalacion", itemId: "ont-123456", from: SITE, clientId: "cliente-1234", serials: ["HWTC0001"] }))
    step(newMove({ kind: "baja", itemId: "ont-123456", from: BODEGA, serials: ["HWTC0002"] }))
    expect(units.map((u) => [u.state, u.place, u.clientId])).toEqual([
      ["cliente", "", "cliente-1234"],
      ["danado", BODEGA, ""],
    ])
    const item = { id: "ont-123456", serialized: true }
    expect([countAt(item, [], units, BODEGA), countAt(item, [], units, SITE)]).toEqual([0, 0])
  })
  it("checks: missing ends, serials not in that place, stock short is a warning", () => {
    const units = [newUnit({ itemId: "ont-123456", serial: "HWTC0001", place: BODEGA })]
    const ont = { serialized: true }
    expect(checkMove(newMove({ kind: "instalacion", itemId: "ont-123456", date: "2026-11-18", from: SITE, serials: ["HWTC0001"] }), ont, units, []).errors).toEqual(["client"])
    expect(checkMove(newMove({ kind: "instalacion", itemId: "ont-123456", date: "2026-11-18", from: SITE, clientId: "cliente-1234", serials: ["HWTC0001"] }), ont, units, []).warnings).toEqual(["notThere:HWTC0001"])
    expect(checkMove(newMove({ kind: "compra", itemId: "ont-123456", date: "2026-11-18", to: BODEGA, serials: ["A1", "a1"] }), ont, units, []).errors).toEqual(["repeated"])
    const drop = { serialized: false }
    expect(checkMove(newMove({ kind: "traspaso", itemId: "drop-12345", date: "2026-11-18", from: BODEGA, to: BODEGA, qty: 0 }), drop, [], []).errors).toEqual(["same", "qty"])
    expect(checkMove(newMove({ kind: "instalacion", itemId: "drop-12345", date: "2026-11-18", from: BODEGA, clientId: "cliente-1234", qty: 30 }), drop, [], []).warnings).toEqual(["short"])
  })
  it("ONTs to recover: at clients with every service cancelled (or the client deleted); repeated serials", () => {
    const units = [newUnit({ serial: "A", state: "cliente", clientId: "c-activo-1" }), newUnit({ serial: "B", state: "cliente", clientId: "c-baja-01" }), newUnit({ serial: "C", state: "cliente", clientId: "c-borrado1" }), newUnit({ serial: "b" })]
    const clients = [
      { id: "c-activo-1", services: [{ status: "activo" }] },
      { id: "c-baja-01", services: [{ status: "cancelado" }] },
    ]
    expect(toRecover(units, clients).map((u) => u.serial)).toEqual(["B", "C"])
    expect([...repeatedSerials(units)]).toEqual(["B"])
  })
  it("reads stored values leniently", () => {
    expect(decodeMove({ kind: "compra", itemId: "drop-12345", qty: -5, to: "s:../x", serials: [" ab 1 ", 3] })).toMatchObject({ qty: 5, to: "", serials: ["AB1"] })
    expect(decodeMove({ kind: "ajuste", itemId: "drop-12345", qty: -5 })!.qty).toBe(-5)
    expect(decodeMove({ kind: "compra" })).toBeNull()
    expect(decodeUnit({ itemId: "ont-123456", serial: "x1", state: "cliente", place: BODEGA, clientId: "c-activo-1" })).toMatchObject({ serial: "X1", place: "", clientId: "c-activo-1" })
    expect(decodeUnit({ itemId: "ont-123456", serial: "  " })).toBeNull()
  })
})

describe("baja reasons, monthly use and what a place still holds (2026-11-19)", () => {
  it("a baja's units take its reason: damaged stays in the place, lost or back to the supplier has none", async () => {
    const { applyToUnits, newMove, newUnit, decodeMove } = await import("./model")
    const u = newUnit({ itemId: "item-ont01", serial: "ABC123", place: "bodega" })
    const out = (reason: "danado" | "perdido" | "proveedor") => applyToUnits([u], newMove({ kind: "baja", itemId: "item-ont01", from: "bodega", serials: ["ABC123"], qty: 1, reason }))[0]
    expect(out("danado")).toMatchObject({ state: "danado", place: "bodega" })
    expect(out("perdido")).toMatchObject({ state: "perdido", place: "" })
    expect(out("proveedor")).toMatchObject({ state: "proveedor", place: "" })
    expect(decodeMove({ kind: "baja", itemId: "item-ont01" })?.reason).toBe("danado")
    expect(decodeMove({ kind: "compra", itemId: "item-ont01", reason: "perdido" })?.reason).toBe("")
  })
  it("monthly use counts what went to clients or out for good in the last 90 days; the suggested minimum is a month of it", async () => {
    const { monthlyUse, newMove, suggestedMin } = await import("./model")
    const m = (kind: "instalacion" | "baja" | "compra" | "traspaso", qty: number, date: string) => newMove({ kind, itemId: "item-drop1", qty, date })
    const moves = [m("instalacion", 60, "2026-11-01"), m("instalacion", 30, "2026-10-01"), m("baja", 30, "2026-09-15"), m("compra", 500, "2026-11-01"), m("traspaso", 100, "2026-11-01"), m("instalacion", 999, "2026-05-01")]
    expect(monthlyUse(moves, "item-drop1", "2026-11-19")).toBe(40)
    expect(suggestedMin(40)).toBe(40)
    expect(monthlyUse(moves, "other-item", "2026-11-19")).toBeNull()
    expect(suggestedMin(null)).toBeNull()
  })
  it("what a place still has, for the warning before deleting a location", async () => {
    const { newMove, newUnit, placesStockItems } = await import("./model")
    const moves = [newMove({ kind: "compra", itemId: "item-cable", qty: 10, to: "s:site-0001" }), newMove({ kind: "compra", itemId: "item-gone1", qty: 5, to: "s:site-0001" }), newMove({ kind: "traspaso", itemId: "item-gone1", qty: 5, from: "s:site-0001", to: "bodega" })]
    const units = [newUnit({ itemId: "item-ont01", serial: "X1", place: "s:site-0001" })]
    const items = new Map([["item-ont01", { id: "item-ont01", serialized: true }]])
    expect(placesStockItems(moves, units, "s:site-0001", items).sort()).toEqual(["item-cable", "item-ont01"])
  })
})
