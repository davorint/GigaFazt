import type { Metadata } from "next"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { AdminLinks } from "@/components/interno/AdminLinks"
import { LEGAL_PAGES } from "@/lib/internal-pages"
import copy from "@/messages/internal/interno.es.json"

/**
 * /interno/admin/legal (owner, 2026-11-21): the legal side of the business, starting with the contracts (contratos).
 * Behind the /interno password (proxy.ts); Spanish only, not linked from the public site, noindex.
 */
export const metadata: Metadata = {
  title: { absolute: copy.interno.admin.pages.legal.metaTitle },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

export default async function LegalPage({ params }: PageProps<"/[locale]/interno/admin/legal">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  const t = copy.interno.admin.pages.legal
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
      <section data-section="legal" className="pt-10 pb-4 sm:pt-16">
        <p className="eyebrow">{t.kicker}</p>
        <h1 className="mt-4 text-4xl font-light tracking-tight text-foreground sm:text-6xl">{t.name}</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-300 sm:text-lg">{t.lead}</p>
        <AdminLinks current="legal" />
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {LEGAL_PAGES.map((p) => (
            <li key={p}>
              <a href={`/interno/admin/legal/${p}`} className="surface group grid h-full gap-2 rounded-2xl p-5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:p-6">
                <span className="text-lg font-medium text-foreground">{t.pages[p].name}</span>
                <span className="text-sm leading-relaxed text-zinc-300">{t.pages[p].desc}</span>
                <span className="mt-2 font-mono text-xs text-zinc-400 group-hover:text-zinc-200">
                  /interno/admin/legal/{p} · {copy.interno.open} →
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
