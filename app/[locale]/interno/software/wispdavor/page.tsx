import type { Metadata } from "next"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { AdminLinks } from "@/components/interno/AdminLinks"
import copy from "@/messages/internal/interno.es.json"

/**
 * /interno/software/wispdavor (owner, 2026-11-21): the WispDavor section, empty until its content is decided. Behind the
 * /interno password (proxy.ts); Spanish only, not linked from the public site, noindex.
 */
const t = copy.interno.tools.software.pages.wispdavor

export const metadata: Metadata = {
  title: { absolute: t.metaTitle },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

export default async function WispDavorPage({ params }: PageProps<"/[locale]/interno/software/wispdavor">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-24 sm:px-6">
      <section data-section="wispdavor" className="pt-8 pb-2 sm:pt-14">
        <p className="eyebrow">{copy.interno.tools.software.kicker}</p>
        <h1 className="mt-3 text-4xl font-light tracking-tight text-foreground sm:text-5xl">{t.name}</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-300">{copy.interno.tools.software.empty}</p>
        <AdminLinks current="software" />
      </section>
    </main>
  )
}
