"use client"

import { useId, useState, useSyncExternalStore, type FormEvent } from "react"
import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { BODY_MAX, NOTE_COLORS, TITLE_MAX, doneNotes, isEmptyNote, matchNote, newNote, openNotes, type Note, type NoteColor } from "@/lib/notes/model"
import { notesStore } from "@/lib/notes/store"
import { readState } from "@/lib/sync/state"

type T = ReturnType<typeof useTranslations>

/** Paper color and its swatch; dark ink on every paper keeps AA contrast. */
const PAPER: Record<NoteColor, { paper: string; swatch: string }> = {
  amarillo: { paper: "bg-amber-200", swatch: "bg-amber-300" },
  rosa: { paper: "bg-pink-200", swatch: "bg-pink-300" },
  azul: { paper: "bg-sky-200", swatch: "bg-sky-300" },
  verde: { paper: "bg-emerald-200", swatch: "bg-emerald-300" },
  naranja: { paper: "bg-orange-200", swatch: "bg-orange-300" },
  morado: { paper: "bg-violet-200", swatch: "bg-violet-300" },
}
/** A slight tilt per note (from its id) so the board reads as paper; it's static, not motion. */
const TILTS = ["-rotate-1", "rotate-1", "rotate-0", "-rotate-[0.6deg]", "rotate-[0.6deg]"]
const tilt = (id: string) => TILTS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % TILTS.length]

const PRIMARY = "h-11 w-fit rounded-full bg-white px-5 text-sm font-medium text-zinc-950 hover:bg-zinc-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const INK_BTN = "inline-flex min-h-9 items-center rounded-full border border-zinc-900/25 px-3 text-xs font-medium text-zinc-900 hover:bg-black/10 focus-visible:ring-3 focus-visible:ring-zinc-900/60 focus-visible:outline-none"
const INK_SAVE = "inline-flex min-h-9 items-center rounded-full bg-zinc-900 px-4 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 focus-visible:ring-3 focus-visible:ring-zinc-900/60 focus-visible:ring-offset-2 focus-visible:outline-none"
const INK_DANGER = "inline-flex min-h-9 items-center rounded-full border border-red-900/40 px-3 text-xs font-medium text-red-900 hover:bg-red-900/10 focus-visible:ring-3 focus-visible:ring-zinc-900/60 focus-visible:outline-none"
const TEXTAREA = "w-full resize-y rounded-md border px-3 py-2 text-base leading-relaxed outline-none focus-visible:ring-3 sm:text-sm"

const when = (iso: string) => {
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? d.toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""
}

function ColorPick({ t, value, onChange, dark }: { t: T; value: NoteColor; onChange: (c: NoteColor) => void; dark?: boolean }) {
  const name = useId()
  return (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className={`mb-1 text-xs ${dark ? "text-zinc-800" : "text-zinc-400"}`}>{t("color")}</legend>
      {NOTE_COLORS.map((c) => (
        <label key={c} className="relative grid size-9 cursor-pointer place-items-center">
          <input type="radio" name={name} value={c} checked={value === c} onChange={() => onChange(c)} className="peer sr-only" />
          <span
            aria-hidden
            className={`size-7 rounded-full border-2 ${PAPER[c].swatch} ${dark ? "border-zinc-900/20" : "border-white/10"} peer-checked:border-zinc-900 peer-checked:ring-2 peer-checked:ring-white peer-focus-visible:ring-3 peer-focus-visible:ring-ring`}
          />
          <span className="sr-only">{t(`colors.${c}`)}</span>
        </label>
      ))}
    </fieldset>
  )
}

function Composer({ t }: { t: T }) {
  const id = useId()
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [color, setColor] = useState<NoteColor>("amarillo")
  const [error, setError] = useState(false)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (isEmptyNote({ title, body })) return setError(true)
    notesStore.save(newNote({ title: title.trim(), body: body.trim(), color, by: readState().name }))
    setTitle("")
    setBody("")
    setError(false)
  }
  return (
    <form onSubmit={submit} aria-labelledby={`${id}-h`} className="mt-6 grid gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <h2 id={`${id}-h`} className="text-sm font-medium text-foreground">
        {t("new.label")}
      </h2>
      <Input aria-label={t("new.title")} placeholder={t("new.title")} value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} className="h-11 text-base sm:text-sm" />
      <textarea
        aria-label={t("new.body")}
        placeholder={t("new.body")}
        value={body}
        maxLength={BODY_MAX}
        rows={3}
        onChange={(e) => setBody(e.target.value)}
        aria-invalid={error || undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        className={`${TEXTAREA} border-input bg-transparent text-foreground placeholder:text-zinc-500 focus-visible:border-ring focus-visible:ring-ring/50`}
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <ColorPick t={t} value={color} onChange={setColor} />
        <button type="submit" className={PRIMARY}>
          {t("new.add")}
        </button>
      </div>
      {error && (
        <p id={`${id}-err`} role="alert" className="text-sm text-amber-200">
          {t("new.empty")}
        </p>
      )}
    </form>
  )
}

