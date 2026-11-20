import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { SyncBar } from "@/components/interno/SyncBar"
import { AdminLinks } from "@/components/interno/AdminLinks"
import { AgreementsApp } from "@/components/sites/AgreementsApp"
import syncCopy from "@/messages/internal/sync.es.json"
import acuerdos from "@/messages/internal/acuerdos.es.json"

/** /interno/admin/acuerdos (owner, 2026-11-19): every building agreement and where it stands. Behind the /interno password; noindex. */
export const metadata: Metadata = {
  title: { absolute: acuerdos.acuerdos.meta.title },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

const messages = { ...acuerdos, ...syncCopy }

export default async function AcuerdosPage({ params }: PageProps<"/[locale]/interno/admin/acuerdos">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  const t = acuerdos.acuerdos
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-24 sm:px-6">
      <section data-section="acuerdos" className="pt-8 pb-2 sm:pt-14">
        <p className="eyebrow">{t.kicker}</p>
        <h1 className="mt-3 text-4xl font-light tracking-tight text-foreground sm:text-5xl">{t.title}</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-300">{t.lead}</p>
        <AdminLinks current="acuerdos" />
      </section>
      <NextIntlClientProvider locale="es" messages={messages}>
        <SyncBar />
        <AgreementsApp />
      </NextIntlClientProvider>
    </main>
  )
}
