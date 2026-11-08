import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { Nav } from "@/components/hud/Nav"
import { Section } from "@/components/layout/Section"
import { Footer } from "@/components/layout/Footer"
import { BusinessHero } from "@/components/business/BusinessHero"
import { BusinessTiers } from "@/components/business/BusinessTiers"
import { BusinessNetworks } from "@/components/business/BusinessNetworks"
import { BusinessNoc } from "@/components/business/BusinessNoc"
import { BriefHost } from "@/components/business/BriefHost"
import { BusinessSteps } from "@/components/business/BusinessSteps"
import { BusinessCta } from "@/components/business/BusinessCta"
import { business } from "@/lib/business"
import { pageMeta } from "@/lib/site"
import { PageTransition } from "@/components/layout/PageTransition"

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/empresas">): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: "business" })
  const ts = await getTranslations({ locale, namespace: "seo" })
  return pageMeta(locale, "/empresas", t("metaTitle"), t("metaDescription", { max: business.maxLinkGbps, lanMax: business.internalNetworkGbps.to }), ts("ogAlt"))
}

/**
 * Businesses (owner, 2026-11-07/08): hero (statement + live 3D building),
 * chapter 01 internet service (the three packages as one comparison), chapter
 * 02 fiber networks (opener, what we do, what it makes possible), how we work,
 * and a full-screen closing scene. Its own page so the home page stays light;
 * server-rendered except the lazy hero building (three.js, never in the
 * initial chunk). Its own visual language (`.biz`): graphite, white type,
 * violet accent, hairlines and a blueprint grid instead of the consumer pages'
 * cyan glow.
 */
export default async function EmpresasPage({ params }: PageProps<"/[locale]/empresas">) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations("business")

  return (
    <>
      <Nav base={`/${locale}`} current="empresas" />
      {/* .biz: the page's own enterprise look (globals.css), unlike the consumer pages. */}
      <PageTransition>
      <main className="biz">
        <Section id="business" aria-label={t("eyebrow")}>
          <BusinessHero />
        </Section>
        <Section id="business-internet" aria-label={t("chapters.internet.title")}>
          <BusinessTiers />
        </Section>
        <Section id="business-noc" aria-label={t("noc.title")}>
          <BusinessNoc />
        </Section>
        <Section id="business-networks" aria-label={t("chapters.fiber.title")}>
          <BusinessNetworks />
        </Section>
        <Section id="business-steps" aria-label={t("stepsTitle")}>
          <BusinessSteps />
        </Section>
        <Section id="business-cta" aria-label={t("ctaTitle")}>
          <BusinessCta />
        </Section>
      </main>
      </PageTransition>
      <BriefHost />
      <Footer base={`/${locale}`} variant="biz" />
    </>
  )
}
