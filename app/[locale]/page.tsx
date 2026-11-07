import { getTranslations, setRequestLocale } from "next-intl/server"
import { Nav } from "@/components/hud/Nav"
import { Section } from "@/components/layout/Section"
import { Hero } from "@/components/fiber/Hero"
import { PlansSection } from "@/components/plans/PlansSection"
import { FiberSection } from "@/components/fiber/FiberSection"
import { CoverageMapSection } from "@/components/map/CoverageMapSection"
import { PlansJsonLd } from "@/components/plans/PlansJsonLd"
import { StatusBadge } from "@/components/hud/StatusBadge"
import { PlaceholderChip } from "@/components/hud/PlaceholderChip"
import { company } from "@/lib/company"
import { isPlaceholder } from "@/lib/placeholder"

// Section shells in page order (SPEC §3–8). Replaced by real feature
// components in later phases; `hero` and `footer` are rendered explicitly.
const SHELLS = ["proof", "install", "cta", "faq"] as const

export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations()

  return (
    <>
      <Nav />
      <main className="pb-16 md:pb-0">
        <Section
          id="hero"
          className="border-b-0"
          aria-label={t("sections.hero")}
        >
          <Hero />
        </Section>

        <Section id="plans" aria-label={t("sections.plans")}>
          <PlansSection />
        </Section>

        <Section id="fiber" aria-label={t("sections.fiber")}>
          <FiberSection />
        </Section>

        <Section id="map" aria-label={t("sections.map")}>
          <CoverageMapSection />
        </Section>

        {SHELLS.map((id) => (
          <Section key={id} id={id} aria-label={t(`sections.${id}`)}>
            <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
              <p className="eyebrow mb-3">[ {t(`sections.${id}`)} ]</p>
              <h2 className="max-w-2xl text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
                {t(`sectionHeads.${id}`)}
              </h2>
              <p className="mt-4 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                {t("common.comingSoon")}
              </p>
            </div>
          </Section>
        ))}

        <footer
          id="footer"
          data-section="footer"
          className="border-t border-border bg-surface"
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-14 sm:px-6">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block size-4 rotate-45 rounded-[3px] bg-fiber shadow-[0_0_12px_var(--color-fiber)]"
              />
              {isPlaceholder(company.name) ? (
                <PlaceholderChip keyName={company.name.key} />
              ) : (
                <span className="font-mono text-sm">{company.name}</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 font-mono text-xs text-muted-foreground">
              <StatusBadge />
              <span className="flex items-center gap-2">
                {t("footer.privacy")} <PlaceholderChip keyName="REGULATORY" />
              </span>
              <span className="flex items-center gap-2">
                {t("footer.terms")} <PlaceholderChip keyName="DOMAIN" />
              </span>
              <span className="flex items-center gap-2">
                {isPlaceholder(company.regulatory) && (
                  <PlaceholderChip keyName={company.regulatory.key} />
                )}
              </span>
            </div>
          </div>
        </footer>
      </main>
      <PlansJsonLd locale={locale} />
    </>
  )
}
