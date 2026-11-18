import { createHash } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { matchInternal } from "./internal-pages"

describe("/interno routes", () => {
  it("everything under /interno, served from the Spanish route", () => {
    expect(matchInternal("/interno")).toEqual({ rewriteTo: "/es/interno", open: false })
    expect(matchInternal("/interno/mikrotik")).toEqual({ rewriteTo: "/es/interno/mikrotik", open: false })
    expect(matchInternal("/interno/mikrotik-optimo")).toEqual({ rewriteTo: "/es/interno/mikrotik-optimo", open: false })
    expect(matchInternal("/interno/calculadora")).toEqual({ rewriteTo: "/es/interno/calculadora", open: false })
    expect(matchInternal("/interno/olt.rsc")).toEqual({ rewriteTo: "/es/interno/olt.rsc", open: false })
    expect(matchInternal("/interno.rsc")).toEqual({ rewriteTo: "/es/interno.rsc", open: false })
    expect(matchInternal("/es/interno/olt")).toEqual({ rewriteTo: null, open: false })
    expect(matchInternal("/en/interno/olt")).toEqual({ rewriteTo: null, open: false })
  })
  it("any capitalization, and the -optimal spelling", () => {
    expect(matchInternal("/INTERNO/MikroTik")).toEqual({ rewriteTo: "/es/interno/mikrotik", open: false })
    expect(matchInternal("/ES/Interno/OLT")).toEqual({ rewriteTo: "/es/interno/olt", open: false })
    expect(matchInternal("/interno/MIKROTIK-OPTIMAL")).toEqual({ rewriteTo: "/es/interno/mikrotik-optimo", open: false })
  })
  it("admin pages and their other spellings", () => {
    expect(matchInternal("/interno/admin/notas")).toEqual({ rewriteTo: "/es/interno/admin/notas", open: false })
    expect(matchInternal("/Interno/Admin/Post-It")).toEqual({ rewriteTo: "/es/interno/admin/notas", open: false })
    expect(matchInternal("/es/interno/admin/notes")).toEqual({ rewriteTo: "/es/interno/admin/notas", open: false })
  })
  it("only the sign-in page is open", () => {
    expect(matchInternal("/interno/entrar")?.open).toBe(true)
    expect(matchInternal("/Interno/Entrar.rsc")).toEqual({ rewriteTo: "/es/interno/entrar.rsc", open: true })
    expect(matchInternal("/interno/otra")?.open).toBe(false)
  })
  it("the old addresses are not internal pages any more", () => {
    expect(["/mikrotik", "/mikrotik-optimo", "/calculadora", "/olt", "/es/mikrotik", "/es/olt", "/internos", "/x/interno", "/es/planes"].map(matchInternal)).toEqual(Array(9).fill(null))
  })
})

// A throwaway password set through the host variables, so the real one never appears in the repository.
describe("/interno password", () => {
  const sha = (s: string) => createHash("sha256").update(s).digest("hex")
  const PASS = "clave-de-prueba"
  let auth: typeof import("./internal-auth")
  beforeAll(async () => {
    vi.stubEnv("INTERNO_PASS_SHA256", sha(`login|${PASS}`))
    vi.stubEnv("INTERNO_COOKIE_SHA256", sha(sha(`cookie|${PASS}`)))
    vi.resetModules()
    auth = await import("./internal-auth")
  })
  afterAll(() => {
    vi.unstubAllEnvs()
  })
  it("accepts the password and nothing else", async () => {
    expect(await auth.passwordOk(PASS)).toBe(true)
    for (const p of ["", PASS.toUpperCase(), `${PASS} `, "otra"]) expect(await auth.passwordOk(p)).toBe(false)
  })
  it("the session cookie comes only from the password, and the stored hashes don't give it", async () => {
    const c = await auth.cookieFor(PASS)
    expect(c).toBe(sha(`cookie|${PASS}`))
    expect(await auth.cookieOk(c)).toBe(true)
    expect(await auth.cookieOk(sha(`login|${PASS}`))).toBe(false)
    expect(await auth.cookieOk(sha(sha(`cookie|${PASS}`)))).toBe(false)
    expect(await auth.cookieOk(await auth.cookieFor("otra"))).toBe(false)
    expect(await auth.cookieOk(undefined)).toBe(false)
    expect(await auth.cookieOk("x")).toBe(false)
  })
  it("after signing in, only pages under /interno", () => {
    expect(auth.safeNext("/interno/olt")).toBe("/interno/olt")
    expect(auth.safeNext("/interno")).toBe("/interno")
    for (const x of ["https://evil.example", "//evil.example", "/es/planes", "/interno/../x", "/interno/olt?x", null]) expect(auth.safeNext(x)).toBe("/interno")
  })
})
