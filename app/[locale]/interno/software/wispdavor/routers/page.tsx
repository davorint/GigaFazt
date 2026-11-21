import type { Metadata } from "next"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { WispFrame } from "@/components/wispdavor/WispFrame"
import { RoutersApp } from "@/components/wispdavor/RoutersApp"
import wisp from "@/messages/internal/wispdavor.es.json"

/**
 * /interno/software/wispdavor/routers: live router control — each MikroTik pulls its actions (lib/wispdavor/routers.ts). Behind the /interno password (proxy.ts); Spanish only, noindex.
 */
const w = wisp.wispdavor

export const metadata: Metadata = {
  title: { absolute: w.meta.routers },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

export default async function WispRoutersPage({ params }: PageProps<"/[locale]/interno/software/wispdavor/routers">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  return (
    <WispFrame title={w.modules.routers.name} sub>
      <RoutersApp />
    </WispFrame>
  )
}
