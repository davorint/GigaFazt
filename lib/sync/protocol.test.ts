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
