import { motionReduced } from "./motion"

/** Scroll to a section, smooth unless the visitor prefers reduced motion. */
export function scrollToId(id: string): boolean {
  const el = document.getElementById(id)
  if (!el) return false
  el.scrollIntoView({ behavior: motionReduced() ? "auto" : "smooth" })
  return true
}
