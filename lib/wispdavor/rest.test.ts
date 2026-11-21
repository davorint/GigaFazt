import { describe, expect, it } from "vitest"
import { EXPORT_SCRIPT, isReadRequest, normalizeFingerprint, safePath, setupCommands, validHost } from "./rest"

describe("REST: what counts as reading (read-only mode)", () => {
  it("GET, print and monitor-traffic read; the exact export reads; anything else writes", () => {
    expect(isReadRequest("GET", "/ppp/secret")).toBe(true)
    expect(isReadRequest("POST", "/interface/print")).toBe(true)
    expect(isReadRequest("POST", "/interface/monitor-traffic", { interface: "ether1", once: "" })).toBe(true)
    expect(isReadRequest("POST", "/execute", { script: EXPORT_SCRIPT })).toBe(true)
    expect(isReadRequest("POST", "/execute", { script: "/system reboot" })).toBe(false)
    expect(isReadRequest("POST", "/system/reboot")).toBe(false)
    expect(isReadRequest("PATCH", "/ppp/secret/*1")).toBe(false)
    expect(isReadRequest("PUT", "/ppp/secret")).toBe(false)
    expect(isReadRequest("DELETE", "/ppp/active/*2")).toBe(false)
  })
  it("addresses, paths and certificate fingerprints are checked", () => {
    expect([validHost("edificio1.dynu.net"), validHost("10.0.0.1"), validHost("bad host"), validHost("x;rm")]).toEqual([true, true, false, false])
    expect([safePath("/ppp/secret/*1A"), safePath("/../etc"), safePath("/ppp secret")]).toEqual([true, false, false])
    const hex = "ab".repeat(32)
    expect(normalizeFingerprint("AB:".repeat(31) + "AB")).toBe(hex)
    expect(normalizeFingerprint(`sha256:${hex.toUpperCase()}`)).toBe(hex)
    expect(normalizeFingerprint("abc")).toBe("")
  })
  it("setup commands: HTTPS on the chosen port, HTTP off, a read-only user", () => {
    const s = setupCommands({ port: 8443, dnsName: "edificio1.dynu.net" })
    expect(s).toContain("/ip service set www-ssl disabled=no port=8443")
    expect(s).toContain("/ip service set www disabled=yes")
    expect(s).toContain("group=read")
  })
})
