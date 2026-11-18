import copy from "@/messages/internal/proveedores.es.json"
import { NewReportsBadge } from "./NewReportsBadge"

const LINKS = [
  ["/interno", "interno"],
  ["/interno/admin", "admin"],
  ["/interno/admin/notas", "notas"],
  ["/interno/admin/despliegues", "despliegues"],
  ["/interno/admin/clientes", "clientes"],
  ["/interno/admin/reportes_clientes", "reportes_clientes"],
  ["/interno/admin/herramientas", "herramientas"],
  ["/interno/admin/proveedores", "proveedores"],
  ["/interno/admin/materiales", "materiales"],
  ["/interno/levantamientos", "levantamientos"],
] as const

/** The links between the admin pages and the sections that use them, on every admin page (the current one marked). */
export function AdminLinks({ current }: { current: (typeof LINKS)[number][1] }) {
  return (
    <nav aria-label={copy.links.admin} className="mt-4">
      <ul className="flex flex-wrap gap-x-1 gap-y-1 text-sm">
        {LINKS.map(([href, key]) => (
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
    </nav>
  )
}
