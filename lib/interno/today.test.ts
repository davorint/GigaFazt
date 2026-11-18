import { describe, expect, it } from "vitest"
import { newItem } from "../materials/catalog"
import { newNote } from "../notes/model"
import { newReport } from "../reports/model"
import { newMove } from "../stock/model"
import { newTool } from "../tools/model"
import { allClear, todaySummary, type TodayInput } from "./today"

const TODAY = "2026-11-18"
const NOW = Date.parse("2026-11-18T18:00:00Z")
const empty: TodayInput = { reports: [], clients: [], payments: [], tools: [], items: [], moves: [], units: [], notes: [] }

describe("today", () => {
  it("nothing to do on an empty base", () => {
    expect(allClear(todaySummary(empty, TODAY, NOW))).toBe(true)
  })
  it("reports: new ones oldest first, urgent/high, older than 48 h; closed ones don't count", () => {
    const reports = [
      newReport({ id: "rep-aaaa", status: "nuevo", name: "Ana", priority: "alta", createdAt: "2026-11-18T10:00:00Z" }),
      newReport({ id: "rep-bbbb", status: "nuevo", name: "Beto", priority: "normal", createdAt: "2026-11-15T10:00:00Z" }),
      newReport({ id: "rep-cccc", status: "en-proceso", priority: "urgente", createdAt: "2026-11-18T09:00:00Z" }),
      newReport({ id: "rep-dddd", status: "resuelto", priority: "urgente", createdAt: "2026-11-01T09:00:00Z" }),
    ]
    const r = todaySummary({ ...empty, reports }, TODAY, NOW).reports
    expect(r.fresh.map((x) => x.id)).toEqual(["rep-bbbb", "rep-aaaa"])
    expect(r.fresh[1].label).toMatch(/^R-REPAAA · Ana$/)
    expect([r.open, r.urgent, r.stale]).toEqual([3, 2, 1])
  })
  it("tools in use with alerts, the serious ones first; tools with no pieces are left out", () => {
    const tools = [
      newTool({ id: "tool-soon1", name: "Arnés", quantity: 1, serviceMonths: 12, purchaseDate: "2025-12-01" }),
      newTool({ id: "tool-late1", name: "OTDR", quantity: 1, serviceMonths: 12, purchaseDate: "2025-01-01" }),
      newTool({ id: "tool-zero1", name: "Cortadora", quantity: 0, condition: "danada" }),
    ]
    const t = todaySummary({ ...empty, tools }, TODAY, NOW).tools
    expect(t.map((x) => [x.id, x.alerts])).toEqual([
      ["tool-late1", ["service-overdue"]],
      ["tool-soon1", ["service-soon"]],
    ])
  })
  it("stock under the warehouse minimum, and open pinned notes", () => {
    const items = [newItem({ id: "item-conn", name: "Conector SC/APC", minStock: 50, unit: "pza" }), newItem({ id: "item-drop", name: "Drop", minStock: null })]
    const moves = [newMove({ kind: "compra", itemId: "item-conn", qty: 20, to: "bodega", date: "2026-11-01" })]
    const notes = [newNote({ id: "note-pin1", title: "Pagar carrier", pinned: true }), newNote({ id: "note-pin2", title: "Hecha", pinned: true, doneAt: "2026-11-17T00:00:00Z" })]
    const s = todaySummary({ ...empty, items, moves, notes }, TODAY, NOW)
    expect(s.lowStock).toEqual([{ id: "item-conn", name: "Conector SC/APC", has: 20, min: 50, unit: "pza" }])
    expect(s.pinned).toEqual([{ id: "note-pin1", title: "Pagar carrier" }])
    expect(allClear(s)).toBe(false)
  })
})
