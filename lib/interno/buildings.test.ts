import { describe, expect, it } from "vitest"
import { newClient, newService } from "../clients/model"
import { newReport } from "../reports/model"
import { newSite, newTower } from "../sites/model"
import { emptyTower, newSurvey } from "../survey/model"
import { buildSites, parseApartment, siteUnits, spread, tally, towerShape } from "./buildings"
import type { Leaf } from "./tablero2-x"

const TODAY = "2026-11-28"

describe("tower view: apartments", () => {
  it("reads apartments as people write them", () => {
    const p = (s: string) => parseApartment(s, 12)
    expect(p("302")).toEqual({ floor: 3, unit: 2 })
    expect(p("1203")).toEqual({ floor: 12, unit: 3 })
    expect(p("Depto. 3-02")).toEqual({ floor: 3, unit: 2 })
    expect(p("3B")).toEqual({ floor: 3, unit: 2 })
    expect(p("4 / 1")).toEqual({ floor: 4, unit: 1 })
    expect(p("PB")).toEqual({ floor: 1, unit: null })
    expect(p("pb-2")).toEqual({ floor: 1, unit: 2 })
    expect(p("PH")).toEqual({ floor: 12, unit: null })
    expect(p("Int. 0401")).toEqual({ floor: 4, unit: 1 })
    expect(p("")).toBeNull()
    expect(p("casa azul")).toBeNull()
    expect(p("7")).toBeNull()
  })

  it("spreads units over floors, the extra ones on top", () => {
    expect(spread(10, 3)).toEqual([3, 3, 4])
    expect(spread(9, 3)).toEqual([3, 3, 3])
    expect(spread(5, 0)).toEqual([])
  })

  it("floors from the survey when it counted them, else from the deployment, else estimated", () => {
    const floor = (level: number, units: number) => ({ level, units, farthestM: null, conduit: "" as const, boxSpot: "", notes: "" })
    const sv = { ...emptyTower("A"), floorsAbove: 3, floorsBelow: 1, floors: [floor(-1, 0), floor(0, 2), floor(1, 4), floor(2, 4)] }
    expect(towerShape(newTower({ apartments: 10, floors: 9 }), sv)).toEqual({ perFloor: [2, 4, 4], basements: 1, source: "levantamiento" })
    expect(towerShape(newTower({}), sv).source).toBe("levantamiento")
    // Edited in Despliegues after the survey: the deployment's numbers win.
    expect(towerShape(newTower({ apartments: 12, floors: 3 }), sv)).toEqual({ perFloor: [4, 4, 4], basements: 0, source: "despliegue" })
    expect(towerShape(newTower({ apartments: 10, floors: 3 }), undefined)).toEqual({ perFloor: [3, 3, 4], basements: 0, source: "despliegue" })
    expect(towerShape(newTower({ apartments: 10 }), undefined).source).toBe("estimado")
    expect(towerShape(newTower({}), undefined).perFloor).toEqual([])
  })

  it("puts clients in their apartment, else their floor, else anywhere free; extra clients counted", () => {
    const t = newTower({ id: "t1", name: "A", apartments: 4, floors: 2 })
    const site = newSite({ id: "s1", name: "Norte", towers: [t] })
    const live = (id: string, apartment: string) => newClient({ id, siteId: "s1", apartment, services: [newService("internet", { status: "activo", plan: "500M", monthly: 496, start: "2026-01-05", rxDbm: -27.5 })] })
    const clients = [live("a", "201"), live("b", "201"), live("c", "2-02"), live("d", "nada"), live("e", "101"), newClient({ id: "gone", siteId: "s1", apartment: "102" })]
    const leaves = new Map<string, Leaf>(["a", "b", "c", "d", "e"].map((id, i) => [id, { id, value: 496, tone: i === 0 ? "atrasado" : "al-corriente", place: "", plan: "500M" }]))
    const reports = [newReport({ clientId: "a", status: "nuevo", category: "lento", createdAt: "2026-11-27T10:00:00Z" }), newReport({ clientId: "a", status: "resuelto" })]
    const [s] = buildSites([site], [], clients, leaves, reports, TODAY)
    const at = (label: string) => siteUnits(s).find((u) => u.label === label)?.resident
    expect(at("201")).toMatchObject({ id: "a", exact: true, tone: "atrasado", reports: 1, lastReport: "lento", plans: ["500M"], rx: -27.5 })
    expect(at("202")).toMatchObject({ id: "c", exact: true })
    expect(at("101")).toMatchObject({ id: "e", exact: true })
    // b wanted 201 (taken, floor 2 full) and d wrote nothing: both in the one free apartment left → one too many.
    expect(at("102")).toMatchObject({ exact: false })
    expect(s).toMatchObject({ apartments: 4, residents: 4, overflow: 1, misplaced: 1 })
    const tl = tally(siteUnits(s))
    expect(tl).toMatchObject({ apartments: 4, residents: 4, value: 1984, paid: 1488 })
    expect(tl.byTone.atrasado).toEqual({ n: 1, value: 496 })
  })

  it("several towers: by the client's tower, the survey matched by name", () => {
    const site = newSite({ id: "s2", towers: [newTower({ id: "ta", name: "Torre A", apartments: 2, floors: 1 }), newTower({ id: "tb", name: "Torre B", apartments: 6, floors: 2 })] })
    const sv = { ...newSurvey("Torre B"), siteId: "s2" }
    sv.towers[0] = { ...sv.towers[0], floorsAbove: 2, floors: [0, 1].map((level) => ({ level, units: 3, farthestM: null, conduit: "", boxSpot: "", notes: "" })) as never }
    const c = newClient({ id: "x", siteId: "s2", towerId: "tb", apartment: "203", services: [newService("internet", { status: "activo", plan: "1G", monthly: 596, start: "2026-01-05" })] })
    const [s] = buildSites([site], [sv], [c], new Map([["x", { id: "x", value: 596, tone: "al-corriente", place: "", plan: "1G" } as Leaf]]), [], TODAY)
    expect(s.towers.map((t) => [t.name, t.source, t.apartments])).toEqual([["Torre A", "despliegue", 2], ["Torre B", "levantamiento", 6]])
    expect(s.towers[1].floors[1].units[2].resident?.id).toBe("x")
  })

  it("who wrote a floor gets a free apartment there before those who wrote nothing", () => {
    const site = newSite({ id: "s3", towers: [newTower({ id: "t", name: "A", apartments: 4, floors: 2 })] })
    const live = (id: string, apartment: string) => newClient({ id, siteId: "s3", apartment, services: [newService("internet", { status: "activo", plan: "200M", monthly: 396, start: "2026-01-05" })] })
    // "a" wrote nothing and sorts first; "b" wants 205 (no such unit) on floor 2.
    const clients = [live("a", ""), live("b", "205"), live("c", "201"), live("d", "101"), live("e", "102")]
    const leaves = new Map<string, Leaf>(clients.map((c) => [c.id, { id: c.id, value: 396, tone: "al-corriente", place: "", plan: "200M" }]))
    const [s] = buildSites([site], [], clients, leaves, [], TODAY)
    expect(siteUnits(s).find((u) => u.label === "202")?.resident?.id).toBe("b")
    expect(s.overflow).toBe(1)
  })
})
