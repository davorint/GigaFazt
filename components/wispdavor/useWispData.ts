"use client"

import { useSyncExternalStore } from "react"
import { clientsServerSnapshot, clientsSnapshot, subscribeClients } from "@/lib/clients/store"
import { paymentsStore } from "@/lib/payments/store"
import { sitesServerSnapshot, sitesSnapshot, subscribeSites } from "@/lib/sites/store"
import { subscribeSurveys, surveysServerSnapshot, surveysSnapshot } from "@/lib/survey/store"

/** What WispDavor reads: the same clients, payments, deployments and surveys as the rest of /interno (owner: "Hub over existing data"). */
export function useWispData() {
  const clients = useSyncExternalStore(subscribeClients, clientsSnapshot, clientsServerSnapshot)
  const payments = useSyncExternalStore(paymentsStore.subscribe, paymentsStore.snapshot, paymentsStore.serverSnapshot)
  const sites = useSyncExternalStore(subscribeSites, sitesSnapshot, sitesServerSnapshot)
  const surveys = useSyncExternalStore(subscribeSurveys, surveysSnapshot, surveysServerSnapshot)
  return { loaded: clients.loaded && payments.loaded && sites.loaded && surveys.loaded, clients: clients.list, payments: payments.list, sites: sites.list, surveys: surveys.list }
}
