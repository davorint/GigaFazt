import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { Nav } from "@/components/hud/Nav"
import { Section } from "@/components/layout/Section"
import { Footer } from "@/components/layout/Footer"
import { PortalApp } from "@/components/customer/PortalApp"
import { company } from "@/lib/company"
import { whatsappHref } from "@/lib/contact"
import { isPlaceholder, type Maybe } from "@/lib/placeholder"

/**
 * The client portal (owner, 2026-11-21, WispDavor → Portal: "Private link"): /mi-cuenta#<token>, sent to each client by
 * WhatsApp. Personal: never indexed or linked, not in the sitemap, disallowed in robots, no referrer. The page is the
 * same for everyone; the client's data loads in the browser with the token (components/customer/PortalApp.tsx).
 */
export async function generateMetadata({ params }: PageProps<"/[locale]/mi-cuenta">): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: "portal" })
  return { title: { absolute: t("metaTitle") }, description: null, robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } }, referrer: "no-referrer" }
}

const CARD = "grid content-start gap-3 rounded-2xl border border-white/10 p-5"
/** Payment data still unfilled shows as XXXXXX (owner, 2026-11-18), the same as /clientes. */
const pay = (v: Maybe<string>) => (isPlaceholder(v) ? "XXXXXX" : v)

export default async function MiCuentaPage({ params }: PageProps<"/[locale]/mi-cuenta">) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations("customer")
  const wa = isPlaceholder(company.whatsapp) ? null : (company.whatsapp as string)
  const rows: [string, Maybe<string>][] = [
    [t("pay.bank"), company.payment.bank],
    [t("pay.clabe"), company.payment.clabe],
    [t("pay.account"), company.payment.account],
    [t("pay.holder"), company.payment.holder],
    [t("pay.reference"), company.payment.reference],
  ]
  const payBlock = (
    <section aria-labelledby="pt-pay" className={CARD}>
      <h2 id="pt-pay" className="text-xl font-normal tracking-tight text-foreground">
        {t("pay.title")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("pay.prepaid")}</p>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="grid gap-0.5">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-mono text-foreground">{pay(v)}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted-foreground">{t("pay.receipt")}</p>
      {wa && (
        <a href={whatsappHref(wa, t("pay.waText"))} target="_blank" rel="noopener noreferrer" className="w-fit text-sm text-fiber underline underline-offset-4">
          {t("pay.sendReceipt")}
        </a>
      )}
    </section>
  )
  return (
    <>
      <Nav base={`/${locale}`} current="clientes" />
      <main>
        <Section id="mi-cuenta" aria-label={t("eyebrow")} className="border-b-0">
          <div className="mx-auto grid max-w-3xl gap-6 px-4 pt-28 pb-24 sm:px-6 lg:pt-36">
            <PortalApp pay={payBlock} />
          </div>
        </Section>
      </main>
      <Footer />
    </>
  )
}
