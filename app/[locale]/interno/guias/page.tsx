import type { Metadata } from "next"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { AdminLinks } from "@/components/interno/AdminLinks"
import { GUIDE_PAGES } from "@/lib/internal-pages"
import copy from "@/messages/internal/interno.es.json"

/**
 * /interno/guias (owner, 2026-11-21): quick references for field work (utp: the UTP color order).
 */
export const metadata: Metadata = {
  title: { absolute: copy.interno.tools.guias.metaTitle },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

export default async function GuiasPage({ params }: PageProps<"/[locale]/interno/guias">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  const t = copy.interno.tools.guias
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
      <section data-section="guias" className="pt-10 pb-4 sm:pt-16">
        <p className="eyebrow">{t.kicker}</p>
        <h1 className="mt-4 text-4xl font-light tracking-tight text-foreground sm:text-6xl">{t.name}</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-300 sm:text-lg">{t.lead}</p>
        <AdminLinks current="guias" />
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {GUIDE_PAGES.map((p) => (
            <li key={p}>
              <a
                href={`/interno/guias/${p}`}
                className="surface group grid h-full gap-2 rounded-2xl p-5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:p-6"
              >
                <span className="text-lg font-medium text-foreground">{t.pages[p].name}</span>
                <span className="text-sm leading-relaxed text-zinc-300">{t.pages[p].desc}</span>
                <span className="mt-2 font-mono text-xs text-zinc-400 group-hover:text-zinc-200">
                  /interno/guias/{p} · {copy.interno.open} →
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
