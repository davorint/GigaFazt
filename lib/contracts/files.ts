/**
 * The signed copies of a contract (owner, 2026-11-21: uploaded to the site). PDF, JPEG, PNG or WebP, at most MAX_BYTES
 * each (the host takes requests up to 4.5 MB); a phone photo larger than that is made smaller on the phone first
 * (components/contracts/ContractFiles.tsx). The type is read from the file's first bytes, not from its name.
 * Stored in the database (`contract_files`), served only to a signed-in session (/api/interno/archivos).
 */
export const MAX_BYTES = 4 * 1024 * 1024

export const FILE_MIMES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const
export type FileMime = (typeof FILE_MIMES)[number]

/** The file's real type from its first bytes, or null when it isn't one we keep. */
export function sniffMime(b: Uint8Array): FileMime | null {
  const at = (i: number, ...xs: number[]) => xs.every((x, k) => b[i + k] === x)
  if (at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf" // %PDF-
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg"
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png"
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp" // RIFF….WEBP
  return null
}

/** A file name safe to store and send back: no path, no control characters, at most 160 characters. */
export function cleanName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ""
  return base.replace(/[\p{Cc}"<>|*?:]/gu, "").trim().slice(0, 160) || "archivo"
}

/** "1.2 MB", "340 KB". */
export const sizeLabel = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
