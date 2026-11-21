/**
 * The MikroTik API's wire format (manual.mikrotik.com, Developer guides → API, RouterOS 7.26): a sentence is words, each
 * a length then its bytes, ended by an empty word. The length takes 1 to 5 bytes, most significant first:
 *   0..0x7F → 1 byte; 0x80..0x3FFF → 2 bytes (| 0x8000); 0x4000..0x1FFFFF → 3 bytes (| 0xC00000);
 *   0x200000..0xFFFFFFF → 4 bytes (| 0xE0000000); larger → 0xF0 then 4 bytes. A first byte >= 0xF8 is reserved.
 * (The manual gives the ranges; the high-bit markers are the API's standard ones, VERIFICAR against a router.)
 * Pure: the connection lives in lib/wispdavor/rest-server.ts.
 */

export function encodeLength(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n])
  if (n < 0x4000) return Buffer.from([(n >> 8) | 0x80, n & 0xff])
  if (n < 0x200000) return Buffer.from([(n >> 16) | 0xc0, (n >> 8) & 0xff, n & 0xff])
  if (n < 0x10000000) return Buffer.from([(n >>> 24) | 0xe0, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff])
  return Buffer.from([0xf0, (n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff])
}

/** The length at the start of `b` and how many bytes it took; null when more bytes are needed. Throws on a reserved byte. */
export function decodeLength(b: Buffer, at = 0): { n: number; size: number } | null {
  if (b.length <= at) return null
  const c = b[at]
  const need = c < 0x80 ? 1 : c < 0xc0 ? 2 : c < 0xe0 ? 3 : c < 0xf0 ? 4 : c === 0xf0 ? 5 : -1
  if (need < 0) throw new Error("reserved control byte")
  if (b.length < at + need) return null
  if (need === 1) return { n: c, size: 1 }
  if (need === 2) return { n: ((c & 0x3f) << 8) | b[at + 1], size: 2 }
  if (need === 3) return { n: ((c & 0x1f) << 16) | (b[at + 1] << 8) | b[at + 2], size: 3 }
  if (need === 4) return { n: ((c & 0x0f) * 0x1000000) + (b[at + 1] << 16) + (b[at + 2] << 8) + b[at + 3], size: 4 }
  return { n: b[at + 1] * 0x1000000 + (b[at + 2] << 16) + (b[at + 3] << 8) + b[at + 4], size: 5 }
}

export function encodeSentence(words: string[]): Buffer {
  const parts: Buffer[] = []
  for (const w of words) {
    const bytes = Buffer.from(w, "utf8")
    parts.push(encodeLength(bytes.length), bytes)
  }
  parts.push(Buffer.from([0]))
  return Buffer.concat(parts)
}

/** Reads whole sentences from a growing buffer; answers them and what's left. */
export function readSentences(buf: Buffer): { sentences: string[][]; rest: Buffer } {
  const sentences: string[][] = []
  let at = 0
  let words: string[] = []
  let start = 0
  for (;;) {
    const len = decodeLength(buf, at)
    if (!len || buf.length < at + len.size + len.n) break
    const word = buf.subarray(at + len.size, at + len.size + len.n).toString("utf8")
    at += len.size + len.n
    if (len.n === 0) {
      // Empty sentences are ignored (manual).
      if (words.length) sentences.push(words)
      words = []
      start = at
    } else words.push(word)
  }
  return { sentences, rest: buf.subarray(start) }
}

export type ApiReply = { records: Record<string, string>[]; done: Record<string, string> | null; trap: string; fatal: string }

/** The replies to one command, from its sentences (up to and including !done, or a !fatal). */
export function collectReply(sentences: string[][]): ApiReply & { finished: boolean } {
  const out: ApiReply & { finished: boolean } = { records: [], done: null, trap: "", fatal: "", finished: false }
  for (const s of sentences) {
    const attrs: Record<string, string> = {}
    for (const w of s.slice(1)) {
      if (!w.startsWith("=")) continue
      const eq = w.indexOf("=", 1)
      if (eq > 0) attrs[w.slice(1, eq)] = w.slice(eq + 1)
    }
    if (s[0] === "!re") out.records.push(attrs)
    else if (s[0] === "!trap") out.trap ||= attrs.message ?? "error"
    else if (s[0] === "!fatal") {
      out.fatal = s.slice(1).join(" ") || "fatal"
      out.finished = true
    } else if (s[0] === "!done") {
      out.done = attrs
      out.finished = true
    }
  }
  return out
}
