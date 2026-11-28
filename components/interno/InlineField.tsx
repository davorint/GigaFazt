"use client"

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { cn } from "cn"
import type { TextKind } from "@/components/mikrotik/TextField"

type Common = {
  label: string
  hint?: string
  /** Anchor for "faltan N datos" (the wrapper gets id `f-<anchor>`). */
  anchor?: string
  /** What the value shows as, when set (defaults to the value itself, numbers with their unit). */
  display?: ReactNode
  className?: string
}
type Variant =
  /** `check` returns the error to show (the field stays open) or "" when the text is fine. */
  | { kind: "text"; value: string; onSave: (v: string) => void; type?: TextKind; max?: number; check?: (v: string) => string }
  | { kind: "area"; value: string; onSave: (v: string) => void; max?: number }
  | { kind: "number"; value: number | null; onSave: (v: number | null) => void; unit?: string; integer?: boolean; min?: number; max?: number }
  | { kind: "date"; value: string; onSave: (v: string) => void }
  | { kind: "pick"; value: string; onSave: (v: string) => void; options: { value: string; label: string }[] }
export type InlineFieldProps = Common & Variant

const MODE: Record<TextKind, "text" | "tel" | "email" | "url"> = { text: "text", tel: "tel", email: "email", url: "url", password: "text" }
const INPUT =
  "w-full min-w-0 rounded-md border border-input bg-zinc-950 px-2.5 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-red-400/60 md:text-sm [color-scheme:dark]"
const MINI = "inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-white/15 px-2 text-xs text-zinc-100 hover:bg-white/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"

const textOf = (p: Variant) => (p.kind === "number" ? (p.value === null ? "" : String(p.value)) : p.value)
const isEmpty = (p: Variant) => (p.kind === "number" ? p.value === null : p.value.trim() === "")

/**
 * One value of a record, edited where it sits (owner, 2026-11-28: "edit field by field as I gather the data, which is
 * not in order"). Shown as a button with its label; a tap turns it into its input. Enter or leaving the field saves
 * (long text: Ctrl/⌘ + Enter or leaving), Esc cancels; only a valid, changed value is saved. Empty values read
 * "— agregar". A menu saves on pick.
 */
