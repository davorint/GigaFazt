import { describe, expect, it } from "vitest"
import { BODY_MAX, decodeNote, doneNotes, linkHref, matchNote, newNote, openNotes } from "./model"

describe("notes", () => {
  it("decodes field by field and never throws", () => {
    expect(decodeNote(null)).toBeNull()
    expect(decodeNote([])).toBeNull()
    const n = decodeNote({ id: "abcdef12", title: 5, body: "x".repeat(BODY_MAX + 10), color: "negro", pinned: "yes", doneAt: "nope", createdAt: "2026-11-18T10:00:00.000Z" })!
    expect(n).toMatchObject({ id: "abcdef12", title: "", color: "amarillo", pinned: false, doneAt: "", createdAt: "2026-11-18T10:00:00.000Z" })
    expect(n.body).toHaveLength(BODY_MAX)
    expect(decodeNote({ id: "bad id!" })!.id).not.toBe("bad id!")
  })
  it("open notes: pinned first, then newest; done notes apart, latest finished first", () => {
    const a = newNote({ id: "aaaaaa", createdAt: "2026-11-01T00:00:00Z" })
    const b = newNote({ id: "bbbbbb", createdAt: "2026-11-03T00:00:00Z" })
    const c = newNote({ id: "cccccc", createdAt: "2026-10-01T00:00:00Z", pinned: true })
    const d = newNote({ id: "dddddd", doneAt: "2026-11-05T00:00:00Z" })
    const e = newNote({ id: "eeeeee", doneAt: "2026-11-07T00:00:00Z" })
    expect(openNotes([a, b, c, d, e]).map((x) => x.id)).toEqual(["cccccc", "bbbbbb", "aaaaaa"])
    expect(doneNotes([a, d, e]).map((x) => x.id)).toEqual(["eeeeee", "dddddd"])
  })
  it("search ignores case and accents, every word must appear", () => {
    const n = newNote({ title: "Llamar a Telmex", body: "Revisar la ONT del depto 4B", by: "Andrés" })
    expect(matchNote(n, "telmex ont")).toBe(true)
    expect(matchNote(n, "ANDRES")).toBe(true)
    expect(matchNote(n, "telmex izzi")).toBe(false)
  })
})

describe("note links", () => {
  it("keeps a valid link, drops a bad one", () => {
    expect(decodeNote({ id: "abcdef12", linkKind: "site", linkId: "site-0001" })).toMatchObject({ linkKind: "site", linkId: "site-0001" })
    expect(decodeNote({ id: "abcdef12", linkKind: "planet", linkId: "site-0001" })).toMatchObject({ linkKind: "", linkId: "" })
    expect(decodeNote({ id: "abcdef12", linkKind: "client", linkId: "../x" })).toMatchObject({ linkKind: "", linkId: "" })
    expect(linkHref("report", "rep-1")).toBe("/interno/admin/reportes_clientes?r=rep-1")
  })
})
