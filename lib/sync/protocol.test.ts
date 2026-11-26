import { describe, expect, it } from "vitest"
import { kindsToSync, SYNC_KINDS, type SyncKind } from "./protocol"

const zero = Object.fromEntries(SYNC_KINDS.map((k) => [k, 0])) as Record<SyncKind, number>

describe("the quick sync check", () => {
  it("syncs the kinds that moved on the server and the ones with edits waiting, nothing else", () => {
    const local = { ...zero, clients: 40, payments: 55, reports: 60 }
    expect(kindsToSync({ ...local, payments: 70 }, local, new Set())).toEqual(["payments"])
    expect(kindsToSync(local, local, new Set(["notes"]))).toEqual(["notes"])
    expect(kindsToSync(local, local, new Set())).toEqual([])
  })

  it("a new browser (revision 0 everywhere) pulls every kind that has records", () => {
    expect(kindsToSync({ ...zero, clients: 3, sites: 9 }, zero, new Set())).toEqual(["clients", "sites"])
  })

  it("a kind the server leaves out (this role can't reach it) is skipped unless it has edits waiting", () => {
    expect(kindsToSync({ clients: 99 }, zero, new Set())).toEqual(["clients"])
    expect(kindsToSync({ clients: 0 }, zero, new Set(["porpagar"]))).toEqual(["porpagar"])
  })
})

describe("what schedules a sync", () => {
  it("only a new edit raises the count; a sync's own writes and a refused record don't", async () => {
    const { dirtyTotal } = await import("./state")
    const state = (meta: Partial<Record<SyncKind, Record<string, { v: number | null; dirty: number; at: string }>>>) => ({ name: "Ana", adopted: true, rev: zero, meta: { ...(Object.fromEntries(SYNC_KINDS.map((k) => [k, {}])) as Record<SyncKind, Record<string, { v: number | null; dirty: number; at: string }>>), ...meta } })
    const refused = { v: 3, dirty: 1, at: "2026-11-26T10:00:00Z" }
    const before = dirtyTotal(state({ clients: { a: refused } }))
    // The sync wrote its revisions; the refused record is still there, unchanged: nothing new to send.
    expect(dirtyTotal({ ...state({ clients: { a: refused } }), rev: { ...zero, clients: 99 } })).toBe(before)
    // A new edit on it, or on another record: the count grows.
    expect(dirtyTotal(state({ clients: { a: { ...refused, dirty: 2 } } }))).toBeGreaterThan(before)
    expect(dirtyTotal(state({ clients: { a: refused }, notes: { n: { v: null, dirty: 1, at: "" } } }))).toBeGreaterThan(before)
    // Sent: back to 0.
    expect(dirtyTotal(state({ clients: { a: { ...refused, dirty: 0 } } }))).toBe(0)
  })
})
