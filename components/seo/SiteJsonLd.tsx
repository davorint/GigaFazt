import { getTranslations } from "next-intl/server"
import { company } from "@/lib/company"
import { STATES } from "@/lib/geo/states"
import { SERVICE_ZONE } from "@/lib/coverage"
import { faqEntries, factText } from "@/components/conversion/faq-content"
import { isAnswered } from "@/lib/faq"
import { isPlaceholder } from "@/lib/placeholder"
import { ORG_ID, SITE_URL, absoluteUrl } from "@/lib/site"
import { JsonLd } from "./JsonLd"
import { stateName } from "@/lib/geo/state-names"

/** Organization only once BUSINESS.md has a name (never an invented brand). */
function organization() {
  if (isPlaceholder(company.name)) return null
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: company.name,
    url: SITE_URL,
    // Raster square logo: what Google's Organization logo guidelines expect.
    logo: `${SITE_URL}/brand/gigafazt-logo-512.png`,
    ...(isPlaceholder(company.salesPhone) ? {} : { telephone: company.salesPhone }),
    ...(isPlaceholder(company.salesEmail) ? {} : { email: company.salesEmail }),
  }
}

/**
 * Site-level JSON-LD (SPEC SEO): Organization (when named) + the fiber
 * `Service` with `areaServed`, linked via `hasOfferCatalog` to the
 * OfferCatalog emitted by PlansJsonLd for the same page. `states` narrows areaServed on /cobertura pages.
 */
export async function ServiceJsonLd({
  locale,
  path,
  states = STATES,
}: {
  locale: string
  path: string
  states?: typeof STATES
}) {
  const t = await getTranslations({ locale, namespace: "seo" })
  const ts = await getTranslations({ locale, namespace: "states" })
  const org = organization()
  const page = absoluteUrl(locale, path)
  const service = {
    "@type": "Service",
    "@id": `${page}#service`,
    url: page,
    hasOfferCatalog: { "@id": `${page}#offers` },
    name: t("serviceName"),
    serviceType: t("serviceType"),
    description: t("serviceDescription"),
    // The served part of each state (lib/coverage SERVICE_ZONE), not the whole state.
    areaServed: states.flatMap((s) => {
      const state = { "@type": "State", name: stateName(ts, s.slug), containedInPlace: { "@type": "Country", name: "México" } }
      const zone = SERVICE_ZONE[s.code]
      if (zone.scope === "all") return [{ ...state, "@type": "AdministrativeArea" }]
      return zone.places.map((name) => ({
        "@type": zone.scope === "metro" ? "AdministrativeArea" : "City",
        name,
        containedInPlace: state,
      }))
    }),
    ...(org ? { provider: { "@id": ORG_ID } } : {}),
  }
  return <JsonLd data={{ "@context": "https://schema.org", "@graph": org ? [org, service] : [service] }} />
}

/** FAQPage with only fully-answered items (no placeholder answers in structured data). */
export async function FaqJsonLd({ locale }: { locale: string }) {
  const t = await getTranslations({ locale })
  const entries = faqEntries(t, locale).filter((e) => isAnswered(e.item))
  if (entries.length === 0) return null
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: entries.map(({ item, question, answer }) => ({
          "@type": "Question",
          name: question,
          acceptedAnswer: {
            "@type": "Answer",
            text: [answer, ...item.facts.map((f) => `${t(`faq.facts.${f.label}`)}: ${factText(f, locale, t)}`)].join(" "),
          },
        })),
      }}
    />
  )
}
