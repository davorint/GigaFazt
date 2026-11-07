import { getTranslations } from "next-intl/server"
import { addOns, plans } from "@/lib/plans"
import { company } from "@/lib/company"
import { speedLabel } from "@/lib/format"
import { isPlaceholder } from "@/lib/placeholder"
import { ORG_ID, absoluteUrl } from "@/lib/site"
import { JsonLd } from "@/components/seo/JsonLd"

/**
 * `Offer` JSON-LD per plan (SPEC §3 ✅). Only concrete BUSINESS.md values are
 * emitted: placeholder prices/fees/seller are omitted, never invented.
 */
export async function PlansJsonLd({ locale, path }: { locale: string; path: string }) {
  const page = absoluteUrl(locale, path)
  const t = await getTranslations({ locale, namespace: "plans" })
  const ta = await getTranslations({ locale, namespace: "addons" })
  // Seller references the Organization node emitted by ServiceJsonLd once named.
  const seller = isPlaceholder(company.name) ? undefined : { "@id": ORG_ID }

  const monthly = (price: number) => ({
    "@type": "UnitPriceSpecification",
    price,
    priceCurrency: "MXN",
    valueAddedTaxIncluded: true,
    unitCode: "MON",
    referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "MON" },
  })

  const offers = plans.map((p) => {
    const name = t("jsonLdName", { speed: speedLabel(p.downMbps) })
    return {
      "@type": "Offer",
      "@id": `${page}#offer-${p.id}`,
      name,
      itemOffered: { "@type": "Service", name },
      ...(isPlaceholder(p.priceMxn)
        ? {}
        : { price: p.priceMxn, priceCurrency: "MXN", priceSpecification: monthly(p.priceMxn) }),
      ...(seller ? { seller } : {}),
    }
  })

  const addOnOffers = addOns.flatMap((a) =>
    isPlaceholder(a.priceMxn)
      ? []
      : [
          {
            "@type": "Offer",
            "@id": `${page}#offer-addon-${a.id}`,
            name: ta(`${a.id as "tv"}.name`),
            price: a.priceMxn,
            priceCurrency: "MXN",
            priceSpecification: monthly(a.priceMxn),
            ...(seller ? { seller } : {}),
          },
        ]
  )

  const data = {
    "@context": "https://schema.org",
    "@type": "OfferCatalog",
    "@id": `${page}#offers`,
    name: t("pageTitle"),
    itemListElement: [...offers, ...addOnOffers],
  }

  return <JsonLd data={data} />
}
