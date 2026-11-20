import copy from "@/messages/internal/proveedores.es.json"
import { NewReportsBadge } from "./NewReportsBadge"

/** The internal menu (owner, 2026-11-18: one menu on every internal page): the admin sections, then the technical tools. */
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
      ["/interno/admin/herramientas", "herramientas"],
      ["/interno/admin/compras-herramientas", "compras-herramientas"],
      ["/interno/admin/proveedores", "proveedores"],
      ["/interno/admin/materiales", "materiales"],
      ["/interno/admin/compras-materiales", "compras-materiales"],
      ["/interno/levantamientos", "levantamientos"],
      ["/interno/admin/numeros", "numeros"],
      ["/interno/admin/cuentas-por-pagar", "cuentas-por-pagar"],
      ["/interno/admin/cuentas-por-cobrar", "cuentas-por-cobrar"],
      ["/interno/admin/equipo", "equipo"],
    ],
  },
  {
    key: "techGroup",
    links: [
      ["/interno/mikrotik-optimo", "mikrotik-optimo"],
      ["/interno/mikrotik", "mikrotik"],
      ["/interno/calculadora", "calculadora"],
      ["/interno/olt", "olt"],
    ],
  },
] as const

type Key = (typeof GROUPS)[number]["links"][number][1] | "admin"

/** On every internal page (the current one marked). */
export function AdminLinks({ current }: { current: Key }) {
  return (
    <nav aria-label={copy.links.admin} className="mt-4 grid gap-1.5">
      {GROUPS.map((g) => (
        <ul key={g.key} aria-label={copy.links[g.key]} className="flex flex-wrap gap-x-1 gap-y-1 text-sm">
          {g.links.map(([href, key]) => (
            <li key={key}>
              <a
                href={href}
                aria-current={key === current ? "page" : undefined}
                className={`block rounded-md px-2.5 py-1.5 underline-offset-4 hover:text-foreground hover:underline aria-[current=page]:bg-white/10 aria-[current=page]:text-foreground aria-[current=page]:no-underline ${g.key === "techGroup" ? "text-zinc-400" : "text-zinc-300"}`}
              >
                {copy.links[key]}
                {key === "reportes_clientes" && <NewReportsBadge label={copy.links.newReports} />}
              </a>
            </li>
          ))}
        </ul>
      ))}
    </nav>
  )
}
