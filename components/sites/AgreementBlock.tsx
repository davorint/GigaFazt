"use client"

import { InlineField } from "@/components/interno/InlineField"
import { localToday } from "@/lib/clients/from-lead"
import { mxn } from "@/lib/materials/catalog"
import { agreementStatus, DEFAULT_NOTICE_DAYS, POWER_PAYERS, RENEWALS, siteCost, type Site } from "@/lib/sites/model"
import { SheetBlock } from "./SheetBlock"
import type { T, Up } from "./sheet-ui"

/** The agreement with the building: rent, power, dates, renewal, notice, increase; where it stands today. */
export function AgreementBlock({ t, s, up }: { t: T; s: Site; up: Up }) {
  const a = agreementStatus(s, localToday())
  const money = (v: number | null) => (v !== null ? mxn(v) : undefined)
  return (
    <SheetBlock id="acuerdo" title={t("nav.acuerdo")} aside={t("agreement.cost", { cost: mxn(siteCost(s)) })}>
      {a.status === "renovado" && <p className="px-2 text-sm text-zinc-300">{t("agreement.rolled", { date: a.end })}</p>}
      {a.status === "por-vencer" && <p className="rounded-md bg-amber-300/10 px-2 py-1 text-sm text-amber-100">{t("agreement.ends", { days: a.daysLeft ?? 0, date: a.end })}</p>}
      {a.status === "vencido" && <p className="rounded-md bg-red-400/10 px-2 py-1 text-sm text-red-200">{t("agreement.ended", { date: a.end })}</p>}
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
        <InlineField kind="number" anchor="agreement.rent" label={t("agreement.rent")} unit={t("agreement.perMonth")} max={1e7} value={s.rentMonthly} display={money(s.rentMonthly)} onSave={(rentMonthly) => up({ rentMonthly })} />
        <InlineField kind="pick" anchor="agreement.powerPayer" label={t("agreement.powerPayer")} value={s.powerPayer} options={POWER_PAYERS.map((p) => ({ value: p, label: t(`agreement.payers.${p}`) }))} onSave={(v) => up({ powerPayer: v as Site["powerPayer"] })} />
        <InlineField kind="number" label={t("agreement.power")} unit={t("agreement.perMonth")} max={1e7} value={s.powerMonthly} display={money(s.powerMonthly)} onSave={(powerMonthly) => up({ powerMonthly })} />
        <InlineField kind="number" label={t("agreement.increase")} unit="%" max={100} value={s.rentIncreasePct} onSave={(rentIncreasePct) => up({ rentIncreasePct })} hint={t("agreement.increaseHint")} />
        <InlineField kind="date" anchor="agreement.start" label={t("agreement.start")} value={s.contractStart} onSave={(contractStart) => up({ contractStart })} />
        <InlineField kind="date" anchor="agreement.end" label={t("agreement.end")} value={s.contractEnd} onSave={(contractEnd) => up({ contractEnd })} />
        <InlineField kind="pick" label={t("agreement.renewal")} value={s.renewal} options={RENEWALS.map((x) => ({ value: x, label: t(`agreement.renewals.${x || "none"}`) }))} onSave={(v) => up({ renewal: v as Site["renewal"] })} />
        <InlineField kind="number" label={t("agreement.notice")} unit={t("agreement.days")} integer max={730} value={s.noticeDays} onSave={(noticeDays) => up({ noticeDays })} hint={t("agreement.noticeHint", { n: DEFAULT_NOTICE_DAYS })} />
      </div>
      <InlineField kind="area" label={t("agreement.notes")} value={s.agreementNotes} onSave={(agreementNotes) => up({ agreementNotes })} hint={t("agreement.notesHint")} />
    </SheetBlock>
  )
}
