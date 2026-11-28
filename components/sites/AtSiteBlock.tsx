"use client"

import { useSyncExternalStore } from "react"
import { RecordHistory } from "@/components/interno/RecordHistory"
import { clientsSnapshot } from "@/lib/clients/store"
import { catalogSnapshot } from "@/lib/materials/store"
import { notesStore } from "@/lib/notes/store"
import { siteLabel, type Site } from "@/lib/sites/model"
import { deleteSite } from "@/lib/sites/store"
import { placesStockItems, sitePlace } from "@/lib/stock/model"
import { movesStore, unitsStore } from "@/lib/stock/store"
import { toolLabel } from "@/lib/tools/model"
import { subscribeTools, toolsServerSnapshot, toolsSnapshot } from "@/lib/tools/store"
import { ConfirmRemove } from "./ConfirmRemove"
import { SheetBlock } from "./SheetBlock"
import { NOTE, type T } from "./sheet-ui"

const NOTES = "/interno/admin/notas"

/** What is at the location now (tools left here, open notes), its change history, and deleting it. */
export function AtSiteBlock({ t, s, onDeleted }: { t: T; s: Site; onDeleted: () => void }) {
  const tools = useSyncExternalStore(subscribeTools, toolsSnapshot, toolsServerSnapshot).list.filter((x) => x.holderKind === "despliegue" && x.siteId === s.id && x.quantity > 0)
  const notes = useSyncExternalStore(notesStore.subscribe, notesStore.snapshot, notesStore.serverSnapshot).list.filter((n) => n.linkKind === "site" && n.linkId === s.id && !n.doneAt)
  // What still points to this location, said in the question so nothing is left behind by surprise.
  const place = sitePlace(s.id)
  const items = new Map(catalogSnapshot().items.map((x) => [x.id, x]))
  const stock = placesStockItems(movesStore.list(), unitsStore.list(), place, items).length
  const nClients = clientsSnapshot().list.filter((c) => c.siteId === s.id).length
  const left = [nClients && t("general.leftClients", { n: nClients }), tools.length && t("general.leftTools", { n: tools.length }), stock && t("general.leftStock", { n: stock })].filter(Boolean)
  return (
    <SheetBlock id="sitio" title={t("nav.sitio")} className="md:col-span-2">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-1">
          <h3 className="px-2 text-xs font-medium text-zinc-300">{t("general.tools", { n: tools.length })}</h3>
          {!tools.length && <p className={NOTE}>{t("general.noTools")}</p>}
          <ul className="grid gap-1 px-2">
            {tools.map((x) => (
              <li key={x.id}>
                <a href={`/interno/herramientas/en-existencia?h=${x.id}`} className="text-sm text-zinc-200 underline-offset-4 hover:underline">
                  {toolLabel(x)}
                  {x.quantity > 1 ? ` × ${x.quantity}` : ""}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div className="grid content-start gap-1">
          <h3 className="px-2 text-xs font-medium text-zinc-300">{t("general.siteNotes", { n: notes.length })}</h3>
          {!notes.length && <p className={NOTE}>{t("general.noSiteNotes")}</p>}
          <ul className="grid gap-1 px-2">
            {notes.map((n) => (
              <li key={n.id} className="text-sm text-zinc-200">
                {n.title || n.body.slice(0, 80)}
              </li>
            ))}
          </ul>
          <a href={NOTES} className="px-2 font-mono text-xs text-zinc-400 hover:text-zinc-100">
            {t("general.toNotes")} →
          </a>
        </div>
      </div>
      <RecordHistory kind="sites" id={s.id} />
      <ConfirmRemove
        label={t("general.remove")}
        question={t("general.confirmRemove", { name: siteLabel(s) })}
        detail={left.length ? `${t("general.leftTitle")} ${left.join(", ")}. ${t("general.leftHint")}` : undefined}
        onRemove={() => {
          deleteSite(s.id)
          onDeleted()
        }}
      />
    </SheetBlock>
  )
}
