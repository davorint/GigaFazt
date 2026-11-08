import { useTranslations } from "next-intl"
import { business } from "@/lib/business"
import { InView } from "@/components/layout/InView"

/**
 * How a business project works (brief → design → quote → install), drawn as
 * a fiber riser: the heading sits beside a vertical line with one node per
 * phase, each phase a "floor" with what you get from it; light runs down the
 * riser while in view (`.biz-riser-packet`, still under reduced motion).
 */
export function BusinessSteps() {
  const t = useTranslations("business")
  return (
    <div className="mx-auto grid max-w-7xl gap-12 px-4 py-24 sm:px-6 sm:py-32 lg:grid-cols-[1fr_1.6fr] lg:gap-20">
      <div className="reveal lg:sticky lg:top-28 lg:self-start">
        <h2 className="biz-display max-w-md text-4xl leading-[1.02] font-[450] tracking-[-0.04em] sm:text-6xl">{t("stepsTitle")}</h2>
        <p className="mt-5 max-w-sm text-zinc-400">{t("stepsLead")}</p>
      </div>

      <InView className="relative">
        {/* The riser. */}
        <div aria-hidden className="absolute top-2 bottom-2 left-[7px] w-px overflow-hidden bg-gradient-to-b from-[var(--biz-accent)] via-white/20 to-white/5">
          <span className="biz-riser-packet absolute inset-x-0 top-0 h-full">
            <span className="absolute bottom-0 left-1/2 h-14 w-[3px] -translate-x-1/2 rounded-full bg-gradient-to-b from-transparent to-white shadow-[0_0_12px_#c4b5fd]" />
          </span>
        </div>
        <ol className="reveal-stagger grid">
          {business.steps.map((id, i) => (
            <li key={id} className="relative grid gap-x-8 gap-y-3 border-b border-[var(--biz-line)] py-10 pl-12 first:pt-2 last:border-b-0 sm:grid-cols-[6rem_1fr]">
              <span aria-hidden className="absolute top-[3.1rem] left-[2px] size-[11px] rotate-45 border border-[var(--biz-accent)] bg-[var(--biz-bg)] [li:first-child>&]:top-[0.85rem]" />
              <p aria-hidden className="font-mono text-6xl leading-none font-semibold tracking-[-0.06em] text-transparent [-webkit-text-stroke:1px_rgb(196_181_253/0.5)]">
                {String(i + 1).padStart(2, "0")}
              </p>
              <div>
                <p className="text-sm text-zinc-400">
                  {t("phase")} {i + 1}
                </p>
                <h3 className="mt-1 text-2xl font-medium tracking-[-0.02em] text-white">{t(`steps.${id}.title`)}</h3>
                <p className="mt-2 max-w-lg leading-relaxed text-zinc-400">{t(`steps.${id}.body`)}</p>
                <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--biz-line-strong)] px-3 py-1 text-xs text-zinc-200">
                  <span className="text-zinc-400">{t("stepsYouGet")}</span>
                  {t(`steps.${id}.out`)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </InView>
    </div>
  )
}
