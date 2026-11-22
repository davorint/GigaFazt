/**
 * A photo redrawn smaller as JPEG on the phone (field and portal photos don't need full resolution; the host takes
 * 4.5 MB per request). Browser code only. Used by Técnico (phase 5) and the client portal's fault report (phase 9).
 */
import { MAX_FIELD_BYTES } from "./model"

const MAX_SIDE = 2000

export async function shrink(file: File): Promise<Blob> {
  try {
    const img = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height)
    for (const q of [0.8, 0.65, 0.5]) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q))
      if (blob && blob.size <= MAX_FIELD_BYTES) return blob
    }
  } catch {
    // The browser can't read it: send it as it is (the server checks type and size).
  }
  return file
}
