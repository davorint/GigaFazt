/**
 * Chapter divider for /empresas: the page has two lines of business, internet
 * service (01) and fiber network deployment and cabling (02). Oversized mono
 * number, chapter name, a hairline to the edge.
 */
export function ChapterMark({ n, title }: { n: number; title: string }) {
  return (
    <div className="reveal flex items-center gap-4 font-mono uppercase sm:gap-6">
      <span className="text-4xl font-semibold tracking-[-0.06em] text-transparent [-webkit-text-stroke:1px_var(--biz-accent)] sm:text-6xl" aria-hidden>
        {String(n).padStart(2, "0")}
      </span>
      <span className="text-xs tracking-[0.3em] text-white sm:text-sm">{title}</span>
      <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-[var(--biz-line-strong)] to-transparent" />
    </div>
  )
}
