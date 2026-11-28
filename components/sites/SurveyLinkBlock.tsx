"use client"

import { InlineField } from "@/components/interno/InlineField"
import type { Survey } from "@/lib/survey/model"
import { saveSurvey } from "@/lib/survey/store"
import type { Site } from "@/lib/sites/model"
import { ConfirmRemove } from "./ConfirmRemove"
import { SheetBlock } from "./SheetBlock"
import { NOTE, SMALL, type T } from "./sheet-ui"

const SURVEYS = "/interno/levantamientos"

/**
 * The survey this deployment came from, or (owner, 2026-11-28) one linked later: any survey not yet tied to a
 * deployment that still exists. Linking copies nothing; it ties the two (Survey.siteId), so the survey's pages and
 * proposal open from here.
 */
export function SurveyLinkBlock({ t, s, surveys, sites }: { t: T; s: Site; surveys: Survey[]; sites: Site[] }) {
  const linked = surveys.find((x) => x.siteId === s.id)
  const free = surveys.filter((x) => !x.siteId || !sites.some((y) => y.id === x.siteId))
  return (
    <SheetBlock id="levantamiento" title={t("nav.levantamiento")}>
      {linked ? (
        <>
          <p className="px-2 text-sm text-zinc-300">{t("survey.linked", { date: linked.ident.visitDate || "—", who: linked.ident.surveyors || "—" })}</p>
          <div className="flex flex-wrap gap-2 px-2">
            <a href={`${SURVEYS}?l=${linked.id}`} className={SMALL}>
              {t("survey.open")}
            </a>
            <a href={`${SURVEYS}/propuesta?l=${linked.id}`} className={SMALL}>
              {t("survey.proposal")}
            </a>
          </div>
          <p className={NOTE}>{t("survey.linkedHint")}</p>
          <div className="px-2">
            <ConfirmRemove label={t("sheet.unlink")} question={t("sheet.unlinkConfirm", { name: linked.ident.name || t("list.untitled") })} onRemove={() => saveSurvey({ ...linked, siteId: "" })} />
          </div>
        </>
      ) : (
        <>
          <p className={NOTE}>{t("survey.noneLinked")}</p>
          {free.length ? (
            <InlineField
              kind="pick"
              label={t("sheet.linkSurvey")}
              hint={t("sheet.linkSurveyHint")}
              value=""
              options={[{ value: "", label: "—" }, ...free.map((x) => ({ value: x.id, label: [x.ident.name || t("list.untitled"), x.ident.visitDate].filter(Boolean).join(" · ") }))]}
              onSave={(id) => {
                const sv = free.find((x) => x.id === id)
                if (sv) saveSurvey({ ...sv, siteId: s.id })
              }}
            />
          ) : (
            <p className={NOTE}>{t("sheet.linkNone")}</p>
          )}
        </>
      )}
    </SheetBlock>
  )
}
