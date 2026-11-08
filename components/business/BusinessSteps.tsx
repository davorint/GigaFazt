import { useTranslations } from "next-intl"
import { business } from "@/lib/business"

/**
 * How a business project works (chat → design → quote → install) as a phase
 * timeline: one hairline with a marker per phase, oversized phase numbers.
 */
export function BusinessSteps() {
  const t = useTranslations("business")
  return (
    <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32">
      <div className="reveal">
        <p className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.25em] text-zinc-400">
          <span aria-hidden className="h-px w-8 bg-[var(--biz-accent)]" />
          {t("stepsEyebrow")}
        </p>
        <h2 className="mt-5 max-w-2xl text-3xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">{t("stepsTitle")}</h2>
      </div>

      <ol className="reveal-stagger relative mt-16 grid gap-12 md:grid-cols-4 md:gap-8">
        <span aria-hidden className="absolute top-[0.3125rem] right-0 left-0 hidden h-px bg-gradient-to-r from-[var(--biz-accent)] via-white/25 to-white/5 md:block" />
        {business.steps.map((id, i) => (
          <li key={id} className="relative max-md:border-l max-md:border-[var(--biz-line)] max-md:pl-6">
            <span aria-hidden className="absolute top-0 left-0 size-[11px] -translate-x-[5px] rotate-45 border border-[var(--biz-accent)] bg-[var(--biz-bg)] md:translate-x-0" />
            <p className="pt-8 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-zinc-400">
              {t("phase")} <span className="text-[var(--biz-accent)]">{String(i + 1).padStart(2, "0")}</span>
            </p>
            <p aria-hidden className="mt-2 font-mono text-6xl font-semibold tracking-[-0.06em] text-transparent [-webkit-text-stroke:1px_rgb(255_255_255/0.22)]">
              {String(i + 1).padStart(2, "0")}
            </p>
            <h3 className="mt-4 text-lg font-medium tracking-[-0.01em] text-white">{t(`steps.${id}.title`)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{t(`steps.${id}.body`)}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}
