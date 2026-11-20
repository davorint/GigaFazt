import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { BurstLab } from "@/components/mikrotik/BurstLab"
import internal from "@/messages/internal/mikrotik.es.json"

/**
 * Internal calculators and simulators (burst, plans, shared parent, busy-hour
 * capacity, solver), served at /interno/calculadora; the MikroTik scripts live at
 * /interno/routers/scripts-mikrotik. Same rules as that page: proxy.ts rewrites /interno/calculadora (any
 * capitalization) here, inside [locale] so the name never appears in the
 * public pages' router payload; Spanish only, not linked, not in the sitemap,
 * noindex; copy from messages/internal/.
 */
export const metadata: Metadata = {
  title: { absolute: internal.mikrotik.meta.titleCalc },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

export default async function CalculadoraPage({ params }: PageProps<"/[locale]/interno/calculadora">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  return (
    <NextIntlClientProvider locale="es" messages={internal}>
      <BurstLab page="calculators" />
    </NextIntlClientProvider>
  )
}
