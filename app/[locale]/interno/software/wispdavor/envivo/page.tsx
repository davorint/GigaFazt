import type { Metadata } from "next"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { WispFrame } from "@/components/wispdavor/WispFrame"
import { LiveApp } from "@/components/wispdavor/LiveApp"
import wisp from "@/messages/internal/wispdavor.es.json"

/**
 * /interno/software/wispdavor/envivo: one router live over its REST API (owner 2026-11-21), read-only unless switched. Behind the /interno password (proxy.ts); Spanish only, noindex.
 */
const w = wisp.wispdavor

export const metadata: Metadata = {
  title: { absolute: w.meta.envivo },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

export default async function WispEnVivoPage({ params }: PageProps<"/[locale]/interno/software/wispdavor/envivo">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  return (
    <WispFrame title={w.modules.envivo.name} sub>
      <LiveApp />
    </WispFrame>
  )
}
