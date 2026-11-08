import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { Nav } from "@/components/hud/Nav"
import { Section } from "@/components/layout/Section"
import { Footer } from "@/components/layout/Footer"
import { PrivacyNotice } from "@/components/legal/PrivacyNotice"
import { company } from "@/lib/company"
import { pageMeta } from "@/lib/site"
import { PageTransition } from "@/components/layout/PageTransition"

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/aviso-de-privacidad">): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: "privacy" })
  const ts = await getTranslations({ locale, namespace: "seo" })
  return pageMeta(
    locale,
    "/aviso-de-privacidad",
    t("metaTitle"),
    t("metaDescription", { name: company.name as string }),
    ts("ogAlt")
  )
}

/** Aviso de Privacidad Integral (LFPDPPP). Linked from the footer and the lead form. */
export default async function PrivacyPage({ params }: PageProps<"/[locale]/aviso-de-privacidad">) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations("privacy")

  return (
    <>
      <Nav base={`/${locale}`} />
      <PageTransition>
      <main>
        <Section id="privacy" aria-label={t("title")} className="border-b-0">
          <PrivacyNotice />
        </Section>
      </main>
      </PageTransition>
      <Footer base={`/${locale}`} />
    </>
  )
}
