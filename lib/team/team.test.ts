import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
const { cleanName, hashPassword, sessionCurrent, verifyPassword } = await import("./server")

describe("team accounts", () => {
  it("a password is stored as a salted PBKDF2 hash and only the right one matches", async () => {
    const h = await hashPassword("una frase larga de prueba")
    expect(h).toMatch(/^pbkdf2-sha256:600000:[\w-]+:[\w-]+$/)
    expect(h).not.toContain("frase")
    expect(await verifyPassword("una frase larga de prueba", h)).toBe(true)
    expect(await verifyPassword("una frase larga de prueba!", h)).toBe(false)
    expect(await hashPassword("una frase larga de prueba")).not.toBe(h)
    expect(await verifyPassword("x", "basura")).toBe(false)
  }, 20000)
  it("names are trimmed with single spaces", () => {
    expect(cleanName("  Luis   Pérez ")).toBe("Luis Pérez")
  })
  it("a password change ends the sessions signed in before it (a reset locks out a lost phone)", () => {
    const m = { id: "m-0001", name: "Luis", admin: false, role: "oficina" as const, active: true, createdAt: "2026-11-01T00:00:00Z", passwordChangedAt: "" }
    expect(sessionCurrent(m, Date.parse("2026-11-02T00:00:00Z"))).toBe(true)
    const reset = { ...m, passwordChangedAt: "2026-11-20T12:00:00.000Z" }
    expect(sessionCurrent(reset, Date.parse("2026-11-19T09:00:00Z"))).toBe(false)
    expect(sessionCurrent(reset, Date.parse("2026-11-20T12:00:03Z"))).toBe(true)
    // A few seconds of clock difference between the server and the database don't end the new session.
    expect(sessionCurrent(reset, Date.parse("2026-11-20T11:59:57Z"))).toBe(true)
  })
})
