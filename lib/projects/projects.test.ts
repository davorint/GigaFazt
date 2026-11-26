import { describe, expect, it } from "vitest"
import { matchInternal } from "../internal-pages"
import { newItem, newOffer } from "../materials/catalog"
import { newBuyOffer, newToolBuy } from "../toolbuys/model"
import { decodeProject, fromKit, newLine, newProject, pushToBuys, resolveLine, totals } from "./model"

const splicer = newToolBuy({ need: "Fusionadora de fibra óptica", brand: "Signal Fire", model: "AI-30", status: "idea", offers: [newBuyOffer({ store: "Amazon MX", price: 23000 })] })
const stripper = newToolBuy({ need: "Pelacables redondo", brand: "Jonard", model: "CST-1900", status: "cotizado", offers: [newBuyOffer({ store: "B", price: 1340 }), newBuyOffer({ store: "A", price: 753 })] })
const bags = newToolBuy({ need: "Bolsas para polvo", status: "idea" })
const olt = newItem({ name: "OLT Huawei MA5800-X2", category: "equipo", offers: [newOffer({ supplier: "Alibaba", price: 50000 })] })
const refs = { buys: [splicer, stripper, bags], items: [olt] }

const kit = newProject({
  kind: "kit",
  name: "Kit base",
  lines: [
    newLine({ scope: "tecnico", ref: "herramienta", refId: splicer.id }),
    newLine({ scope: "tecnico", ref: "herramienta", refId: stripper.id, qty: 1 }),
    newLine({ scope: "tecnico", ref: "herramienta", refId: bags.id, qty: 2 }),
    newLine({ scope: "despliegue", ref: "material", refId: olt.id }),
  ],
})

describe("nuevos proyectos", () => {
  it("prices come from the option's or item's best offer; technician lines count once per technician", () => {
    const p = { ...fromKit(kit, { name: "Torre A" }), technicians: 2 }
    const rows = p.lines.map((l) => resolveLine(l, p.technicians, refs))
    expect(rows.map((r) => [r.name, r.unit, r.need, r.total])).toEqual([
      ["Signal Fire AI-30", 23000, 2, 46000],
      ["Jonard CST-1900", 753, 2, 1506],
      ["Bolsas para polvo", null, 4, null],
      ["OLT Huawei MA5800-X2", 50000, 1, 50000],
    ])
    expect(totals(rows)).toEqual({ total: 97506, toBuy: 97506, unpriced: 1, missingPieces: 9, perTechnician: 23753, deployment: 50000 })
  })
  it("a project copies the kit's lines with new ids and nothing in hand; what's in hand lowers what to buy", () => {
    const p = fromKit(kit)
    expect(p.kind).toBe("proyecto")
    expect(p.kitId).toBe(kit.id)
    expect(p.lines.map((l) => l.refId)).toEqual(kit.lines.map((l) => l.refId))
    expect(p.lines.some((l, i) => l.id === kit.lines[i].id)).toBe(false)
    const got = { ...p, lines: p.lines.map((l, i) => (i === 0 ? { ...l, have: 1 } : l)) }
    const t = totals(got.lines.map((l) => resolveLine(l, got.technicians, refs)))
    expect(t.toBuy).toBe(50753)
  })
  it("a line whose record is gone shows as not found, without a price", () => {
    const r = resolveLine(newLine({ refId: "borrado-123" }), 1, refs)
    expect([r.found, r.unit, r.total]).toEqual([false, null, null])
  })
  it("pasar a compras: open options grow to what's missing (never shrink), idea → cotizado with a price; bought ones get a new copy", () => {
    const bought = { ...stripper, status: "comprado" as const, toolId: "tool-123456", quantity: 1 }
    const p = { ...fromKit(kit), technicians: 3 }
    const out = pushToBuys(p, [{ ...splicer, quantity: 5 }, bought, bags], "Ana")
    const s = out.find((x) => x.id === splicer.id)!
    expect([s.quantity, s.status]).toEqual([5, "cotizado"])
    const copy = out.find((x) => x.need === stripper.need)!
    expect(copy.id).not.toBe(stripper.id)
    expect([copy.quantity, copy.status, copy.toolId, copy.offers.length, copy.by]).toEqual([3, "cotizado", "", 2, "Ana"])
    const b = out.find((x) => x.id === bags.id)!
    expect([b.quantity, b.status]).toEqual([6, "idea"])
    // Everything in hand: nothing to push.
    const full = { ...p, lines: p.lines.map((l) => ({ ...l, have: 100 })) }
    expect(pushToBuys(full, refs.buys, "Ana")).toEqual([])
  })
  it("decodes stored values field by field and never throws", () => {
    expect(decodeProject(null)).toBeNull()
    const d = decodeProject({ id: "proj-123456", kind: "raro", technicians: 0, start: "mañana", lines: [{ refId: "x" }, { refId: "ok-123456", qty: -1, scope: "despliegue" }, 4] })!
    expect([d.kind, d.technicians, d.start, d.lines.length, d.lines[0].qty, d.lines[0].scope]).toEqual(["proyecto", 1, "", 1, 1, "despliegue"])
  })
  it("the page answers at /interno/nuevos_proyectos in any case and with a hyphen", () => {
    expect(matchInternal("/interno/nuevos_proyectos")).toEqual({ rewriteTo: "/es/interno/nuevos_proyectos", open: false })
    expect(matchInternal("/INTERNO/Nuevos_Proyectos")?.rewriteTo).toBe("/es/interno/nuevos_proyectos")
    expect(matchInternal("/interno/nuevos-proyectos")?.rewriteTo).toBe("/es/interno/nuevos_proyectos")
  })
})
