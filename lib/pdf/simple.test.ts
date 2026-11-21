import { describe, expect, it } from "vitest"
import { simplePdf } from "./simple"

const text = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join("")

describe("One-page PDF (portal receipts)", () => {
  it("a valid structure: header, objects at the offsets the xref says, startxref, EOF", () => {
    const s = text(simplePdf([{ text: "Comprobante de pago", size: 18, bold: true }, { text: "Total: $396.00" }], "Comprobante"))
    expect(s.startsWith("%PDF-1.4\n")).toBe(true)
    expect(s.trimEnd().endsWith("%%EOF")).toBe(true)
    const xrefAt = Number(/startxref\n(\d+)/.exec(s)?.[1])
    expect(s.slice(xrefAt, xrefAt + 4)).toBe("xref")
    const offsets = [...s.slice(xrefAt).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]))
    expect(offsets).toHaveLength(7)
    offsets.forEach((o, i) => expect(s.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`))
    const len = Number(/<< \/Length (\d+) >>\nstream\n/.exec(s)?.[1])
    const start = s.indexOf("stream\n") + 7
    expect(s.slice(start + len, start + len + 10)).toBe("\nendstream")
  })
  it("Spanish in WinAnsi, PDF specials escaped, the rest as ?", () => {
    const s = text(simplePdf([{ text: "Depósito (año) — ¿señal? \\ 😀" }]))
    expect(s).toContain("(Dep\xf3sito \\(a\xf1o\\) \x97 \xbfse\xf1al? \\\\ ?)")
  })
})
