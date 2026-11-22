import { describe, expect, it } from "vitest"
import { groupEntries, type Entry } from "./activity"

const e = (at: string, who: string, kind: string, what: string, label: string): Entry => ({ at: `2026-11-22T${at}:00.000Z`, who, kind, ref: label, what, label, detail: "" })

describe("Activity log groups", () => {
  it("runs of the same person, kind and change within 10 minutes are one row", () => {
    const g = groupEntries([
      e("12:30", "Ana", "materials", "new", "Cable"),
      e("12:28", "Ana", "materials", "new", "Conector"),
      e("12:21", "Ana", "materials", "new", "Roseta"),
      e("12:05", "Ana", "materials", "new", "Fusión"),
      e("12:04", "Luis", "materials", "new", "Caja"),
      e("12:03", "Luis", "router", "action", "Torre A"),
      e("12:02", "Luis", "router", "action", "Torre A"),
    ])
    expect(g.map((x) => [x.who, x.kind, x.n, x.labels.join("+")])).toEqual([
      ["Ana", "materials", 3, "Cable+Conector+Roseta"],
      ["Ana", "materials", 1, "Fusión"],
      ["Luis", "materials", 1, "Caja"],
      ["Luis", "router", 1, "Torre A"],
      ["Luis", "router", 1, "Torre A"],
    ])
    expect(g[0].first).toBe("2026-11-22T12:21:00.000Z")
  })
})
