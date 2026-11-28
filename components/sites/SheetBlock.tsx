import type { ReactNode } from "react"
import { cn } from "cn"

/** One block of the deployment sheet: an anchor (#torres…) with its title, an optional line beside it, and its fields. */
export function SheetBlock({ id, title, aside, className, children }: { id: string; title: string; aside?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("grid min-w-0 scroll-mt-32 content-start gap-3 rounded-xl border border-white/10 p-3 sm:p-4", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={`${id}-title`} className="text-base font-medium text-foreground">
          {title}
        </h2>
        {aside && <div className="font-mono text-xs text-zinc-400">{aside}</div>}
      </div>
      {children}
    </section>
  )
}
