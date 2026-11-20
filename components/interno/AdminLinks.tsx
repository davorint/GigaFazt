import copy from "@/messages/internal/proveedores.es.json"
import { NewReportsBadge } from "./NewReportsBadge"

/** The internal menu (owner, 2026-11-18: one menu on every internal page; 2026-11-20: one list, one color). */
const GROUPS = [
  {
    key: "adminGroup",
    links: [
      ["/interno", "interno"],
      ["/interno/admin/notas", "notas"],
      ["/interno/admin/despliegues", "despliegues"],
      ["/interno/admin/acuerdos", "acuerdos"],
      ["/interno/admin/agenda", "agenda"],
      ["/interno/admin/clientes", "clientes"],
      ["/interno/admin/reportes_clientes", "reportes_clientes"],
      ["/interno/herramientas", "herramientas"],
      ["/interno/admin/proveedores", "proveedores"],
      ["/interno/materiales", "materiales"],
      ["/interno/admin/numeros", "numeros"],
      ["/interno/admin/cuentas-por-pagar", "cuentas-por-pagar"],
      ["/interno/admin/cuentas-por-cobrar", "cuentas-por-cobrar"],
      ["/interno/admin/equipo", "equipo"],
      ["/interno/equipos-telecom", "equipos-telecom"],
    ],
  },
] as const

type Key = (typeof GROUPS)[number]["links"][number][1] | "admin"

/**
 * On every internal page (the current one marked). On a phone it folds into one "Menú · <this page>" line that opens the
 * list (owner review 2026-11-20: the open list pushed each page's content below half the screen); from sm up it's the
 * open list. Without JavaScript too (<details>); the folded and open lists are never both visible.
 */
export function AdminLinks({ current }: { current: Key }) {
  const list = (
    <>
      {GROUPS.map((g) => (
        <ul key={g.key} aria-label={copy.links[g.key]} className="flex flex-wrap gap-x-1 gap-y-1 text-sm">
          {g.links.map(([href, key]) => (
            <li key={key}>
              <a
                href={href}
                aria-current={key === current ? "page" : undefined}
                className="block rounded-md px-2.5 py-1.5 text-zinc-300 underline-offset-4 hover:text-foreground hover:underline aria-[current=page]:bg-white/10 aria-[current=page]:text-foreground aria-[current=page]:no-underline"
              >
                {copy.links[key]}
                {key === "reportes_clientes" && <NewReportsBadge label={copy.links.newReports} />}
              </a>
            </li>
          ))}
        </ul>
      ))}
    </>
  )
  return (
    <>
      <details className="group mt-4 rounded-xl border border-white/10 sm:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm text-zinc-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          <span>
            {copy.links.menu}
            {current !== "admin" && <span className="text-zinc-400"> · {copy.links[current]}</span>}
            <NewReportsBadge label={copy.links.newReports} />
          </span>
          <span aria-hidden className="text-zinc-400 transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>
        <nav aria-label={copy.links.admin} className="grid gap-1.5 border-t border-white/10 p-2">
          {list}
        </nav>
      </details>
      <nav aria-label={copy.links.admin} className="mt-4 hidden gap-1.5 sm:grid">
        {list}
      </nav>
    </>
  )
}
