import type { Metadata } from "next"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { AdminLinks } from "@/components/interno/AdminLinks"
import { cidrTable } from "@/lib/guides/ipv4"
import guias from "@/messages/internal/guias.es.json"

/**
 * /interno/guias/ipv4 (owner, 2026-11-27): the IPv4 CIDR subnetting table, /8 to /32: prefix, subnet mask, usable
 * hosts, block size and a key note each, plus how to use the block size. Behind the /interno password (proxy.ts);
 * Spanish only, noindex; a server page with no JavaScript of its own.
 */
const t = guias.guias.ipv4
const NOTES = t.notes as Record<string, string>

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
const num = (n: number) => n.toLocaleString("es-MX")
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""))
/** The usual prefixes, a little brighter: the LAN, PPPoE pools and point-to-point links. */
const KEY = new Set([10, 16, 22, 24, 29, 30, 31, 32])

export default async function Ipv4Page({ params }: PageProps<"/[locale]/interno/guias/ipv4">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  const rows = cidrTable()
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
      <section data-section="ipv4" className="pt-8 pb-2 sm:pt-14">
        <p className="eyebrow">{t.kicker}</p>
        <h1 className="mt-3 text-4xl font-light tracking-tight text-foreground sm:text-5xl">{t.title}</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-300">{t.lead}</p>
        <AdminLinks current="guias" />
      </section>
      <div className="mt-6 grid gap-8">
        <p className="-mb-6 font-mono text-xs text-zinc-500 sm:hidden">{t.swipe}</p>
        {/* Scrolls sideways inside its own box on a phone; the page itself never does. */}
        <div className="overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label={t.caption}>
          <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
            <caption className="sr-only">{t.caption}</caption>
            <thead className="bg-white/[0.03] font-mono text-xs text-zinc-400">
              <tr>
                <th scope="col" className="sticky left-0 bg-background px-3 py-2.5 font-normal">{t.cols.prefix}</th>
                <th scope="col" className="px-3 py-2.5 font-normal">{t.cols.mask}</th>
                <th scope="col" className="px-3 py-2.5 text-right font-normal">{t.cols.usable}</th>
                <th scope="col" className="px-3 py-2.5 font-normal">{t.cols.block}</th>
                <th scope="col" className="px-3 py-2.5 font-normal">{t.cols.note}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.prefix} className={`border-t border-white/5 align-top ${r.prefix % 8 === 0 ? "border-t-white/20" : ""}`}>
                  <th scope="row" className={`sticky left-0 bg-background px-3 py-2.5 font-mono font-medium ${KEY.has(r.prefix) ? "text-cyan-200" : "text-zinc-100"}`}>
                    /{r.prefix}
                  </th>
                  <td className="px-3 py-2.5 font-mono whitespace-nowrap text-zinc-100">{r.mask}</td>
                  <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap">
                    <span className="text-zinc-100">{num(r.usable)}</span>
                    <span className="block text-[11px] text-zinc-500">{r.total === 1 ? t.totalOne : fill(t.total, { n: num(r.total) })}</span>
                  </td>
                  <td className="px-3 py-2.5 font-mono whitespace-nowrap text-zinc-300">{fill(t.blockIn, { n: num(r.block), octet: r.octet })}</td>
                  <td className="min-w-[18rem] px-3 py-2.5 leading-relaxed text-zinc-300">{NOTES[String(r.prefix)]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="rounded-xl border border-cyan-400/30 p-3 text-sm text-cyan-100">{t.private}</p>
        <section className="grid gap-2">
          <h2 className={H2}>{t.how.title}</h2>
          <ol className="grid list-decimal gap-1.5 pl-5 text-sm leading-relaxed text-zinc-300">
            {t.how.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  )
}
