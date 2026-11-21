import type { Metadata } from "next"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { WispFrame } from "@/components/wispdavor/WispFrame"
import { HotspotApp } from "@/components/wispdavor/HotspotApp"
import wisp from "@/messages/internal/wispdavor.es.json"

/**
 * /interno/software/wispdavor/hotspot: common-area Wi-Fi voucher plans and vouchers (lib/wispdavor/hotspot.ts). Behind the /interno password (proxy.ts); Spanish only, noindex.
 */
const w = wisp.wispdavor

export const metadata: Metadata = {
  title: { absolute: w.meta.hotspot },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

export default async function WispHotspotPage({ params }: PageProps<"/[locale]/interno/software/wispdavor/hotspot">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  return (
    <WispFrame title={w.modules.hotspot.name} sub>
      <HotspotApp />
    </WispFrame>
  )
}
