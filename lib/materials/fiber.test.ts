import { describe, expect, it } from "vitest"
import messages from "../../messages/internal/materiales.es.json"
import { decodeItem, newItem } from "./catalog"
import { CABLE_TYPES, FIBER_BUILDS, FIBER_GRADES, FIBER_JACKETS, FIBER_MODES, FIBER_PLACES, FIBER_STRENGTH, decodeFiber, emptyFiber, gradesFor, hasFiber, setFiber } from "./fiber"

describe("fiber and cable type", () => {
  it("decodes anything, keeping only known values; a grade sets its mode", () => {
    for (const v of [null, 1, "x", [], {}]) expect(decodeFiber(v)).toEqual(emptyFiber())
    expect(decodeFiber({ mode: "mm", grade: "g657a2", cable: "drop-plano", place: "exterior", strands: 1, jacket: "lszh" })).toMatchObject({ mode: "sm", grade: "g657a2", cable: "drop-plano", place: "exterior", strands: 1, jacket: "lszh" })
    expect(decodeFiber({ cable: "nope", strands: 0.5, place: "luna" })).toEqual(emptyFiber())
  })
  it("items saved before keep working with an empty spec; the spec survives a save", () => {
    expect(decodeItem({ name: "Drop" })!.fiber).toEqual(emptyFiber())
    const it = newItem({ name: "Drop", category: "fibra", fiber: { ...emptyFiber(), mode: "sm", cable: "drop-plano" } })
    expect(decodeItem(JSON.parse(JSON.stringify(it)))!.fiber).toMatchObject({ mode: "sm", cable: "drop-plano" })
    expect(hasFiber(it.fiber)).toBe(true)
    expect(hasFiber(emptyFiber())).toBe(false)
  })
  it("mode and grade stay consistent", () => {
    expect(gradesFor("sm")).not.toContain("om3")
    expect(gradesFor("mm")).toEqual(["om1", "om2", "om3", "om4", "om5"])
    const sm = setFiber(emptyFiber(), { grade: "g652d" })
    expect(sm.mode).toBe("sm")
    expect(setFiber(sm, { mode: "mm" }).grade).toBe("")
    expect(setFiber(sm, { mode: "sm" }).grade).toBe("g652d")
  })
  it("every menu option has its Spanish label", () => {
    const f = messages.materiales.fiber as unknown as Record<string, Record<string, string> | undefined>
    const groups: [string, readonly string[]][] = [["modes", FIBER_MODES], ["grades", FIBER_GRADES], ["cables", CABLE_TYPES], ["places", FIBER_PLACES], ["builds", FIBER_BUILDS], ["jackets", FIBER_JACKETS], ["strengths", FIBER_STRENGTH]]
    for (const [g, list] of groups) for (const v of list) expect(f[g]?.[v], `${g}.${v}`).toBeTruthy()
  })
})
