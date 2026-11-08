import { ViewTransition } from "react"

/**
 * Page-to-page transition (owner, 2026-11-08: "hyper expensive" point 8):
 * wraps each page's <main> so client navigations between home, /planes,
 * /empresas, /cobertura/* and the privacy notice crossfade (old page leaves
 * fast with a slight drop and blur, the new one rises in). Pure browser View
 * Transitions via React (no JS cost); globals.css has the keyframes and turns
 * them off under reduced motion and the pause toggle. Must sit in each
 * page.tsx: layouts persist, so enter/exit never fire there.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page-in" exit="page-out" default="none">
      {children}
    </ViewTransition>
  )
}
