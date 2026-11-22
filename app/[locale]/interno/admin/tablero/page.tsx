import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { AdminLinks } from "@/components/interno/AdminLinks"
import { TableroApp } from "@/components/dashboard/TableroApp"
import { SyncBar } from "@/components/interno/SyncBar"
import syncCopy from "@/messages/internal/sync.es.json"
import tablero from "@/messages/internal/tablero.es.json"

/** /interno/admin/tablero (owner, 2026-11-22): the business at a glance with Apache ECharts. Oficina and admins; noindex. */
export const metadata: Metadata = {
  title: { absolute: tablero.tablero.meta },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

// The sync bar keeps this phone's records current (the charts redraw as they arrive).
const messages = { ...tablero, ...syncCopy }

export default async function TableroPage({ params }: PageProps<"/[locale]/interno/admin/tablero">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  const t = tablero.tablero
  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-24 sm:px-6">
      <section data-section="tablero" className="pt-8 pb-2 sm:pt-14">
        <p className="eyebrow">{t.kicker}</p>
        <h1 className="mt-3 text-4xl font-light tracking-tight text-foreground sm:text-5xl">{t.title}</h1>
        <AdminLinks current="tablero" />
      </section>
      <NextIntlClientProvider locale="es" messages={messages}>
        <SyncBar />
        <TableroApp />
      </NextIntlClientProvider>
    </main>
  )
}
