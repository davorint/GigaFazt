import { Suspense } from "react"
import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { Proposal } from "@/components/surveys/Proposal"
import copy from "@/messages/internal/propuesta.es.json"

/**
 * /interno/levantamientos/propuesta?l=<survey> (owner, 2026-11-19): the printable proposal for a building's administrator,
 * made from a survey on this phone. The offer only, never our costs. Behind the /interno password; noindex.
 */
export const metadata: Metadata = {
  title: { absolute: copy.propuesta.meta.title },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

export default async function PropuestaPage({ params }: PageProps<"/[locale]/interno/levantamientos/propuesta">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-24 sm:px-6 print:max-w-none print:p-0">
      <NextIntlClientProvider locale="es" messages={copy}>
        {/* The survey id is in the address (?l=): read in the browser. */}
        <Suspense fallback={null}>
          <Proposal />
        </Suspense>
      </NextIntlClientProvider>
    </main>
  )
}
