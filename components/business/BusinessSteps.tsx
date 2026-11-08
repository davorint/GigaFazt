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
      <h2 className="reveal biz-display max-w-2xl text-4xl leading-[1.02] font-[450] tracking-[-0.04em] sm:text-6xl">{t("stepsTitle")}</h2>

      <ol className="reveal-stagger relative mt-16 grid gap-12 md:grid-cols-4 md:gap-8">
        <span aria-hidden className="absolute top-[0.3125rem] right-0 left-0 hidden h-px bg-gradient-to-r from-[var(--biz-accent)] via-white/25 to-white/5 md:block" />
        {business.steps.map((id, i) => (
          <li key={id} className="relative max-md:border-l max-md:border-[var(--biz-line)] max-md:pl-6">
            <span aria-hidden className="absolute top-0 left-0 size-[11px] -translate-x-[5px] rotate-45 border border-[var(--biz-accent)] bg-[var(--biz-bg)] md:translate-x-0" />
            <p className="pt-8 text-sm text-zinc-400">
              {t("phase")} {i + 1}
            </p>
            <p aria-hidden className="mt-2 font-mono text-6xl font-semibold tracking-[-0.06em] text-transparent [-webkit-text-stroke:1px_rgb(196_181_253/0.45)]">
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
