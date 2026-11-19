import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { SyncBar } from "@/components/interno/SyncBar"
import { DeletedList } from "@/components/interno/RecordHistory"
import { AdminLinks } from "@/components/interno/AdminLinks"
import { ToolBuysApp } from "@/components/toolbuys/ToolBuysApp"
import syncCopy from "@/messages/internal/sync.es.json"
import compras from "@/messages/internal/compras.es.json"
import herramientas from "@/messages/internal/herramientas.es.json"
import mikrotik from "@/messages/internal/mikrotik.es.json"

/**
 * /interno/admin/compras-herramientas (owner, 2026-11-18): candidate models for each tool we need, with offers, priority and status; bought ones go to Herramientas. Behind the /interno password (proxy.ts); Spanish only, not
 * linked from the public site, not in the sitemap, noindex.
 */
export const metadata: Metadata = {
  title: { absolute: compras.comprasHerramientas.meta.title },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

/** The number field shared with the MikroTik tools reads its "invalid" message from there. */
const messages = { ...herramientas, ...compras, ...syncCopy, mikrotik: { params: { invalid: mikrotik.mikrotik.params.invalid } } }

export default async function ComprasHerramientasPage({ params }: PageProps<"/[locale]/interno/admin/compras-herramientas">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  const t = compras.comprasHerramientas
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-24 sm:px-6">
      <section data-section="compras-herramientas" className="pt-8 pb-2 sm:pt-14">
        <p className="eyebrow">{t.kicker}</p>
        <h1 className="mt-3 text-4xl font-light tracking-tight text-foreground sm:text-5xl">{t.title}</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-300">{t.lead}</p>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- another internal page: a full load (proxy.ts checks the session and rewrites it) */}
        <a href="/interno/admin/herramientas" className="mt-3 inline-flex min-h-9 w-fit items-center text-sm text-zinc-100 underline decoration-white/30 underline-offset-4 hover:decoration-white">
          {t.stockLink}
        </a>
        <AdminLinks current="compras-herramientas" />
      </section>
      <NextIntlClientProvider locale="es" messages={messages}>
        <SyncBar />
        <ToolBuysApp />
        <div className="mt-12 grid gap-3">
          <DeletedList kind="toolbuys" named />
        </div>
      </NextIntlClientProvider>
    </main>
  )
}
