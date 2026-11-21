import type { Metadata } from "next"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { AdminLinks } from "@/components/interno/AdminLinks"
import { UtpPlug } from "@/components/guides/UtpPlug"
import { T568A, T568B } from "@/lib/guides/utp"
import guias from "@/messages/internal/guias.es.json"

/**
 * /interno/guias/utp (owner, 2026-11-21): the UTP color order for quick lookups in the field (T568B and T568A, straight or
 * crossover, crimping, pairs per speed). Behind the /interno password (proxy.ts); Spanish only, noindex; works offline
 * once opened (public/sw-interno.js).
 */
const t = guias.guias.utp

export const metadata: Metadata = {
  title: { absolute: t.meta.title },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

const H2 = "text-lg font-medium text-foreground"

export default async function UtpPage({ params }: PageProps<"/[locale]/interno/guias/utp">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-24 sm:px-6">
      <section data-section="utp" className="pt-8 pb-2 sm:pt-14">
        <p className="eyebrow">{t.kicker}</p>
        <h1 className="mt-3 text-4xl font-light tracking-tight text-foreground sm:text-5xl">{t.title}</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-300">{t.lead}</p>
        <AdminLinks current="guias" />
      </section>
      <div className="mt-6 grid gap-8">
        <div className="grid gap-4 sm:grid-cols-2">
          <UtpPlug title={t.standardB} wires={T568B} names={t.names} pinLabel={t.pin} />
          <UtpPlug title={t.standardA} wires={T568A} names={t.names} pinLabel={t.pin} />
        </div>
        <p className="rounded-xl border border-cyan-400/30 p-3 text-sm text-cyan-100">{t.difference}</p>
        <section className="grid gap-2">
          <h2 className={H2}>{t.which.title}</h2>
          <ul className="grid list-disc gap-1.5 pl-5 text-sm leading-relaxed text-zinc-300">
            <li>{t.which.straight}</li>
            <li>{t.which.cross}</li>
            <li>{t.which.same}</li>
          </ul>
        </section>
        <section className="grid gap-2">
          <h2 className={H2}>{t.crimp.title}</h2>
          <ol className="grid list-decimal gap-1.5 pl-5 text-sm leading-relaxed text-zinc-300">
            {t.crimp.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </section>
        <section className="grid gap-2">
          <h2 className={H2}>{t.pairs.title}</h2>
          <ul className="grid list-disc gap-1.5 pl-5 text-sm leading-relaxed text-zinc-300">
            <li>{t.pairs.fast}</li>
            <li>{t.pairs.giga}</li>
            <li>{t.pairs.poe}</li>
          </ul>
        </section>
      </div>
    </main>
  )
}
