import type { Metadata } from "next"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { WispFrame } from "@/components/wispdavor/WispFrame"
import { TrafficApp } from "@/components/wispdavor/TrafficApp"
import wisp from "@/messages/internal/wispdavor.es.json"

/**
 * /interno/software/wispdavor/trafico: download and upload per PPPoE user, as each router reports it. Behind the /interno password (proxy.ts); Spanish only, noindex.
 */
const w = wisp.wispdavor

export const metadata: Metadata = {
  title: { absolute: w.meta.trafico },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

export default async function WispTraficoPage({ params }: PageProps<"/[locale]/interno/software/wispdavor/trafico">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  return (
    <WispFrame title={w.modules.trafico.name} sub>
      <TrafficApp />
    </WispFrame>
  )
}
