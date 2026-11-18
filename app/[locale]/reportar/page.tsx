import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { Nav } from "@/components/hud/Nav"
import { Section } from "@/components/layout/Section"
import { Footer } from "@/components/layout/Footer"
import { PageTransition } from "@/components/layout/PageTransition"
import { ReportForm } from "@/components/support/ReportForm"
import { company } from "@/lib/company"
import { pageMeta } from "@/lib/site"

export async function generateMetadata({ params }: PageProps<"/[locale]/reportar">): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: "report" })
  const ts = await getTranslations({ locale, namespace: "seo" })
  return pageMeta(locale, "/reportar", t("metaTitle"), t("metaDescription", { name: company.name as string }), ts("ogAlt"))
}

/** Clients report a service problem (owner, 2026-11-18); it lands in /interno/admin/reportes_clientes. Linked from the footer. */
export default async function ReportPage({ params }: PageProps<"/[locale]/reportar">) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations("report")
  const tips = t.raw("tips") as string[]
  return (
    <>
      <Nav base={`/${locale}`} />
      <PageTransition>
        <main>
          <Section id="report" aria-label={t("title")} className="border-b-0">
            <div className="mx-auto grid max-w-6xl gap-10 px-4 pt-28 pb-24 sm:px-6 lg:grid-cols-[1fr_1.4fr] lg:gap-16 lg:pt-36">
              <div className="grid content-start gap-5">
                <p className="eyebrow">{t("eyebrow")}</p>
                <h1 className="text-4xl font-normal tracking-tight text-balance text-foreground sm:text-5xl">{t("title")}</h1>
                <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">{t("lead")}</p>
                <div className="grid gap-2 rounded-2xl border border-white/10 p-5">
                  <h2 className="text-sm font-medium text-foreground">{t("tipsTitle")}</h2>
                  <ul className="grid list-disc gap-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
                    {tips.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <ReportForm />
            </div>
          </Section>
        </main>
      </PageTransition>
      <Footer base={`/${locale}`} />
    </>
  )
}
