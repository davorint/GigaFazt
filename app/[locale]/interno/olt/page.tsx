import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { OltKnowledgeBase } from "@/components/olt/OltKnowledgeBase"
import internal from "@/messages/internal/olt.es.json"

/**
 * Internal knowledge base for Huawei OLTs (MA5600T family and MA5800), served at /interno/olt (owner, 2026-11-16).
 * Same rules as /interno/mikrotik and /interno/calculadora: proxy.ts rewrites /interno/olt (any capitalization) here, inside [locale]
 * so the name never appears in the public pages' router payload; Spanish only, not linked from the public
 * site, not in the sitemap, noindex; copy from messages/internal/.
 */
export const metadata: Metadata = {
  title: { absolute: internal.olt.meta.title },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

export default async function OltPage({ params }: PageProps<"/[locale]/interno/olt">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  return (
    <NextIntlClientProvider locale="es" messages={internal}>
      <OltKnowledgeBase />
    </NextIntlClientProvider>
  )
}
