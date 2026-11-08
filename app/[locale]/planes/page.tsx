import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { Nav } from "@/components/hud/Nav"
import { Section } from "@/components/layout/Section"
import { PlansSection } from "@/components/plans/PlansSection"
import { PlansJsonLd } from "@/components/plans/PlansJsonLd"
import { Footer } from "@/components/layout/Footer"
import { LeadSheetHost } from "@/components/conversion/LeadSheetHost"
import { pageMeta } from "@/lib/site"
import { PageTransition } from "@/components/layout/PageTransition"

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/planes">): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: "plans" })
  const ts = await getTranslations({ locale, namespace: "seo" })
  return pageMeta(locale, "/planes", t("pageTitle"), t("pageLead"), ts("ogAlt"))
}

/** Full plans + comparison page (SPEC file structure: /planes). */
export default async function PlanesPage({ params }: PageProps<"/[locale]/planes">) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations("sections")

  return (
    <>
      <Nav base={`/${locale}`} />
      <PageTransition>
      <main className="pt-8">
        <Section id="plans" aria-label={t("plans")}>
          <PlansSection variant="page" />
        </Section>
      </main>
      </PageTransition>
      <Footer base={`/${locale}`} />
      <LeadSheetHost />
      <PlansJsonLd locale={locale} path="/planes" />
    </>
  )
}
