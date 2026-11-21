/**
 * A one-page PDF of text lines (owner, 2026-11-21: the portal's payment receipts as PDF), written by hand so the
 * client portal needs no PDF library: the standard Helvetica fonts (every PDF reader has them) with WinAnsi encoding,
 * which covers Spanish (á é í ó ú ñ ü ¿ ¡) and the usual typographic marks. Pure; works in the browser and in tests.
 */

export type PdfLine = { text: string; size?: number; bold?: boolean; gap?: number; muted?: boolean }

/** WinAnsi (Windows-1252) for the characters outside Latin-1 that it has; Latin-1 maps to itself; the rest → "?". */
const WIN: Record<string, number> = { "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "™": 0x99 }

function encode(s: string): string {
  let out = ""
  for (const ch of s.normalize("NFC")) {
    const c = ch.codePointAt(0) ?? 63
    const b = WIN[ch] ?? (c >= 0x20 && c <= 0xff && !(c >= 0x7f && c < 0xa0) ? c : 63)
    const char = String.fromCharCode(b)
    // The PDF string's own special characters are escaped.
    out += char === "(" || char === ")" || char === "\\" ? `\\${char}` : char
  }
  return out
}

/** A4 page, 50 pt margins; lines go down from the top, each `gap` points below the last (default 1.5 × its size). */
export function simplePdf(lines: PdfLine[], title = ""): Uint8Array {
  let y = 842 - 60
  const ops: string[] = []
  for (const l of lines) {
    const size = l.size ?? 11
    y -= l.gap ?? Math.round(size * 1.5)
    ops.push(`BT ${l.muted ? "0.4 0.4 0.4 rg" : "0 0 0 rg"} /${l.bold ? "F2" : "F1"} ${size} Tf 50 ${y} Td (${encode(l.text)}) Tj ET`)
  }
  const content = ops.join("\n")
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Title (${encode(title)}) /Producer (GigaFazt) >>`,
  ]
  // One byte per character (WinAnsi), so string lengths are byte offsets.
  let pdf = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
  const offsets: number[] = []
  objects.forEach((o, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  const bytes = new Uint8Array(pdf.length)
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff
  return bytes
}
