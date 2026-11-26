"use client"

import { useState, useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import { NumberField } from "@/components/mikrotik/NumberField"
import { TextField } from "@/components/mikrotik/TextField"
import { AreaField, DateField, PickField } from "@/components/surveys/SurveyFields"
import { RecordHistory } from "@/components/interno/RecordHistory"
import { useOpenParam } from "@/components/interno/useOpenParam"
import { useSellers } from "@/components/materials/PriceList"
import { mxn } from "@/lib/materials/catalog"
import { catalogServerSnapshot, catalogSnapshot, subscribeCatalog } from "@/lib/materials/store"
import { providerName } from "@/lib/providers/model"
import { LINE_SCOPES, PROJECT_STATUSES, fromKit, newLine, newProject, projectLabel, pushToBuys, resolveLine, totals, type LineScope, type Project, type ProjectLine, type ProjectStatus, type Refs, type Resolved } from "@/lib/projects/model"
import { projectsStore } from "@/lib/projects/store"
import { sitesServerSnapshot, sitesSnapshot, subscribeSites } from "@/lib/sites/store"
import { readState } from "@/lib/sync/state"
import { buyLabel } from "@/lib/toolbuys/model"
import { toolBuysStore } from "@/lib/toolbuys/store"
import { newId } from "@/lib/survey/id"

type T = ReturnType<typeof useTranslations>
const SMALL = "inline-flex min-h-9 w-fit items-center rounded-full border border-white/15 px-3 text-xs text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const PRIMARY = "inline-flex min-h-10 w-fit items-center rounded-full bg-white px-4 text-sm font-medium text-zinc-950 hover:bg-zinc-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const DANGER = "inline-flex min-h-9 w-fit items-center rounded-full border border-red-400/30 px-3 text-xs text-red-200 hover:bg-red-400/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const LINK = "inline-flex min-h-9 w-fit items-center text-xs text-zinc-100 underline decoration-white/30 underline-offset-4 hover:decoration-white"
const TAB = "inline-flex min-h-10 items-center rounded-full px-4 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const STATUS_TONE: Record<ProjectStatus, string> = { planeacion: "text-zinc-300", compras: "text-amber-200", listo: "text-emerald-300", cerrado: "text-zinc-500" }

/**
 * Nuevos proyectos (/interno/nuevos_proyectos, owner 2026-11-26): kits (the minimum equipment of a technician plus the
 * deployment's equipment) and projects copied from them, priced from Compras de herramientas and the materials list.
 */
export function ProjectsApp() {
  const t = useTranslations("proyectos")
  const store = useSyncExternalStore(projectsStore.subscribe, projectsStore.snapshot, projectsStore.serverSnapshot)
  const buys = useSyncExternalStore(toolBuysStore.subscribe, toolBuysStore.snapshot, toolBuysStore.serverSnapshot)
  const catalog = useSyncExternalStore(subscribeCatalog, catalogSnapshot, catalogServerSnapshot)
  const sellers = useSellers()
  const [openId, setOpenId] = useOpenParam("p")
  const [view, setView] = useState<"kits" | "proyectos" | null>(null)
  if (!store.loaded || !buys.loaded || !catalog.loaded) return null
  const kits = store.list.filter((x) => x.kind === "kit").sort((a, b) => a.name.localeCompare(b.name, "es"))
  const projects = store.list.filter((x) => x.kind === "proyecto").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const opened = store.list.find((x) => x.id === openId)
  // An opened link decides the tab; else projects once there are some.
  const tab = view ?? (opened ? (opened.kind === "kit" ? "kits" : "proyectos") : projects.length ? "proyectos" : "kits")
  const refs: Refs = { buys: buys.list, items: catalog.items }
  const storeName = (supplierId: string, fallback: string) => {
    const p = supplierId ? sellers.find((s) => s.id === supplierId) : undefined
    return (p ? providerName(p) : fallback) || ""
  }
  const shown = tab === "kits" ? kits : projects

  const addKit = () => {
    const k = newProject({ kind: "kit", name: t("newKitName"), by: readState().name })
    projectsStore.save(k)
    setView("kits")
    setOpenId(k.id)
  }
  const startProject = (kit: Project) => {
    const p = fromKit(kit, { name: t("newProjectName"), by: readState().name })
    projectsStore.save(p)
    setView("proyectos")
    setOpenId(p.id)
  }

  return (
    <div className="mt-6 grid gap-6">
      {!store.persisted && (
        <p role="alert" className="rounded-xl border border-amber-400/30 p-3 text-sm text-amber-200">
          {t("noStorage")}
        </p>
      )}
      <div role="group" aria-label={t("tabs.label")} className="flex flex-wrap gap-2">
        {(["proyectos", "kits"] as const).map((v) => (
          <button key={v} type="button" aria-pressed={tab === v} onClick={() => setView(v)} className={`${TAB} ${tab === v ? "bg-white font-medium text-zinc-950" : "border border-white/15 text-zinc-100 hover:bg-white/5"}`}>
            {v === "kits" ? t("tabs.kits", { n: kits.length }) : t("tabs.projects", { n: projects.length })}
          </button>
        ))}
        {tab === "kits" && (
          <button type="button" onClick={addKit} className={SMALL}>
            {t("newKit")}
          </button>
        )}
      </div>
      <p className="text-xs leading-relaxed text-zinc-400">{t("priceNote")}</p>
      {!shown.length && <p className="text-sm text-zinc-400">{tab === "kits" ? t("noKits") : t("noProjects")}</p>}
      <ul className="grid gap-3">
        {shown.map((p) => (
          <li key={p.id}>
            <ProjectCard t={t} p={p} kits={kits} refs={refs} storeName={storeName} open={openId === p.id} onToggle={() => setOpenId(openId === p.id ? null : p.id)} onStart={() => startProject(p)} onOpen={(id) => { setView(null); setOpenId(id) }} />
          </li>
        ))}
      </ul>
    </div>
  )
}

type CardProps = { t: T; p: Project; kits: Project[]; refs: Refs; storeName: (id: string, f: string) => string; open: boolean; onToggle: () => void; onStart: () => void; onOpen: (id: string) => void }

function ProjectCard({ t, p, kits, refs, storeName, open, onToggle, onStart, onOpen }: CardProps) {
  const tm = useTranslations("materiales")
  const sites = useSyncExternalStore(subscribeSites, sitesSnapshot, sitesServerSnapshot)
  const [done, setDone] = useState("")
  const isKit = p.kind === "kit"
  const up = (x: Partial<Project>) => projectsStore.save({ ...p, ...x })
  const rows = p.lines.map((l) => resolveLine(l, p.technicians, refs, storeName))
  const sum = totals(rows)
  const kit = kits.find((k) => k.id === p.kitId)
  const site = sites.list.find((s) => s.id === p.siteId)
  const setLine = (l: ProjectLine) => up({ lines: p.lines.map((x) => (x.id === l.id ? l : x)) })
  const removeLine = (id: string) => up({ lines: p.lines.filter((x) => x.id !== id) })
  const groupOf = (r: Resolved) => (r.line.ref === "material" && r.item ? tm(`categories.${r.item.category}`) : r.group)

  const push = () => {
    const out = pushToBuys(p, toolBuysStore.list(), readState().name)
    toolBuysStore.save(...out)
    if (out.length && p.status === "planeacion") up({ status: "compras" })
    setDone(t("pushDone", { n: out.length }))
  }
  const duplicate = () => {
    const c = { ...p, id: newId(), name: t("copyOf", { name: projectLabel(p) }), lines: p.lines.map((l) => ({ ...l, id: newId() })), by: readState().name }
    projectsStore.save(c)
    onOpen(c.id)
  }

  return (
    <div className="rounded-xl border border-white/10">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center justify-between gap-3 rounded-xl p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className="grid min-w-0 gap-0.5">
          <span className="text-sm text-zinc-100">
            {isKit && <span className="mr-2 rounded border border-white/20 px-1 font-mono text-[10px] tracking-wider text-zinc-300">{t("kitBadge")}</span>}
            {projectLabel(p)}
          </span>
          <span className="font-mono text-xs text-zinc-400">
            {!isKit && <span className={STATUS_TONE[p.status]}>{t(`statuses.${p.status}`)} · </span>}
            {t("lines", { n: p.lines.length })} · {t("techCount", { n: p.technicians })}
            {site ? ` · ${site.name}` : ""}
            {sum.unpriced ? ` · ${t("sum.unpriced", { n: sum.unpriced })}` : ""}
          </span>
        </span>
        <span className="grid shrink-0 justify-items-end gap-0.5 font-mono">
          <span className="text-sm text-zinc-100">{mxn(sum.total)}</span>
          {!isKit && sum.toBuy > 0 && <span className="text-xs text-amber-200">{t("sum.toBuy")} {mxn(sum.toBuy)}</span>}
        </span>
      </button>
      {open && (
        <div className="grid gap-6 border-t border-white/10 p-3">
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <TextField label={t("name")} value={p.name} onChange={(v) => up({ name: v.slice(0, 200) })} />
            <NumberField label={t("technicians")} unit={t("people")} hint={t("techniciansHint")} integer min={1} max={50} value={p.technicians} onChange={(v) => up({ technicians: v ?? 1 })} />
            {!isKit && (
              <>
                <PickField label={t("status")} value={p.status} onChange={(v: ProjectStatus) => up({ status: v })} options={PROJECT_STATUSES.map((s) => ({ value: s, label: t(`statuses.${s}`) }))} />
                <PickField label={t("site")} value={p.siteId} onChange={(v) => up({ siteId: v })} options={[{ value: "", label: t("noSite") }, ...(p.siteId && !site ? [{ value: p.siteId, label: p.siteId.slice(0, 8) }] : []), ...sites.list.map((s) => ({ value: s.id, label: s.name || s.id.slice(0, 8) }))]} />
                <DateField label={t("start")} value={p.start} onChange={(v) => up({ start: v })} />
              </>
            )}
          </div>
          {!isKit && kit && (
            <button type="button" onClick={() => onOpen(kit.id)} className={LINK}>
              {t("fromKit", { name: projectLabel(kit) })}
            </button>
          )}

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t("sum.perTechnician")} value={mxn(sum.perTechnician)} />
            <Stat label={t("sum.deployment")} value={mxn(sum.deployment)} />
            <Stat label={t("sum.total")} value={mxn(sum.total)} strong />
            {isKit ? <Stat label={t("line.noPrice")} value={String(sum.unpriced)} tone={sum.unpriced ? "text-amber-200" : undefined} /> : <Stat label={t("sum.toBuy")} value={mxn(sum.toBuy)} tone={sum.toBuy ? "text-amber-200" : "text-emerald-300"} />}
          </dl>
          {!isKit && <p className="font-mono text-xs text-zinc-400">{t("sum.missing", { n: sum.missingPieces })}{sum.unpriced ? ` · ${t("sum.unpriced", { n: sum.unpriced })}` : ""}</p>}

          {LINE_SCOPES.map((scope) => {
            const list = rows.filter((r) => r.line.scope === scope)
            if (!list.length) return null
            return (
              <section key={scope} aria-label={t(`scopes.${scope}`)} className="grid gap-2">
                <h3 className="text-sm font-medium text-foreground">
                  {t(`scopes.${scope}`)} <span className="font-mono text-xs text-zinc-400">· {t("lines", { n: list.length })}</span>
                </h3>
                <ul className="grid gap-2">
                  {list.map((r) => (
                    <li key={r.line.id}>
                      <LineRow t={t} r={r} group={groupOf(r)} isKit={isKit} onChange={setLine} onRemove={() => removeLine(r.line.id)} />
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}

          <AddLine t={t} refs={refs} onAdd={(l) => up({ lines: [...p.lines, l] })} />
          <AreaField label={t("notes")} value={p.notes} onChange={(v) => up({ notes: v.slice(0, 2000) })} rows={2} />

          <div className="grid gap-2">
            {isKit ? (
              <button type="button" onClick={onStart} className={PRIMARY}>
                {t("newProject")}
              </button>
            ) : (
              <>
                <button type="button" onClick={push} className={PRIMARY}>
                  {t("push")}
                </button>
                <p className="text-xs leading-relaxed text-zinc-400">{t("pushHint")}</p>
              </>
            )}
            {done && (
              <p role="status" className="text-sm text-emerald-300">
                {done}
              </p>
            )}
          </div>

          <RecordHistory kind="proyectos" id={p.id} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={duplicate} className={SMALL}>
              {t("duplicate")}
            </button>
            <button type="button" onClick={() => window.confirm(t("confirmRemove", { name: projectLabel(p) })) && projectsStore.remove(p.id)} className={DANGER}>
              {t("remove")}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className="grid gap-1 rounded-lg border border-white/10 p-3">
      <dt className="text-xs text-zinc-400">{label}</dt>
      <dd className={`font-mono ${strong ? "text-base text-foreground" : "text-sm"} ${tone ?? "text-zinc-100"}`}>{value}</dd>
    </div>
  )
}

function LineRow({ t, r, group, isKit, onChange, onRemove }: { t: T; r: Resolved; group: string; isKit: boolean; onChange: (l: ProjectLine) => void; onRemove: () => void }) {
  const l = r.line
  const href = l.ref === "herramienta" ? `/interno/herramientas/compras?o=${l.refId}` : `/interno/materiales/compras?m=${l.refId}`
  return (
    <div className={`grid gap-3 rounded-lg border p-3 ${r.found ? "border-white/10" : "border-amber-400/40"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid min-w-0 gap-0.5">
          <span className="text-sm text-zinc-100">{r.found ? r.name : t("line.gone")}</span>
          <span className="font-mono text-xs text-zinc-400">
            {[group, r.store].filter(Boolean).join(" · ")}
            {r.unit !== null ? ` · ${t("line.each", { price: mxn(r.unit) })}` : ""}
          </span>
        </div>
        <span className={`shrink-0 font-mono text-sm ${r.total === null ? "text-amber-200" : "text-zinc-100"}`}>{r.total === null ? t("line.noPrice") : mxn(r.total)}</span>
      </div>
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <div className="grid w-full grid-cols-2 items-start gap-3 sm:w-auto sm:grid-cols-[9rem_9rem]">
          <NumberField label={l.scope === "tecnico" ? t("line.qtyTech") : t("line.qty")} unit={t("line.pieces")} integer min={0} max={100000} value={l.qty} onChange={(v) => onChange({ ...l, qty: v ?? 0 })} />
          {!isKit && <NumberField label={t("line.have")} unit={t("line.pieces")} integer min={0} max={100000} value={l.have} onChange={(v) => onChange({ ...l, have: v ?? 0 })} />}
        </div>
        {!isKit && (
          <p className={`pb-2 font-mono text-xs ${r.missing ? "text-amber-200" : "text-emerald-300"}`}>
            {t("line.need", { n: r.need })} · {r.missing ? t("line.missing", { n: r.missing }) : t("line.complete")}
          </p>
        )}
        <div className="flex flex-wrap gap-2 sm:ml-auto">
        {r.found && (
          <a href={href} className={LINK}>
            {t("line.open")}
          </a>
        )}
        {/^https?:\/\//.test(r.url) && (
          <a href={r.url} target="_blank" rel="noopener noreferrer" className={LINK}>
            {t("line.store")}
          </a>
        )}
        <button type="button" onClick={onRemove} className={DANGER}>
          {t("line.remove")}
        </button>
        </div>
      </div>
    </div>
  )
}

function AddLine({ t, refs, onAdd }: { t: T; refs: Refs; onAdd: (l: ProjectLine) => void }) {
  const [what, setWhat] = useState("")
  const [scope, setScope] = useState<LineScope>("tecnico")
  const tools = [...refs.buys].filter((b) => b.status !== "descartado").sort((a, b) => (a.need + buyLabel(a)).localeCompare(b.need + buyLabel(b), "es"))
  const items = [...refs.items].sort((a, b) => a.name.localeCompare(b.name, "es"))
  const add = () => {
    const [ref, refId] = what.split(":")
    if (!refId) return
    onAdd(newLine({ ref: ref === "material" ? "material" : "herramienta", refId, scope }))
    setWhat("")
  }
  return (
    <fieldset className="grid gap-3 rounded-lg border border-dashed border-white/15 p-3">
      <legend className="px-1 text-sm font-medium text-foreground">{t("add.title")}</legend>
      <div className="grid items-start gap-3 sm:grid-cols-[1fr_auto]">
        <label className="grid gap-1.5">
          <span className="font-mono text-xs text-zinc-300">{t("add.what")}</span>
          <select value={what} onChange={(e) => setWhat(e.target.value)} className="min-h-10 w-full min-w-0 rounded-lg border border-white/15 bg-zinc-950 px-3 text-sm text-zinc-100 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            <option value="">{t("add.pick")}</option>
            <optgroup label={t("add.tools")}>
              {tools.map((b) => (
                <option key={b.id} value={`herramienta:${b.id}`}>
                  {b.need ? `${b.need} — ` : ""}
                  {buyLabel(b)}
                </option>
              ))}
            </optgroup>
            <optgroup label={t("add.materials")}>
              {items.map((it) => (
                <option key={it.id} value={`material:${it.id}`}>
                  {it.name}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <PickField label={t("add.scope")} value={scope} onChange={setScope} options={LINE_SCOPES.map((s) => ({ value: s, label: t(`scopes.${s}`) }))} />
      </div>
      <button type="button" onClick={add} disabled={!what} className={`${SMALL} disabled:opacity-40`}>
        {t("add.submit")}
      </button>
    </fieldset>
  )
}
