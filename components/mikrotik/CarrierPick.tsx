"use client"

import { useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import { isKind, providerName } from "@/lib/providers/model"
import { providersServerSnapshot, providersSnapshot, subscribeProviders } from "@/lib/providers/store"
import { SelectField } from "./SelectField"

/** The carrier of a link, picked from /interno/admin/proveedores (carriers only). */
export function CarrierPick({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const t = useTranslations("mikrotik.carrierPick")
  const store = useSyncExternalStore(subscribeProviders, providersSnapshot, providersServerSnapshot)
  const carriers = store.list.filter((p) => isKind(p, "carrier"))
  // A saved id whose provider isn't in this browser: kept, shown as unknown.
  const unknown = value && !carriers.some((p) => p.id === value)
  return (
    <SelectField label={t("label")} value={value} onChange={onChange} hint={t("hint")}>
      <option value="">{t("none")}</option>
      {unknown && <option value={value}>{value.slice(0, 8)}…</option>}
      {carriers.map((p) => (
        <option key={p.id} value={p.id}>
          {providerName(p) || p.id.slice(0, 8)}
        </option>
      ))}
    </SelectField>
  )
}
