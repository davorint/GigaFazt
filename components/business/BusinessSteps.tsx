import { useTranslations } from "next-intl"
import { business } from "@/lib/business"

/** How a business project works: chat → design → quote → install. */
export function BusinessSteps() {
  const t = useTranslations("business")
  return (
    <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
      <p className="eyebrow mb-3">[ {t("stepsEyebrow")} ]</p>
      <h2 className="max-w-2xl text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">{t("stepsTitle")}</h2>

      <ol className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-2 lg:grid-cols-4">
        {business.steps.map((id, i) => (
          <li key={id} className="flex flex-col gap-3 bg-surface p-6">
            <span className="font-mono text-xs tabular-nums text-fiber" aria-hidden>
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="font-semibold">{t(`steps.${id}.title`)}</h3>
            <p className="text-sm text-muted-foreground">{t(`steps.${id}.body`)}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}
