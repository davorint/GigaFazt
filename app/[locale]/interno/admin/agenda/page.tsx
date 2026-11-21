import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { SyncBar } from "@/components/interno/SyncBar"
import { DeletedList } from "@/components/interno/RecordHistory"
import { AdminLinks } from "@/components/interno/AdminLinks"
import { AgendaApp } from "@/components/agenda/AgendaApp"
import syncCopy from "@/messages/internal/sync.es.json"
import agenda from "@/messages/internal/agenda.es.json"
import clientes from "@/messages/internal/clientes.es.json"
import tecnico from "@/messages/internal/tecnico.es.json"

/** /interno/admin/agenda (owner, 2026-11-19): installations and visits by day and technician. Behind the /interno password; noindex. */
export const metadata: Metadata = {
  title: { absolute: agenda.agenda.meta.title },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

const messages = { tecnico: { summary: tecnico.tecnico.summary }, ...clientes, ...agenda, ...syncCopy }

export default async function AgendaPage({ params }: PageProps<"/[locale]/interno/admin/agenda">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  const t = agenda.agenda
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-24 sm:px-6">
      <section data-section="agenda" className="pt-8 pb-2 sm:pt-14">
        <p className="eyebrow">{t.kicker}</p>
        <h1 className="mt-3 text-4xl font-light tracking-tight text-foreground sm:text-5xl">{t.title}</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-300">{t.lead}</p>
        <AdminLinks current="agenda" />
      </section>
      <NextIntlClientProvider locale="es" messages={messages}>
        <SyncBar />
        <AgendaApp />
        <div className="mt-12 grid gap-3">
          <DeletedList kind="agenda" named />
        </div>
      </NextIntlClientProvider>
    </main>
  )
}
