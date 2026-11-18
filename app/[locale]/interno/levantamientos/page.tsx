import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { SyncBar } from "@/components/interno/SyncBar"
import { DeletedList } from "@/components/interno/RecordHistory"
import syncCopy from "@/messages/internal/sync.es.json"
import { AdminLinks } from "@/components/interno/AdminLinks"
import { SurveysApp } from "@/components/surveys/SurveysApp"
import copy from "@/messages/internal/levantamientos.es.json"
import materiales from "@/messages/internal/materiales.es.json"
import mikrotik from "@/messages/internal/mikrotik.es.json"

/**
 * /interno/levantamientos (owner, 2026-11-17): site surveys of a building before a deployment, filled on a phone during
 * the visit, saved in this browser and shared as a file (a Postgres database later). Behind the /interno password
 * (proxy.ts); Spanish only, not linked from the public site, not in the sitemap, noindex.
 */
export const metadata: Metadata = {
  title: { absolute: copy.levantamientos.meta.title },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

/** The number field shared with the MikroTik tools reads its "invalid" message from there. */
const messages = { ...copy, ...syncCopy, ...materiales, mikrotik: { params: { invalid: mikrotik.mikrotik.params.invalid } } }

export default async function LevantamientosPage({ params }: PageProps<"/[locale]/interno/levantamientos">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  const t = copy.levantamientos
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-24 sm:px-6">
      <section data-section="levantamientos" className="pt-8 pb-2 sm:pt-14">
        <p className="eyebrow">{t.kicker}</p>
        <h1 className="mt-3 text-4xl font-light tracking-tight text-foreground sm:text-5xl">{t.title}</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-300">{t.lead}</p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">{t.storage}</p>
        <AdminLinks current="levantamientos" />
      </section>
      <NextIntlClientProvider locale="es" messages={messages}>
        <SyncBar />
        <SurveysApp />
        <div className="mt-12 grid gap-3">
          <DeletedList kind="surveys" />
        </div>
      </NextIntlClientProvider>
    </main>
  )
}
