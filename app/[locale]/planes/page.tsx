import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { Nav } from "@/components/hud/Nav"
import { Section } from "@/components/layout/Section"
import { PlansSection } from "@/components/plans/PlansSection"
import { PlansJsonLd } from "@/components/plans/PlansJsonLd"

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/planes">): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: "plans" })
  return { title: t("pageTitle"), description: t("pageLead") }
}

/** Full plans + comparison page (SPEC file structure: /planes). */
export default async function PlanesPage({ params }: PageProps<"/[locale]/planes">) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations("sections")

  return (
    <>
      <Nav base={`/${locale}`} />
      <main className="pt-8 pb-16 md:pb-0">
        <Section id="plans" aria-label={t("plans")}>
          <PlansSection variant="page" />
        </Section>
      </main>
      <PlansJsonLd locale={locale} />
    </>
  )
}
