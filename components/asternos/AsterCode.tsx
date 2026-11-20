"use client"

import { useTranslations } from "next-intl"
import { CopyButton } from "@/components/mikrotik/CopyButton"
import { DOCS, type Block } from "@/lib/asternos/config"

/** Lines shown on the page; a longer block (a plan's policers run to thousands of lines) is downloaded whole. */
const PREVIEW = 80

const download = (name: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** An AsterNOS command block: its sources, the "verify on the device" flag, copy and download. */
export function AsterCode({ block, title, file }: { block: Block; title: string; file: string }) {
  const t = useTranslations("asternos.code")
  const lines = block.code.split("\n")
  const long = lines.length > PREVIEW
  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-xs text-zinc-400">{t("lines", { n: lines.length })}</p>
        <div className="flex flex-wrap gap-2">
          {!long && <CopyButton text={block.code} label={t("copy")} done={t("copied")} />}
          <button
            type="button"
            onClick={() => download(file, block.code + "\n")}
            className="inline-flex h-8 items-center rounded-md border border-white/15 px-3 text-xs text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {t("download")}
          </button>
        </div>
      </div>
      {block.verify && (
        <p className="rounded-lg border border-amber-400/30 px-3 py-2 text-xs text-amber-100">
          <span className="font-mono">{t("verifyTag")}</span> {t("verify")}
        </p>
      )}
      <pre
        tabIndex={0}
        aria-label={title}
        className="[font-variant-ligatures:none] max-h-[28rem] overflow-auto rounded-lg border border-white/10 bg-black/40 p-4 font-mono text-xs leading-relaxed whitespace-pre text-zinc-100 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <code>{(long ? lines.slice(0, PREVIEW) : lines).join("\n")}</code>
        {long && <span className="block pt-2 text-zinc-400">{t("more", { n: lines.length - PREVIEW })}</span>}
      </pre>
      <p className="text-xs text-zinc-400">
        {t("sources")}{" "}
        {block.docs.map((k, i) => (
          <span key={k}>
            {i > 0 && " · "}
            <a href={DOCS[k]} target="_blank" rel="noreferrer" className="underline decoration-white/30 underline-offset-4 hover:text-zinc-200">
              {t(`docs.${k}`)}
            </a>
          </span>
        ))}
      </p>
    </div>
  )
}

export { download }
