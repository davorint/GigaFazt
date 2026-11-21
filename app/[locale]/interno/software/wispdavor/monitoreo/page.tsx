import type { Metadata } from "next"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { WispFrame } from "@/components/wispdavor/WispFrame"
import { MonitorApp } from "@/components/wispdavor/MonitorApp"
import wisp from "@/messages/internal/wispdavor.es.json"

/**
 * /interno/software/wispdavor/monitoreo: sessions online, carrier and ONT pings and outages per router (phase 4). Behind the /interno password (proxy.ts); Spanish only, noindex.
 */
const w = wisp.wispdavor

export const metadata: Metadata = {
  title: { absolute: w.meta.monitoreo },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

export default async function WispMonitoreoPage({ params }: PageProps<"/[locale]/interno/software/wispdavor/monitoreo">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  return (
    <WispFrame title={w.modules.monitoreo.name} sub>
      <MonitorApp />
    </WispFrame>
  )
}
