import { describe, expect, it } from "vitest"
import { catalogFile, decodeItem, mergeItems, newOffer, readCatalogFile, starterCatalog, withEffective, type Item, type Role } from "../materials/catalog"
import { balancedDesign, tapDesign, DEFAULT_OPTICS } from "./design"
import { decodeMaterials, designNeeds, surveyCosts, usedItems, withPicks } from "./materials"
import { emptyTower, newSurvey, syncFloors, type Survey } from "./model"

/** PB + 9 floors × 8 apartments, 20 m to the farthest door, 3 m floors, 15 m from the room to the duct. */
const survey = (kind: "balanced" | "taps" = "balanced"): Survey => {
  const s = newSurvey()
  const t0 = syncFloors({ ...emptyTower("A"), floorsAbove: 10, floorsBelow: 0, floorHeightM: 3 })
  const t = { ...t0, floors: t0.floors.map((f) => ({ ...f, units: 8, farthestM: 20 })) }
  const design = kind === "balanced" ? balancedDesign(t, { feeds: 1, perBox: 2, base: "auto", floor: "auto" }) : tapDesign(t, { feeds: 1, perBox: 2, floor: 16 }, DEFAULT_OPTICS)
  return { ...s, room: { ...s.room, toDuctM: 15 }, commercial: { ...s.commercial, expectedClients: 30 }, towers: [{ ...t, design }] }
}
/** The starter list with a price on every item: 10 MXN per unit, 100 for the ONT. */
const priced = (): Item[] => starterCatalog().map((x) => withEffective({ ...x, offers: [newOffer({ price: x.role === "ont" ? 100 : 10 })] }))

describe("what the design needs", () => {
  it("balanced: one 1:8 at the base, five 1:16 boxes, splices, fiber with slack", () => {
    const n = designNeeds(survey())
    expect(n.build).toEqual({
      "splitter-8": 1,
      "splitter-16": 5,
      "floor-box": 5,
      "base-box": 1,
      splice: 12,
      "olt-patch": 1,
      "feeder-m": 17, // 15 m × 1.10
      "riser-m": 66, // boxes on floors 0, 2, 4, 6, 8 × 3 m × 1.10 = 0 + 6.6 + 13.2 + 19.8 + 26.4
    })
    expect(n.client).toEqual({ "drop-m": 23, ont: 1, "client-connector": 2, "client-labor": 1 })
  })
  it("the average drop leaves out floors whose farthest door isn't known (not 0 m)", () => {
    const s = survey()
    const t = { ...s.towers[0], floors: s.towers[0].floors.map((f) => (f.level >= 5 ? { ...f, farthestM: null } : f)) }
    expect(designNeeds({ ...s, towers: [t] }).client["drop-m"]).toBe(23)
    const none = { ...t, floors: t.floors.map((f) => ({ ...f, farthestM: null })) }
    expect(designNeeds({ ...s, towers: [none] }).client["drop-m"]).toBe(0)
  })
  it("taps: four taps, five floor splitters, no base box, connectors when the joints are connectors", () => {
    const s = survey("taps")
    const n = designNeeds({ ...s, optics: { ...s.optics, joint: "connector" } })
    const taps = Object.entries(n.build).filter(([k]) => k.startsWith("tap-")).reduce((a, [, v]) => a + (v ?? 0), 0)
    expect(taps).toBe(4)
    expect(n.build["splitter-16"]).toBe(5)
    expect(n.build["base-box"]).toBeUndefined()
    expect(n.build.connector).toBe(18) // (4 taps + 5 splitters) × 2
    expect(n.build.splice).toBeUndefined()
  })
})

