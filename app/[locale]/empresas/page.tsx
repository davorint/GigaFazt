import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { Nav } from "@/components/hud/Nav"
import { Section } from "@/components/layout/Section"
import { Footer } from "@/components/layout/Footer"
import { BusinessHero } from "@/components/business/BusinessHero"
import { BusinessServices } from "@/components/business/BusinessServices"
import { BusinessSteps } from "@/components/business/BusinessSteps"
import { BusinessCta } from "@/components/business/BusinessCta"
import { business } from "@/lib/business"
import { pageMeta } from "@/lib/site"

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/empresas">): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: "business" })
  const ts = await getTranslations({ locale, namespace: "seo" })
  return pageMeta(locale, "/empresas", t("metaTitle"), t("metaDescription", { max: business.maxLinkGbps }), ts("ogAlt"))
}

/**
 * Businesses (owner, 2026-11-07): custom fiber installations, gigabit in every
 * area, dedicated internet, cabling, Wi-Fi and network equipment. Its own page
 * so the home page stays light; all server-rendered (no extra client JS).
 */
export default async function EmpresasPage({ params }: PageProps<"/[locale]/empresas">) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations("business")

  return (
    <>
      <Nav base={`/${locale}`} current="empresas" />
      <main>
        <Section id="business" aria-label={t("eyebrow")} className="holo-grid">
          <BusinessHero />
        </Section>
        <Section id="business-services" aria-label={t("servicesEyebrow")}>
          <BusinessServices />
        </Section>
        <Section id="business-steps" aria-label={t("stepsEyebrow")}>
          <BusinessSteps />
        </Section>
        <Section id="business-cta" aria-label={t("ctaTitle")}>
          <BusinessCta />
        </Section>
      </main>
      <Footer base={`/${locale}`} />
    </>
  )
}
