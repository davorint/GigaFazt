import { cn } from "cn"

/** Lockup aspect ratio (public/brand/gigafazt-lockup.svg viewBox 278×72). */
const RATIO = 278 / 72

/**
 * The GigaFazt lockup (fiber end-face "G" + wordmark), served as a static SVG
 * so nav and footer share one cached file. `alt` carries the brand name, so
 * a link wrapping it keeps the visible name in its accessible name (WCAG 2.5.3).
 */
export function BrandLogo({ alt, height = 28, className }: { alt: string; height?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static SVG; next/image would add client JS to every page (perf budget)
    <img
      src="/brand/gigafazt-lockup.svg"
      alt={alt}
      width={Math.round(height * RATIO)}
      height={height}
      decoding="async"
      draggable={false}
      className={cn("block h-auto select-none", className)}
    />
  )
}
