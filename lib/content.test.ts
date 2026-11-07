import { describe, expect, it } from "vitest"
import { telHref, whatsappHref } from "./contact"
import { hasUptime, uptimeAverage, uptimeLevel } from "./status"
import { alternatesFor, localizedPath } from "./site"
import { faqItems, isAnswered, tvFaqArgs } from "./faq"
import { placeholder } from "./placeholder"

describe("contact links", () => {
  it("builds a wa.me link with digits only and an encoded message", () => {
    expect(whatsappHref("+52 55 1234 5678", "Hola, 1 Gbps & TV")).toBe(
      "https://wa.me/525512345678?text=Hola%2C%201%20Gbps%20%26%20TV"
    )
    expect(whatsappHref("55-1234-5678")).toBe("https://wa.me/5512345678")
  })
  it("builds tel links keeping a leading +", () => {
    expect(telHref("+52 (55) 1234-5678")).toBe("tel:+525512345678")
    expect(telHref("55 1234 5678")).toBe("tel:5512345678")
  })
})

describe("status helpers", () => {
  it("classifies daily uptime", () => {
    expect(uptimeLevel(1)).toBe("ok")
    expect(uptimeLevel(0.9995)).toBe("ok")
    expect(uptimeLevel(0.995)).toBe("warn")
    expect(uptimeLevel(0.9)).toBe("down")
  })
  it("averages valid days only", () => {
    expect(uptimeAverage([])).toBeNull()
    expect(uptimeAverage([1, 0.98, Number.NaN, 2])).toBeCloseTo(0.99)
  })
  it("hides unknown or empty status (hard rule #3)", () => {
    expect(hasUptime(null)).toBe(false)
    expect(hasUptime({ status: "unknown", uptime90d: [1] })).toBe(false)
    expect(hasUptime({ status: "operational", uptime90d: [] })).toBe(false)
    expect(hasUptime({ status: "operational", uptime90d: [1, 1] })).toBe(true)
  })
})

describe("site urls", () => {
  it("localizes paths", () => {
    expect(localizedPath("es", "/")).toBe("/es")
    expect(localizedPath("en", "/planes")).toBe("/en/planes")
  })
  it("emits canonical + hreflang + x-default", () => {
    expect(alternatesFor("en", "/cobertura/cdmx")).toEqual({
      canonical: "/en/cobertura/cdmx",
      languages: {
        "es-MX": "/es/cobertura/cdmx",
        en: "/en/cobertura/cdmx",
        "x-default": "/es/cobertura/cdmx",
      },
    })
  })
})

describe("faq", () => {
  it("only marks items answered when no fact is a placeholder", () => {
    expect(isAnswered({ id: "speed", facts: [] })).toBe(true)
    expect(
      isAnswered({ id: "router", facts: [{ label: "router", value: placeholder("ROUTER") }] })
    ).toBe(false)
    expect(isAnswered({ id: "router", facts: [{ label: "router", value: "Wi-Fi 6" }] })).toBe(true)
  })
  it("has unique ids and real TV contents", () => {
    expect(new Set(faqItems.map((f) => f.id)).size).toBe(faqItems.length)
    expect(tvFaqArgs()).toEqual({ channels: 350, movies: 3000, series: 600 })
  })
})
