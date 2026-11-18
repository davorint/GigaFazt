import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { SyncBar } from "@/components/interno/SyncBar"
import { AdminLinks } from "@/components/interno/AdminLinks"
import { NotesApp } from "@/components/notes/NotesApp"
import syncCopy from "@/messages/internal/sync.es.json"
import copy from "@/messages/internal/notas.es.json"

/**
 * /interno/admin/notas (owner, 2026-11-18): the team's post-its (colors, pinned on top, done/archive, author and date),
 * shared through the database. Behind the /interno password (proxy.ts); Spanish only, not linked from the public site,
 * not in the sitemap, noindex.
 */
export const metadata: Metadata = {
  title: { absolute: copy.notas.meta.title },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

const messages = { ...copy, ...syncCopy }

export default async function NotasPage({ params }: PageProps<"/[locale]/interno/admin/notas">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  const t = copy.notas
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
      <section data-section="notas" className="pt-8 pb-2 sm:pt-14">
        <p className="eyebrow">{t.kicker}</p>
        <h1 className="mt-3 text-4xl font-light tracking-tight text-foreground sm:text-5xl">{t.title}</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-300">{t.lead}</p>
        <AdminLinks current="notas" />
      </section>
      <NextIntlClientProvider locale="es" messages={messages}>
        <SyncBar />
        <NotesApp />
      </NextIntlClientProvider>
    </main>
  )
}
