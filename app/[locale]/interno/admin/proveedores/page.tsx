import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { AdminLinks } from "@/components/interno/AdminLinks"
import { ProvidersApp } from "@/components/providers/ProvidersApp"
import copy from "@/messages/internal/proveedores.es.json"
import mikrotik from "@/messages/internal/mikrotik.es.json"

/**
 * /interno/admin/proveedores (owner, 2026-11-17): every provider (materials and equipment, carriers, services, other)
 * with contacts, terms, ratings and carrier offers, used by the materials list, the surveys and the MikroTik links.
 * Behind the /interno password (proxy.ts); Spanish only, not linked from the public site, not in the sitemap, noindex.
 */
export const metadata: Metadata = {
  title: { absolute: copy.proveedores.meta.title },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

/** The number field shared with the MikroTik tools reads its "invalid" message from there. */
const messages = { ...copy, mikrotik: { params: { invalid: mikrotik.mikrotik.params.invalid } } }

export default async function ProveedoresPage({ params }: PageProps<"/[locale]/interno/admin/proveedores">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  const t = copy.proveedores
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-24 sm:px-6">
      <section data-section="proveedores" className="pt-8 pb-2 sm:pt-14">
        <p className="eyebrow">{t.kicker}</p>
        <h1 className="mt-3 text-4xl font-light tracking-tight text-foreground sm:text-5xl">{t.title}</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-300">{t.lead}</p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">{t.storage}</p>
        <AdminLinks current="proveedores" />
      </section>
      <NextIntlClientProvider locale="es" messages={messages}>
        <ProvidersApp />
      </NextIntlClientProvider>
    </main>
  )
}
