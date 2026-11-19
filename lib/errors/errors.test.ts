import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
const { cleanPath, errorText, reportError } = await import("./server")

describe("error reporting", () => {
  it("keeps only the path (no query string or fragment) and builds a short alert", () => {
    expect(cleanPath("/interno/admin/clientes?c=cli-123&tab=payments#x")).toBe("/interno/admin/clientes")
    const text = errorText({ source: "client", message: "Cannot read properties of undefined", path: "/es/planes", digest: "123abc" })
    expect(text).toContain("Error en el navegador")
    expect(text).toContain("Página: /es/planes")
    expect(text).toContain("Ref: 123abc")
  })
  it("without an alert channel it is only logged", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    delete process.env.REPORT_TELEGRAM_BOT_TOKEN
    delete process.env.REPORT_WEBHOOK_URL
    expect(await reportError({ source: "server", message: "boom", path: "/x?secret=1" })).toBe("logged")
    expect(log.mock.calls[0][0]).toBe("[error:server] /x boom")
    log.mockRestore()
  })
})
