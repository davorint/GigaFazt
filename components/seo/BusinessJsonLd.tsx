import { getTranslations } from "next-intl/server"
import { business } from "@/lib/business"
import { ORG_ID, absoluteUrl } from "@/lib/site"
import { JsonLd } from "./JsonLd"
import { areaServed, organization } from "./SiteJsonLd"

/**
 * /empresas JSON-LD: the two lines of business as Services (business internet
 * links, internal fiber networks and cabling) over the served zone, provided
 * by the Organization. No offers or prices: business work is quoted per
 * project (owner), so nothing price-like is claimed.
 */
export async function BusinessJsonLd({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "seo" })
  const ts = await getTranslations({ locale, namespace: "states" })
  const page = absoluteUrl(locale, "/empresas")
  const org = organization()
  const area = areaServed(ts)
  const provider = org ? { provider: { "@id": ORG_ID } } : {}
  const services = [
    {
      "@type": "Service",
      "@id": `${page}#internet`,
      url: `${page}#business-internet`,
      name: t("bizInternetName"),
      serviceType: t("bizInternetType"),
      description: t("bizInternetDescription", { max: business.maxLinkGbps }),
      audience: { "@type": "BusinessAudience" },
      areaServed: area,
      ...provider,
    },
    {
      "@type": "Service",
      "@id": `${page}#networks`,
      url: `${page}#business-networks`,
      name: t("bizNetworksName"),
      serviceType: t("bizNetworksType"),
      description: t("bizNetworksDescription", business.internalNetworkGbps),
      audience: { "@type": "BusinessAudience" },
      areaServed: area,
      ...provider,
    },
  ]
  return <JsonLd data={{ "@context": "https://schema.org", "@graph": [org, ...services].filter(Boolean) }} />
}
