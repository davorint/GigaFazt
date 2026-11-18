import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
const { alertText, reportLink } = await import("./notify")
const { ipHash, clientIp } = await import("./limits")

describe("report alerts and flood control", () => {
  const a = { id: "abc123", code: "R-ABC123", category: "sin-servicio", priority: "alta", name: "Ana", phone: "5512345678", address: "Torre B 1204", description: "Luz roja", clientName: "Ana López", siteName: "Be Grand", sameSite: 2 }
  it("the alert says what, who, where, a possible outage, and links to the report", () => {
    const text = alertText(a)
    expect(text).toContain("R-ABC123")
    expect(text).toContain("No tiene internet")
    expect(text).toContain("Ana · 5512345678")
    expect(text).toContain("Cliente: Ana López (Be Grand)")
    expect(text).toContain("posible falla general")
    expect(text).toContain("Luz roja")
    expect(text.endsWith(reportLink("abc123"))).toBe(true)
    expect(reportLink("abc123")).toMatch(/\/es\/interno\/admin\/reportes_clientes\?r=abc123$/)
    const plain = alertText({ ...a, clientName: "", siteName: "", sameSite: 0, description: "" })
    expect(plain).toContain("No se encontró el cliente")
    expect(plain).not.toContain("falla general")
    expect(plain).not.toMatch(/\n\n\n/)
  })
  it("sender address: first forwarded entry, hashed per day, never stored as is", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "201.1.2.3, 10.0.0.1" }))).toBe("201.1.2.3")
    expect(clientIp(new Headers({ "x-real-ip": "201.1.2.4" }))).toBe("201.1.2.4")
    const h = ipHash("201.1.2.3", "2026-11-18")
    expect(h).toMatch(/^[0-9a-f]{32}$/)
    expect(h).not.toContain("201")
    expect(ipHash("201.1.2.3", "2026-11-19")).not.toBe(h)
  })
})
