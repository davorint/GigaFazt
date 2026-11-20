import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { BurstLab } from "@/components/mikrotik/BurstLab"
import internal from "@/messages/internal/mikrotik.es.json"

/**
 * Internal MikroTik scripts (queues, deployments, load balancing, setup), served
 * at /interno/equipos-telecom/mikrotik/scripts (owner, 2026-11-20); the calculators and simulators live at /interno/equipos-telecom/calculadora.
 * Behind the /interno password (owner, 2026-11-17); proxy.ts maps any
 * capitalization here. It sits inside [locale] on purpose: a static
 * folder at the app root is listed in every public page's router payload
 * (static siblings of [locale]), which would leak the name. Spanish only, not
 * linked, not in the sitemap, noindex; its copy lives in messages/internal/
 * so it never ships with the public pages' messages.
 */
export const metadata: Metadata = {
  title: { absolute: internal.mikrotik.meta.title },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

export default async function ScriptsMikrotikPage({ params }: PageProps<"/[locale]/interno/equipos-telecom/mikrotik/scripts">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  return (
    <NextIntlClientProvider locale="es" messages={internal}>
      <BurstLab page="scripts" />
    </NextIntlClientProvider>
  )
}
