import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { AdminLinks } from "@/components/interno/AdminLinks"
import { AsterSimulator } from "@/components/asternos/AsterSimulator"
import copy from "@/messages/internal/asternos.es.json"
import mikrotik from "@/messages/internal/mikrotik.es.json"

/**
 * /interno/equipos-telecom/asternos/simulador (owner, 2026-11-20: a simulator/calculator for AsterNOS-VPP itself): plan design,
 * busy hour, priority classes and hardware sizing. Behind the /interno password (proxy.ts); Spanish
 * only, not linked from the public site, noindex.
 */
export const metadata: Metadata = {
  title: { absolute: copy.asternos.meta.simulator },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

/** The number fields shared with the MikroTik tools read their "invalid" message from there. */
const messages = { ...copy, mikrotik: { params: { invalid: mikrotik.mikrotik.params.invalid } } }

export default async function SimuladorAsternosPage({ params }: PageProps<"/[locale]/interno/equipos-telecom/asternos/simulador">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  const t = copy.asternos
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-24 sm:px-6">
      <section data-section="asternos-simulador" className="pt-8 pb-2 sm:pt-14">
        <p className="eyebrow">{t.kicker}</p>
        <h1 className="mt-3 text-4xl font-light tracking-tight text-foreground sm:text-5xl">{t.simTitle}</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-300">{t.simLead}</p>
        <AdminLinks current="equipos-telecom" />
      </section>
      <NextIntlClientProvider locale="es" messages={messages}>
        <AsterSimulator />
      </NextIntlClientProvider>
    </main>
  )
}
