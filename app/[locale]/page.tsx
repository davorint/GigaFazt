import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { speedRange } from "@/lib/plans"
import { Nav } from "@/components/hud/Nav"
import { Section } from "@/components/layout/Section"
import { Footer } from "@/components/layout/Footer"
import { Hero } from "@/components/fiber/Hero"
import { PlansSection } from "@/components/plans/PlansSection"
import { FiberSection } from "@/components/fiber/FiberSection"
import { WifiSection } from "@/components/fiber/WifiSection"
import { CoverageMapSection } from "@/components/map/CoverageMapSection"
import { ProofBand } from "@/components/hud/ProofBand"
import { InstallSteps } from "@/components/conversion/InstallSteps"
import { Faq } from "@/components/conversion/Faq"
import { FinalCta } from "@/components/conversion/FinalCta"
import { LeadSheetHost } from "@/components/conversion/LeadSheetHost"
import { PlansJsonLd } from "@/components/plans/PlansJsonLd"
import { FaqJsonLd, ServiceJsonLd } from "@/components/seo/SiteJsonLd"
import { pageMeta } from "@/lib/site"
import { wifi7Plan } from "@/lib/plans"
import { speedLabel } from "@/lib/format"
import { PageTransition } from "@/components/layout/PageTransition"

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "meta" })
  const ts = await getTranslations({ locale, namespace: "seo" })
  const wifi7 = wifi7Plan ? ` ${t("wifi7", { speed: speedLabel(wifi7Plan.downMbps) })}` : ""
  return pageMeta(locale, "/", t("title"), t("description", speedRange()) + wifi7, ts("ogAlt"))
}

/** Home: the ordered list of sections only (SPEC file structure). */
export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations("sections")

  return (
    <>
      <Nav />
      <PageTransition>
      <main>
        <Section id="hero" className="border-b-0" aria-label={t("hero")}>
          <Hero />
        </Section>
        <Section id="plans" aria-label={t("plans")}>
          <PlansSection />
        </Section>
        <Section id="fiber" aria-label={t("fiber")}>
          <FiberSection />
        </Section>
        <Section id="wifi" aria-label={t("wifi")}>
          <WifiSection />
        </Section>
        <Section id="map" aria-label={t("map")}>
          <CoverageMapSection />
        </Section>
        <Section id="proof" aria-label={t("proof")}>
          <ProofBand />
        </Section>
        <Section id="install" aria-label={t("install")}>
          <InstallSteps />
        </Section>
        <Section id="faq" aria-label={t("faq")}>
          <Faq />
        </Section>
        <Section id="cta" aria-label={t("cta")}>
          <FinalCta />
        </Section>
      </main>
      </PageTransition>
      <Footer />
      <LeadSheetHost />
      <PlansJsonLd locale={locale} path="/" />
      <ServiceJsonLd locale={locale} path="/" />
      <FaqJsonLd locale={locale} />
    </>
  )
}
