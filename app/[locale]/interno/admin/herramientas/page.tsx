import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { SyncBar } from "@/components/interno/SyncBar"
import { DeletedList } from "@/components/interno/RecordHistory"
import syncCopy from "@/messages/internal/sync.es.json"
import { AdminLinks } from "@/components/interno/AdminLinks"
import { ToolsApp } from "@/components/tools/ToolsApp"
import copy from "@/messages/internal/herramientas.es.json"
import mikrotik from "@/messages/internal/mikrotik.es.json"

/**
 * /interno/admin/herramientas (owner, 2026-11-18): the tools (pliers, fusion splicer, meters…) with where each one is,
 * its purchase and its maintenance. Behind the /interno password (proxy.ts); Spanish only, not linked from the public site, not in the sitemap, noindex.
 */
export const metadata: Metadata = {
  title: { absolute: copy.herramientas.meta.title },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

/** The number field shared with the MikroTik tools reads its "invalid" message from there. */
const messages = { ...copy, ...syncCopy, mikrotik: { params: { invalid: mikrotik.mikrotik.params.invalid } } }

export default async function HerramientasPage({ params }: PageProps<"/[locale]/interno/admin/herramientas">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  const t = copy.herramientas
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-24 sm:px-6">
      <section data-section="herramientas" className="pt-8 pb-2 sm:pt-14">
        <p className="eyebrow">{t.kicker}</p>
        <h1 className="mt-3 text-4xl font-light tracking-tight text-foreground sm:text-5xl">{t.title}</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-300">{t.lead}</p>
        
        <AdminLinks current="herramientas" />
      </section>
      <NextIntlClientProvider locale="es" messages={messages}>
        <SyncBar />
        <ToolsApp />
        <div className="mt-12 grid gap-3">
          <DeletedList kind="tools" />
        </div>
      </NextIntlClientProvider>
    </main>
  )
}
