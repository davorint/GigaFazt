import { clientLabel, clientStatus, type Client } from "@/lib/clients/model"
import { towerLabel, type Site } from "@/lib/sites/model"
import { SheetBlock } from "./SheetBlock"
import { NOTE, type T } from "./sheet-ui"

const TONE: Record<string, string> = { activo: "text-emerald-300", suspendido: "text-amber-200", cancelado: "text-zinc-500", "sin-servicio": "text-zinc-400" }

/** The deployment's clients by tower (read only: they are edited in Clientes). */
export function SiteClientsBlock({ t, s, clients }: { t: T; s: Site; clients: Client[] }) {
  const mine = clients.filter((c) => c.siteId === s.id).sort((a, b) => (a.apartment || clientLabel(a)).localeCompare(b.apartment || clientLabel(b), "es", { numeric: true }))
  const groups = [...s.towers.map((x, i) => ({ id: x.id, label: towerLabel(x, i) })), { id: "", label: t("clients.noTower") }]
    .map((g) => ({ ...g, list: mine.filter((c) => (g.id ? c.towerId === g.id : !s.towers.some((x) => x.id === c.towerId))) }))
    .filter((g) => g.list.length)
  return (
    <SheetBlock id="clientes" title={t("nav.clientes")} aside={mine.length ? t("sheet.clientsAside", { n: mine.length }) : undefined}>
      {!mine.length && <p className={NOTE}>{t("clients.none")}</p>}
      {groups.map((g) => (
        <section key={g.id || "none"} aria-label={g.label} className="grid gap-1">
          <h3 className="px-2 text-xs font-medium text-zinc-300">
            {g.label} · {g.list.length}
          </h3>
          <ul className="grid gap-1 sm:grid-cols-2">
            {g.list.map((c) => {
              const st = clientStatus(c)
              return (
                <li key={c.id} className="min-w-0">
                  <a href={`/interno/admin/clientes?c=${c.id}`} className="flex items-center justify-between gap-3 rounded-md border border-white/10 px-2.5 py-1.5 text-sm hover:bg-white/[0.04] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                    <span className="min-w-0 truncate text-zinc-100">
                      {c.apartment ? <span className="font-mono text-zinc-400">{c.apartment} · </span> : null}
                      {clientLabel(c)}
                    </span>
                    <span className={`shrink-0 text-xs ${TONE[st] ?? "text-zinc-300"}`}>{t(`clients.statuses.${st}`)}</span>
                  </a>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </SheetBlock>
  )
}
