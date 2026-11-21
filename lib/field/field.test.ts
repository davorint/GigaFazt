import { describe, expect, it } from "vitest"
import { decodeAppointment } from "../agenda/model"
import { matchInternal } from "../internal-pages"
import { decodeReport } from "../reports/model"
import { decodeField, emptyField } from "./model"

describe("Field work (phase 5, Técnico)", () => {
  it("decodes what the technician recorded; junk is dropped, old records get an empty one", () => {
    const f = decodeField({ arrivedAt: "2026-11-21T15:00:00.000Z", lat: 18.92, lng: 999, doneAt: "ayer", signedBy: "  Ana López ", files: [{ id: "abc123def", kind: "firma", name: "firma.png" }, { id: "x", kind: "foto" }, "junk"], batch: "b-123456", notes: "ONT instalada" })
    expect(f).toEqual({ arrivedAt: "2026-11-21T15:00:00.000Z", lat: 18.92, lng: null, doneAt: "", signedBy: "Ana López", files: [{ id: "abc123def", kind: "firma", name: "firma.png" }], batch: "b-123456", notes: "ONT instalada" })
    expect(decodeField(undefined)).toEqual(emptyField())
    expect(decodeAppointment({ id: "appt-000001", date: "2026-11-21" })?.field).toEqual(emptyField())
    expect(decodeReport({ id: "rep-0000001", field: { doneAt: "2026-11-21T16:00:00.000Z" } })?.field.doneAt).toBe("2026-11-21T16:00:00.000Z")
  })
  it("routes /interno/tecnico in any case", () => {
    expect(matchInternal("/Interno/Tecnico")).toEqual({ rewriteTo: "/es/interno/tecnico", open: false })
  })
})
