import type { ReactNode } from "react"

export const ERROR_PRIMARY =
  "inline-flex h-11 items-center rounded-full bg-white px-5 text-sm font-medium text-zinc-950 hover:bg-zinc-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
export const ERROR_SECONDARY =
  "inline-flex h-11 items-center rounded-full border border-white/15 px-5 text-sm text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"

/**
 * The body of the 404 and error pages: code, title, lead and the ways out. No hooks, so the server not-found pages
 * and the client error boundaries share it.
 */
export function ErrorScreen({ code, title, lead, children, extra }: { code: string; title: string; lead: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <section id="error" data-section="error" className="mx-auto grid w-full max-w-3xl content-center gap-5 px-4 py-24 sm:px-6 sm:py-32">
      <p className="eyebrow">{code}</p>
      <h1 className="text-4xl font-light tracking-tight text-balance text-foreground sm:text-6xl">{title}</h1>
      <p className="max-w-xl text-base leading-relaxed text-pretty text-zinc-300 sm:text-lg">{lead}</p>
      <div className="mt-2 flex flex-wrap gap-3">{children}</div>
      {extra}
    </section>
  )
}
