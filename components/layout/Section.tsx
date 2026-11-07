import { cn } from "cn"

/**
 * Every top-level section is `<section id data-section>` (CLAUDE.md convention);
 * the screenshot script keys off `[data-section]`. `scroll-mt` offsets the
 * fixed nav for anchor links.
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
        "relative scroll-mt-20 border-b border-border",
        className
      )}
    >
      {children}
    </section>
  )
}
