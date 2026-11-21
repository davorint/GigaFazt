/**
 * The DavorOLT tools in the owner's order (owner, 2026-11-21: "an individual tool per topic", one per item of the list
 * taken from AdminOLT/SmartOLT), each on its own page /interno/software/davorolt/<slug>. No imports: lib/internal-pages
 * reads the slugs to canonicalize addresses.
 */
export const GROUPS = ["setup", "onu", "install"] as const
export type GroupId = (typeof GROUPS)[number]

export const CATALOG = [
  { id: "inicial", slug: "configuracion-inicial", group: "setup" },
  { id: "usuario", slug: "crear-usuario-administrador", group: "setup" },
  { id: "acceso", slug: "agregar-olt", group: "setup" },
  { id: "sinIp", slug: "conectar-olt-sin-ip-publica", group: "setup" },
  { id: "redireccion", slug: "redireccion-de-puertos", group: "setup" },
  { id: "mikrotik", slug: "configuraciones-en-mikrotik", group: "setup" },
  { id: "todo", slug: "aplicar-configuracion-inicial", group: "setup" },
  { id: "vlan", slug: "crear-vlan", group: "setup" },
  { id: "pon", slug: "habilitar-pon", group: "setup" },
  { id: "uplink", slug: "habilitar-puerto-uplink", group: "setup" },
  { id: "tarjeta", slug: "confirmar-tarjeta", group: "setup" },
  { id: "seguridad", slug: "recomendaciones-de-seguridad", group: "setup" },
  { id: "perfiles", slug: "crear-perfiles-de-linea", group: "setup" },
  { id: "backup", slug: "backup", group: "setup" },
  { id: "importar", slug: "importar-onus", group: "setup" },
  { id: "autorizar", slug: "autorizar-onu", group: "onu" },
  { id: "preautorizar", slug: "pre-autorizar-onu", group: "onu" },
  { id: "eliminar", slug: "eliminar-onu", group: "onu" },
  { id: "reiniciar", slug: "reiniciar-onu", group: "onu" },
  { id: "plan", slug: "cambiar-plan-de-velocidad", group: "onu" },
  { id: "detalles", slug: "ver-detalles-de-onu", group: "onu" },
  { id: "activar", slug: "habilitar-deshabilitar-onu", group: "onu" },
  { id: "editar", slug: "editar-onu", group: "onu" },
  { id: "puerto", slug: "cambiar-onu-de-puerto", group: "onu" },
  { id: "slot", slug: "cambiar-onu-de-slot", group: "onu" },
  { id: "verConfig", slug: "ver-configuracion-de-onu", group: "onu" },
  { id: "herramientas", slug: "herramientas-en-detalles-de-onu", group: "onu" },
  { id: "autorizadas", slug: "lista-de-onus-autorizadas", group: "onu" },
  { id: "noAutorizadas", slug: "lista-de-onus-no-autorizadas", group: "onu" },
  { id: "migrar", slug: "migrar-onu-a-otra-olt", group: "onu" },
  { id: "porSn", slug: "editar-onu-por-numero-de-serie", group: "onu" },
  { id: "catv", slug: "habilitar-deshabilitar-puerto-catv", group: "onu" },
  { id: "otraMarca", slug: "migrar-onu-a-olt-de-otra-marca", group: "onu" },
  { id: "reiniciarPon", slug: "reiniciar-puerto-pon", group: "onu" },
  { id: "wifi", slug: "wifi-remoto-en-onus", group: "onu" },
  { id: "instalar", slug: "instalacion-de-onu", group: "install" },
  { id: "pasos", slug: "pasos-para-instalar-un-cliente", group: "install" },
  { id: "estatica", slug: "wan-ip-estatica", group: "install" },
  { id: "estaticaPuente", slug: "wan-ip-estatica-modo-bridge", group: "install" },
  { id: "pppoe", slug: "wan-pppoe", group: "install" },
  { id: "dhcp", slug: "configuracion-wan-ip", group: "install" },
  { id: "xml", slug: "configuracion-wan-ip-xml", group: "install" },
  { id: "gestion", slug: "configuracion-avanzada-onu", group: "install" },
  { id: "eth", slug: "configurar-puertos-eth", group: "install" },
  { id: "planesPrioridad", slug: "planes-line-profile-priority", group: "install" },
  { id: "planesVlan", slug: "planes-line-profile-vlan", group: "install" },
  { id: "iptv", slug: "triple-play-iptv", group: "install" },
  { id: "catvTriple", slug: "triple-play-catv", group: "install" },
  { id: "ipv6", slug: "wan-ipv6", group: "install" },
] as const satisfies readonly { id: string; slug: string; group: GroupId }[]

export type CatalogEntry = (typeof CATALOG)[number]
export const DAVOROLT_SLUGS: readonly string[] = CATALOG.map((c) => c.slug)
export const entryBySlug = (slug: string) => CATALOG.find((c) => c.slug === slug)
