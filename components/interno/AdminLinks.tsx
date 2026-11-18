import copy from "@/messages/internal/proveedores.es.json"

const LINKS = [
  ["/interno", "interno"],
  ["/interno/admin", "admin"],
  ["/interno/admin/clientes", "clientes"],
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
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
