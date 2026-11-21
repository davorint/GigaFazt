import type { Metadata } from "next"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { WispFrame } from "@/components/wispdavor/WispFrame"
import { PortalAdmin } from "@/components/wispdavor/PortalAdmin"
import wisp from "@/messages/internal/wispdavor.es.json"

/**
 * /interno/software/wispdavor/portal: each client's private portal link (lib/wispdavor/portal-server.ts). Behind the /interno password (proxy.ts); Spanish only, noindex.
 */
const w = wisp.wispdavor

export const metadata: Metadata = {
  title: { absolute: w.meta.portal },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

export default async function WispPortalPage({ params }: PageProps<"/[locale]/interno/software/wispdavor/portal">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  return (
    <WispFrame title={w.modules.portal.name} sub>
      <PortalAdmin />
    </WispFrame>
  )
}
