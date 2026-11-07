import { describe, expect, it } from "vitest"
import { prefersSpanishByCountry, visitorCountry } from "./geo-locale"

describe("geo-locale", () => {
  it("reads the country from host headers", () => {
    expect(visitorCountry(new Headers({ "x-vercel-ip-country": "mx" }))).toBe("MX")
    expect(visitorCountry(new Headers({ "cf-ipcountry": "AR" }))).toBe("AR")
    expect(visitorCountry(new Headers({ "cf-ipcountry": "XX1" }))).toBeNull()
    expect(visitorCountry(new Headers())).toBeNull()
  })
  it("prefers Spanish only for Spanish-speaking countries", () => {
    expect(prefersSpanishByCountry(new Headers({ "cf-ipcountry": "MX" }))).toBe(true)
    expect(prefersSpanishByCountry(new Headers({ "cf-ipcountry": "ES" }))).toBe(true)
    expect(prefersSpanishByCountry(new Headers({ "cf-ipcountry": "US" }))).toBe(false)
    expect(prefersSpanishByCountry(new Headers())).toBe(false)
  })
})
