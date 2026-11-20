import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { SyncBar } from "@/components/interno/SyncBar"
import { DeletedList } from "@/components/interno/RecordHistory"
import syncCopy from "@/messages/internal/sync.es.json"
import { AdminLinks } from "@/components/interno/AdminLinks"
import { MaterialsApp } from "@/components/materials/MaterialsApp"
import copy from "@/messages/internal/materiales.es.json"
import mikrotik from "@/messages/internal/mikrotik.es.json"

/**
 * /interno/materiales/en-existencia (owner, 2026-11-17; split 2026-11-18): materials in stock (each place's stock, fiber rolls,
 * ONTs by serial). The master list with prices and buying options is /interno/materiales/compras. Behind the /interno password (proxy.ts); Spanish only, not
 * linked from the public site, not in the sitemap, noindex.
 */
export const metadata: Metadata = {
  title: { absolute: copy.materiales.meta.title },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

const messages = { ...copy, ...syncCopy, mikrotik: { params: { invalid: mikrotik.mikrotik.params.invalid } } }

export default async function MaterialesPage({ params }: PageProps<"/[locale]/interno/materiales/en-existencia">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  const t = copy.materiales
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-24 sm:px-6">
      <section data-section="materiales" className="pt-8 pb-2 sm:pt-14">
        <p className="eyebrow">{t.kicker}</p>
        <h1 className="mt-3 text-4xl font-light tracking-tight text-foreground sm:text-5xl">{t.title}</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-300">{t.lead}</p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">{t.storage}</p>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- another internal page: a full load (proxy.ts checks the session and rewrites it) */}
        <a href="/interno/materiales/compras" className="mt-3 inline-flex min-h-9 w-fit items-center text-sm text-zinc-100 underline decoration-white/30 underline-offset-4 hover:decoration-white">
          {t.buyLink}
        </a>
        <AdminLinks current="materiales" />
      </section>
      <NextIntlClientProvider locale="es" messages={messages}>
        <SyncBar />
        <MaterialsApp />
        <div className="mt-12 grid gap-3">
          <DeletedList kind="stock" named />
          <DeletedList kind="rolls" named />
        </div>
      </NextIntlClientProvider>
    </main>
  )
}
