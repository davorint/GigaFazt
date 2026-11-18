"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import type { Wan } from "@/lib/mikrotik/balance"
import { MIN_PORTS, natLayout, natLookup, natOf } from "@/lib/mikrotik/cgnat"
import { fmtNum } from "@/lib/mikrotik/format"
import { NAT_MODES, parseCidr, type NatMode, type SetupState } from "@/lib/mikrotik/setup"
import { NumberField } from "./NumberField"
import { SelectField } from "./SelectField"
import { TextField } from "./TextField"

type Props = {
  setup: SetupState
  wans: Wan[]
  onSetup: (patch: Partial<SetupState>) => void
  onWans: (wans: Wan[]) => void
  /** Shown twice on /mikrotik (Configuración and the guide): distinct region names. */
  where: string
}

/** CGNAT mode, each link's public IPs and ports, and "who had this IP and port". */
export function NatFields({ setup: s, wans, onSetup, onWans, where }: Props) {
  const t = useTranslations("mikrotik.config.trace")
  const pool = parseCidr(s.pool)
  const layouts = wans.map((w) => (pool ? natLayout(pool, w) : null))
  const [pick, setPick] = useState(0)
  const [ip, setIp] = useState("")
  const [port, setPort] = useState<number | null>(null)
  const k = Math.min(pick, Math.max(0, wans.length - 1))
  const lay = layouts[k]
  const found = lay && port !== null ? natLookup(lay, ip, port) : null
  const cell = "px-2 py-2"

  return (
    <div className="grid min-w-0 gap-4">
      <SelectField label={t("natMode")} value={s.natMode} onChange={(v) => NAT_MODES.includes(v as NatMode) && onSetup({ natMode: v as NatMode })} hint={t(`natModeHint.${s.natMode}`)} className="max-w-xl">
        {NAT_MODES.map((m) => (
          <option key={m} value={m}>
            {t(`natModes.${m}`)}
          </option>
        ))}
      </SelectField>
      {s.natMode === "fixed" && (
        <>
          <div className="overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label={t("caption", { where })}>
            <table className="w-full min-w-[46rem] text-left text-sm">
              <caption className="sr-only">{t("caption", { where })}</caption>
              <thead className="text-xs text-zinc-400">
                <tr className="border-b border-white/10">
                  {(["link", "ips", "perIp", "ports", "first"] as const).map((c) => (
                    <th key={c} scope="col" className="px-2 py-2.5 font-normal whitespace-nowrap">
                      {t(`cols.${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {wans.map((w, i) => {
                  const l = layouts[i]
                  const first = l ? natOf(l, 0) : null
                  return (
                    <tr key={i} className="border-t border-white/5 align-top">
                      <td className={`${cell} font-mono whitespace-nowrap text-zinc-200`}>
                        {w.name} <span className="text-zinc-500">· {w.iface}</span>
                      </td>
                      <td className={cell}>
                        <Input
                          className="h-9 w-56 min-w-0 bg-white/[0.03] font-mono text-base md:text-sm"
                          value={w.natIps}
                          placeholder={t("own")}
                          aria-label={t("ipsOf", { name: w.name })}
                          spellCheck={false}
                          onChange={(e) => onWans(wans.map((x, j) => (j === i ? { ...x, natIps: e.target.value.replace(/[^0-9.\- ]/g, "").slice(0, 40) } : x)))}
                        />
                      </td>
                      <td className={`${cell} font-mono tabular-nums`}>{l ? fmtNum(l.perIp, 0) : "—"}</td>
                      <td className={`${cell} font-mono tabular-nums ${l && l.block < MIN_PORTS ? "text-amber-300" : "text-zinc-100"}`}>{l ? fmtNum(l.block, 0) : "—"}</td>
                      <td className={`${cell} font-mono text-xs whitespace-nowrap text-zinc-400`}>
                        {first ? `${first.address} → ${first.ip ?? t("ownShort")}:${first.from}–${first.to}` : t("badIps")}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="max-w-3xl text-xs leading-snug text-zinc-400">{t("ipsHint", { min: MIN_PORTS })}</p>

          <div className="grid gap-3 rounded-xl border border-white/10 p-4">
            <p className="text-sm font-medium text-foreground">{t("lookup.title")}</p>
            {wans[k]?.providerNat && <p className="max-w-3xl text-xs leading-snug text-amber-200">{t("lookup.providerNat", { name: wans[k].name })}</p>}
            <div className="grid items-start gap-4 sm:grid-cols-3">
              <SelectField label={t("lookup.link")} value={String(k)} onChange={(v) => setPick(Number(v))}>
                {wans.map((w, i) => (
                  <option key={i} value={i}>
                    {w.name}
                  </option>
                ))}
              </SelectField>
              {lay?.ips ? <TextField label={t("lookup.ip")} value={ip} onChange={setIp} /> : <p className="text-xs leading-snug text-zinc-400 sm:pt-6">{t("lookup.ownIp")}</p>}
              <NumberField label={t("lookup.port")} unit={t("lookup.portUnit")} value={port} optional integer min={1} max={65535} onChange={setPort} />
            </div>
            <p className="text-sm text-zinc-200" aria-live="polite">
              {port === null ? t("lookup.empty") : found ? t("lookup.found", { address: found.address, from: found.from, to: found.to, ip: found.ip ?? t("ownShort") }) : t("lookup.none")}
            </p>
            {found && <code className="block overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-xs text-zinc-200">{`/log print where message~"ip=${found.address} "`}</code>}
            {found && <p className="text-xs leading-snug text-zinc-400">{t("lookup.then")}</p>}
          </div>
        </>
      )}
    </div>
  )
}

/** Session log, PITP and IPv6 for the clients. */
export function AccessFields({ setup: s, onSetup }: { setup: SetupState; onSetup: (patch: Partial<SetupState>) => void }) {
  const t = useTranslations("mikrotik.config.trace")
  return (
    <div className="grid min-w-0 gap-4">
      {(["sessionLog", "pitp"] as const).map((key) => (
        <div key={key} className="grid gap-1.5">
          <label className="flex w-fit cursor-pointer items-center gap-3 text-sm text-zinc-200">
            <Switch checked={s[key]} onCheckedChange={(on) => onSetup({ [key]: on })} />
            {t(key)}
          </label>
          <p className="max-w-3xl text-xs leading-snug text-zinc-400">{t(`${key}Hint`)}</p>
        </div>
      ))}
      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TextField label={t("ipv6Pd")} value={s.ipv6Pd} onChange={(v) => onSetup({ ipv6Pd: v.trim() })} hint={t("ipv6PdHint")} />
        <NumberField label={t("ipv6PdLength")} unit="/" value={s.ipv6PdLength} integer min={48} max={64} onChange={(v) => v !== null && onSetup({ ipv6PdLength: v })} hint={t("ipv6PdLengthHint")} />
        <TextField label={t("ipv6Wan")} value={s.ipv6Wan} onChange={(v) => onSetup({ ipv6Wan: v.trim() })} hint={t("ipv6WanHint")} />
      </div>
    </div>
  )
}
