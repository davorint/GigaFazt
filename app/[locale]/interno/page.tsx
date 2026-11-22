import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { AdminLinks } from "@/components/interno/AdminLinks"
import { SignOutButton } from "@/components/interno/SignOutButton"
import { SyncBar } from "@/components/interno/SyncBar"
import { SessionActions, TodayBoard } from "@/components/interno/TodayBoard"
import { INTERNAL_PAGES } from "@/lib/internal-pages"
import copy from "@/messages/internal/interno.es.json"
import syncCopy from "@/messages/internal/sync.es.json"

/**
 * /interno (owner, 2026-11-17; "Hoy", search and session 2026-11-18): search across every section, what needs
 * attention today (reports, late payments, tools, low stock, pinned notes), the internal tools, and this phone's
 * backup / sign-out. Behind the password (proxy.ts). Spanish only, not linked from the public site, not in the
 * sitemap, noindex; copy from messages/internal/.
 */
export const metadata: Metadata = {
  title: { absolute: copy.interno.meta.title },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

const messages = { ...copy, ...syncCopy }

export default async function InternoPage({ params }: PageProps<"/[locale]/interno">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  const t = copy.interno
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
      <section data-section="interno" className="pt-10 pb-4 sm:pt-16">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="eyebrow">{t.kicker}</p>
          <SignOutButton label={t.logout} />
        </div>
        <h1 className="mt-4 text-4xl font-light tracking-tight text-foreground sm:text-6xl">{t.title}</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-300 sm:text-lg">{t.lead}</p>
        <AdminLinks current="interno" />
      </section>
      <NextIntlClientProvider locale="es" messages={messages}>
        <SyncBar />
        <TodayBoard />
        <h2 className="mt-12 text-lg font-medium text-foreground">{t.toolsTitle}</h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {INTERNAL_PAGES.filter((p) => p !== "levantamientos").map((p) => (
            <li key={p}>
              <a
                href={`/interno/${p}`}
                data-nav
                className="surface group grid h-full gap-2 rounded-2xl p-5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:p-6"
              >
                <span className="text-lg font-medium text-foreground">{t.tools[p].name}</span>
                <span className="text-sm leading-relaxed text-zinc-300">{t.tools[p].desc}</span>
                <span className="mt-2 font-mono text-xs text-zinc-400 group-hover:text-zinc-200">
                  /interno/{p} · {t.open} →
                </span>
              </a>
            </li>
          ))}
        </ul>
        <div className="mt-12">
          <SessionActions />
        </div>
      </NextIntlClientProvider>
    </main>
  )
}