export function InlineField(props: InlineFieldProps) {
  const t = useTranslations("inline")
  const id = useId()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [error, setError] = useState("")
  const button = useRef<HTMLButtonElement>(null)
  const picker = useRef<HTMLInputElement & HTMLSelectElement>(null)
  const refocus = useRef(false)
  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false
      button.current?.focus()
    }
    // Menus and dates open their picker on the first tap (phones would need a second one); not every browser can.
    if (editing && (props.kind === "pick" || props.kind === "date"))
      try {
        picker.current?.showPicker()
      } catch {
        // Not allowed or not supported: the focused field is still there to tap.
      }
  }, [editing, props.kind])

  const open = () => {
    setDraft(textOf(props))
    setError("")
    setEditing(true)
  }
  // Back to the value's button after Enter, Esc, ✓ or ✕; not after leaving the field (focus went where it was tapped).
  const close = (back = true) => {
    refocus.current = back
    setEditing(false)
  }
  const commit = (raw = draft, back = true) => {
    const text = props.kind === "text" || props.kind === "area" ? raw.slice(0, props.max ?? (props.kind === "area" ? 4000 : 300)) : raw
    if (props.kind === "number") {
      const min = props.min ?? 0
      const max = props.max ?? 1e7
      const s = text.replace(/[,\s$]/g, "")
      if (s === "") {
        if (props.value !== null) props.onSave(null)
        return close(back)
      }
      const n = Number(s)
      if (!Number.isFinite(n) || n < min || n > max || (props.integer && !Number.isInteger(n))) return setError(t(props.integer ? "invalidInteger" : "invalidNumber", { min, max }))
      if (n !== props.value) props.onSave(n)
      return close(back)
    }
    if (props.kind === "date" && text && !/^\d{4}-\d{2}-\d{2}$/.test(text)) return setError(t("invalidDate"))
    const bad = props.kind === "text" && text.trim() && props.check ? props.check(text) : ""
    if (bad) return setError(bad)
    const v = props.kind === "date" || props.kind === "pick" ? text : text.trim() === "" ? "" : text
    if (v !== props.value) props.onSave(v)
    close(back)
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault()
      close()
    } else if (e.key === "Enter" && (props.kind !== "area" || e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      commit()
    }
  }
  // Buttons inside the editor act before the input's blur (which would save first).
  const keep = (e: { preventDefault: () => void }) => e.preventDefault()

  // A `display` given by the caller (a default name, the carrier typed by hand) counts as a value.
  const empty = props.display === undefined && isEmpty(props)
  const shown =
    props.display ??
    (props.kind === "pick" ? (props.options.find((o) => o.value === props.value)?.label ?? props.value) : props.kind === "number" ? `${props.value}${props.unit ? ` ${props.unit}` : ""}` : props.value)

  return (
    <div id={props.anchor ? `f-${props.anchor}` : undefined} data-missing={empty || undefined} className={cn("min-w-0 scroll-mt-32", props.className)}>
      {!editing ? (
        <button
          ref={button}
          type="button"
          onClick={open}
          className="group grid w-full min-w-0 gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-white/[0.05] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span className="font-mono text-[0.7rem] text-zinc-400">{props.label}</span>
          <span className={cn("text-sm break-words", empty ? "text-zinc-500 group-hover:text-cyan-200" : "text-zinc-100", props.kind === "area" && "whitespace-pre-line")}>{empty ? t("add") : shown}</span>
        </button>
      ) : (
        <div className="grid gap-1.5 rounded-md bg-white/[0.04] p-2">
          <label htmlFor={id} className="font-mono text-[0.7rem] text-zinc-300">
            {props.label}
            {props.kind === "number" && props.unit ? ` (${props.unit})` : ""}
          </label>
          <div className="flex items-start gap-1.5">
            {props.kind === "pick" ? (
              <select
                id={id}
                autoFocus
                value={draft}
                ref={picker}
                onChange={(e) => commit(e.target.value)}
                onBlur={() => close(false)}
                onKeyDown={onKey}
                className={cn(INPUT, "h-10")}
              >
                {props.options.map((o) => (
                  <option key={o.value || "none"} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : props.kind === "area" ? (
              <textarea
                id={id}
                autoFocus
                rows={4}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => commit(draft, false)}
                onKeyDown={onKey}
                aria-describedby={`${id}-hint`}
                className={cn(INPUT, "py-2")}
              />
            ) : (
              <input
                id={id}
                autoFocus
                type={props.kind === "date" ? "date" : props.kind === "text" ? (props.type ?? "text") : "text"}
                inputMode={props.kind === "number" ? (props.integer ? "numeric" : "decimal") : props.kind === "text" ? MODE[props.type ?? "text"] : undefined}
                autoComplete="off"
                spellCheck={false}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value)
                  setError("")
                }}
                ref={props.kind === "date" ? picker : undefined}
                onBlur={() => commit(draft, false)}
                onKeyDown={onKey}
                aria-invalid={error ? true : undefined}
                aria-describedby={error || props.hint ? `${id}-hint` : undefined}
                className={cn(INPUT, "h-10", props.kind !== "text" && "font-mono")}
              />
            )}
            {props.kind !== "pick" && (
              <>
                <button type="button" onMouseDown={keep} onClick={() => commit()} aria-label={t("save")} className={MINI}>
                  ✓
                </button>
                <button type="button" onMouseDown={keep} onClick={() => close()} aria-label={t("cancel")} className={MINI}>
                  ✕
                </button>
              </>
            )}
          </div>
          {(error || props.hint || props.kind === "area") && (
            <p id={`${id}-hint`} role={error ? "alert" : undefined} className={cn("text-xs leading-snug", error ? "text-red-300" : "text-zinc-400")}>
              {error || props.hint || t("areaHint")}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
