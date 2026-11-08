import { cn } from "cn"

/**
 * Every top-level section is `<section id data-section>` (CLAUDE.md convention);
 * the screenshot script keys off `[data-section]`. `scroll-mt` offsets the
 * fixed nav for anchor links. `isolate` keeps the per-section ambient light
 * (globals.css, `[data-section]::before`) behind the content but above the page.
 */
export function Section({
  id,
  className,
  children,
  "aria-label": ariaLabel,
}: {
  id: string
  className?: string
  children: React.ReactNode
  "aria-label"?: string
}) {
  return (
    <section
      id={id}
      data-section={id}
      aria-label={ariaLabel}
      className={cn(
        "relative isolate scroll-mt-20 border-b border-border",
        className
      )}
    >
      {children}
    </section>
  )
}
