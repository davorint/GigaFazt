import { describe, expect, it } from "vitest"
import { addDays, byWhen, decodeAppointment, isOpenAppt, newAppointment, weekOf } from "./model"

describe("agenda", () => {
  it("the week is Monday to Sunday around any day", () => {
    expect(weekOf("2026-11-19")).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"])
    expect(weekOf("2026-11-22")[0]).toBe("2026-11-16")
    expect(weekOf("2026-11-23")[0]).toBe("2026-11-23")
    expect(addDays("2026-12-29", 7)).toBe("2027-01-05")
  })
  it("sorted by day and time, appointments without a time last in their day", () => {
    const xs = [{ date: "2026-11-20", time: "" }, { date: "2026-11-20", time: "09:00" }, { date: "2026-11-19", time: "17:30" }]
    expect([...xs].sort(byWhen)).toEqual([{ date: "2026-11-19", time: "17:30" }, { date: "2026-11-20", time: "09:00" }, { date: "2026-11-20", time: "" }])
  })
  it("decodes field by field and never throws", () => {
    const a = decodeAppointment({ ...newAppointment({ kind: "visita", date: "2026-11-20", time: "9:00", who: "Luis" }), status: "rara", leadId: "3f1c2a4e-1111-4222-8333-944455556666" })!
    expect(a).toMatchObject({ kind: "visita", date: "2026-11-20", time: "", who: "Luis", status: "pendiente", leadId: "3f1c2a4e-1111-4222-8333-944455556666" })
    expect(decodeAppointment(null)).toBeNull()
    expect(isOpenAppt({ status: "confirmada" })).toBe(true)
    expect(isOpenAppt({ status: "hecha" })).toBe(false)
  })
})
