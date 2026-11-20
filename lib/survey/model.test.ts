import { describe, expect, it } from "vitest"
import { SECTIONS, completeness, decodeSurvey, emptyTower, fillFloors, mergeSurveys, newSurvey, readSurveyFile, surveyFile, syncFloors, towerUnits, type Survey } from "./model"
import { matchInternal } from "../internal-pages"

const filled = (): Survey => {
  const s = newSurvey("Torre A", "2026-11-17T10:00:00.000Z")
  s.ident = { name: "Torre Norte", address: "Av. Siempre Viva 742", municipality: "Benito Juárez", state: "Ciudad de México", lat: 19.37, lng: -99.16, visitDate: "2026-11-17", surveyors: "Ana y Luis" }
  s.towers[0] = syncFloors({ ...s.towers[0], floorsAbove: 4, floorsBelow: 2 })
  s.contacts.push({ id: "contact-1", role: "administrador", name: "Rosa", phone: "5512345678", email: "", notes: "" })
  return s
}

describe("floors", () => {
  it("from the lowest basement to the top floor, ground floor = 0", () => {
    const t = syncFloors({ ...emptyTower("A"), floorsAbove: 4, floorsBelow: 2 })
    expect(t.floors.map((f) => f.level)).toEqual([-2, -1, 0, 1, 2, 3])
  })
  it("changing the counts keeps the floors already filled and drops the ones out of range", () => {
    let t = syncFloors({ ...emptyTower("A"), floorsAbove: 4, floorsBelow: 0 })
    t = { ...t, floors: t.floors.map((f) => (f.level === 2 ? { ...f, units: 6, farthestM: 18 } : f)) }
    const more = syncFloors({ ...t, floorsAbove: 10 })
    expect(more.floors).toHaveLength(10)
    expect(more.floors.find((f) => f.level === 2)).toMatchObject({ units: 6, farthestM: 18 })
    const fewer = syncFloors({ ...t, floorsAbove: 2 })
    expect(fewer.floors.map((f) => f.level)).toEqual([0, 1])
    expect(syncFloors({ ...t, floorsAbove: null }).floors).toEqual([])
  })
  it("copying a floor fills only the empty ones", () => {
    let t = syncFloors({ ...emptyTower("A"), floorsAbove: 4 })
    t = { ...t, floors: t.floors.map((f) => (f.level === 1 ? { ...f, units: 8, farthestM: 20, conduit: "si" as const } : f.level === 3 ? { ...f, units: 4 } : f)) }
    const out = fillFloors(t, t.floors[1])
    expect(out.floors.map((f) => f.units)).toEqual([8, 8, 8, 4])
    expect(towerUnits(out)).toBe(28)
  })
})

describe("reading stored and imported surveys", () => {
  it("a survey survives its own file", () => {
    const s = filled()
    expect(readSurveyFile(surveyFile([s]))).toEqual([s])
  })
  it("wrong types and unknown values fall back, extra fields are dropped, it never throws", () => {
    const raw = JSON.parse(JSON.stringify(filled())) as Record<string, unknown>
    raw.status = "hacked"
    raw.evil = "<script>"
    ;(raw.ident as Record<string, unknown>).lat = 400
    ;(raw.commercial as Record<string, unknown>).units = "muchos"
    ;(raw.room as Record<string, unknown>).ground = "maybe"
    const s = decodeSurvey(raw)!
    expect(s.status).toBe("draft")
    expect("evil" in s).toBe(false)
    expect(s.ident.lat).toBeNull()
    expect(s.commercial.units).toBeNull()
    expect(s.room.ground).toBe("")
    for (const bad of [null, 1, "x", [], {}, { id: "abc" }]) expect(decodeSurvey(bad)).toBeNull()
  })
  it("repeated floor levels keep one, in order", () => {
    const raw = JSON.parse(JSON.stringify(filled())) as Survey
    raw.towers[0].floors = [...raw.towers[0].floors].reverse().concat(raw.towers[0].floors[0])
    expect(decodeSurvey(raw)!.towers[0].floors.map((f) => f.level)).toEqual([-2, -1, 0, 1, 2, 3])
  })
  it("only our own files are read", () => {
    expect(readSurveyFile("nope")).toBeNull()
    expect(readSurveyFile(JSON.stringify({ type: "otra-cosa", surveys: [] }))).toBeNull()
  })
})

describe("importing", () => {
  it("adds new ones, replaces older copies, never undoes newer work", () => {
    const a = { ...filled(), id: "survey-a", updatedAt: "2026-11-17T10:00:00.000Z" }
    const b = { ...filled(), id: "survey-b", updatedAt: "2026-11-17T12:00:00.000Z" }
    const r = mergeSurveys([a, b], [
      { ...a, updatedAt: "2026-11-17T11:00:00.000Z", status: "done" },
      { ...b, updatedAt: "2026-11-17T09:00:00.000Z", status: "done" },
      { ...a, id: "survey-c" },
    ])
    expect([r.added, r.replaced, r.kept]).toEqual([1, 1, 1])
    expect(r.list.find((x) => x.id === "survey-a")?.status).toBe("done")
    expect(r.list.find((x) => x.id === "survey-b")?.status).toBe("draft")
  })
})

describe("completeness", () => {
  it("a new survey is mostly empty, the filled sections count", () => {
    const s = filled()
    expect(completeness(s, "ident")).toEqual({ done: 6, total: 6 })
    expect(completeness(newSurvey(), "ident").done).toBe(1) // only the visit date
    const c = completeness(s, "contacts")
    expect(c.done).toBe(1)
    for (const k of SECTIONS) expect(completeness(s, k).total).toBeGreaterThanOrEqual(0)
  })
})

describe("route", () => {
  it("/interno/levantamientos is an internal page", () => {
    expect(matchInternal("/interno/levantamientos")).toEqual({ rewriteTo: "/es/interno/levantamientos", open: false })
    expect(matchInternal("/INTERNO/Levantamientos")?.rewriteTo).toBe("/es/interno/levantamientos")
  })
})

describe("state and municipality menus (owner, 2026-11-20)", () => {
  it("lists CDMX's 16 alcaldías, Huixquilucan and Naucalpan, the Morelos towns; old surveys get their state", async () => {
    const { PLACES, municipalitiesOf, stateOf } = await import("./places")
    expect(PLACES["Ciudad de México"]).toHaveLength(16)
    expect(municipalitiesOf("Estado de México")).toEqual(["Huixquilucan", "Naucalpan de Juárez"])
    expect(municipalitiesOf("Jalisco")).toEqual([])
    expect(municipalitiesOf("")).toHaveLength(20)
    expect(stateOf("Coyoacán")).toBe("Ciudad de México")
    expect(stateOf("Metepec")).toBe("")
    const old = JSON.parse(JSON.stringify(newSurvey()))
    old.ident.municipality = "Huixquilucan"
    delete old.ident.state
    expect(decodeSurvey(old)!.ident.state).toBe("Estado de México")
    old.ident.state = "Querétaro"
    old.ident.municipality = "El Marqués"
    expect(decodeSurvey(old)!.ident).toMatchObject({ state: "Querétaro", municipality: "El Marqués" })
  })
})
