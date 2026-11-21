import type { Metadata } from "next"
import { NextIntlClientProvider } from "next-intl"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { AdminLinks } from "@/components/interno/AdminLinks"
import { DavorOltTool } from "@/components/davorolt/DavorOltTool"
import { CATALOG, entryBySlug } from "@/lib/davorolt/catalog"
import davorolt from "@/messages/internal/davorolt.es.json"

/**
 * /interno/software/davorolt/<tool> (owner, 2026-11-21: "an individual tool per topic"): one DavorOLT tool. Behind the
 * /interno password (proxy.ts); Spanish only, noindex; works offline once opened.
 */
const t = davorolt.davorolt
type ToolId = keyof typeof t.tools

/** Every tool page built ahead; any other address ends in notFound() below. */
export const generateStaticParams = () => CATALOG.map((c) => ({ tool: c.slug }))

export async function generateMetadata({ params }: PageProps<"/[locale]/interno/software/davorolt/[tool]">): Promise<Metadata> {
  const { tool } = await params
  const e = entryBySlug(tool)
  return {
    title: { absolute: e ? `${t.tools[e.id as ToolId].name} · DavorOLT` : t.meta.title },
    description: null,
    alternates: null,
    openGraph: null,
    twitter: null,
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
    referrer: "no-referrer",
  }
}

export default async function DavorOltToolPage({ params }: PageProps<"/[locale]/interno/software/davorolt/[tool]">) {
  const { locale, tool } = await params
  const e = entryBySlug(tool)
  if (locale !== "es" || !e) notFound()
  setRequestLocale(locale)
  const copy = t.tools[e.id as ToolId]
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-24 sm:px-6">
      <section data-section="davorolt-tool" className="pt-8 pb-2 sm:pt-14">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- another internal page: a full load (proxy.ts checks the session and rewrites it) */}
        <a href="/interno/software/davorolt" className="inline-flex min-h-9 items-center text-sm text-zinc-300 hover:text-foreground">
          {t.back}
        </a>
        <p className="eyebrow mt-2">DavorOLT · {t.groups[e.group]}</p>
        <h1 className="mt-3 text-3xl font-light tracking-tight text-foreground sm:text-4xl">{copy.name}</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-300">{copy.desc}</p>
        <AdminLinks current="software" />
      </section>
      <NextIntlClientProvider locale="es" messages={davorolt}>
        <DavorOltTool id={e.id} />
      </NextIntlClientProvider>
    </main>
  )
}
