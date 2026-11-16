"use client"

import { useMemo, useState, useSyncExternalStore } from "react"
import { AlertTriangle, Info } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { CopyButton } from "@/components/mikrotik/CopyButton"
import { SelectField } from "@/components/mikrotik/SelectField"
import { CHASSIS } from "@/lib/olt-kb"
import { LAYOUTS, boardsFor, decodeBuild, encodeBuild, starter, summarize, type Build, type BuildIssue, type PonTech, type SlotRole } from "@/lib/olt-build"

const ROLE_STYLE: Record<SlotRole, string> = {
  service: "border-cyan-400/25",
  control: "border-violet-400/35",
  uplink: "border-emerald-400/30",
  power: "border-amber-400/30",
}
const PARAM = "arma"
const fmt = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 1 })
const noSubscribe = () => () => {}

/** Pick a chassis, put a board in each slot, see ports, ONTs, power and what to watch for; copy the shopping list. */
export function OltBuilder() {
  const t = useTranslations("olt.builder")
  const tb = useTranslations("olt.boards")
  // A shared link (?arma=…) opens that build; the server renders without it, the browser reads it once.
  const search = useSyncExternalStore(noSubscribe, () => window.location.search, () => "")
  const fromLink = useMemo(() => {
    const v = new URLSearchParams(search).get(PARAM)
    return v ? decodeBuild(v) : null
  }, [search])
  // Until the user edits, the build is the shared one (or the MA5608T example).
  const [own, setBuild] = useState<Build | null>(null)
  const build = own ?? fromLink ?? starter("ma5608t")

  const layout = LAYOUTS[build.chassis]
  const s = useMemo(() => summarize(build), [build])
  const slots = Object.keys(s.roleOf)
    .map(Number)
    .sort((a, b) => a - b)
  const setSlot = (slot: number, code: string) => {
    const next = { ...build.slots }
    if (code) next[slot] = code
    else delete next[slot]
    setBuild({ ...build, slots: next })
  }
  const chassis = CHASSIS.find((c) => c.id === build.chassis)

  const bill = [`1 × ${chassis?.name ?? build.chassis}${chassis?.backplane ? ` (${chassis.backplane.v})` : ""}`, ...s.bill.map((x) => `${x.count} × ${x.code}`)].join("\n")
  const shareUrl = () => `${window.location.origin}/olt?${PARAM}=${encodeURIComponent(encodeBuild(build))}#armar`

  const issueText = (i: BuildIssue) => {
    switch (i.code) {
      case "mixedControl":
        return t("issues.mixedControl", { boards: i.boards.join(", ") })
      case "notWithControl":
        return t("issues.notWithControl", { board: i.board, control: i.control })
      case "endOfLife":
        return t(i.replacedBy.length ? "issues.endOfLife" : "issues.endOfLifeNoReplacement", { board: i.board, status: tb(`lifecycle.${i.status}`), replacedBy: i.replacedBy.join(", ") })
      case "noPowerData":
        return t("issues.noPowerData", { boards: i.boards.join(", ") })
      default:
        return t(`issues.${i.code}`)
    }
  }
  const warn = (i: BuildIssue) => i.code !== "noPowerData" && i.code !== "noOntData"

  return (
    <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
      <div className="grid items-end gap-4 sm:grid-cols-[minmax(0,20rem)_auto]">
        <SelectField label={t("chassis")} value={build.chassis} onChange={(id) => setBuild(starter(id))} hint={t("chassisHint")}>
          {CHASSIS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.alias ? ` (${c.alias.v.split(":")[0]})` : ""}
            </option>
          ))}
        </SelectField>
        <div className="flex flex-wrap gap-2 pb-6">
          <Button type="button" variant="outline" onClick={() => setBuild(starter(build.chassis))}>
            {t("example")}
          </Button>
          <Button type="button" variant="outline" onClick={() => setBuild({ chassis: build.chassis, slots: {} })}>
            {t("clear")}
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* The chassis, slot by slot. */}
        <div className="grid gap-3">
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
            {(["service", "control", "uplink", "power"] as const)
              .filter((r) => (layout?.[r].length ?? 0) > 0)
              .map((r) => (
                <span key={r} className="flex items-center gap-1.5">
                  <span aria-hidden className={`inline-block size-3 rounded-sm border-2 ${ROLE_STYLE[r]}`} />
                  {t(`roles.${r}`)}
                </span>
              ))}
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {slots.map((slot) => {
              const role = s.roleOf[slot]
              const options = boardsFor(build.chassis, role)
              return (
                <li key={slot} className={`rounded-xl border-2 bg-white/[0.02] p-3 ${ROLE_STYLE[role]}`}>
                  <SelectField label={t("slot", { slot, role: t(`roles.${role}`) })} value={build.slots[slot] ?? ""} onChange={(code) => setSlot(slot, code)}>
                    <option value="">{t("empty")}</option>
                    {options.map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.code} · {b.ports.v.length > 46 ? `${b.ports.v.slice(0, 45)}…` : b.ports.v}
                      </option>
                    ))}
                  </SelectField>
                </li>
              )
            })}
          </ul>
        </div>

        {/* What it adds up to. */}
        <div className="surface grid gap-4 rounded-2xl p-5 lg:sticky lg:top-16" aria-live="polite">
          <h3 className="text-base font-medium text-foreground">{t("summary")}</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-zinc-400">{t("ports")}</dt>
              <dd className="mt-0.5 text-zinc-100">
                {Object.keys(s.ports).length
                  ? (Object.entries(s.ports) as [PonTech, number][]).map(([tech, n]) => (
                      <span key={tech} className="block">
                        {t("portsOf", { count: n, tech: t(`techs.${tech}`) })}
                      </span>
                    ))
                  : t("none")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-400">{t("onts")}</dt>
              <dd className="mt-0.5 text-zinc-100">{s.onts ? fmt(s.onts) : t("none")}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-400">{t("power")}</dt>
              <dd className="mt-0.5 text-zinc-100">{t("powerValue", { staticW: fmt(s.staticW), maxW: fmt(s.maxW) })}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-400">{t("current")}</dt>
              <dd className="mt-0.5 text-zinc-100">{t("currentValue", { amps: fmt(s.amps48) })}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-zinc-400">{t("software")}</dt>
              <dd className="mt-0.5 font-mono text-zinc-100">{s.minVersion ?? t("none")}</dd>
            </div>
          </dl>
          {s.issues.length > 0 && (
            <ul className="grid gap-2">
              {s.issues.map((i, k) => (
                <li key={k} className="flex gap-2 text-sm leading-snug text-zinc-200">
                  {warn(i) ? <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-300" /> : <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-zinc-400" />}
                  <span>{issueText(i)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-2">
            <p className="text-xs text-zinc-400">{t("bill")}</p>
            <pre className="overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-xs leading-relaxed text-zinc-200">{bill}</pre>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={bill} label={t("copyBill")} done={t("copied")} />
              <CopyButton getText={shareUrl} label={t("copyLink")} done={t("copied")} />
            </div>
          </div>
          <p className="text-xs leading-snug text-zinc-400">{t("note")}</p>
        </div>
      </div>
    </div>
  )
}
