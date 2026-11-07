import { Suspense } from "react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { ArrowRight, Building2 } from "lucide-react"
import { Link } from "@/i18n/navigation"
import { Nav } from "@/components/hud/Nav"
import { SimTag } from "@/components/hud/SimTag"
import { Section } from "@/components/layout/Section"
import { Footer } from "@/components/layout/Footer"
import { PlanCard } from "@/components/plans/PlanCard"
import { TrustStrip } from "@/components/plans/TrustStrip"
import { PlansJsonLd } from "@/components/plans/PlansJsonLd"
import { StateOutline } from "@/components/map/StateOutline"
import { ContractButton } from "@/components/conversion/ContractButton"
import { FinalCta } from "@/components/conversion/FinalCta"
import { LeadSheetHost } from "@/components/conversion/LeadSheetHost"
import { ServiceJsonLd } from "@/components/seo/SiteJsonLd"
import { JsonLd } from "@/components/seo/JsonLd"
import { areaBySlug, coverageAreas } from "@/lib/coverage"
import { clientsByState } from "@/lib/clients"
import { STATES } from "@/lib/geo/states"
import { plans, speedRange } from "@/lib/plans"
import { SITE_URL, absoluteUrl, localizedPath, pageMeta } from "@/lib/site"
import { stateIn, stateName } from "@/lib/geo/state-names"

/**
 * Only the three service states are prerendered. Unknown slugs hit notFound();
 * (`dynamicParams` is incompatible with cacheComponents, so the not-found UI is
 * streamed with a noindex meta instead of an HTTP 404.)
 */
export function generateStaticParams() {
  return coverageAreas.map((a) => ({ slug: a.slug }))
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/cobertura/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params
  const area = areaBySlug(slug)
  if (!area) notFound()
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: "area" })
  const inName = stateIn(await getTranslations({ locale, namespace: "states" }), slug)
  return pageMeta(
    locale,
    `/cobertura/${slug}`,
    t("metaTitle", { name: inName }),
    t("metaDescription", { name: inName, ...speedRange() }),
    (await getTranslations({ locale, namespace: "seo" }))("ogAlt")
  )
}

/** Per-state coverage page (SPEC SEO: "Internet de fibra óptica en {área}"). */
/**
 * Params are read inside <Suspense> so the generic `[slug]` shell (unknown
 * slugs) stays instant-navigable; the three known states are prerendered in
 * full, so the empty fallback never shows for them.
 */
export default function AreaPage({ params }: PageProps<"/[locale]/cobertura/[slug]">) {
  return (
    <Suspense fallback={null}>
      <AreaContent params={params} />
    </Suspense>
  )
}

