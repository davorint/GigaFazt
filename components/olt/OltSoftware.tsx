"use client"

import { useTranslations } from "next-intl"
import { BOARDS, CHASSIS, CVE_9067, compareVersions, type Family } from "@/lib/olt-kb"
import { Src } from "./Src"

type Entry = { version: string; items: { name: string; src: string }[] }

/** Every minimum version the knowledge base names, oldest first, with the chassis and boards that need it. */
function versionsOf(family: Family): Entry[] {
  const by = new Map<string, Entry["items"]>()
  const add = (version: string, name: string, src: string) => by.set(version, [...(by.get(version) ?? []), { name, src }])
  for (const c of CHASSIS) if (c.family === family && c.minSoftware) add(c.minSoftware.v, c.name, c.minSoftware.src)
  for (const b of BOARDS) if (b.family === family && b.minVersion) add(b.minVersion.v, b.code, b.minVersion.src)
  return [...by.entries()].sort(([a], [b]) => compareVersions(a, b)).map(([version, items]) => ({ version, items }))
}

/** Software versions: which version each chassis and board needs, the known vulnerability and how to choose. */
export function OltSoftware() {
  const t = useTranslations("olt.software")
  const affected = { ma5600: CVE_9067.ma5600, ma5800: CVE_9067.ma5800 }
  return (
    <div className="grid gap-6">
      <div className="grid gap-4 lg:grid-cols-2">
        {(["ma5600", "ma5800"] as const).map((family) => (
          <div key={family} className="surface grid content-start gap-3 rounded-xl p-5">
            <h3 className="text-base font-medium text-foreground">{t(`family.${family}`)}</h3>
            <ol className="grid gap-3">
              {versionsOf(family).map((e) => (
                <li key={e.version} className="grid gap-1 border-l-2 border-white/10 pl-3">
                  <span className="font-mono text-sm text-foreground">
                    {e.version}
                    {affected[family].v.includes(e.version) && <span className="ml-2 font-sans text-xs text-amber-300">{t("affected", { cve: CVE_9067.id })}</span>}
                  </span>
                  <span className="text-xs leading-snug text-zinc-400">
                    {t("needs")}{" "}
                    {e.items.map((x, k) => (
                      <span key={x.name}>
                        {k > 0 ? ", " : ""}
                        <span className="font-mono text-zinc-300">{x.name}</span>
                      </span>
                    ))}
                    <Src id={e.items[0].src} />
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      <div className="surface grid gap-3 rounded-xl p-5">
        <h3 className="text-base font-medium text-foreground">{t("cveTitle", { cve: CVE_9067.id })}</h3>
        <p className="max-w-3xl text-sm leading-relaxed text-zinc-300">
          {t("cveLead")} {CVE_9067.score.v}
          <Src id={CVE_9067.score.src} />
        </p>
        <dl className="grid gap-2 text-sm">
          {(["ma5600", "ma5800"] as const).map((family) => (
            <div key={family} className="grid gap-1 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <dt className="text-zinc-400">{t(`family.${family}`)}</dt>
              <dd className="font-mono text-xs leading-relaxed text-zinc-200">
                {affected[family].v.join(", ")}
                <Src id={affected[family].src} />
              </dd>
            </div>
          ))}
          <div className="grid gap-1 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <dt className="text-zinc-400">{t("fix")}</dt>
            <dd className="text-zinc-200">
              {CVE_9067.fix.v}
              <Src id={CVE_9067.fix.src} />
            </dd>
          </div>
        </dl>
      </div>

      <div className="grid gap-3">
        <h3 className="text-base font-medium text-foreground">{t("adviceTitle")}</h3>
        <ul className="grid max-w-3xl gap-2 text-sm leading-relaxed text-zinc-300">
          {(t.raw("advice") as string[]).map((x, k) => (
            <li key={k} className="flex gap-2">
              <span aria-hidden className="text-zinc-600">
                ·
              </span>
              <span>
                {x}
                {k === 1 && <Src id="hdPatch" />}
                {k === 2 && <Src id="gponsolution" />}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
