"use client"

import { useMemo, useState, useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { SelectField } from "@/components/mikrotik/SelectField"
import { putDeployment, readDeployments, serverDeployments, subscribeDeployments } from "@/lib/mikrotik/deployment-store"
import { clientsOf, portsOf } from "@/lib/mikrotik/deployments"
import type { OltModelId } from "@/lib/mikrotik/olt"
import { decodeDeployment, encodeDeployment } from "@/lib/mikrotik/state"
import { MODEL_CHASSIS, buildPorts, chassisModel, encodeBuild, suggestFor, type Build, type PonTech } from "@/lib/olt-build"
import { chassisName } from "@/lib/olt-kb"

const fmt = (n: number) => n.toLocaleString("es-MX")

/**
 * The deployments saved on /mikrotik and /calculadora (same browser storage): build the OLT one needs from its clients
 * and PON type, or save the build on screen into it (Hora pico then checks its ports against the clients).
 */
export function BuildDeployment({ build, ports, onBuild }: { build: Build; ports: Partial<Record<PonTech, number>>; onBuild: (b: Build) => void }) {
  const t = useTranslations("olt.builder.deployment")
  const tb = useTranslations("olt.builder")
  const store = useSyncExternalStore(subscribeDeployments, readDeployments, serverDeployments)
  const list = useMemo(
    () =>
      store.list
        .map((d) => ({ id: d.id, fields: decodeDeployment(d.data) }))
        .filter((d): d is { id: string; fields: NonNullable<ReturnType<typeof decodeDeployment>> } => d.fields !== null),
    [store.list]
  )
  const [picked, setPicked] = useState("")
  const [message, setMessage] = useState<{ text: string; saved?: boolean } | null>(null)
  const current = list.find((d) => d.id === picked) ?? null

  if (!store.loaded) return null
  if (!list.length) {
    return (
      <p className="text-sm text-zinc-400">
        {t("none")}{" "}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- another internal page: a full load (each page keeps its own state; proxy.ts rewrites it) */}
        <a href="/interno/routers/scripts-mikrotik#despliegues" className="text-zinc-100 underline decoration-white/30 underline-offset-4 hover:decoration-white">
          {t("noneLink")}
        </a>
      </p>
    )
  }

  const f = current?.fields
  const pon = f && f.capacity.pon !== "none" ? f.capacity.pon : null
  const need = f ? portsOf(f) : 0
  const name = (d: (typeof list)[number]) => d.fields.deployment || t("unnamed")

  const suggest = () => {
    if (!f || !pon) return
    const chassis = MODEL_CHASSIS[f.capacity.oltModel] ?? build.chassis
    const s = suggestFor(chassis, pon, need)
    onBuild(s.build)
    const text =
      !s.board
        ? t("noBoard", { chassis: chassisName(chassis), tech: tb(`techs.${pon}`) })
        : s.fits
          ? t("suggested", { boards: s.boards, board: s.board, ports: fmt(s.ports), need: fmt(need) })
          : t("short", { boards: s.boards, board: s.board, ports: fmt(s.ports), need: fmt(need), chassis: chassisName(chassis) })
    setMessage({ text })
  }
  const save = () => {
    if (!f || !current) return
    const capacity = { ...f.capacity, oltModel: chassisModel(build.chassis) as OltModelId, oltBuild: { code: encodeBuild(build), ports: buildPorts(ports) } }
    putDeployment(current.id, encodeDeployment({ ...f, capacity }))
    setMessage({ text: t("saved", { name: name(current) }), saved: true })
  }

  return (
    <div className="surface grid gap-3 rounded-2xl p-5">
      <h3 className="text-base font-medium text-foreground">{t("title")}</h3>
      <div className="grid items-end gap-4 sm:grid-cols-[minmax(0,20rem)_auto]">
        <SelectField
          label={t("pick")}
          value={picked}
          onChange={(v) => {
            setPicked(v)
            setMessage(null)
          }}
        >
          <option value="">{t("choose")}</option>
          {list.map((d) => (
            <option key={d.id} value={d.id}>
              {name(d)}
            </option>
          ))}
        </SelectField>
        <div className="flex flex-wrap gap-2 pb-0.5">
          <Button type="button" variant="outline" onClick={suggest} disabled={!pon}>
            {t("suggest")}
          </Button>
          <Button type="button" variant="outline" onClick={save} disabled={!f}>
            {t("save")}
          </Button>
        </div>
      </div>
      {f && (
        <p className="text-sm text-zinc-300">
          {pon
            ? t("summary", { clients: fmt(clientsOf(f)), need: fmt(need), tech: tb(`techs.${pon}`), model: t(`models.${f.capacity.oltModel}`) })
            : t("noPon", { clients: fmt(clientsOf(f)) })}
          {f.capacity.oltBuild ? ` ${t("hasBuild")}` : ""}
        </p>
      )}
      <p className="text-sm text-zinc-100" aria-live="polite">
        {message?.text}
        {message?.saved && (
          <>
            {" "}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- another internal page: a full load (each page keeps its own state; proxy.ts rewrites it) */}
            <a href="/interno/calculadora#hora-pico" className="underline decoration-white/30 underline-offset-4 hover:decoration-white">
              {t("open")}
            </a>
          </>
        )}
      </p>
      <p className="text-xs leading-snug text-zinc-400">{t("note")}</p>
    </div>
  )
}
