import { describe, expect, it } from "vitest"
import { newReport } from "../reports/model"
import { newTool } from "../tools/model"
import { digestText } from "./digest"
import { todaySummary, type TodayInput } from "./today"

const empty: TodayInput = { reports: [], clients: [], payments: [], tools: [], items: [], moves: [], units: [], notes: [] }
const TODAY = "2026-11-18"
const NOW = Date.parse("2026-11-18T18:00:00Z")

describe("daily summary text", () => {
  it("nothing to send when all is in order, or only minor tool reminders", () => {
    expect(digestText(todaySummary(empty, TODAY, NOW), TODAY, "https://x/interno")).toBeNull()
    const tools = [newTool({ name: "Arnés", quantity: 1, warrantyEnd: "2026-12-01" })]
    expect(digestText(todaySummary({ ...empty, tools }, TODAY, NOW), TODAY, "https://x/interno")).toBeNull()
  })
  it("lists the new reports and serious tools, with the link", () => {
    const reports = [newReport({ id: "rep-aaaa", status: "nuevo", name: "Ana", createdAt: "2026-11-18T10:00:00Z" })]
    const tools = [newTool({ name: "OTDR", quantity: 1, serviceMonths: 12, purchaseDate: "2025-01-01" })]
    const text = digestText(todaySummary({ ...empty, reports, tools }, TODAY, NOW), TODAY, "https://x/interno")!
    expect(text).toContain("Reportes abiertos: 1")
    expect(text).toContain("• R-REPAAA · Ana")
    expect(text).toContain("• OTDR: mantenimiento vencido")
    expect(text.endsWith("https://x/interno")).toBe(true)
  })
})
