import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { SyncBar } from "@/components/interno/SyncBar"
import { AdminLinks } from "@/components/interno/AdminLinks"
import { NumbersApp } from "@/components/interno/NumbersApp"
import syncCopy from "@/messages/internal/sync.es.json"
import numeros from "@/messages/internal/numeros.es.json"

/** /interno/admin/numeros (owner, 2026-11-19): the business month by month and the profit of each location. Behind the /interno password; noindex. */
export const metadata: Metadata = {
  title: { absolute: numeros.numeros.meta.title },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

const messages = { ...numeros, ...syncCopy }

export default async function NumerosPage({ params }: PageProps<"/[locale]/interno/admin/numeros">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  const t = numeros.numeros
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-24 sm:px-6">
      <section data-section="numeros" className="pt-8 pb-2 sm:pt-14">
        <p className="eyebrow">{t.kicker}</p>
        <h1 className="mt-3 text-4xl font-light tracking-tight text-foreground sm:text-5xl">{t.title}</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-300">{t.lead}</p>
        <AdminLinks current="numeros" />
      </section>
      <NextIntlClientProvider locale="es" messages={messages}>
        <SyncBar />
        <NumbersApp />
      </NextIntlClientProvider>
    </main>
  )
}
