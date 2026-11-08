import { useTranslations } from "next-intl"
import { ArrowRight } from "lucide-react"
import { Link } from "@/i18n/navigation"
import { plans } from "@/lib/plans"
import { PlanCard } from "./PlanCard"
import { TrustStrip } from "./TrustStrip"
import { RecommenderPrompt } from "./RecommenderPrompt"
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
      <div className="reveal">
      <p className="eyebrow mb-3">[ {t("sections.plans")} ]</p>
      <Heading className="max-w-2xl text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
        {variant === "page" ? t("plans.pageTitle") : t("sectionHeads.plans")}
      </Heading>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        {variant === "page" ? t("plans.pageLead") : t("plans.lead")}
      </p>
      </div>

      <div className="relative mt-14">
        {/* The featured card's own light on the page behind it. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-y-24 right-0 -z-10 hidden w-[55%] md:block"
          style={{ background: "radial-gradient(50% 50% at 50% 50%, rgb(6 182 212 / 0.16), rgb(167 139 250 / 0.05) 50%, transparent 72%)" }}
        />
        <div className="reveal-stagger grid items-start gap-6 md:grid-cols-[1fr_1fr_1.18fr] lg:gap-5">
          {plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} maxMbps={maxMbps} level={variant === "page" ? "h2" : "h3"} />
          ))}
        </div>
      </div>

      {/* Trust facts and the helper fold into two quiet lines, not two more boxes. */}
      <div className="reveal mt-10 grid gap-4">
        <TrustStrip variant="inline" />
        <RecommenderPrompt />
      </div>
      <p className="mx-auto mt-5 max-w-3xl text-center font-mono text-[0.7rem] text-muted-foreground">
        {t("plans.speedNote")}
        {wifi7Plan && <> {t("plans.wifi7Note")}</>}
      </p>

      <div className="reveal mt-14">
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
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground/75 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {t("plans.compareAll")}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      )}

    </div>
  )
}
