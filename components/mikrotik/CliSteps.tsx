"use client"

import { useId, useMemo } from "react"
import { useTranslations } from "next-intl"
import { Checkbox } from "@/components/ui/checkbox"
import { cliSteps, pieceText, type CliCheck, type CliInput, type CliLine, type CliSegment } from "@/lib/mikrotik/cli"
import { useCli } from "./CliContext"
import { CopyButton } from "./CopyButton"

const LINE_TONE: Record<string, string> = {
  cmd: "border-transparent",
  script: "border-amber-400/70 bg-amber-400/[0.04]",
  manual: "border-sky-400/70 bg-sky-400/[0.04] text-zinc-400",
}

/** A script's steps as plain terminal commands in small pieces (owner, 2026-11-28), for the WinBox terminal. */
export function CliSteps({ steps }: { steps: CliInput[] }) {
  const t = useTranslations("mikrotik.cli")
  const cli = useCli()
  const mode = cli?.mode ?? "new"
  const exportText = cli?.exportText ?? ""
  const r = useMemo(() => cliSteps(steps, { mode, exportText }), [steps, mode, exportText])
  const total = r.steps.reduce((a, s) => a + s.segments.length, 0)
  const done = r.steps.reduce((a, s) => a + s.segments.filter((g) => cli?.isDone(g.id)).length, 0)
  const multi = steps.length > 1 || r.steps.some((s) => s.stale)

  return (
    <div className="grid min-w-0 gap-5">
      <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-zinc-400">
        <span>{t("progress", { done, total })}</span>
        {mode === "existing" && exportText.trim() && <span>{t("sameTotal", { count: r.same })}</span>}
        {mode === "existing" && !exportText.trim() && <span className="text-amber-300">{t("noExport")}</span>}
      </p>
      {r.nonAscii && <p className="text-xs text-amber-300">{t("nonAscii")}</p>}
      <ol className="grid gap-7">
        {r.steps.map((s, k) => (
          <li key={k} className="grid min-w-0 gap-3">
            {multi && (
              <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-mono text-xs text-zinc-400">{s.stale ? t("staleWord") : t("stepWord", { n: k + 1 })}</span>
                <span className="text-sm font-medium text-foreground">{s.stale ? t("staleTitle") : s.title}</span>
                {s.same > 0 && <span className="font-mono text-xs text-emerald-300">{t("same", { count: s.same })}</span>}
              </p>
            )}
            {s.stale && <p className="max-w-3xl text-xs leading-snug text-zinc-400">{t("staleHint")}</p>}
            {s.segments.length === 0 && <p className="text-sm text-emerald-300">{t("nothing")}</p>}
            <ol className="grid gap-3">
              {s.segments.map((g) => (
                <Piece key={g.id} seg={g} label={multi ? (s.stale ? t("staleWord") : t("stepWord", { n: k + 1 })) : ""} />
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Piece({ seg, label }: { seg: CliSegment; label: string }) {
  const t = useTranslations("mikrotik.cli")
  const tc = useTranslations("mikrotik.export")
  const cli = useCli()
  const id = useId()
  const done = cli?.isDone(seg.id) ?? false
  const text = pieceText(seg)
  const title = label ? t("part", { label, part: seg.part, parts: seg.parts }) : t("partAlone", { part: seg.part, parts: seg.parts })

  return (
    <li className={`grid min-w-0 gap-3 rounded-xl border border-white/10 p-4 transition-opacity ${done ? "opacity-60" : ""}`}>
      <div className="grid grid-cols-[1fr_auto] items-start gap-3">
        <div className="flex min-w-0 items-start gap-3 pt-1.5">
          {cli && <Checkbox id={id} checked={done} onCheckedChange={(on) => cli.setDone(seg.id, on === true)} aria-label={t("doneLabel", { label: title })} />}
          <label htmlFor={id} className="min-w-0">
            <span className="font-mono text-xs text-zinc-400">{title}</span>
            {seg.menus.length > 0 && <span className="ml-2 font-mono text-xs break-words text-zinc-200">{seg.menus.join(" · ")}</span>}
          </label>
        </div>
        {seg.lines.length > 0 && <CopyButton text={text} label={tc("copy")} done={tc("copied")} />}
      </div>

      {seg.before.length > 0 && (
        <div className="grid gap-1.5">
          <p className="text-xs font-medium text-amber-200">{t("before")}</p>
          <Checks items={seg.before} />
        </div>
      )}

      {seg.lines.length > 0 && (
        <pre
          tabIndex={0}
          aria-label={title}
          className="[font-variant-ligatures:none] max-h-[28rem] overflow-auto rounded-lg border border-white/10 bg-black/40 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-zinc-100 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <code>
            {seg.lines.map((l, i) => (
              <Line key={i} line={l} />
            ))}
          </code>
        </pre>
      )}
      {seg.lines.some((l) => l.kind === "script") && <p className="text-xs leading-snug text-amber-200">{t("scriptLine")}</p>}
      {seg.lines.some((l) => l.kind === "manual") && <p className="text-xs leading-snug text-sky-200">{t("manualLine")}</p>}

      {(seg.verify.length > 0 || seg.stepVerify) && (
        <div className="grid gap-1.5">
          <p className="text-xs font-medium text-zinc-300">{t("verify")}</p>
          <Checks items={[...seg.verify, ...(seg.stepVerify && !seg.verify.some((v) => v.cmd === seg.stepVerify) ? [{ cmd: seg.stepVerify, expect: { kind: "list" as const } }] : [])]} />
        </div>
      )}

      {(seg.undo.length > 0 || seg.undoPartial) && seg.lines.length > 0 && (
        <details className="rounded-lg border border-white/10">
          <summary className="cursor-pointer rounded-lg px-3 py-2 text-xs text-zinc-300 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">{t("undo")}</summary>
          <div className="grid gap-2 px-3 pb-3">
            {seg.undo.length > 0 && (
              <>
                <div className="flex justify-end">
                  <CopyButton text={seg.undo.join("\n")} label={tc("copy")} done={tc("copied")} />
                </div>
                <pre tabIndex={0} aria-label={t("undo")} className="[font-variant-ligatures:none] overflow-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-zinc-100 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                  <code>{seg.undo.join("\n")}</code>
                </pre>
              </>
            )}
            {seg.undoPartial && <p className="text-xs leading-snug text-zinc-400">{t("undoPartial")}</p>}
          </div>
        </details>
      )}
    </li>
  )
}

/** One command, with what a diff changes beside it. */
function Line({ line }: { line: CliLine }) {
  const t = useTranslations("mikrotik.cli")
  return (
    // Hanging indent: a wrapped command's next rows sit to the right of where it starts.
    <span className={`block border-l-2 pr-4 pl-10 [text-indent:-1.5rem] ${LINE_TONE[line.kind]} ${line.stale ? "text-red-200" : ""}`}>
      <Tokens text={line.text} />
      {line.changed && line.changed.length > 0 && <span className="ml-2 text-emerald-300/80 select-none"> {t("changed", { props: line.changed.join(", ") })}</span>}
    </span>
  )
}

/** Wraps between parameters only, never inside a key=value (a very long value may still break). */
function Tokens({ text }: { text: string }) {
  return text.split(" ").map((token, j) => (
    <span key={j}>
      {j > 0 && " "}
      <span className="whitespace-nowrap">{token}</span>
    </span>
  ))
}

function Checks({ items }: { items: CliCheck[] }) {
  const t = useTranslations("mikrotik.cli")
  const tc = useTranslations("mikrotik.export")
  const expect = (c: CliCheck) => {
    const e = c.expect
    if (e.kind === "zero") return t("expect.zero")
    if (e.kind === "atLeast") return t("expect.atLeast", { n: e.n })
    if (e.kind === "value") return e.not ? t("expect.not", { value: e.value }) : t("expect.value", { value: e.value })
    return t("expect.list")
  }
  return (
    <ul className="grid gap-2">
      {items.map((c, i) => (
        <li key={i} className="grid gap-1 rounded-lg bg-white/[0.03] p-2.5 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-3">
          <div className="grid min-w-0 gap-1">
            <code className="font-mono text-xs text-zinc-100 [font-variant-ligatures:none]">
              <Tokens text={c.cmd} />
            </code>
            <span className="text-xs leading-snug text-zinc-400">
              {expect(c)}
              {c.msg && <span className="text-zinc-500"> · {t("ifNot", { msg: c.msg })}</span>}
            </span>
          </div>
          <CopyButton text={c.cmd} label={tc("copy")} done={tc("copied")} />
        </li>
      ))}
    </ul>
  )
}
