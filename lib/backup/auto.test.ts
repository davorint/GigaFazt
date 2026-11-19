import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("../sync/history", () => ({ fullBackup: async () => ({}) }))
const { toPrune, KEEP } = await import("./auto")

describe("weekly backup", () => {
  it("keeps the newest snapshots and never touches other branches", () => {
    const b = (id: string, name: string, at: string) => ({ id, name, created_at: at })
    const list = [b("m", "main", "2025-01-01"), b("d", "dev", "2026-01-01"), ...["01", "08", "15", "22", "29"].map((d, i) => b(`r${i}`, `respaldo-2026-10-${d}`, `2026-10-${d}T09:00:00Z`)), b("x", "respaldo-2026-11-05", "2026-11-05T09:00:00Z")]
    expect(KEEP).toBe(4)
    expect(toPrune(list).sort()).toEqual(["r0", "r1"])
  })
})
