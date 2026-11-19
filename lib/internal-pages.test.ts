import { pbkdf2Sync, randomBytes } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
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

// A throwaway password and secret set through the host variables, so the real ones never appear in the repository.
describe("/interno password", () => {
  const PASS = "clave-de-prueba-larga"
  const ITER = 100_000
  const hashOf = (pass: string, salt = randomBytes(16)) => `pbkdf2-sha256:${ITER}:${salt.toString("base64url")}:${pbkdf2Sync(pass, salt, ITER, 32, "sha256").toString("base64url")}`
  const HASH = hashOf(PASS)
  const SECRET = randomBytes(32).toString("base64url")
  let auth: typeof import("./internal-auth")
  beforeAll(async () => {
    vi.stubEnv("INTERNO_PASS_HASH", HASH)
    vi.stubEnv("INTERNO_SESSION_SECRET", SECRET)
    vi.resetModules()
    auth = await import("./internal-auth")
  })
  afterEach(() => {
    vi.stubEnv("INTERNO_PASS_HASH", HASH)
    vi.stubEnv("INTERNO_SESSION_SECRET", SECRET)
  })
  afterAll(() => {
    vi.unstubAllEnvs()
  })
  it("accepts the password and nothing else", async () => {
    expect(auth.authConfigured()).toBe(true)
    expect(await auth.passwordOk(PASS)).toBe(true)
    for (const p of ["", PASS.toUpperCase(), `${PASS} `, "otra"]) expect(await auth.passwordOk(p)).toBe(false)
  })
  it("without both host values (or with a weak hash) nobody signs in", async () => {
    const session = await auth.newSession()
    for (const [k, v] of [["INTERNO_PASS_HASH", ""], ["INTERNO_SESSION_SECRET", ""], ["INTERNO_SESSION_SECRET", "corto"], ["INTERNO_PASS_HASH", HASH.replace(`:${ITER}:`, ":1000:")], ["INTERNO_PASS_HASH", "764ebace7c0c2e46a186386509c724d3fe61d2b33804aa5b40c3b0391cca1307"]]) {
      vi.stubEnv(k, v)
      expect(auth.authConfigured()).toBe(false)
      expect(await auth.passwordOk(PASS)).toBe(false)
      expect(await auth.cookieOk(session)).toBe(false)
      await expect(auth.newSession()).rejects.toThrow()
      vi.stubEnv("INTERNO_PASS_HASH", HASH)
      vi.stubEnv("INTERNO_SESSION_SECRET", SECRET)
    }
  })
  it("a session is signed, random, expires, and doesn't come from the password", async () => {
    const now = Date.now()
    const a = await auth.newSession(now)
    const b = await auth.newSession(now)
    expect(a).not.toBe(b)
    expect(a).not.toContain(PASS)
    expect(await auth.cookieOk(a, now)).toBe(true)
    expect(await auth.cookieOk(a, now + (auth.AUTH_DAYS - 1) * 86_400_000)).toBe(true)
    expect(await auth.cookieOk(a, now + (auth.AUTH_DAYS * 86_400_000) + 1000)).toBe(false)
    const [exp, nonce, sig] = a.split(".")
    // A later expiry, another nonce or another signature: refused.
    expect(await auth.cookieOk(`${Number(exp) + 86_400}.${nonce}.${sig}`, now)).toBe(false)
    expect(await auth.cookieOk(`${exp}.${b.split(".")[1]}.${sig}`, now)).toBe(false)
    expect(await auth.cookieOk(`${exp}.${nonce}.${b.split(".")[2]}`, now)).toBe(false)
    for (const x of [undefined, "", "x", "1.2", "a.b.c", HASH, SECRET, `${a}.x`]) expect(await auth.cookieOk(x, now)).toBe(false)
  })
  it("a new password or a new secret signs everyone out", async () => {
    const s = await auth.newSession()
    vi.stubEnv("INTERNO_PASS_HASH", hashOf("otra-clave-larga-123"))
    expect(await auth.cookieOk(s)).toBe(false)
    vi.stubEnv("INTERNO_PASS_HASH", HASH)
    expect(await auth.cookieOk(s)).toBe(true)
    vi.stubEnv("INTERNO_SESSION_SECRET", randomBytes(32).toString("base64url"))
    expect(await auth.cookieOk(s)).toBe(false)
  })
  it("after signing in, only pages under /interno", () => {
    expect(auth.safeNext("/interno/olt")).toBe("/interno/olt")
    expect(auth.safeNext("/interno")).toBe("/interno")
    for (const x of ["https://evil.example", "//evil.example", "/es/planes", "/interno/../x", "/interno/olt?x", null]) expect(auth.safeNext(x)).toBe("/interno")
  })
})
