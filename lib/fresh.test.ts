import { describe, expect, it } from "vitest"
import { dropUntouched, markFresh } from "./fresh"

describe("new records left blank", () => {
  it("removes a new record still as created (edit times aside), keeps an edited one and the one still open", () => {
    const a = { id: "nuevo-aaaa", name: "", updatedAt: "1" }
    const b = { id: "nuevo-bbbb", name: "", updatedAt: "1" }
    const c = { id: "nuevo-cccc", name: "", updatedAt: "1" }
    markFresh(a)
    markFresh(b)
    markFresh(c)
    const removed: string[] = []
    const list = [{ ...a, updatedAt: "2" }, { ...b, name: "Juan" }, c]
    dropUntouched(list, (id) => removed.push(id), c.id)
    expect(removed).toEqual([a.id])
    // Forgotten once checked: an edit later doesn't bring it back; the open one is checked when it closes.
    dropUntouched(list, (id) => removed.push(id))
    expect(removed).toEqual([a.id, c.id])
    dropUntouched(list, (id) => removed.push(id))
    expect(removed).toEqual([a.id, c.id])
  })
})
