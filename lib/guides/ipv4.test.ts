import { describe, expect, it } from "vitest"
import { matchInternal } from "../internal-pages"
import { CIDR_PREFIXES, cidrRow, cidrTable } from "./ipv4"
import guias from "../../messages/internal/guias.es.json"

const row = (p: number) => {
  const r = cidrRow(p)
  return [r.mask, r.usable, r.block, r.octet]
}

describe("IPv4 CIDR table", () => {
  it("masks, usable hosts, block size and octet of the usual prefixes", () => {
    expect(row(8)).toEqual(["255.0.0.0", 16777214, 1, 1])
    expect(row(10)).toEqual(["255.192.0.0", 4194302, 64, 2])
    expect(row(16)).toEqual(["255.255.0.0", 65534, 1, 2])
    expect(row(22)).toEqual(["255.255.252.0", 1022, 4, 3])
    expect(row(24)).toEqual(["255.255.255.0", 254, 1, 3])
    expect(row(26)).toEqual(["255.255.255.192", 62, 64, 4])
    expect(row(29)).toEqual(["255.255.255.248", 6, 8, 4])
    expect(row(30)).toEqual(["255.255.255.252", 2, 4, 4])
  })
  it("/31 has 2 usable (point-to-point, RFC 3021) and /32 one host", () => {
    expect(row(31)).toEqual(["255.255.255.254", 2, 2, 4])
    expect(row(32)).toEqual(["255.255.255.255", 1, 1, 4])
  })
  it("/8 to /32, each total twice the next; every prefix has a key note", () => {
    const t = cidrTable()
    expect(t.map((r) => r.prefix)).toEqual(CIDR_PREFIXES)
    expect(t.every((r, i) => i === t.length - 1 || r.total === 2 * t[i + 1].total)).toBe(true)
    const notes = guias.guias.ipv4.notes as Record<string, string>
    expect(CIDR_PREFIXES.filter((p) => !notes[String(p)])).toEqual([])
  })
  it("routes: /interno/guias/ipv4 in any case", () => {
    expect(matchInternal("/Interno/Guias/IPv4")).toEqual({ rewriteTo: "/es/interno/guias/ipv4", open: false })
  })
})
