"use client"

import { InlineField } from "@/components/interno/InlineField"
import { clientLabel, type Client } from "@/lib/clients/model"
import { newSiteContact, type Site, type SiteContact } from "@/lib/sites/model"
import { ConfirmRemove } from "./ConfirmRemove"
import { SheetBlock } from "./SheetBlock"
import { ADD, ITEM, NOTE, type T, type Up } from "./sheet-ui"

/** The building's administration and other contacts, the access rules, hours and keys. */
export function AccessBlock({ t, s, up, clients }: { t: T; s: Site; up: Up; clients: Client[] }) {
  const admins = clients.filter((c) => c.kind === "administracion")
  const admin = clients.find((c) => c.id === s.adminClientId)
  const setC = (id: string, p: Partial<SiteContact>) => up({ contacts: s.contacts.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const adminContact = admin ? [admin.contacts[0]?.name, admin.phone || admin.contacts[0]?.phone, admin.email].filter(Boolean).join(" · ") : ""
  return (
    <SheetBlock id="acceso" title={t("nav.acceso")}>
      <div className="grid gap-0.5">
        <InlineField
          kind="pick"
          anchor="access.contact"
          label={t("access.admin")}
          value={s.adminClientId}
          hint={t("access.adminHint")}
          options={[{ value: "", label: t("access.adminNone") }, ...(s.adminClientId && !admin ? [{ value: s.adminClientId, label: s.adminClientId.slice(0, 8) }] : []), ...admins.map((c) => ({ value: c.id, label: clientLabel(c) }))]}
          onSave={(adminClientId) => up({ adminClientId })}
        />
        {!admins.length && <p className="px-2 text-xs text-amber-200">{t("access.adminMissing")}</p>}
        {adminContact && <p className={NOTE}>{t("access.adminContact", { contact: adminContact })}</p>}
      </div>
      <div className="grid grid-cols-2 gap-x-2">
        <InlineField kind="text" anchor="access.hours" label={t("access.hours")} value={s.accessHours} onSave={(accessHours) => up({ accessHours })} max={200} />
        <InlineField kind="area" label={t("access.keys")} value={s.keys} onSave={(keys) => up({ keys })} hint={t("access.keysHint")} max={1000} />
      </div>
      <InlineField kind="area" label={t("access.rules")} value={s.accessRules} onSave={(accessRules) => up({ accessRules })} hint={t("access.rulesHint")} />
      <div className="grid gap-2">
        <p className="px-2 text-sm font-medium text-zinc-100">{t("access.contacts")}</p>
        {!s.contacts.length && <p className={NOTE}>{t("access.contactsHint")}</p>}
        {s.contacts.map((k, i) => (
          <div key={k.id} role="group" aria-label={k.name || `${t("access.contacts")} ${i + 1}`} className={ITEM}>
            <div className="grid grid-cols-2 gap-x-2">
              <InlineField kind="text" label={t("access.contactName")} value={k.name} onSave={(name) => setC(k.id, { name })} max={200} />
              <InlineField kind="text" label={t("access.contactRole")} value={k.role} onSave={(role) => setC(k.id, { role })} max={80} />
              <InlineField kind="text" type="tel" label={t("access.contactPhone")} value={k.phone} onSave={(phone) => setC(k.id, { phone })} max={40} />
              <InlineField kind="text" type="email" label={t("access.contactEmail")} value={k.email} onSave={(email) => setC(k.id, { email })} max={200} />
            </div>
            <div className="flex flex-wrap items-center gap-3 px-2 pb-1">
              {k.phone && (
                <a href={`tel:${k.phone.replace(/[^\d+]/g, "")}`} className="text-xs text-zinc-300 underline decoration-white/30 underline-offset-4 hover:text-foreground">
                  {t("sheet.call")}
                </a>
              )}
              <ConfirmRemove label={t("access.removeContact")} question={t("sheet.confirm", { name: k.name || t("access.contacts") })} onRemove={() => up({ contacts: s.contacts.filter((x) => x.id !== k.id) })} />
            </div>
          </div>
        ))}
        <div>
          <button type="button" onClick={() => up({ contacts: [...s.contacts, newSiteContact()] })} className={ADD}>
            + {t("access.addContact")}
          </button>
        </div>
      </div>
    </SheetBlock>
  )
}
