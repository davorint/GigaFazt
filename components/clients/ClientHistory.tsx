"use client"

import { useState, useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import type { Client } from "@/lib/clients/model"
import { clientLabel } from "@/lib/clients/model"
import { agendaStore } from "@/lib/agenda/store"
import { byWhen, isOpenAppt } from "@/lib/agenda/model"
import { reportsStore } from "@/lib/reports/store"
import { reportCode } from "@/lib/reports/model"
import { movesStore, unitsStore } from "@/lib/stock/store"
import { notesStore } from "@/lib/notes/store"
import { catalogServerSnapshot, catalogSnapshot, subscribeCatalog } from "@/lib/materials/store"
import { ScheduleForm } from "@/components/agenda/ScheduleForm"
import { receivablesStore } from "@/lib/finance/store"
import { balanceOf, isOpenDoc } from "@/lib/finance/common"
import { mxn } from "@/lib/materials/catalog"
import { dayLabel } from "@/components/agenda/AgendaApp"

const SMALL = "inline-flex min-h-9 w-fit items-center rounded-full border border-white/15 px-3 text-xs text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const ROW = "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/[0.03]"
const MAX = 8

/**
 * Everything about a client in one place (owner, 2026-11-19): their appointments (and "Agendar visita"), their reports,
 * the equipment they hold, what was installed or replaced for them, and the notes about them. Each line opens its
 * section.
 */
export function ClientHistory({ c }: { c: Client }) {
  const t = useTranslations("clientes.history")
  const ta = useTranslations("agenda")
  const tr = useTranslations("reportes")
  const tm = useTranslations("materiales")
  const agenda = useSyncExternalStore(agendaStore.subscribe, agendaStore.snapshot, agendaStore.serverSnapshot).list
  const reports = useSyncExternalStore(reportsStore.subscribe, reportsStore.snapshot, reportsStore.serverSnapshot).list
  const moves = useSyncExternalStore(movesStore.subscribe, movesStore.snapshot, movesStore.serverSnapshot).list
  const units = useSyncExternalStore(unitsStore.subscribe, unitsStore.snapshot, unitsStore.serverSnapshot).list
  const notes = useSyncExternalStore(notesStore.subscribe, notesStore.snapshot, notesStore.serverSnapshot).list
  const charges = useSyncExternalStore(receivablesStore.subscribe, receivablesStore.snapshot, receivablesStore.serverSnapshot).list
  const items = useSyncExternalStore(subscribeCatalog, catalogSnapshot, catalogServerSnapshot).items
  const [scheduling, setScheduling] = useState(false)
  const itemName = (id: string) => items.find((x) => x.id === id)?.name ?? t("unknownItem")

  const appts = agenda.filter((a) => a.clientId === c.id && isOpenAppt(a)).sort(byWhen)
  const mineReports = reports.filter((r) => r.clientId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const held = units.filter((u) => u.state === "cliente" && u.clientId === c.id)
  const mineMoves = moves.filter((m) => m.clientId === c.id).sort((a, b) => b.date.localeCompare(a.date))
  const mineNotes = notes.filter((n) => n.linkKind === "client" && n.linkId === c.id)
  // One-off charges (Cuentas por cobrar) still open for this client.
  const mineCharges = charges.filter((x) => x.clientId === c.id && isOpenDoc(x)).sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"))

  return (
    <fieldset className="grid gap-4">
      <legend className="mb-1 text-sm font-medium text-foreground">{t("title")}</legend>

      <section aria-label={t("agenda")} className="grid gap-2">
        <h3 className="font-mono text-xs uppercase tracking-wide text-zinc-400">{t("agenda")}</h3>
        {appts.map((a) => (
          // eslint-disable-next-line @next/next/no-html-link-for-pages -- another internal page: a full load (proxy.ts checks the session)
          <a key={a.id} href="/interno/admin/agenda" className={ROW}>
            <span className="text-zinc-100 first-letter:uppercase">
              {dayLabel(a.date)}
              {a.time ? ` · ${a.time}` : ""} · {ta(`kinds.${a.kind}`)}
            </span>
            <span className="font-mono text-xs text-zinc-400">
              {a.who || ta("unassigned")} · {ta(`statuses.${a.status}`)}
            </span>
          </a>
        ))}
        {scheduling ? (
          <ScheduleForm
            kind="visita"
            base={{ clientId: c.id, siteId: c.siteId, name: clientLabel(c), phone: c.whatsapp || c.phone, address: [c.building, c.tower, c.apartment].filter(Boolean).join(" ") }}
            onDone={() => setScheduling(false)}
          />
        ) : (
          <button type="button" onClick={() => setScheduling(true)} className={SMALL}>
            {ta("scheduleVisit")}
          </button>
        )}
      </section>

      {mineCharges.length > 0 && (
        <section aria-label={t("charges")} className="grid gap-2">
          <h3 className="font-mono text-xs uppercase tracking-wide text-zinc-400">{t("charges")}</h3>
          {mineCharges.map((x) => (
            <a key={x.id} href={`/interno/admin/cuentas-por-cobrar?c=${x.id}`} className={ROW}>
              <span className="text-zinc-100">{x.concept || "—"}</span>
              <span className="font-mono text-xs text-zinc-400">{t("chargeLine", { balance: mxn(balanceOf(x)), date: x.dueDate || "—" })}</span>
            </a>
          ))}
        </section>
      )}

      <section aria-label={t("reports")} className="grid gap-2">
        <h3 className="font-mono text-xs uppercase tracking-wide text-zinc-400">{t("reportsCount", { n: mineReports.length })}</h3>
        {!mineReports.length && <p className="text-xs text-zinc-400">{t("none")}</p>}
        {mineReports.slice(0, MAX).map((r) => (
          <a key={r.id} href={`/interno/admin/reportes_clientes?r=${r.id}`} className={ROW}>
            <span className="text-zinc-100">
              {reportCode(r)} · {tr(`categories.${r.category}`)}
            </span>
            <span className="font-mono text-xs text-zinc-400">
              {r.createdAt.slice(0, 10)} · {tr(`statuses.${r.status}`)}
            </span>
          </a>
        ))}
        {mineReports.length > MAX && <p className="text-xs text-zinc-400">{t("more", { n: mineReports.length - MAX })}</p>}
      </section>

      <section aria-label={t("equipment")} className="grid gap-2">
        <h3 className="font-mono text-xs uppercase tracking-wide text-zinc-400">{t("equipment")}</h3>
        {!held.length && <p className="text-xs text-zinc-400">{t("noEquipment")}</p>}
        {held.map((u) => (
          // eslint-disable-next-line @next/next/no-html-link-for-pages -- another internal page: a full load
          <a key={u.id} href="/interno/materiales/en-existencia?t=equipos" className={ROW}>
            <span className="font-mono text-zinc-100">{u.serial}</span>
            <span className="text-xs text-zinc-400">{itemName(u.itemId)}</span>
          </a>
        ))}
      </section>

      <section aria-label={t("moves")} className="grid gap-2">
        <h3 className="font-mono text-xs uppercase tracking-wide text-zinc-400">{t("moves")}</h3>
        {!mineMoves.length && <p className="text-xs text-zinc-400">{t("none")}</p>}
        {mineMoves.slice(0, MAX).map((m) => (
          <div key={m.id} className={ROW}>
            <span className="text-zinc-100">
              {tm(`move.kinds.${m.kind}`)} · {itemName(m.itemId)}
            </span>
            <span className="font-mono text-xs text-zinc-400">
              {m.date} · {m.serials.length ? m.serials.join(", ") : m.qty}
            </span>
          </div>
        ))}
        {mineMoves.length > MAX && <p className="text-xs text-zinc-400">{t("more", { n: mineMoves.length - MAX })}</p>}
      </section>

      <section aria-label={t("notes")} className="grid gap-2">
        <h3 className="font-mono text-xs uppercase tracking-wide text-zinc-400">{t("notes")}</h3>
        {!mineNotes.length && <p className="text-xs text-zinc-400">{t("none")}</p>}
        {mineNotes.map((n) => (
          // eslint-disable-next-line @next/next/no-html-link-for-pages -- another internal page: a full load
          <a key={n.id} href="/interno/admin/notas" className={ROW}>
            <span className="text-zinc-100">{n.title || n.body.slice(0, 80)}</span>
            <span className="font-mono text-xs text-zinc-400">{n.doneAt ? t("noteDone") : t("noteOpen")}</span>
          </a>
        ))}
      </section>
    </fieldset>
  )
}
