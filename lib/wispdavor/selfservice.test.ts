import { describe, expect, it } from "vitest"
import { DEFAULT_NOTICES, decodeNotices, payBy, portalPriority, reminderRef, reminderToday, reportRef } from "./selfservice"
import { TEMPLATES, fill } from "./whatsapp"

describe("Phase 9: automatic notices", () => {
  it("off by default; bad values fall back; the notice never comes before the reminder", () => {
    expect(decodeNotices(undefined)).toEqual(DEFAULT_NOTICES)
    expect(decodeNotices({ reminders: true, reminderDay: 0, noticeDay: 22 })).toMatchObject({ reminders: true, reminderDay: 3, noticeDay: 9 })
    expect(decodeNotices({ reminders: true, reminderDay: 7, noticeDay: 5 })).toMatchObject({ reminderDay: 7, noticeDay: 7 })
    expect(decodeNotices({ reminders: "yes" }).reminders).toBe(false)
  })
  it("which one goes today", () => {
    const on = { ...DEFAULT_NOTICES, reminders: true }
    expect(reminderToday("2026-12-03", on)).toBe("recordatorio")
    expect(reminderToday("2026-12-09", on)).toBe("corte")
    expect(reminderToday("2026-12-04", on)).toBeNull()
    expect(reminderToday("2026-12-03", DEFAULT_NOTICES)).toBeNull()
    expect(reminderToday("2026-12-05", { ...on, reminderDay: 5, noticeDay: 5 })).toBe("corte")
  })
  it("once a month, once per report status; the last day to pay", () => {
    expect(reminderRef("recordatorio", "2026-12-03")).toBe("rec-2026-12")
    expect(reminderRef("corte", "2026-12-09")).toBe("corte-2026-12")
    expect(reportRef("abc", "resuelto")).toBe("rep-abc-resuelto")
    expect(payBy("2026-12-03")).toBe("10 de diciembre")
  })
  it("portal faults: no service is high priority; the report template", () => {
    expect(portalPriority("sin-servicio")).toBe("alta")
    expect(portalPriority("wifi")).toBe("normal")
    expect(TEMPLATES.reporte.params).toHaveLength(4)
    expect(fill("reporte", ["Ana", "R-1A2B", "resuelto", "https://x"])).toBe("Hola Ana, tu reporte R-1A2B de GigaFazt ahora está: resuelto. Consulta los detalles aquí: https://x")
  })
})
