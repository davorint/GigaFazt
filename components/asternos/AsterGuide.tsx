"use client"

import { useTranslations } from "next-intl"
import { deploymentBlocks, deploymentFile } from "@/lib/asternos/config"
import { AsterCode, download } from "./AsterCode"
import { AsterForm } from "./AsterForm"
import { useAsterDeployment } from "./useAsterDeployment"

/**
 * Guía AsterNOS (owner, 2026-11-20: the MikroTik guide "tropicalized" to AsterNOS-VPP): the deployment's fields, then
 * each step with what it does, its commands, their documentation and whether they must be checked on the device.
 */
export function AsterGuide() {
  const t = useTranslations("asternos.guide")
  const [d, set] = useAsterDeployment()
  const blocks = deploymentBlocks(d)
  const name = (d.hostname || "asternos").replace(/[^\w-]/g, "")
  return (
    <div className="mt-8 grid gap-8">
      <section aria-labelledby="aster-before" className="grid gap-2 rounded-xl border border-white/10 p-4">
        <h2 id="aster-before" className="text-base font-medium text-foreground">
          {t("before.title")}
        </h2>
        <ul className="grid list-disc gap-1 pl-5 text-sm text-zinc-300">
          {(["console", "license", "verify", "backup"] as const).map((k) => (
            <li key={k}>{t(`before.${k}`)}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="aster-fields" className="grid gap-3">
        <h2 id="aster-fields" className="text-xl font-light text-foreground">
          {t("fields")}
        </h2>
        <AsterForm d={d} set={set} />
      </section>

      <section aria-labelledby="aster-steps" className="grid gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="aster-steps" className="text-xl font-light text-foreground">
            {t("steps")}
          </h2>
          <button
            type="button"
            onClick={() => download(`asternos-${name}.txt`, deploymentFile(d, (id) => t(`blocks.${id}.title`)) + "\n")}
            className="inline-flex h-10 items-center rounded-full bg-white px-4 text-sm font-medium text-zinc-950 hover:bg-zinc-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {t("downloadAll")}
          </button>
        </div>
        <ol className="grid gap-6">
          {blocks.map((b, i) => (
            <li key={b.id} className="grid gap-3 rounded-xl border border-white/10 p-4">
              <h3 className="text-base font-medium text-foreground">
                {i + 1}. {t(`blocks.${b.id}.title`)}
              </h3>
              <p className="text-sm leading-relaxed text-zinc-300">{t(`blocks.${b.id}.what`)}</p>
              <AsterCode block={b} title={t(`blocks.${b.id}.title`)} file={`asternos-${name}-${b.id}.txt`} />
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
