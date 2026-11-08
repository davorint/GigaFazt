import { describe, expect, it } from "vitest"
import es from "../messages/es.json"
import en from "../messages/en.json"
import { FLOORS, fiberRun, kindCounts, roomKey } from "./floors"

const roomOf = (plan: (typeof FLOORS)[keyof typeof FLOORS], room: string) =>
  plan.rooms.find((r) => (r.n ? `${r.id}-${r.n}` : r.id) === room)

describe("floor lab plans", () => {
  for (const plan of Object.values(FLOORS)) {
    it(`${plan.space}: every point sits inside its room, ids are unique`, () => {
      const ids = new Set<string>()
      for (const e of [...plan.elements, { id: "closet", ...plan.closet }]) {
        expect(ids.has(e.id)).toBe(false)
        ids.add(e.id)
        const r = roomOf(plan, e.room)
        expect(r, `${e.id} → ${e.room}`).toBeDefined()
        expect(e.x).toBeGreaterThan(r!.x)
        expect(e.x).toBeLessThan(r!.x + r!.w)
        expect(e.y).toBeGreaterThan(r!.y)
        expect(e.y).toBeLessThan(r!.y + r!.h)
      }
    })

    it(`${plan.space}: the corridor runs between rooms, not through one`, () => {
      for (const r of plan.rooms) {
        expect(plan.corridorY <= r.y || plan.corridorY >= r.y + r.h).toBe(true)
      }
    })

    it(`${plan.space}: every room and kind has copy in both languages`, () => {
      for (const m of [es, en]) {
        const floor = m.business.floor as { rooms: Record<string, string>; kinds: Record<string, unknown> }
        for (const r of plan.rooms) expect(floor.rooms[r.id]).toBeTruthy()
        for (const k of Object.keys(kindCounts(plan))) expect(floor.kinds[k]).toBeTruthy()
      }
    })
  }

  it("runs go closet → corridor → point, orthogonally", () => {
    const plan = FLOORS.offices
    expect(fiberRun(plan, { x: 100, y: 400 })).toBe(`M${plan.closet.x} ${plan.closet.y} V${plan.corridorY} H100 V400`)
  })

  it("splits numbered rooms", () => {
    expect(roomKey("unit-3")).toEqual({ id: "unit", n: 3 })
    expect(roomKey("lobby")).toEqual({ id: "lobby" })
  })
})
