import type { Metadata } from "next"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { AdminLinks } from "@/components/interno/AdminLinks"
import { MATERIAL_PAGES } from "@/lib/internal-pages"
import copy from "@/messages/internal/interno.es.json"

/**
 * /interno/materiales (owner, 2026-11-20): the materials in one section, the stock (en-existencia) and the master
 * list with its buying options (compras). Behind the /interno password (proxy.ts); Spanish only, not linked from the public site, noindex.
 */
export const metadata: Metadata = {
  title: { absolute: copy.interno.tools.materiales.metaTitle },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

export default async function MaterialesPage({ params }: PageProps<"/[locale]/interno/materiales">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  const t = copy.interno.tools.materiales
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
      <section data-section="materiales" className="pt-10 pb-4 sm:pt-16">
        <p className="eyebrow">{t.kicker}</p>
        <h1 className="mt-4 text-4xl font-light tracking-tight text-foreground sm:text-6xl">{t.name}</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-300 sm:text-lg">{t.lead}</p>
        <AdminLinks current="materiales" />
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {MATERIAL_PAGES.map((p) => (
            <li key={p}>
              <a
                href={`/interno/materiales/${p}`}
                className="surface group grid h-full gap-2 rounded-2xl p-5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:p-6"
              >
                <span className="text-lg font-medium text-foreground">{t.pages[p].name}</span>
                <span className="text-sm leading-relaxed text-zinc-300">{t.pages[p].desc}</span>
                <span className="mt-2 font-mono text-xs text-zinc-400 group-hover:text-zinc-200">
                  /interno/materiales/{p} · {copy.interno.open} →
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
