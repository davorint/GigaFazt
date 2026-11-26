import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { SyncBar } from "@/components/interno/SyncBar"
import { DeletedList } from "@/components/interno/RecordHistory"
import { AdminLinks } from "@/components/interno/AdminLinks"
import { ProjectsApp } from "@/components/projects/ProjectsApp"
import syncCopy from "@/messages/internal/sync.es.json"
import proyectos from "@/messages/internal/proyectos.es.json"
import materiales from "@/messages/internal/materiales.es.json"
import compras from "@/messages/internal/compras.es.json"
import mikrotik from "@/messages/internal/mikrotik.es.json"

/**
 * /interno/nuevos_proyectos (owner, 2026-11-26): the kit of a new deployment (each technician's minimum tools plus the
 * deployment's equipment) and the projects made from it, priced from Compras de herramientas and the materials list.
 * Behind the /interno password (proxy.ts); Spanish only, not linked from the public site, not in the sitemap, noindex.
 */
export const metadata: Metadata = {
  title: { absolute: proyectos.proyectos.meta.title },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

/** Material categories from Materiales, the store names' fallback from Compras; the number field's message from MikroTik. */
const messages = { ...materiales, ...compras, ...proyectos, ...syncCopy, mikrotik: { params: { invalid: mikrotik.mikrotik.params.invalid } } }

export default async function NuevosProyectosPage({ params }: PageProps<"/[locale]/interno/nuevos_proyectos">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  const t = proyectos.proyectos
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-24 sm:px-6">
      <section data-section="nuevos-proyectos" className="pt-8 pb-2 sm:pt-14">
        <p className="eyebrow">{t.kicker}</p>
        <h1 className="mt-3 text-4xl font-light tracking-tight text-foreground sm:text-5xl">{t.title}</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-300">{t.lead}</p>
        <div className="mt-3 flex flex-wrap gap-x-4">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- another internal page: a full load (proxy.ts checks the session and rewrites it) */}
          <a href="/interno/herramientas/compras" className="inline-flex min-h-9 w-fit items-center text-sm text-zinc-100 underline decoration-white/30 underline-offset-4 hover:decoration-white">
            {t.buysLink}
          </a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- another internal page: a full load (proxy.ts checks the session and rewrites it) */}
          <a href="/interno/materiales/compras" className="inline-flex min-h-9 w-fit items-center text-sm text-zinc-100 underline decoration-white/30 underline-offset-4 hover:decoration-white">
            {t.materialsLink}
          </a>
        </div>
        <AdminLinks current="nuevos_proyectos" />
      </section>
      <NextIntlClientProvider locale="es" messages={messages}>
        <SyncBar />
        <ProjectsApp />
        <div className="mt-12 grid gap-3">
          <DeletedList kind="proyectos" named />
        </div>
      </NextIntlClientProvider>
    </main>
  )
}