async function AreaContent({ params }: { params: PageProps<"/[locale]/cobertura/[slug]">["params"] }) {
  const { locale, slug } = await params
  const area = areaBySlug(slug)
  if (!area) notFound()
  setRequestLocale(locale)
  const t = await getTranslations()
  const ts = await getTranslations("states")
  const name = stateName(ts, slug)
  const inName = stateIn(ts, slug)
  const state = STATES.find((s) => s.code === area.state)!
  const list = clientsByState(area.state)
  const others = STATES.filter((s) => s.code !== area.state)
  const maxMbps = Math.max(...plans.map((p) => p.downMbps))
  const home = localizedPath(locale, "/")

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { name: t("area.home"), item: absoluteUrl(locale, "/") },
      { name: t("area.coverage"), item: `${SITE_URL}${home}#map` },
      { name, item: absoluteUrl(locale, `/cobertura/${slug}`) },
    ].map((b, i) => ({ "@type": "ListItem", position: i + 1, ...b })),
  }

  return (
    <>
      <Nav base={home} />
      <main className="pt-16">
        <Section id="area" aria-label={name}>
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
            <div>
              <nav aria-label={t("area.breadcrumb")} className="mb-6 font-mono text-xs text-muted-foreground">
                <ol className="flex flex-wrap items-center gap-2">
                  <li><Link href="/" className="rounded hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">{t("area.home")}</Link></li>
                  <li aria-hidden>/</li>
                  <li><a href={`${home}#map`} className="rounded hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">{t("area.coverage")}</a></li>
                  <li aria-hidden>/</li>
                  <li aria-current="page" className="text-foreground">{name}</li>
                </ol>
              </nav>
              <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-ok/30 bg-ok/10 px-3 py-1 font-mono text-xs uppercase tracking-wider text-ok">
                <span aria-hidden className="size-2 rounded-full bg-ok" />
                {t("area.available")}
              </p>
              <h1 className="text-4xl font-semibold tracking-[-0.03em] sm:text-6xl">
                {t("area.h1", { name: inName })}
              </h1>
              <p className="mt-5 max-w-xl text-lg text-muted-foreground">{t("area.lead", { name: inName })}</p>
              <p className="mt-3 max-w-xl text-sm text-muted-foreground">{t("map.hud.confirm")}</p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <ContractButton context={`area_${slug}`} />
                <a
                  href={`${home}#map`}
                  className="inline-flex items-center gap-2 rounded-md px-3 py-2 font-mono text-xs uppercase tracking-wider text-fiber hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {t("area.seeMap")}
                  <ArrowRight className="size-4" aria-hidden />
                </a>
              </div>
            </div>

            <div className="hud-brackets relative rounded-2xl border border-border bg-surface/60 p-4 sm:p-6">
              <StateOutline state={area.state} />
              {list.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[0.65rem] text-muted-foreground">
                  {list.some((c) => !c.demo) && (
                    <li className="flex items-center gap-2">
                      <span aria-hidden className="size-2.5 rounded-full bg-fiber shadow-[0_0_6px_var(--color-fiber)]" />
                      {t("map.legend.client")}
                    </li>
                  )}
                  {list.some((c) => c.demo) && (
                    <li className="flex items-center gap-2">
                      <span aria-hidden className="size-2.5 rounded-full border border-warn" />
                      {t("map.legend.demo")}
                      <SimTag kind="demo" />
                    </li>
                  )}
                </ul>
              )}
              {list.length > 0 && (
                <div className="mt-4 border-t border-border pt-4">
                  <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    {t("area.clients", { name: inName })}
                  </h2>
                  <ul className="mt-3 space-y-1.5">
                    {list.map((c) => (
                      <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <Building2 className="size-4 text-fiber" aria-hidden />
                        <span>{c.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{c.area}</span>
                        {c.demo && <SimTag kind="demo" />}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 font-mono text-[0.7rem] text-muted-foreground">{t("map.approx")}</p>
                </div>
              )}
            </div>
          </div>
        </Section>

        <Section id="plans" aria-label={t("sections.plans")}>
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
            <p className="eyebrow mb-3">[ {t("sections.plans")} ]</p>
            <h2 className="max-w-2xl text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
              {t("area.plansTitle", { name: inName })}
            </h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">{t("plans.lead")}</p>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {plans.map((plan) => (
                <PlanCard key={plan.id} plan={plan} maxMbps={maxMbps} />
              ))}
            </div>
            <p className="mt-3 font-mono text-[0.7rem] text-muted-foreground">{t("plans.speedNote")}</p>
            <div className="mt-8">
              <TrustStrip />
            </div>
            <div className="mt-10 flex justify-center">
              <Link
                href="/planes"
                className="inline-flex items-center gap-2 rounded-md px-3 py-2 font-mono text-xs uppercase tracking-wider text-fiber hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {t("plans.compareAll")}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          </div>
        </Section>

        <Section id="cta" aria-label={t("sections.cta")}>
          <FinalCta />
          <nav aria-label={t("area.others")} className="mx-auto -mt-12 max-w-7xl px-4 pb-20 text-center sm:px-6">
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{t("area.others")}</p>
            <ul className="mt-3 flex flex-wrap justify-center gap-3">
              {others.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={`/cobertura/${s.slug}`}
                    className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {t("area.h1", { name: stateIn(ts, s.slug) })}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </Section>
      </main>
      <Footer base={home} />
      <LeadSheetHost />
      <PlansJsonLd locale={locale} path={`/cobertura/${slug}`} />
      <ServiceJsonLd locale={locale} path={`/cobertura/${slug}`} states={[state]} />
      <JsonLd data={breadcrumb} />
    </>
  )
}