describe("costs (IVA included)", () => {
  it("sums the design, the extras and the expected clients", () => {
    const cat = priced()
    const labor = cat.find((x) => x.name.startsWith("Mano de obra del despliegue"))!
    const s = { ...survey(), materials: { pick: {}, qty: {}, extras: [{ id: "extra-0001", itemId: labor.id, qty: 3, note: "" }] } }
    const c = surveyCosts(s, cat)
    // Design: 1 + 5 + 5 + 1 + 12 + 1 + 17 + 66 = 108 units × 10
    expect(c.build.reduce((a, x) => a + x.total!, 0)).toBe(1080)
    expect(c.buildTotal).toBe(1080 + 30)
    // Per client: 23 m drop × 10 + ONT 100 + 2 connectors × 10 + installation 10
    expect(c.perClient).toBe(360)
    expect(c.clientsTotal).toBe(360 * 30)
    expect(c.total).toBe(1110 + 10800)
    expect(c.missing).toBe(0)
  })
  it("a typed quantity wins over the computed one; a chosen item wins over the first of its role", () => {
    const cat = priced()
    const cheaper: Item = { ...cat.find((x) => x.role === "riser-m")!, id: "riser-cheap", name: "Riser barato", price: 5 }
    const s = { ...survey(), materials: { pick: { "riser-m": "riser-cheap" } as Partial<Record<Role, string>>, qty: { "floor-box": 6 } as Partial<Record<Role, number>>, extras: [] } }
    const c = surveyCosts(s, [...cat, cheaper])
    expect(c.build.find((x) => x.role === "riser-m")).toMatchObject({ qty: 66, total: 330 })
    expect(c.build.find((x) => x.role === "floor-box")).toMatchObject({ qty: 6, total: 60 })
  })
  it("items without a price, roles without an item: counted as 0 and reported", () => {
    const cat = starterCatalog().filter((x) => x.role !== "ont")
    const c = surveyCosts(survey(), cat)
    expect(c.total).toBe(0)
    expect(c.missing).toBe(c.build.length + c.client.length)
    expect(c.client.find((x) => x.role === "ont")?.item).toBeNull()
  })
  it("on another phone with its own unpriced list, the exported survey keeps its total", () => {
    const mine = priced()
    const s = survey()
    // Same fixed starter ids, no prices; plus an older browser whose starter copies have random ids.
    const theirs = starterCatalog()
    const older = starterCatalog().map((x) => ({ ...x, id: `old-${x.id}` }))
    const arrived = mergeItems(theirs, usedItems(s, mine), false).list
    // Unpriced items with the same id take the incoming prices.
    expect(surveyCosts(s, arrived).total).toBe(surveyCosts(s, mine).total)
    // With other ids, the survey names its items (withPicks), so the total holds too.
    const arrivedOld = mergeItems(older, usedItems(s, mine).map((x) => ({ ...x, id: `mine-${x.id}` })), false).list
    const mineRenamed = mine.map((x) => ({ ...x, id: `mine-${x.id}` }))
    const sRenamed = withPicks(s, mineRenamed)
    expect(surveyCosts(sRenamed, arrivedOld).total).toBe(surveyCosts(s, mine).total)
  })
  it("the items a survey uses travel with it", () => {
    const cat = priced()
    const used = usedItems(survey(), cat)
    expect(used.some((x) => x.role === "splitter-16")).toBe(true)
    expect(used.some((x) => x.role === "splitter-2")).toBe(false)
  })
})

describe("master list", () => {
  it("file round trip, hostile input, merge", () => {
    const cat = priced()
    expect(readCatalogFile(catalogFile(cat))).toEqual(cat)
    expect(readCatalogFile("{}")).toBeNull()
    expect(decodeItem({ name: "X", category: "nope", price: -5, role: "hack", unit: "" })).toMatchObject({ category: "otros", price: null, role: "", unit: "pza" })
    const edited = { ...cat[0], price: 99 }
    expect(mergeItems(cat, [edited], false).list[0].price).toBe(10) // arriving with a survey: never overwrites
    expect(mergeItems(cat, [edited], true).list[0].price).toBe(99) // importing a list on purpose: replaces
    expect(mergeItems(cat, [{ ...edited, id: "new-item-1" }], false).added).toBe(1)
  })
  it("survey materials read leniently", () => {
    expect(decodeMaterials({ pick: { "splitter-8": "abc123", nope: "x" }, qty: { "riser-m": 10, ont: -1 }, extras: [{ itemId: "abc123", qty: "a" }, { itemId: 5 }] })).toMatchObject({
      pick: { "splitter-8": "abc123" },
      qty: { "riser-m": 10 },
      extras: [{ itemId: "abc123", qty: 1 }],
    })
  })
})
