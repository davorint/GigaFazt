import { cn } from "@/lib/utils"

/**
 * Empty card shown until a lazy island loads. Pass the same min-height classes
 * as the `WhenVisible` wrapper (≥ the loaded widget's height at each
 * breakpoint, measured) so the swap doesn't shift layout.
 */
export function IslandFrame({ className }: { className: string }) {
  return <div aria-hidden className={cn("rounded-xl surface", className)} />
}
