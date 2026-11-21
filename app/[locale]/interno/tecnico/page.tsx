import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { AdminLinks } from "@/components/interno/AdminLinks"
import { SyncBar } from "@/components/interno/SyncBar"
import { TecnicoApp } from "@/components/tecnico/TecnicoApp"
import materiales from "@/messages/internal/materiales.es.json"
import mikrotik from "@/messages/internal/mikrotik.es.json"
import syncCopy from "@/messages/internal/sync.es.json"
import tecnico from "@/messages/internal/tecnico.es.json"

/**
 * /interno/tecnico (WispDavor phase 5, owner 2026-11-21): the technician's jobs of the day on the phone. Behind the
 * /interno password (proxy.ts); Spanish only, noindex.
 */
export const metadata: Metadata = {
  title: { absolute: tecnico.tecnico.meta.title },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

// The materials form (stock movements) needs its own copy.
const messages = { ...tecnico, ...materiales, ...syncCopy, mikrotik: { params: { invalid: mikrotik.mikrotik.params.invalid } } }

export default async function TecnicoPage({ params }: PageProps<"/[locale]/interno/tecnico">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  const t = tecnico.tecnico
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 sm:px-6">
      <section data-section="tecnico" className="pt-8 pb-2 sm:pt-14">
        <p className="eyebrow">{t.kicker}</p>
        <h1 className="mt-3 text-4xl font-light tracking-tight text-foreground sm:text-5xl">{t.title}</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-300">{t.lead}</p>
        <AdminLinks current="tecnico" />
      </section>
      <NextIntlClientProvider locale="es" messages={messages}>
        <SyncBar />
        <TecnicoApp />
      </NextIntlClientProvider>
    </main>
  )
}
