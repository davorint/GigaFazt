/** Scroll to a section, smooth unless the visitor prefers reduced motion. */
export function scrollToId(id: string): boolean {
  const el = document.getElementById(id)
  if (!el) return false
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth" })
  return true
}
