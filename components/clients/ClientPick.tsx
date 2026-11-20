"use client"

import { clientPlace } from "@/lib/clients/place"
import { sitesSnapshot } from "@/lib/sites/store"
import { useState, useSyncExternalStore } from "react"
import { TextField } from "@/components/mikrotik/TextField"
import { PickField } from "@/components/surveys/SurveyFields"
import { clientLabel, type Client } from "@/lib/clients/model"
import { clientsServerSnapshot, clientsSnapshot, subscribeClients } from "@/lib/clients/store"

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()

/** A client's name with where they live (their deployment, tower and apartment), for lists. */
export const clientLine = (c: Client) => [clientLabel(c), clientPlace(c, typeof window === "undefined" ? [] : sitesSnapshot().list)].filter(Boolean).join(" · ")

/** Picks a client by typing part of the name, apartment, phone or PPPoE user (a location's clients first). */
export function ClientPick({
  label,
  searchLabel,
  searchHint,
  noneLabel,
  value,
  onChange,
  siteId = "",
}: {
  label: string
  searchLabel: string
  searchHint: string
  noneLabel: string
  value: string
  onChange: (id: string) => void
  siteId?: string
}) {
  const clients = useSyncExternalStore(subscribeClients, clientsSnapshot, clientsServerSnapshot).list
  const [q, setQ] = useState("")
  const chosen = clients.find((c) => c.id === value)
  const needle = fold(q.trim())
  const digits = q.replace(/\D/g, "")
  const found = clients
    .filter((c) => !needle || fold([c.name, c.building, c.tower, c.apartment, c.phone, c.whatsapp, ...c.services.map((s) => s.pppoeUser)].join(" ")).includes(needle) || (digits.length >= 4 && [c.phone, c.whatsapp].some((p) => p.replace(/\D/g, "").includes(digits))))
    .sort((a, b) => Number(b.siteId === siteId && !!siteId) - Number(a.siteId === siteId && !!siteId) || clientLabel(a).localeCompare(clientLabel(b), "es"))
    .slice(0, 60)
  return (
    <div className="grid gap-2">
      <TextField label={searchLabel} value={q} onChange={setQ} hint={searchHint} />
      <PickField label={label} value={value} onChange={onChange} options={[{ value: "", label: noneLabel }, ...(chosen && !found.includes(chosen) ? [chosen] : []).concat(found).map((c) => ({ value: c.id, label: clientLine(c) }))]} />
    </div>
  )
}
