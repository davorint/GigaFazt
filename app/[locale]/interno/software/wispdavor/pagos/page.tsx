import type { Metadata } from "next"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { WispFrame } from "@/components/wispdavor/WispFrame"
import { OnlinePaymentsApp } from "@/components/wispdavor/OnlinePaymentsApp"
import wisp from "@/messages/internal/wispdavor.es.json"

/**
 * /interno/software/wispdavor/pagos: online payments with Stripe (card, OXXO, SPEI) and card auto-pay (lib/wispdavor/stripe-server.ts). Behind the /interno password (proxy.ts); Spanish only, noindex.
 */
const w = wisp.wispdavor

export const metadata: Metadata = {
  title: { absolute: w.meta.pagos },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

export default async function WispPagosPage({ params }: PageProps<"/[locale]/interno/software/wispdavor/pagos">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  return (
    <WispFrame title={w.modules.pagos.name} sub>
      <OnlinePaymentsApp />
    </WispFrame>
  )
}
