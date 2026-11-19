import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { SyncBar } from "@/components/interno/SyncBar"
import { DeletedList } from "@/components/interno/RecordHistory"
import { AdminLinks } from "@/components/interno/AdminLinks"
import { PayablesApp } from "@/components/finance/PayablesApp"
import syncCopy from "@/messages/internal/sync.es.json"
import cuentas from "@/messages/internal/cuentas.es.json"
import mikrotik from "@/messages/internal/mikrotik.es.json"

/** /interno/admin/cuentas-por-pagar (owner, 2026-11-19). Behind the /interno password; noindex. */
export const metadata: Metadata = {
  title: { absolute: cuentas.cuentas.meta.pagar },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

/** The number field shared with the MikroTik tools reads its "invalid" message from there. */
const messages = { ...cuentas, ...syncCopy, mikrotik: { params: { invalid: mikrotik.mikrotik.params.invalid } } }

export default async function CuentasPorPagarPage({ params }: PageProps<"/[locale]/interno/admin/cuentas-por-pagar">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  const t = cuentas.cuentas.pagar
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-24 sm:px-6">
      <section data-section="cuentas-por-pagar" className="pt-8 pb-2 sm:pt-14">
        <p className="eyebrow">{cuentas.cuentas.kicker}</p>
        <h1 className="mt-3 text-4xl font-light tracking-tight text-foreground sm:text-5xl">{t.title}</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-300">{t.lead}</p>
        <AdminLinks current="cuentas-por-pagar" />
      </section>
      <NextIntlClientProvider locale="es" messages={messages}>
        <SyncBar />
        <PayablesApp />
        <div className="mt-12 grid gap-3">
          <DeletedList kind="porpagar" named />
        </div>
      </NextIntlClientProvider>
    </main>
  )
}
