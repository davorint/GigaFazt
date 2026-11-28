"use client"

import type { MouseEvent } from "react"
import type { Client } from "@/lib/clients/model"
import { SHEET_SECTIONS, type Site } from "@/lib/sites/model"
import { siteStats } from "@/lib/sites/stats"
import { saveSite, sitesSnapshot } from "@/lib/sites/store"
import type { Survey } from "@/lib/survey/model"
import { AccessBlock } from "./AccessBlock"
import { AgreementBlock } from "./AgreementBlock"
import { AtSiteBlock } from "./AtSiteBlock"
import { GeneralBlock } from "./GeneralBlock"
import { RoomsBlock } from "./RoomsBlock"
import { SheetHeader } from "./SheetHeader"
import { SiteClientsBlock } from "./SiteClientsBlock"
import { SurveyLinkBlock } from "./SurveyLinkBlock"
import { TowersBlock } from "./TowersBlock"
import type { T } from "./sheet-ui"

/**
 * A deployment on one screen (owner, 2026-11-28: "all the information in one screen, editing individual fields; I
 * gather the data field by field and not in order"). Every value edits in place and saves on its own; blocks in
 * page order, two columns from tablets up for the shorter ones.
 */
export function SiteSheet({ t, s, sites, clients, surveys, onBack }: { t: T; s: Site; sites: Site[]; clients: Client[]; surveys: Survey[]; onBack: (e?: MouseEvent<HTMLAnchorElement>) => void }) {
  // Each field saves the deployment as it is now in the store, so two quick edits never undo each other.
  const up = (p: Partial<Site>) => saveSite({ ...(sitesSnapshot().list.find((x) => x.id === s.id) ?? s), ...p })
  const stats = siteStats(s, clients)
  return (
    <div className="mt-6 grid gap-4">
      <SheetHeader t={t} s={s} sections={[...SHEET_SECTIONS]} onBack={onBack} />
      <h2 className="sr-only">{s.name}</h2>
      <GeneralBlock t={t} s={s} up={up} stats={stats} />
      <TowersBlock t={t} s={s} up={up} stats={stats} />
      <RoomsBlock t={t} s={s} up={up} clients={clients} />
      <div className="grid items-start gap-4 md:grid-cols-2">
        <AgreementBlock t={t} s={s} up={up} />
        <AccessBlock t={t} s={s} up={up} clients={clients} />
        <SiteClientsBlock t={t} s={s} clients={clients} />
        <SurveyLinkBlock t={t} s={s} surveys={surveys} sites={sites} />
        <AtSiteBlock t={t} s={s} onDeleted={() => onBack()} />
      </div>
    </div>
  )
}
