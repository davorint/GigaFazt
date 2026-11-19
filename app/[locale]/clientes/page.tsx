import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { Nav } from "@/components/hud/Nav"
import { PlaceholderChip } from "@/components/hud/PlaceholderChip"
import { Section } from "@/components/layout/Section"
import { Footer } from "@/components/layout/Footer"
import { PageTransition } from "@/components/layout/PageTransition"
import { BalanceCheck } from "@/components/customer/BalanceCheck"
import { ReportStatus } from "@/components/customer/ReportStatus"
import { ReportForm } from "@/components/support/ReportForm"
import { company } from "@/lib/company"
import { whatsappHref } from "@/lib/contact"
import { hourLabel } from "@/lib/format"
import { isPlaceholder, type Maybe } from "@/lib/placeholder"
import { pageMeta } from "@/lib/site"

export async function generateMetadata({ params }: PageProps<"/[locale]/clientes">): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: "customer" })
  const ts = await getTranslations({ locale, namespace: "seo" })
  return pageMeta(locale, "/clientes", t("metaTitle"), t("metaDescription", { name: company.name as string }), ts("ogAlt"))
}

const SECTIONS = ["ayuda", "reportar", "mis-reportes", "saldo", "contacto"] as const
const H2 = "text-2xl font-normal tracking-tight text-foreground sm:text-3xl"
const CARD = "grid content-start gap-2 rounded-2xl border border-white/10 p-5"

/** Payment data still unfilled shows as XXXXXX (owner, 2026-11-18: "leave it with XXXXXX for now"). */
const pay = (v: Maybe<string>) => (isPlaceholder(v) ? "XXXXXX" : v)

/**
 * The client area (owner, 2026-11-18): self-help before reporting, the report form (same as /reportar, which now
 * redirects here), the status of their reports by phone or code, their balance with phone + PPPoE user, how to pay
 * and how to reach us. In the top menu and the footer.
 */
export default async function ClientesPage({ params }: PageProps<"/[locale]/clientes">) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations("customer")
  const tf = await getTranslations("faq")
  const help = t.raw("help.items") as { title: string; steps: string[] }[]
  const hours = company.policies.officeHours
  const wa = isPlaceholder(company.whatsapp) ? null : (company.whatsapp as string)
  const payRows: [string, Maybe<string>][] = [
    [t("pay.bank"), company.payment.bank],
    [t("pay.clabe"), company.payment.clabe],
    [t("pay.account"), company.payment.account],
    [t("pay.holder"), company.payment.holder],
    [t("pay.reference"), company.payment.reference],
  ]
  return (
    <>
      <Nav base={`/${locale}`} current="clientes" />
      <PageTransition>
        <main>
          <Section id="clientes" aria-labelledby="clientes-title" className="border-b-0">
            <div className="mx-auto grid max-w-6xl gap-6 px-4 pt-28 pb-10 sm:px-6 lg:pt-36">
              <p className="eyebrow">{t("eyebrow")}</p>
              <h1 id="clientes-title" className="text-4xl font-normal tracking-tight text-balance text-foreground sm:text-5xl">
                {t("title")}
              </h1>
              <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">{t("lead")}</p>
              <nav aria-label={t("jump")}>
                <ul className="flex flex-wrap gap-2">
                  {SECTIONS.map((s) => (
                    <li key={s}>
                      <a href={`#${s}`} className="inline-flex min-h-10 items-center rounded-full border border-white/15 px-4 text-sm text-foreground hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                        {t(`sections.${s}`)}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </Section>

          <Section id="ayuda" aria-labelledby="ayuda-title" className="border-b-0">
            <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:px-6">
              <h2 id="ayuda-title" className={H2}>
                {t("help.title")}
              </h2>
              <p className="max-w-2xl text-muted-foreground">{t("help.lead")}</p>
              <div className="grid gap-4 md:grid-cols-2">
                {help.map((h) => (
                  <div key={h.title} className={CARD}>
                    <h3 className="text-base font-medium text-foreground">{h.title}</h3>
                    <ol className="grid list-decimal gap-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
                      {h.steps.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          <Section id="reportar" aria-labelledby="reportar-title" className="border-b-0">
            <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
              <div className="grid content-start gap-3">
                <h2 id="reportar-title" className={H2}>
                  {t("report.title")}
                </h2>
                <p className="text-muted-foreground">{t("report.lead")}</p>
              </div>
              <ReportForm />
            </div>
          </Section>

          <Section id="mis-reportes" aria-labelledby="mis-reportes-title" className="border-b-0">
            <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
              <div className="grid content-start gap-3">
                <h2 id="mis-reportes-title" className={H2}>
                  {t("status.title")}
                </h2>
                <p className="text-muted-foreground">{t("status.lead")}</p>
              </div>
              <ReportStatus />
            </div>
          </Section>

          <Section id="saldo" aria-labelledby="saldo-title" className="border-b-0">
            <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
              <div className="grid content-start gap-4">
                <h2 id="saldo-title" className={H2}>
                  {t("balance.title")}
                </h2>
                <p className="text-muted-foreground">{t("balance.lead")}</p>
                <div id="como-pagar" className={CARD}>
                  <h3 className="text-base font-medium text-foreground">{t("pay.title")}</h3>
                  <p className="text-sm text-muted-foreground">{t("pay.prepaid")}</p>
                  <dl className="grid gap-2 text-sm">
                    {payRows.map(([k, v]) => (
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
                </div>
              </div>
              <BalanceCheck />
            </div>
          </Section>

          <Section id="contacto" aria-labelledby="contacto-title" className="border-b-0">
            <div className="mx-auto grid max-w-6xl gap-6 px-4 pt-12 pb-24 sm:px-6">
              <h2 id="contacto-title" className={H2}>
                {t("contact.title")}
              </h2>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className={CARD}>
                  <dt className="text-sm text-muted-foreground">WhatsApp</dt>
                  <dd>
                    {wa ? (
                      <a href={whatsappHref(wa, t("contact.waText"))} target="_blank" rel="noopener noreferrer" className="font-mono text-foreground underline underline-offset-4">
                        {wa}
                      </a>
                    ) : (
                      <PlaceholderChip keyName="WHATSAPP" />
                    )}
                  </dd>
                </div>
                <div className={CARD}>
                  <dt className="text-sm text-muted-foreground">{t("contact.phone")}</dt>
                  <dd>{isPlaceholder(company.salesPhone) ? <PlaceholderChip keyName={company.salesPhone.key} /> : <a href={`tel:${company.salesPhone}`} className="font-mono text-foreground underline underline-offset-4">{company.salesPhone}</a>}</dd>
                </div>
                <div className={CARD}>
                  <dt className="text-sm text-muted-foreground">{t("contact.email")}</dt>
                  <dd>{isPlaceholder(company.salesEmail) ? <PlaceholderChip keyName={company.salesEmail.key} /> : <a href={`mailto:${company.salesEmail}`} className="text-foreground underline underline-offset-4">{company.salesEmail}</a>}</dd>
                </div>
                <div className={CARD}>
                  <dt className="text-sm text-muted-foreground">{t("contact.hours")}</dt>
                  <dd className="text-foreground">{isPlaceholder(hours) ? <PlaceholderChip keyName={hours.key} /> : tf("officeHoursValue", { open: hourLabel(hours.open, locale), close: hourLabel(hours.close, locale) })}</dd>
                </div>
              </dl>
              {company.network.monitoring24h === true && <p className="text-sm text-muted-foreground">{t("contact.monitoring")}</p>}
            </div>
          </Section>
        </main>
      </PageTransition>
      <Footer base={`/${locale}`} />
    </>
  )
}
