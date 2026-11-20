import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { BurstLab } from "@/components/mikrotik/BurstLab"
import internal from "@/messages/internal/mikrotik.es.json"

/**
 * The ideal guide for a deployment (owner, 2026-11-16): the saved deployments, the step-by-step guide with its fields,
 * the deployment's download (the guide plus the expert scripts turned on) and the "what's installed" check. The expert
 * scripts and the full editors live at /interno/equipos-telecom/mikrotik/scripts (owner, 2026-11-20: under Equipos de Telecom). Same
 * rules as that page: proxy.ts maps any capitalization here, inside [locale]; Spanish only, not linked, not in the sitemap, noindex.
 */
export const metadata: Metadata = {
  title: { absolute: internal.mikrotik.meta.titleGuide },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

export default async function GuiaMikrotikPage({ params }: PageProps<"/[locale]/interno/equipos-telecom/mikrotik/guia">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  return (
    <NextIntlClientProvider locale="es" messages={internal}>
      <BurstLab page="guide" />
    </NextIntlClientProvider>
  )
}
