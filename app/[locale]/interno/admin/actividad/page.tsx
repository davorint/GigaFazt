import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { AdminLinks } from "@/components/interno/AdminLinks"
import { ActivityApp } from "@/components/interno/ActivityApp"
import equipo from "@/messages/internal/equipo.es.json"

/** /interno/admin/actividad (phase 14): who changed what (lib/team/activity-server.ts). Admins only; noindex. */
export const metadata: Metadata = {
  title: { absolute: equipo.equipo.activity.meta },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

const messages = { ...equipo }

export default async function ActividadPage({ params }: PageProps<"/[locale]/interno/admin/actividad">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  const t = equipo.equipo.activity
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-24 sm:px-6">
      <section data-section="actividad" className="pt-8 pb-2 sm:pt-14">
        <p className="eyebrow">{t.kicker}</p>
        <h1 className="mt-3 text-4xl font-light tracking-tight text-foreground sm:text-5xl">{t.title}</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-300">{t.lead}</p>
        <AdminLinks current="actividad" />
      </section>
      <NextIntlClientProvider locale="es" messages={messages}>
        <ActivityApp />
      </NextIntlClientProvider>
    </main>
  )
}
