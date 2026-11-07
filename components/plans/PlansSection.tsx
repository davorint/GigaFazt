import { useTranslations } from "next-intl"
import { ArrowRight } from "lucide-react"
import { Link } from "@/i18n/navigation"
import { plans } from "@/lib/plans"
import { PlanCard } from "./PlanCard"
import { TrustStrip } from "./TrustStrip"
import { PlanRecommender } from "./PlanRecommender"
import { AddOnsPanel } from "./AddOnsPanel"
import { ComparisonTable } from "./ComparisonTable"
import { wifi7Plan } from "@/lib/plans"

/**
 * Plans (SPEC §3), the conversion core. `home` links out to /planes for the
 * comparison table; `page` renders it inline. One lineup for everyone.
 */
export function PlansSection({ variant = "home" }: { variant?: "home" | "page" }) {
  const t = useTranslations()
  const maxMbps = Math.max(...plans.map((p) => p.downMbps))
  const Heading = variant === "page" ? "h1" : "h2"

  return (
    <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
      <p className="eyebrow mb-3">[ {t("sections.plans")} ]</p>
      <Heading className="max-w-2xl text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
        {variant === "page" ? t("plans.pageTitle") : t("sectionHeads.plans")}
      </Heading>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        {variant === "page" ? t("plans.pageLead") : t("plans.lead")}
      </p>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} maxMbps={maxMbps} level={variant === "page" ? "h2" : "h3"} />
        ))}
      </div>
      <p className="mt-3 font-mono text-[0.7rem] text-muted-foreground">
        {t("plans.speedNote")}
        {wifi7Plan && <> {t("plans.wifi7Note")}</>}
      </p>

      <div className="mt-8">
        <TrustStrip />
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        <PlanRecommender />
        <AddOnsPanel />
      </div>

      {variant === "page" ? (
        <div className="mt-16">
          <h2 className="mb-6 text-2xl font-semibold tracking-[-0.02em]">{t("compare.title")}</h2>
          <ComparisonTable />
        </div>
      ) : (
        <div className="mt-10 flex justify-center">
          <Link
            href="/planes"
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 font-mono text-xs uppercase tracking-wider text-fiber hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {t("plans.compareAll")}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      )}

    </div>
  )
}
