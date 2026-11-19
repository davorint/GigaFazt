import { describe, expect, it } from "vitest"
import mat from "../../messages/internal/materiales.es.json"
import tools from "../../messages/internal/herramientas.es.json"
import { CATEGORIES, decodeItem, newItem, starterCatalog, typeOldStarter as typeOldItem } from "../materials/catalog"
import { MATERIAL_SPECS } from "../materials/specs"
import { TOOL_CATEGORIES, decodeTool, starterTools, typeOldStarter as typeOldTool } from "../tools/model"
import { TOOL_SPECS } from "../tools/specs"
import { buyIntoTools, decodeToolBuy, newToolBuy } from "../toolbuys/model"
import { decodeSpecs, decodeType, typesOf, type SpecCatalog } from "./engine"

type Labels = { types: Record<string, string>; fields: Record<string, string>; options: Record<string, Record<string, string>> }

function checkCatalog<C extends string>(cat: SpecCatalog<C>, categories: readonly C[], labels: Labels) {
  for (const c of categories) expect(cat.types[c], c).toBeDefined()
  const seen = new Set<string>()
  for (const c of categories)
    for (const type of typesOf(cat, c)) {
      expect(seen.has(type), `type ${type} in two categories`).toBe(false)
      seen.add(type)
      expect(labels.types[type], `label of type ${type}`).toBeTruthy()
      for (const key of cat.types[c][type]) {
        const f = cat.fields[key]
        expect(f, `field ${key}`).toBeDefined()
        expect(labels.fields[key], `label of field ${key}`).toBeTruthy()
        if (f.kind === "pick") for (const o of f.options) expect(labels.options[key]?.[o], `label of ${key}.${o}`).toBeTruthy()
      }
    }
}

describe("product types and characteristics (hard-coded menus)", () => {
  it("materials: every category has its types, every type and option has a label", () => {
    checkCatalog(MATERIAL_SPECS, CATEGORIES, mat.materiales.specs as unknown as Labels)
    for (const c of CATEGORIES) expect((mat.materiales.categories as Record<string, string>)[c], c).toBeTruthy()
    for (const c of CATEGORIES) expect((tools.herramientas.parts.categories as Record<string, string>)[c], c).toBeTruthy()
  })
  it("tools: every category has its types, every type and option has a label", () => {
    checkCatalog(TOOL_SPECS, TOOL_CATEGORIES, tools.herramientas.specs as unknown as Labels)
  })
  it("keeps only the type's fields with allowed values; a type from another category is dropped", () => {
    expect(decodeType(MATERIAL_SPECS, "cajas", "nap")).toBe("nap")
    expect(decodeType(MATERIAL_SPECS, "splitters", "nap")).toBe("")
    expect(decodeType(MATERIAL_SPECS, "cajas", "toString")).toBe("")
    expect(decodeSpecs(MATERIAL_SPECS, "cajas", "nap", { ports: 16, ip: "ip68", ratio: "1x8", splices: 2.5, mount: "luna" })).toEqual({ ports: 16, ip: "ip68" })
    expect(decodeSpecs(MATERIAL_SPECS, "cajas", "", { ports: 16 })).toEqual({})
  })
  it("items, tools and buying options keep their type through a save", () => {
    const it = decodeItem(JSON.parse(JSON.stringify(newItem({ name: "NAP", category: "cajas", ptype: "nap", traits: { ports: 16, splitterIncluded: "si" } }))))!
    expect(it).toMatchObject({ ptype: "nap", traits: { ports: 16, splitterIncluded: "si" } })
    expect(decodeItem({ name: "viejo", category: "otros" })).toMatchObject({ ptype: "", traits: {} })
    expect(decodeTool({ id: "tool-000001", name: "F", category: "empalme", ptype: "fusionadora", traits: { alignment: "nucleo", motors: 6 } })).toMatchObject({ ptype: "fusionadora", traits: { alignment: "nucleo", motors: 6 } })
    expect(decodeToolBuy({ need: "OTDR", category: "medicion", ptype: "otdr", traits: { wavelengths: "1310-1550" } })).toMatchObject({ ptype: "otdr", traits: { wavelengths: "1310-1550" } })
  })
  it("a bought option gives its type to the tool", () => {
    const opt = newToolBuy({ need: "Fusionadora de fibra óptica", category: "empalme", ptype: "fusionadora", traits: { alignment: "nucleo" } })
    const r = buyIntoTools(opt, starterTools(), "2026-11-19")
    expect(r.tool).toMatchObject({ ptype: "fusionadora", traits: { alignment: "nucleo" } })
  })
})

describe("starter lists come typed", () => {
  it("every starter tool has a valid type; typed starter materials decode unchanged", () => {
    for (const t of starterTools()) {
      expect(t.ptype, t.name).not.toBe("")
      expect(decodeType(TOOL_SPECS, t.category, t.ptype), t.name).toBe(t.ptype)
      expect(decodeSpecs(TOOL_SPECS, t.category, t.ptype, t.traits), t.name).toEqual(t.traits)
    }
    for (const it of starterCatalog().filter((x) => x.ptype)) {
      expect(decodeType(MATERIAL_SPECS, it.category, it.ptype), it.name).toBe(it.ptype)
      expect(decodeSpecs(MATERIAL_SPECS, it.category, it.ptype, it.traits), it.name).toEqual(it.traits)
    }
  })
})

describe("starters saved before types existed", () => {
  it("get the starter's type when their name and category are unchanged; renamed or already typed ones stay as they are", () => {
    const tool = starterTools().find((x) => x.ptype === "fusionadora")!
    const old = { ...tool, ptype: "", traits: {}, quantity: 2, brand: "Signal Fire" }
    expect(typeOldTool(old)).toMatchObject({ ptype: "fusionadora", quantity: 2, brand: "Signal Fire" })
    expect(typeOldTool({ ...old, name: "Mi fusionadora" }).ptype).toBe("")
    expect(typeOldTool({ ...old, ptype: "cortadora" }).ptype).toBe("cortadora")
    const peladora = starterTools().find((x) => x.ptype === "peladora-fibra")!
    expect(typeOldTool({ ...peladora, ptype: "", traits: {} }).traits).toEqual({ stripperHoles: 3 })
    const plc = starterCatalog().find((x) => x.ptype === "plc")!
    expect(typeOldItem({ ...plc, ptype: "", traits: {} })).toMatchObject({ ptype: "plc", traits: plc.traits })
    expect(typeOldItem({ ...plc, ptype: "", traits: {}, category: "otros" }).ptype).toBe("")
    expect(typeOldItem(newItem({ name: plc.name, category: "splitters" })).ptype).toBe("")
  })
})
