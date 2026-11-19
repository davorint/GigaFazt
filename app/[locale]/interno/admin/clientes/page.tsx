import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { SyncBar } from "@/components/interno/SyncBar"
import { DeletedList } from "@/components/interno/RecordHistory"
import { AdminLinks } from "@/components/interno/AdminLinks"
import { ClientsApp } from "@/components/clients/ClientsApp"
import copy from "@/messages/internal/clientes.es.json"
import syncCopy from "@/messages/internal/sync.es.json"
import mikrotik from "@/messages/internal/mikrotik.es.json"
import agenda from "@/messages/internal/agenda.es.json"
import reportes from "@/messages/internal/reportes.es.json"
import materiales from "@/messages/internal/materiales.es.json"

/**
 * /interno/admin/clientes (owner, 2026-11-17): subscribers (synced through the database like the surveys), the
 * website's requests, and the import from a spreadsheet or a MikroTik /ppp secret export. Personal data: behind the
 * /interno password (proxy.ts); Spanish only, not linked from the public site, not in the sitemap, noindex.
 */
export const metadata: Metadata = {
  title: { absolute: copy.clientes.meta.title },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

/** The number field shared with the MikroTik tools reads its "invalid" message from there. */
// Only the labels the client's history needs from Reportes and Materiales.
const history = { reportes: { categories: reportes.reportes.categories, statuses: reportes.reportes.statuses }, materiales: { move: { kinds: materiales.materiales.move.kinds } } }
const messages = { ...copy, ...agenda, ...history, ...syncCopy, mikrotik: { params: { invalid: mikrotik.mikrotik.params.invalid } } }

export default async function ClientesPage({ params }: PageProps<"/[locale]/interno/admin/clientes">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  const t = copy.clientes
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-24 sm:px-6">
      <section data-section="clientes" className="pt-8 pb-2 sm:pt-14">
        <p className="eyebrow">{t.kicker}</p>
        <h1 className="mt-3 text-4xl font-light tracking-tight text-foreground sm:text-5xl">{t.title}</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-300">{t.lead}</p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-amber-200">{t.privacy}</p>
        <AdminLinks current="clientes" />
      </section>
      <NextIntlClientProvider locale="es" messages={messages}>
        <SyncBar />
        <ClientsApp />
        <div className="mt-12 grid gap-3">
          <DeletedList kind="clients" named />
          <DeletedList kind="payments" named />
        </div>
      </NextIntlClientProvider>
    </main>
  )
}
