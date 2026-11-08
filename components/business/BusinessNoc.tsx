import { useTranslations } from "next-intl"
import { LazyNoc } from "./LazyNoc"

/**
 * Chapter 01, after the packages: what Internet dedicado looks like from the
 * monitoring side, as a simulated NOC panel (NocPanel, lazy). Centered
 * heading (breaks the page's "heading left, lead right" rhythm); every figure
 * in the panel is tagged SIMULACIÓN.
 */
export function BusinessNoc() {
  const t = useTranslations("business.noc")
  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 sm:pb-36">
      <div className="reveal mx-auto max-w-3xl text-center">
        <h2 className="biz-display text-4xl leading-[1.02] font-[450] tracking-[-0.04em] text-balance sm:text-6xl">{t("title")}</h2>
        <p className="mx-auto mt-6 max-w-xl text-zinc-400">{t("lead")}</p>
      </div>
      <div className="mt-14">
        <LazyNoc />
      </div>
    </div>
  )
}
