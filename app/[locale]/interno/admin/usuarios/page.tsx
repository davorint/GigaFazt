import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { AdminLinks } from "@/components/interno/AdminLinks"
import { TeamApp } from "@/components/interno/TeamApp"
import equipo from "@/messages/internal/equipo.es.json"

/** /interno/admin/usuarios (owner, 2026-11-19; "Usuarios y accesos" since 2026-11-20): the team accounts. Behind the /interno password; noindex. */
export const metadata: Metadata = {
  title: { absolute: equipo.equipo.meta.title },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

const messages = { ...equipo }

export default async function UsuariosPage({ params }: PageProps<"/[locale]/interno/admin/usuarios">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  const t = equipo.equipo
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-24 sm:px-6">
      <section data-section="usuarios" className="pt-8 pb-2 sm:pt-14">
        <p className="eyebrow">{t.kicker}</p>
        <h1 className="mt-3 text-4xl font-light tracking-tight text-foreground sm:text-5xl">{t.title}</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-300">{t.lead}</p>
        <AdminLinks current="usuarios" />
      </section>
      <NextIntlClientProvider locale="es" messages={messages}>
        <TeamApp />
      </NextIntlClientProvider>
    </main>
  )
}
