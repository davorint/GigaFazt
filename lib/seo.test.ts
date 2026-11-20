import { describe, expect, it } from "vitest"
import robots from "../app/robots"
import sitemap from "../app/sitemap"
import { INTERNAL_HEADERS, matchInternal } from "./internal-pages"

describe("indexing: public pages in, /interno out", () => {
  const urls = sitemap().map((x) => x.url)
  it("the sitemap lists the public pages in both languages and nothing internal", () => {
    for (const p of ["/es", "/en", "/es/planes", "/en/empresas", "/es/clientes", "/es/aviso-de-privacidad"]) {
      expect(urls.some((u) => u.endsWith(p)), p).toBe(true)
    }
    expect(urls.filter((u) => /interno|mikrotik|\/api\//i.test(u))).toEqual([])
  })
  it("robots.txt lets crawlers in (so they see the noindex on /interno) and keeps them off the API", () => {
    const r = robots()
    const rules = Array.isArray(r.rules) ? r.rules[0] : r.rules
    expect(rules.allow).toBe("/")
    expect(rules.disallow).toBe("/api/")
    expect(r.sitemap).toMatch(/\/sitemap\.xml$/)
  })
  it("every /interno URL, in any spelling, gets the noindex header", () => {
    expect(INTERNAL_HEADERS["X-Robots-Tag"]).toMatch(/noindex/)
    for (const p of ["/interno", "/en/interno", "/INTERNO/Admin/Proveedores", "/es/interno/entrar", "/interno/equipos-telecom/olt-huawei"]) {
      expect(matchInternal(p), p).not.toBeNull()
    }
  })
})