function NoteCard({ t, n }: { t: T; n: Note }) {
  const id = useId()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(n)
  const done = Boolean(n.doneAt)
  const save = (p: Partial<Note>) => notesStore.save({ ...n, ...p })
  const startEdit = () => {
    setDraft(n)
    setEditing(true)
  }
  const commit = (e: FormEvent) => {
    e.preventDefault()
    if (isEmptyNote(draft)) return
    save({ title: draft.title.trim(), body: draft.body.trim(), color: draft.color })
    setEditing(false)
  }
  const remove = () => window.confirm(t("actions.confirmDelete", { title: n.title || t("untitled") })) && notesStore.remove(n.id)
  const paper = PAPER[editing ? draft.color : n.color].paper

  return (
    <li className={`${editing ? "" : tilt(n.id)} motion-safe:transition-transform hover:rotate-0 focus-within:rotate-0`}>
      <article aria-labelledby={`${id}-t`} className={`relative grid h-full min-h-44 content-start gap-2 rounded-sm p-4 text-zinc-900 shadow-lg shadow-black/40 ${paper}`}>
        {editing ? (
          <form onSubmit={commit} className="grid gap-2">
            <h3 id={`${id}-t`} className="sr-only">
              {t("actions.edit")}
            </h3>
            <input
              aria-label={t("new.title")}
              placeholder={t("new.title")}
              value={draft.title}
              maxLength={TITLE_MAX}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className="h-10 rounded-md border border-zinc-900/25 bg-white/50 px-3 text-base font-semibold text-zinc-900 outline-none placeholder:text-zinc-600 focus-visible:ring-3 focus-visible:ring-zinc-900/50 sm:text-sm"
            />
            <textarea
              aria-label={t("new.body")}
              placeholder={t("new.body")}
              value={draft.body}
              maxLength={BODY_MAX}
              rows={5}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              className={`${TEXTAREA} border-zinc-900/25 bg-white/50 text-zinc-900 placeholder:text-zinc-600 focus-visible:ring-zinc-900/50`}
            />
            <ColorPick t={t} value={draft.color} onChange={(c) => setDraft({ ...draft, color: c })} dark />
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={isEmptyNote(draft)} className={INK_SAVE}>
                {t("actions.save")}
              </button>
              <button type="button" onClick={() => setEditing(false)} className={INK_BTN}>
                {t("actions.cancel")}
              </button>
            </div>
          </form>
        ) : (
          <>
            {n.pinned && !done && (
              <span className="absolute -top-2 right-3 rounded-full bg-zinc-900 px-2 py-0.5 font-mono text-[11px] tracking-wide text-white uppercase">{t("pinned")}</span>
            )}
            <h3 id={`${id}-t`} className={`text-base leading-snug font-semibold break-words ${done ? "line-through decoration-zinc-900/50" : ""} ${n.title ? "" : "sr-only"}`}>
              {n.title || t("untitled")}
            </h3>
            {n.body && <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{n.body}</p>}
            <p className="mt-auto pt-2 font-mono text-[11px] leading-relaxed text-zinc-700">
              {t("by", { name: n.by || t("anon"), date: when(n.createdAt) })}
              {n.updatedAt && n.updatedAt.slice(0, 16) !== n.createdAt.slice(0, 16) && !done && (
                <>
                  <br />
                  {t("edited", { date: when(n.updatedAt) })}
                </>
              )}
              {done && (
                <>
                  <br />
                  {t("doneOn", { date: when(n.doneAt) })}
                </>
              )}
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {done ? (
                <>
                  <button type="button" onClick={() => save({ doneAt: "" })} className={INK_BTN}>
                    {t("actions.reopen")}
                  </button>
                  <button type="button" onClick={remove} className={INK_DANGER}>
                    {t("actions.delete")}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => save({ doneAt: new Date().toISOString(), pinned: false })} className={INK_BTN}>
                    ✓ {t("actions.done")}
                  </button>
                  <button type="button" aria-pressed={n.pinned} onClick={() => save({ pinned: !n.pinned })} className={INK_BTN}>
                    {n.pinned ? t("actions.unpin") : t("actions.pin")}
                  </button>
                  <button type="button" onClick={startEdit} className={INK_BTN}>
                    {t("actions.edit")}
                  </button>
                  <button type="button" onClick={remove} className={INK_DANGER}>
                    {t("actions.delete")}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </article>
    </li>
  )
}

/** /interno/admin/notas: the composer, then the pending or done notes as a board of post-its. */
export function NotesApp() {
  const t = useTranslations("notas")
  const store = useSyncExternalStore(notesStore.subscribe, notesStore.snapshot, notesStore.serverSnapshot)
  const [tab, setTab] = useState<"open" | "done">("open")
  const [q, setQ] = useState("")
  const open = openNotes(store.list)
  const done = doneNotes(store.list)
  const shown = (tab === "open" ? open : done).filter((n) => !q.trim() || matchNote(n, q))
  const TAB = "min-h-9 rounded-full px-4 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-[current=true]:bg-white aria-[current=true]:text-zinc-950 text-zinc-300 hover:text-foreground"

  return (
    <div>
      {store.loaded && !store.persisted && (
        <p role="status" className="mt-4 rounded-lg border border-amber-400/40 p-3 text-sm text-amber-200">
          {t("noStorage")}
        </p>
      )}
      <Composer t={t} />
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-full border border-white/10 p-1">
          <button type="button" aria-current={tab === "open"} onClick={() => setTab("open")} className={TAB}>
            {t("tabs.open", { n: open.length })}
          </button>
          <button type="button" aria-current={tab === "done"} onClick={() => setTab("done")} className={TAB}>
            {t("tabs.done", { n: done.length })}
          </button>
        </div>
        <Input type="search" aria-label={t("search")} placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} className="h-10 w-full text-base sm:w-64 sm:text-sm" />
      </div>
      {store.loaded && !shown.length ? (
        <p className="mt-8 text-sm text-zinc-400">{q.trim() ? t("empty.search") : t(`empty.${tab}`)}</p>
      ) : (
        <ul aria-label={t(`tabs.${tab}`, { n: shown.length })} className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((n) => (
            <NoteCard key={n.id} t={t} n={n} />
          ))}
        </ul>
      )}
    </div>
  )
}
