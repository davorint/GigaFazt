import { useTranslations } from "next-intl"
import { business, INTERNET_TIERS, type InternetTier } from "@/lib/business"
import { cn } from "cn"
import { ChapterMark } from "./ChapterMark"
import { QuoteButton } from "./QuoteButton"

type Row = { key: string; label: string; value: (tier: InternetTier) => string | null }

/**
 * Chapter 01: the three internet packages as one comparison (owner order:
 * lowest availability first, Dedicado last). Speed is the same choice in all
 * of them, so it is one line above the table (the page's only "10 Gbps"),
 * not a row repeated three times. Dedicado is the lit column, its 99.9 % SLA
 * the large figure. Wide screens get a real <table>; phones get cards with the
 * same rows. No prices (quoted per project).
 */
export function BusinessTiers() {
  const t = useTranslations("business")
  const tt = useTranslations("business.tiers")
  const max = business.maxLinkGbps

  const rows: Row[] = [
    { key: "uptime", label: tt("uptimeLabel"), value: (x) => (x.uptimePct !== null ? tt("uptimeValue", { pct: x.uptimePct }) : null) },
    { key: "bandwidth", label: tt("bandwidthLabel"), value: (x) => tt(`bandwidth.${x.bandwidth}`) },
    { key: "video", label: tt("videoLabel"), value: (x) => (x.videoCalls ? tt("videoValue") : null) },
    { key: "support", label: tt("supportLabel"), value: (x) => tt(`support.${x.support}`) },
    { key: "backup", label: tt("extraLabel"), value: (x) => (x.backupRoute ? tt("backupRoute") : null) },
  ]
  const featured = (x: InternetTier) => x.id === "dedicated"
  const none = (
    <>
      <span aria-hidden className="text-zinc-600">—</span>
      <span className="sr-only">{tt("notIncluded")}</span>
    </>
  )
  const uptimeFigure = (x: InternetTier) =>
    x.uptimePct !== null && (
      <span className="flex items-baseline gap-2">
        <span className="biz-display text-5xl leading-none font-[450] tracking-[-0.04em] tabular-nums sm:text-6xl">{tt("uptimePct", { pct: x.uptimePct })}</span>
        <span className="text-sm text-zinc-400">{tt("monthly")}</span>
      </span>
    )
  const cta = (x: InternetTier, className?: string) => (
    <QuoteButton
      context={`business_tier_${x.id}`}
      message={tt("whatsappMessage", { tier: tt(`items.${x.id}.name`) })}
      variant={featured(x) ? "primary" : "ghost"}
      className={className}
    />
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-36">
      <ChapterMark n={1} title={t("chapters.internet.title")} />
      <div className="reveal mt-12 grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-end">
        <h2 className="biz-display max-w-2xl text-4xl leading-[1.02] font-[450] tracking-[-0.04em] text-balance sm:text-6xl">{tt("title")}</h2>
        <p className="max-w-md text-zinc-400 lg:justify-self-end">{tt("lead")}</p>
      </div>
      <p className="reveal mt-10 max-w-3xl border-l border-[var(--biz-accent)] pl-5 text-lg text-zinc-200">
        {tt("speedAll", { max })}
      </p>

      {/* Wide screens: one comparison table, Dedicado lit. */}
      <div className="reveal mt-16 hidden lg:block">
        <table className="w-full table-fixed border-collapse text-left">
          <caption className="sr-only">{tt("title")}</caption>
          <colgroup>
            <col className="w-[22%]" />
            {INTERNET_TIERS.map((x) => (
              <col key={x.id} className={featured(x) ? "w-[30%]" : "w-[24%]"} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="sr-only">{tt("featureLabel")}</th>
              {INTERNET_TIERS.map((x, i) => (
                <th
                  key={x.id}
                  scope="col"
                  className={cn(
                    "relative px-7 pt-8 pb-7 align-top font-normal",
                    featured(x) ? "biz-lit-col biz-lit-top" : "border-t border-[var(--biz-line)]"
                  )}
                >
                  <span className="flex h-6 items-center justify-between gap-3">
                    <span className="font-mono text-xs text-[var(--biz-accent)] tabular-nums" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
                    {featured(x) && (
                      <span className="rounded-full border border-[var(--biz-accent)]/50 bg-[var(--biz-accent-soft)] px-2.5 py-0.5 text-xs text-violet-200">{tt("featured")}</span>
                    )}
                  </span>
                  <span className="mt-4 block text-2xl font-medium tracking-[-0.02em] text-white">{tt(`items.${x.id}.name`)}</span>
                  <span className="mt-2 block text-sm text-zinc-400">{tt(`items.${x.id}.tagline`)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-[var(--biz-line)]">
                <th scope="row" className="py-6 pr-6 align-top text-sm font-normal text-zinc-400">{r.label}</th>
                {INTERNET_TIERS.map((x) => {
                  const v = r.value(x)
                  return (
                    <td key={x.id} className={cn("px-7 py-6 align-top text-zinc-200", featured(x) && "biz-lit-col text-white")}>
                      {r.key === "uptime" && v ? uptimeFigure(x) : v ?? none}
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr className="border-t border-[var(--biz-line)]">
              <td />
              {INTERNET_TIERS.map((x) => (
                <td key={x.id} className={cn("px-7 pt-6 pb-8", featured(x) && "biz-lit-col biz-lit-bottom")}>
                  {cta(x, "w-full")}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Phones and tablets: the same rows as cards. */}
      <ul className="reveal-stagger mt-12 grid gap-5 lg:hidden">
        {INTERNET_TIERS.map((x, i) => (
          <li key={x.id} className={cn("flex flex-col p-6 sm:p-8", featured(x) ? "biz-frame biz-lit-card" : "border border-[var(--biz-line)]")}>
            <span className="flex h-6 items-center justify-between gap-3">
              <span className="font-mono text-xs text-[var(--biz-accent)] tabular-nums" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
              {featured(x) && <span className="rounded-full border border-[var(--biz-accent)]/50 bg-[var(--biz-accent-soft)] px-2.5 py-0.5 text-xs text-violet-200">{tt("featured")}</span>}
            </span>
            <h3 className="mt-4 text-2xl font-medium tracking-[-0.02em] text-white">{tt(`items.${x.id}.name`)}</h3>
            <p className="mt-2 text-sm text-zinc-400">{tt(`items.${x.id}.tagline`)}</p>
            {featured(x) && <div className="mt-6">{uptimeFigure(x)}</div>}
            <dl className="mt-6 border-t border-[var(--biz-line)]">
              {rows.map((r) => {
                const v = r.value(x)
                if (!v || (featured(x) && r.key === "uptime")) return null
                return (
                  <div key={r.key} className="grid gap-1 border-b border-[var(--biz-line)] py-4">
                    <dt className="text-sm text-zinc-400">{r.label}</dt>
                    <dd className="text-zinc-100">{v}</dd>
                  </div>
                )
              })}
            </dl>
            {cta(x, "mt-6 w-full")}
          </li>
        ))}
      </ul>

      <div className="reveal mt-8 flex flex-col gap-2 text-sm text-zinc-400 sm:flex-row sm:justify-between">
        <p>* {t("speedQual")}</p>
        <p>{tt("note")}</p>
      </div>
    </div>
  )
}
