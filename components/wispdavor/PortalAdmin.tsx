"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { CopyButton } from "@/components/mikrotik/CopyButton"
import { TextField } from "@/components/mikrotik/TextField"
import { DANGER, SMALL } from "@/components/finance/FinParts"
import { clientLabel } from "@/lib/clients/model"
import { whatsappHref } from "@/lib/contact"
import { readState } from "@/lib/sync/state"
import { waNumber } from "@/lib/wispdavor/whatsapp"
import { useWispData } from "./useWispData"

type Link = { id: string; clientId: string; token: string; createdAt: string; revokedAt: string; lastSeenAt: string; seenCount: number }

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
export const portalUrl = (token: string) => `${window.location.origin}/mi-cuenta#${token}`

/** /interno/software/wispdavor/portal: each client's private link to their portal (create, copy, send, revoke). */
export function PortalAdmin() {
  const t = useTranslations("wispdavor.portal")
  const d = useWispData()
  const [links, setLinks] = useState<Link[] | null>(null)
  const [q, setQ] = useState("")
  const [error, setError] = useState(false)
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/interno/portal", { cache: "no-store" })
      const b = (await r.json()) as { links?: Link[] }
      if (!r.ok || !b.links) throw new Error(String(r.status))
      setLinks(b.links)
      setError(false)
    } catch {
      setError(true)
    }
  }, [])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the links once from the server when the page opens
    void load()
  }, [load])
  if (!d.loaded) return null
  const active = (clientId: string) => links?.find((l) => l.clientId === clientId && !l.revokedAt)
  const call = async (method: "POST" | "DELETE", clientId: string) => {
    try {
      const r = await fetch(method === "POST" ? "/api/interno/portal" : `/api/interno/portal?cliente=${encodeURIComponent(clientId)}`, {
        method,
        headers: { "content-type": "application/json", "x-interno-nombre": encodeURIComponent(readState().name) },
        body: method === "POST" ? JSON.stringify({ clientId }) : undefined,
      })
      if (!r.ok) throw new Error(String(r.status))
      await load()
    } catch {
      setError(true)
    }
  }
  const shown = d.clients
    .filter((c) => c.services.some((s) => s.status !== "cancelado"))
    .filter((c) => !q.trim() || fold([c.name, c.phone, c.whatsapp, c.building, c.apartment, ...c.services.map((s) => s.pppoeUser)].join(" ")).includes(fold(q.trim())))
    .sort((a, b) => clientLabel(a).localeCompare(clientLabel(b), "es"))
    .slice(0, 200)
  return (
    <div className="mt-6 grid gap-6">
      <p className="text-sm text-zinc-300">{t("lead")}</p>
      {(error || links === null) && <p className="text-xs text-amber-200">{error ? t("error") : t("needsOnline")}</p>}
      <div className="max-w-md">
        <TextField label={t("search")} value={q} onChange={setQ} />
      </div>
      {!shown.length && <p className="text-sm text-zinc-400">{t("none")}</p>}
      <ul className="grid gap-2">
        {shown.map((c) => {
          const l = active(c.id)
          const name = clientLabel(c)
          const phone = waNumber(c.whatsapp || c.phone)
          return (
            <li key={c.id} className="grid gap-2 rounded-xl border border-white/10 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm text-zinc-100">{name}</span>
                <span className="font-mono text-xs text-zinc-400">{l ? t("seen", { n: l.seenCount }) : t("noLink")}</span>
              </div>
              {links !== null && (
                <div className="flex flex-wrap gap-2">
                  {l ? (
                    <>
                      <CopyButton getText={() => portalUrl(l.token)} label={t("copy")} done={t("copied")} />
                      {phone && (
                        <a href={whatsappHref(phone, t("sendText", { name: c.name.trim().split(/\s+/)[0] ?? "", url: portalUrl(l.token) }))} target="_blank" rel="noopener noreferrer" className={SMALL}>
                          {t("send")}
                        </a>
                      )}
                      <button type="button" onClick={() => window.confirm(t("confirmRecreate", { name })) && call("POST", c.id)} className={SMALL}>
                        {t("recreate")}
                      </button>
                      <button type="button" onClick={() => window.confirm(t("confirmRevoke", { name })) && call("DELETE", c.id)} className={DANGER}>
                        {t("revoke")}
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => call("POST", c.id)} className={SMALL}>
                      {t("create")}
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
