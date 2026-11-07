/** Same-size empty card shown until a lazy island loads (no layout shift). */
export function IslandFrame({ minHeight }: { minHeight: number }) {
  return <div aria-hidden className="h-full rounded-xl border border-border bg-surface" style={{ minHeight }} />
}
