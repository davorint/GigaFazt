import { Fragment } from "react"
import { useLocale, useTranslations } from "next-intl"
import { PlaceholderChip } from "@/components/hud/PlaceholderChip"
import { company } from "@/lib/company"
import { isPlaceholder, type Maybe } from "@/lib/placeholder"
import { SITE_URL } from "@/lib/site"

type Item = string | [term: string, desc: string]
type NoticeSection = { id: string; title: string; paras: string[]; items?: Item[]; after?: string[] }

/**
 * Aviso de Privacidad Integral (LFPDPPP, DOF 2025-03-20, art. 15): identity and
 * address, data (no sensitive), purposes split primary/secondary, limiting
 * options, ARCO + revocation, changes. Copy lives in messages (`privacy`) as
 * raw section arrays; `{entity}`, `{address}`, `{email}` come from
 * lib/company.ts and render as POR DEFINIR chips until set (hard rule #1).
 * Server-rendered, no client JS beyond the chips.
 */
export function PrivacyNotice() {
  const t = useTranslations("privacy")
  const locale = useLocale()
  const { entityName, address, privacyEmail, privacyUpdated, privacyUrl } = company.legal
  const sections = t.raw("sections") as NoticeSection[]
  const pageUrl = `${SITE_URL}/${locale}${isPlaceholder(privacyUrl) ? "" : privacyUrl}`
  const updated = new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(privacyUpdated))

  const value = (v: Maybe<string>, render: (s: string) => React.ReactNode = (s) => s) =>
    isPlaceholder(v) ? <PlaceholderChip keyName={v.key} className="align-middle" /> : render(v)

  const tokens: Record<string, React.ReactNode> = {
    name: company.name as string,
    entity: value(entityName, (s) => <strong className="font-semibold text-foreground">{s}</strong>),
    address: value(address),
    email: value(privacyEmail, (s) => (
      <a href={`mailto:${s}`} className="text-fiber underline underline-offset-4">
        {s}
      </a>
    )),
    url: (
      <a href={pageUrl} className="break-all text-fiber underline underline-offset-4">
        {pageUrl}
      </a>
    ),
  }

  /** "{email}"-style tokens → company values or chips. */
  const fill = (text: string) =>
    text.split(/(\{(?:name|entity|address|email|url)\})/).map((part, i) => {
      const key = part.match(/^\{(\w+)\}$/)?.[1]
      return <Fragment key={i}>{key ? tokens[key] : part}</Fragment>
    })

  return (
    <article className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
      <p className="eyebrow mb-3">[ {t("eyebrow")} ]</p>
      <h1 className="text-balance text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">{t("title")}</h1>
      <p className="mt-4 font-mono text-xs text-muted-foreground">{t("updated", { date: updated })}</p>
      <p className="mt-8 text-lg leading-relaxed text-muted-foreground">{t("intro", { name: company.name as string })}</p>

      <nav aria-label={t("toc")} className="surface mt-10 rounded-xl p-5 sm:p-6">
        <h2 className="eyebrow mb-3">{t("toc")}</h2>
        <ol className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
          {sections.map((s, i) => (
            <li key={s.id} className="flex gap-2">
              <span className="font-mono text-xs tabular-nums text-fiber" aria-hidden>
                {String(i + 1).padStart(2, "0")}
              </span>
              <a href={`#${s.id}`} className="rounded text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-14 space-y-14">
        {sections.map((s, i) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-24">
            <h2 id={`${s.id}-h`} className="flex items-baseline gap-3 text-2xl font-semibold tracking-[-0.02em]">
              <span className="font-mono text-sm tabular-nums text-fiber" aria-hidden>
                {String(i + 1).padStart(2, "0")}
              </span>
              {s.title}
            </h2>
            <div className="mt-4 space-y-4 leading-relaxed text-muted-foreground">
              {s.paras.map((p, j) => (
                <p key={j}>{fill(p)}</p>
              ))}
              {s.items && (
                <ul className="space-y-2.5 border-l border-fiber/30 pl-5">
                  {s.items.map((it, j) => (
                    <li key={j}>
                      {Array.isArray(it) ? (
                        <>
                          <span className="font-medium text-foreground">{it[0]}:</span> {fill(it[1])}
                        </>
                      ) : (
                        fill(it)
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {s.after?.map((p, j) => (
                <p key={j} className={p.startsWith("•") ? "pl-5" : undefined}>
                  {fill(p)}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  )
}
