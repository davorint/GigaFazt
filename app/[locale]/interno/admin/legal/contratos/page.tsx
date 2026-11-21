import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { SyncBar } from "@/components/interno/SyncBar"
import { DeletedList } from "@/components/interno/RecordHistory"
import { AdminLinks } from "@/components/interno/AdminLinks"
import { ContractsApp } from "@/components/contracts/ContractsApp"
import syncCopy from "@/messages/internal/sync.es.json"
import contratos from "@/messages/internal/contratos.es.json"
import acuerdos from "@/messages/internal/acuerdos.es.json"
import mikrotik from "@/messages/internal/mikrotik.es.json"

/**
 * /interno/admin/legal/contratos (owner, 2026-11-21): every contract with its signed copies, and the building agreements
 * (Acuerdos con edificios, before at /interno/admin/acuerdos). Behind the /interno password; noindex.
 */
export const metadata: Metadata = {
  title: { absolute: contratos.contratos.meta.title },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

/** The number field shared with the MikroTik tools reads its "invalid" message from there. */
const messages = { ...contratos, ...acuerdos, ...syncCopy, mikrotik: { params: { invalid: mikrotik.mikrotik.params.invalid } } }

export default async function ContratosPage({ params }: PageProps<"/[locale]/interno/admin/legal/contratos">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  const t = contratos.contratos
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-24 sm:px-6">
      <section data-section="contratos" className="pt-8 pb-2 sm:pt-14">
        <p className="eyebrow">{t.kicker}</p>
        <h1 className="mt-3 text-4xl font-light tracking-tight text-foreground sm:text-5xl">{t.title}</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-300">{t.lead}</p>
        <AdminLinks current="legal" />
      </section>
      <NextIntlClientProvider locale="es" messages={messages}>
        <SyncBar />
        <ContractsApp />
        <div className="mt-12 grid gap-3">
          <DeletedList kind="contratos" named />
        </div>
      </NextIntlClientProvider>
    </main>
  )
}
