import { useTranslations } from "next-intl"
import { LazyNoc } from "./LazyNoc"

/**
 * Chapter 01, after the packages: what Internet dedicado looks like from the
 * monitoring side, as a simulated NOC panel (NocPanel, lazy). Heading and lead
 * are server-rendered; every figure in the panel is tagged SIMULACIÓN.
 */
export function BusinessNoc() {
  const t = useTranslations("business.noc")
  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 sm:pb-36">
      <div className="reveal grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-end">
        <h2 className="biz-display max-w-2xl text-4xl leading-[1.02] font-[450] tracking-[-0.04em] text-balance sm:text-6xl">{t("title")}</h2>
        <p className="max-w-md text-zinc-400 lg:justify-self-end">{t("lead")}</p>
      </div>
      <div className="mt-12">
        <LazyNoc />
      </div>
    </div>
  )
}
