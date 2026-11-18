"use client"

import { useId, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { TextField } from "@/components/mikrotik/TextField"
import { AreaField, PickField } from "@/components/surveys/SurveyFields"
import { IMPORT_FIELDS, guessField, hasHeader, parseTable, pppSecretsToClients, rowsToClients, type ImportField } from "@/lib/clients/import"
import { importClients } from "@/lib/clients/store"

const PRIMARY = "h-11 w-fit rounded-full bg-white px-5 text-sm font-medium text-zinc-950 hover:bg-zinc-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
const PREVIEW_ROWS = 5

/** Current subscribers in, from a spreadsheet (columns matched to fields) or from a MikroTik /ppp secret export. */
export function ImportPanel() {
  const t = useTranslations("clientes")
  return (
    <div className="grid gap-6">
      <p className="text-sm leading-relaxed text-zinc-300">{t("import.intro")}</p>
      <SheetImport />
      <MikrotikImport />
    </div>
  )
}

function SheetImport() {
  const t = useTranslations("clientes")
  const fileId = useId()
  const [text, setText] = useState("")
  const [header, setHeader] = useState<boolean | null>(null)
  const [mapping, setMapping] = useState<(ImportField | "")[] | null>(null)
  const [done, setDone] = useState("")
  const rows = useMemo(() => (text.trim() ? parseTable(text) : []), [text])
  const withHeader = header ?? hasHeader(rows)
  const cols = Math.max(0, ...rows.slice(0, 50).map((r) => r.length))
  const map: (ImportField | "")[] = mapping && mapping.length === cols ? mapping : Array.from({ length: cols }, (_, i) => (withHeader ? guessField(rows[0]?.[i] ?? "") : ""))
  const r = useMemo(() => rowsToClients(rows, map, withHeader), [rows, map, withHeader])
  const reset = (next: string) => {
    setText(next)
    setMapping(null)
    setHeader(null)
    setDone("")
  }
  const run = () => {
    const res = importClients(r.clients)
    setDone(t("import.done", res))
    setText("")
    setMapping(null)
  }
  return (
    <section aria-labelledby="hoja" className="grid gap-4 rounded-xl border border-white/10 p-4">
      <h3 id="hoja" className="text-base font-medium text-foreground">
        {t("import.sheetTitle")}
      </h3>
      <p className="text-xs leading-snug text-zinc-400">{t("import.sheetHint")}</p>
      <AreaField label={t("import.paste")} value={text} onChange={reset} rows={5} />
      <div className="flex flex-wrap items-center gap-4">
        <label htmlFor={fileId} className="inline-flex h-10 cursor-pointer items-center rounded-full border border-white/15 px-4 text-sm text-zinc-100 hover:bg-white/5 focus-within:ring-3 focus-within:ring-ring/50">
          {t("import.file")}
          <input id={fileId} type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={(e) => void e.target.files?.[0]?.text().then(reset).finally(() => (e.target.value = ""))} />
        </label>
        {rows.length > 0 && (
          <label className="flex min-h-9 items-center gap-2 text-sm text-zinc-200">
            <input type="checkbox" className="size-5 accent-white" checked={withHeader} onChange={(e) => setHeader(e.target.checked)} />
            {t("import.header")}
          </label>
        )}
      </div>
      {rows.length > 0 && (
        <>
          <div className="grid gap-3">
            <p className="text-sm font-medium text-foreground">{t("import.mapTitle")}</p>
            <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {map.map((f, i) => (
                <PickField
                  key={i}
                  label={`${t("import.column", { n: i + 1 })}${withHeader && rows[0]?.[i] ? ` · ${rows[0][i]}` : ""}`}
                  value={f}
                  onChange={(v) => setMapping(map.map((x, j) => (j === i ? v : x)))}
                  options={[{ value: "" as const, label: t("import.ignore") }, ...IMPORT_FIELDS.map((k) => ({ value: k, label: t(`fields.${k}`) }))]}
                />
              ))}
            </div>
          </div>
          <div className="grid gap-1">
            <p className="text-xs text-zinc-400">{t("import.preview", { n: PREVIEW_ROWS })}</p>
            <div className="overflow-x-auto rounded-lg border border-white/10" tabIndex={0} role="region" aria-label={t("import.preview", { n: PREVIEW_ROWS })}>
              <table className="w-full text-left text-xs">
                <tbody>
                  {rows.slice(withHeader ? 1 : 0, (withHeader ? 1 : 0) + PREVIEW_ROWS).map((row, k) => (
                    <tr key={k} className="border-b border-white/5 last:border-0">
                      {row.map((c, i) => (
                        <td key={i} className="px-2 py-1.5 whitespace-nowrap text-zinc-300">
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-sm text-zinc-100">{t("import.ready", { n: r.clients.length })}</p>
          {r.errors.length > 0 && (
            <div className="grid gap-1">
              <p className="text-sm text-amber-200">{t("import.errors", { n: r.errors.length })}</p>
              <ul className="max-h-48 overflow-y-auto font-mono text-xs leading-relaxed text-zinc-300">
                {r.errors.slice(0, 100).map((e, k) => (
                  <li key={k}>{e.field === "row" ? t("import.errorRow", { line: e.line }) : t("import.errorLine", { line: e.line, field: t(`fields.${e.field}`), value: e.value })}</li>
                ))}
              </ul>
            </div>
          )}
          <button type="button" onClick={run} disabled={!r.clients.length} className={PRIMARY}>
            {t("import.doImport")}
          </button>
        </>
      )}
      {done && (
        <p role="status" className="text-sm text-emerald-300">
          {done}
        </p>
      )}
    </section>
  )
}

function MikrotikImport() {
  const t = useTranslations("clientes")
  const [text, setText] = useState("")
  const [deployment, setDeployment] = useState("")
  const [done, setDone] = useState("")
  const r = useMemo(() => (text.trim() ? pppSecretsToClients(text) : { clients: [], skipped: 0 }), [text])
  const run = () => {
    const res = importClients(r.clients.map((c) => ({ ...c, deployment: deployment.trim(), building: deployment.trim() || c.building })))
    setDone(t("import.done", res))
    setText("")
  }
  return (
    <section aria-labelledby="mikrotik" className="grid gap-4 rounded-xl border border-white/10 p-4">
      <h3 id="mikrotik" className="text-base font-medium text-foreground">
        {t("import.mikrotikTitle")}
      </h3>
      <p className="text-xs leading-snug text-zinc-400">{t("import.mikrotikHint")}</p>
      <AreaField
        label={t("import.mikrotikPaste")}
        value={text}
        onChange={(v) => {
          setText(v)
          setDone("")
        }}
        rows={5}
      />
      <TextField label={t("import.deployment")} value={deployment} onChange={setDeployment} hint={t("import.deploymentHint")} />
      {text.trim() && <p className="text-sm text-zinc-100">{t("import.found", { n: r.clients.length, skipped: r.skipped })}</p>}
      <button type="button" onClick={run} disabled={!r.clients.length} className={PRIMARY}>
        {t("import.doImport")}
      </button>
      {done && (
        <p role="status" className="text-sm text-emerald-300">
          {done}
        </p>
      )}
    </section>
  )
}
