"use client"

import { useCallback, useSyncExternalStore } from "react"
import { RULES } from "@/lib/mikrotik/burst"
import type { AsterDeployment } from "@/lib/asternos/config"

/**
 * The AsterNOS deployment being prepared, kept on this phone (localStorage) and shared by the Guía and Scripts pages.
 * It holds no secrets: passwords are typed into the generated text only.
 */
const KEY = "gigafazt-asternos"

export const DEFAULT_DEPLOYMENT: AsterDeployment = {
  hostname: "gigafazt",
  adminUser: "noc",
  mgmtPort: 8,
  mgmtAddress: "",
  mgmtGateway: "",
  ntp: "pool.ntp.org",
  dns: "1.1.1.1",
  oltPorts: [1],
  plans: [
    { name: "200M", mbps: 200, vlan: 200, pool: "100.64.1.0/24" },
    { name: "500M", mbps: 500, vlan: 500, pool: "100.64.2.0/24" },
    { name: "1G", mbps: 1000, vlan: 1000, pool: "100.64.3.0/24" },
  ],
  carriers: [{ name: "Carrier 1", port: 5, mode: "static", address: "", gateway: "", mbps: 1000 }],
  wanMode: "balance",
  probe: "1.1.1.1",
  design: "two-stage",
  rule: RULES.s20,
}

const listeners = new Set<() => void>()
let cache: { raw: string | null; value: AsterDeployment } | null = null

function read(): AsterDeployment {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(KEY)
  } catch {
    // Storage blocked: start from the defaults.
  }
  if (cache && cache.raw === raw) return cache.value
  let value = DEFAULT_DEPLOYMENT
  try {
    if (raw) value = { ...DEFAULT_DEPLOYMENT, ...(JSON.parse(raw) as Partial<AsterDeployment>) }
  } catch {
    value = DEFAULT_DEPLOYMENT
  }
  cache = { raw, value }
  return value
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  const onStorage = (e: StorageEvent) => e.key === KEY && cb()
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(cb)
    window.removeEventListener("storage", onStorage)
  }
}

export function useAsterDeployment(): [AsterDeployment, (p: Partial<AsterDeployment>) => void] {
  const d = useSyncExternalStore(subscribe, read, () => DEFAULT_DEPLOYMENT)
  const set = useCallback((p: Partial<AsterDeployment>) => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ ...read(), ...p }))
    } catch {
      // Not saved on this phone; the page still works for this visit.
    }
    listeners.forEach((l) => l())
  }, [])
  return [d, set]
}
