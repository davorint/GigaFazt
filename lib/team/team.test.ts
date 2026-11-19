import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
const { cleanName, hashPassword, verifyPassword } = await import("./server")

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
})
