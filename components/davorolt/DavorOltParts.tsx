"use client"

import { useId, useState } from "react"
import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { CopyButton } from "@/components/mikrotik/CopyButton"
import { DEFAULT_SETTINGS, FIRST_ID, PLAN_MODES, settingsIssues, type OltSettings } from "@/lib/davorolt/settings"
import { run, type Field, type Tool, type Values } from "@/lib/davorolt/tools"
import { saveOltSettings } from "./useOltSettings"

export type T = ReturnType<typeof useTranslations>
const SELECT =
  "h-10 w-full rounded-md border border-input bg-white/[0.03] px-3 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
const LABEL = "font-mono text-xs text-zinc-300"
const SMALL = "inline-flex min-h-9 w-fit items-center rounded-full border border-white/15 px-3 text-xs text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"

/** A labelled input or select, with its hint below. */
function Box({ label, hint, children }: { label: string; hint?: string; children: (id: string, describedBy?: string) => React.ReactNode }) {
  const id = useId()
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      {children(id, hint ? `${id}-h` : undefined)}
      {hint && (
        <p id={`${id}-h`} className="text-xs leading-snug text-zinc-400">
          {hint}
        </p>
      )}
    </div>
  )
}

function TextIn({ label, hint, value, onChange, numeric, secret, onBlur }: { label: string; hint?: string; value: string; onChange: (v: string) => void; numeric?: boolean; secret?: boolean; onBlur?: () => void }) {
  return (
    <Box label={label} hint={hint}>
      {(id, d) => (
        <Input
          id={id}
          type={secret ? "password" : "text"}
          inputMode={numeric ? "numeric" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          spellCheck={false}
          autoComplete={secret ? "new-password" : "off"}
          aria-describedby={d}
          className="h-10 bg-white/[0.03] font-mono text-base md:text-sm"
        />
      )}
    </Box>
  )
}

function SelectIn({ label, hint, value, onChange, options }: { label: string; hint?: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <Box label={label} hint={hint}>
      {(id, d) => (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={d} className={SELECT}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Box>
  )
}

/**
 * A whole number in the settings: what's typed stays while typing (it can be emptied to retype); a valid number in range
 * is saved at once; leaving the box shows the saved value.
 */
function NumIn({ label, value, onChange, min, max }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <TextIn
      label={label}
      numeric
      value={draft ?? String(value)}
      onBlur={() => setDraft(null)}
      onChange={(x) => {
        setDraft(x)
        const n = Number(x.trim())
        if (/^\d+$/.test(x.trim()) && n >= min && n <= max) onChange(n)
      }}
    />
  )
}

/** A tool's form, its notes and the commands it writes (nothing typed here is saved). */
export function ToolForm({ t, tool, s }: { t: T; tool: Tool; s: OltSettings }) {
  const [v, setV] = useState<Values>(() => Object.fromEntries(tool.fields.map((f) => [f.key, f.def ?? ""])))
  const notes = t.raw(`tools.${tool.id}.notes`) as string[]
  const result = run(tool, v, s)
  const label = (f: Field) => t(`fields.${f.key}.label`)
  const hint = (f: Field) => (t.has(`fields.${f.key}.hint`) ? t(`fields.${f.key}.hint`) : undefined)
  return (
    <div className="grid gap-5">
      {tool.fields.length > 0 && (
        <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tool.fields.map((f) => {
            const set = (x: string) => setV((o) => ({ ...o, [f.key]: x }))
            if (f.kind === "select")
              return <SelectIn key={f.key} label={label(f)} hint={hint(f)} value={v[f.key]} onChange={set} options={(f.options ?? []).map((o) => ({ value: o, label: t.has(`options.${f.key}.${o}`) ? t(`options.${f.key}.${o}`) : o }))} />
            if (f.kind === "plan") return <SelectIn key={f.key} label={label(f)} value={v[f.key]} onChange={set} options={s.plans.map((p, k) => ({ value: String(k), label: `${p.name} · ${p.mbps} Mbps` }))} />
            return <TextIn key={f.key} label={label(f)} hint={hint(f)} value={v[f.key]} onChange={set} numeric={f.kind === "number"} secret={f.kind === "secret"} />
          })}
        </div>
      )}
      {notes.length > 0 && (
        <ul className="grid list-disc gap-1 pl-5 text-sm leading-relaxed text-zinc-300">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {!tool.build && <p className="text-xs text-zinc-400">{t("infoOnly")}</p>}
      {result && "error" in result && (
        <p role="status" className="rounded-lg border border-amber-400/30 px-3 py-2 text-sm text-amber-100">
          {result.error === "field" && result.field ? t("errors.field", { field: t(`fields.${result.field}.label`) }) : t(`errors.${result.error}`)}
        </p>
      )}
      {result && !("error" in result) && (
        <div className="grid gap-4">
          {result.verify.length > 0 && (
            <div className="grid gap-1 rounded-lg border border-amber-400/30 px-3 py-2 text-xs text-amber-100">
              <p>
                <span className="font-mono">{t("verifyTag")}</span> {t("verify")}
              </p>
              <ul className="grid gap-0.5 font-mono">
                {result.verify.map((x) => (
                  <li key={x}>· {x}</li>
                ))}
              </ul>
            </div>
          )}
          {result.blocks.map((b, i) => (
            <div key={i} className="grid min-w-0 gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-zinc-200">{b.label ? t(`blocks.${b.label}`) : ""}</p>
                <CopyButton text={b.code} label={t("copy")} done={t("copied")} />
              </div>
              <pre
                tabIndex={0}
                aria-label={b.label ? t(`blocks.${b.label}`) : t(`tools.${tool.id}.name`)}
                className="[font-variant-ligatures:none] max-h-[32rem] overflow-auto rounded-lg border border-white/10 bg-black/40 p-4 font-mono text-xs leading-relaxed whitespace-pre text-zinc-100 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <code>{b.code}</code>
              </pre>
            </div>
          ))}
          {result.answers && (
            <div className="grid gap-2">
              <p className="text-sm text-zinc-200">{t("answers")}</p>
              <dl className="grid gap-1 font-mono text-xs">
                {result.answers.map((a) => (
                  <div key={a.prompt} className="flex flex-wrap gap-x-3">
                    <dt className="text-zinc-400">{a.prompt}:</dt>
                    <dd className="text-zinc-100">{a.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          <p className="text-xs text-zinc-400">{result.pages.length ? t("pages", { list: result.pages.map((p) => `p. ${p}`).join(", ") }) : t("noPages")}</p>
        </div>
      )}
    </div>
  )
}

/** The OLT's data: open the first time (to fill them in); folded afterwards, so the tools come first. */
export function Settings({ t, s, persisted, open }: { t: T; s: OltSettings; persisted: boolean; open: boolean }) {
  const up = (p: Partial<OltSettings>) => saveOltSettings({ ...s, ...p })
  const issues = settingsIssues(s)
  return (
    <details className="group rounded-2xl border border-white/10 p-4" open={open}>
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 text-base font-medium text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        {t("settings.title")}
        <span aria-hidden className="text-zinc-400 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="mt-3 grid gap-4">
        <p className="text-xs text-zinc-400">
          {t("settings.hint")} {persisted ? t("settings.saved") : t("settings.notSaved")}
        </p>
        <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <TextIn label={t("settings.sysname")} value={s.sysname} onChange={(sysname) => up({ sysname })} />
          <NumIn label={t("settings.mgmtVlan")} min={2} max={4094} value={s.mgmtVlan} onChange={(mgmtVlan) => up({ mgmtVlan })} />
          <TextIn label={t("settings.mgmtAddress")} value={s.mgmtAddress} onChange={(mgmtAddress) => up({ mgmtAddress })} />
          <TextIn label={t("settings.mgmtGateway")} value={s.mgmtGateway} onChange={(mgmtGateway) => up({ mgmtGateway })} />
          <SelectIn label={t("settings.uplinkSlot")} value={String(s.uplinkSlot)} onChange={(x) => up({ uplinkSlot: Number(x) })} options={["2", "3"].map((x) => ({ value: x, label: `0/${x}` }))} />
          <SelectIn label={t("settings.uplinkPort")} value={String(s.uplinkPort)} onChange={(x) => up({ uplinkPort: Number(x) })} options={["0", "1", "2", "3"].map((x) => ({ value: x, label: x }))} />
          <SelectIn label={t("settings.ontMode")} value={s.ontMode} onChange={(x) => up({ ontMode: x === "bridge" ? "bridge" : "router" })} options={["router", "bridge"].map((x) => ({ value: x, label: t(`settings.ontModes.${x}`) }))} />
          <NumIn label={t("settings.iptvVlan")} min={0} max={4094} value={s.iptvVlan} onChange={(iptvVlan) => up({ iptvVlan })} />
          <SelectIn label={t("settings.iptvEth")} value={String(s.iptvEth)} onChange={(x) => up({ iptvEth: Number(x) })} options={["1", "2", "3", "4"].map((x) => ({ value: x, label: `LAN ${x}` }))} />
        </div>
        <SelectIn label={t("settings.planMode")} hint={t("settings.planModeHint")} value={s.planMode} onChange={(x) => up({ planMode: x === "vlan" ? "vlan" : "priority" })} options={PLAN_MODES.map((x) => ({ value: x, label: t(`settings.planModes.${x}`) }))} />
        {s.planMode === "priority" && (
          <div className="max-w-xs">
            <NumIn label={t("settings.internetVlan")} min={2} max={4094} value={s.internetVlan} onChange={(internetVlan) => up({ internetVlan })} />
          </div>
        )}
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm text-zinc-200">{t("settings.plans")}</legend>
          {s.plans.map((p, k) => {
            const set = (q: Partial<typeof p>) => up({ plans: s.plans.map((x, i) => (i === k ? { ...x, ...q } : x)) })
            return (
              <div key={k} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <TextIn label={t("settings.planName")} value={p.name} onChange={(name) => set({ name: name.slice(0, 20) })} />
                <NumIn label={t("settings.planMbps")} min={1} max={10000} value={p.mbps} onChange={(mbps) => set({ mbps })} />
                {s.planMode === "vlan" ? <NumIn label={t("settings.planVlan")} min={2} max={4094} value={p.vlan} onChange={(vlan) => set({ vlan })} /> : <span className="hidden sm:block" />}
                <button type="button" disabled={s.plans.length <= 1} onClick={() => up({ plans: s.plans.filter((_, i) => i !== k) })} className={`${SMALL} mb-0.5 disabled:opacity-40`}>
                  {t("settings.removePlan")}
                </button>
              </div>
            )
          })}
          <p className="text-xs text-zinc-400">{t("settings.planIds", { first: FIRST_ID })}</p>
          {s.plans.length < 8 && (
            <button type="button" onClick={() => up({ plans: [...s.plans, { name: "Plan", mbps: 100, vlan: 100 + s.plans.length }] })} className={SMALL}>
              {t("settings.addPlan")}
            </button>
          )}
        </fieldset>
        {issues.length > 0 && (
          <ul role="status" className="grid gap-1 rounded-lg border border-amber-400/30 px-3 py-2 text-xs text-amber-100">
            {issues.map((i) => (
              <li key={i}>{t(`settings.issues.${i}`)}</li>
            ))}
          </ul>
        )}
        <button type="button" onClick={() => window.confirm(t("settings.resetConfirm")) && saveOltSettings(DEFAULT_SETTINGS)} className={SMALL}>
          {t("settings.reset")}
        </button>
      </div>
    </details>
  )
}
