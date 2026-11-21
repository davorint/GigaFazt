"use client"

import { useSyncExternalStore } from "react"
import { DEFAULT_SETTINGS, decodeSettings, type OltSettings } from "@/lib/davorolt/settings"

/** The OLT's data for DavorOLT, kept in this browser only (owner: "just forms", nothing in the database). */
const KEY = "gigafazt-davorolt"
/** fresh: nothing saved yet in this browser (the settings open so they get filled first). */
type State = { settings: OltSettings; persisted: boolean; fresh: boolean }
const SERVER: State = { settings: DEFAULT_SETTINGS, persisted: true, fresh: true }
let current: State | null = null
const listeners = new Set<() => void>()

function load(): State {
  try {
    const raw = window.localStorage.getItem(KEY)
    return { settings: raw ? decodeSettings(JSON.parse(raw)) : DEFAULT_SETTINGS, persisted: true, fresh: !raw }
  } catch {
    return { settings: current?.settings ?? DEFAULT_SETTINGS, persisted: false, fresh: current?.fresh ?? true }
  }
}

export function saveOltSettings(s: OltSettings) {
  let persisted = true
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    persisted = false
  }
  current = { settings: s, persisted, fresh: current?.fresh ?? false }
  listeners.forEach((l) => l())
}

const subscribe = (cb: () => void) => {
  listeners.add(cb)
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      current = load()
      cb()
    }
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(cb)
    window.removeEventListener("storage", onStorage)
  }
}

export function useOltSettings(): State & { loaded: boolean } {
  const s = useSyncExternalStore(subscribe, () => (current ??= load()), () => SERVER)
  return { ...s, loaded: s !== SERVER }
}
