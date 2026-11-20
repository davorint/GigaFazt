import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { AdminLinks } from "@/components/interno/AdminLinks"
import { AsterGuide } from "@/components/asternos/AsterGuide"
import copy from "@/messages/internal/asternos.es.json"
import mikrotik from "@/messages/internal/mikrotik.es.json"

/**
 * /interno/equipos-telecom/asternos/guia (owner, 2026-11-20): the AsterNOS-VPP deployment step by step, with its fields and
 * the generated configuration (each command from docs.asternos.com). Behind the /interno password (proxy.ts); Spanish
 * only, not linked from the public site, noindex.
 */
export const metadata: Metadata = {
  title: { absolute: copy.asternos.meta.guide },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

/** The number fields shared with the MikroTik tools read their "invalid" message from there. */
const messages = { ...copy, mikrotik: { params: { invalid: mikrotik.mikrotik.params.invalid } } }

export default async function GuiaAsternosPage({ params }: PageProps<"/[locale]/interno/equipos-telecom/asternos/guia">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  const t = copy.asternos
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-24 sm:px-6">
      <section data-section="asternos-guia" className="pt-8 pb-2 sm:pt-14">
        <p className="eyebrow">{t.kicker}</p>
        <h1 className="mt-3 text-4xl font-light tracking-tight text-foreground sm:text-5xl">{t.guideTitle}</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-300">{t.guideLead}</p>
        <AdminLinks current="equipos-telecom" />
      </section>
      <NextIntlClientProvider locale="es" messages={messages}>
        <AsterGuide />
      </NextIntlClientProvider>
    </main>
  )
}
