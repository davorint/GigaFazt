"use client"

import { useTranslations } from "next-intl"
import { Switch } from "@/components/ui/switch"
import { ALERT_MODES, BACKUP_MODES, DNS_MODES, type AlertMode, type BackupMode, type DnsMode, type SetupState } from "@/lib/mikrotik/setup"
import { SelectField } from "./SelectField"
import { TextField } from "./TextField"

type Props = { setup: SetupState; onSetup: (patch: Partial<SetupState>) => void }

/** How the clients resolve names, where the router's alerts and backups go, SNMP. */
export function OpsFields({ setup: s, onSetup }: Props) {
  const t = useTranslations("mikrotik.config.ops")
  const mail = s.alert === "email" || s.backup === "email"
  return (
    <div className="grid min-w-0 gap-4">
      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField label={t("dnsMode")} value={s.dnsMode} onChange={(v) => DNS_MODES.includes(v as DnsMode) && onSetup({ dnsMode: v as DnsMode })} hint={t(`dnsModeHint.${s.dnsMode}`)}>
          {DNS_MODES.map((m) => (
            <option key={m} value={m}>
              {t(`dnsModes.${m}`)}
            </option>
          ))}
        </SelectField>
        <SelectField label={t("alert")} value={s.alert} onChange={(v) => ALERT_MODES.includes(v as AlertMode) && onSetup({ alert: v as AlertMode })} hint={t(`alertHint.${s.alert}`)}>
          {ALERT_MODES.map((m) => (
            <option key={m} value={m}>
              {t(`alerts.${m}`)}
            </option>
          ))}
        </SelectField>
        <SelectField label={t("backup")} value={s.backup} onChange={(v) => BACKUP_MODES.includes(v as BackupMode) && onSetup({ backup: v as BackupMode })} hint={t(`backupHint.${s.backup}`)}>
          {BACKUP_MODES.map((m) => (
            <option key={m} value={m}>
              {t(`backups.${m}`)}
            </option>
          ))}
        </SelectField>
      </div>
      {(s.alert === "telegram" || mail || s.backup === "sftp") && (
        <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {s.alert === "telegram" && <TextField label={t("telegramChat")} value={s.telegramChat} onChange={(v) => onSetup({ telegramChat: v.trim().slice(0, 24) })} hint={t("telegramChatHint")} />}
          {mail && (
            <>
              <TextField label={t("mailServer")} value={s.mailServer} onChange={(v) => onSetup({ mailServer: v.trim().slice(0, 64) })} hint={t("mailServerHint")} />
              <TextField label={t("mailFrom")} value={s.mailFrom} onChange={(v) => onSetup({ mailFrom: v.trim().slice(0, 64) })} />
              <TextField label={t("mailTo")} value={s.mailTo} onChange={(v) => onSetup({ mailTo: v.trim().slice(0, 64) })} />
            </>
          )}
          {s.backup === "sftp" && (
            <>
              <TextField label={t("backupHost")} value={s.backupHost} onChange={(v) => onSetup({ backupHost: v.trim().slice(0, 64) })} />
              <TextField label={t("backupUser")} value={s.backupUser} onChange={(v) => onSetup({ backupUser: v.trim().slice(0, 64) })} />
              <TextField label={t("backupPath")} value={s.backupPath} onChange={(v) => onSetup({ backupPath: v.trim().slice(0, 64) })} hint={t("backupPathHint")} />
            </>
          )}
        </div>
      )}
      <div className="grid gap-1.5">
        <label className="flex w-fit cursor-pointer items-center gap-3 text-sm text-zinc-200">
          <Switch checked={s.snmp} onCheckedChange={(snmp) => onSetup({ snmp })} />
          {t("snmp")}
        </label>
        <p className="max-w-3xl text-xs leading-snug text-zinc-400">{t("snmpHint")}</p>
      </div>
      <p className="max-w-3xl text-xs leading-snug text-zinc-400">{t("secrets")}</p>
    </div>
  )
}
