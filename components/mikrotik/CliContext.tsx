"use client"

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react"
import type { CliMode } from "@/lib/mikrotik/cli"

export type ScriptView = "script" | "cli"

type CliState = {
  view: ScriptView
  setView: (v: ScriptView) => void
  mode: CliMode
  setMode: (m: CliMode) => void
  /** The configured router's /export, kept in memory only (never stored). */
  exportText: string
  setExportText: (t: string) => void
  isDone: (id: string) => boolean
  setDone: (id: string, done: boolean) => void
  clearDone: () => void
  doneCount: number
}

const Ctx = createContext<CliState | null>(null)

const VIEW_KEY = "mk-cli-view"
const MODE_KEY = "mk-cli-mode"
const doneKey = (scope: string) => `mk-cli-done:${scope || "-"}`

/* localStorage as an external store: per-viewer conveniences, the page works without it. */
const listeners = new Set<() => void>()
function subscribe(cb: () => void) {
  listeners.add(cb)
  window.addEventListener("storage", cb)
  return () => {
    listeners.delete(cb)
    window.removeEventListener("storage", cb)
  }
}
function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}
function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Storage blocked: the choice lasts until the page closes (kept in memory below).
  }
  memory.set(key, value)
  listeners.forEach((l) => l())
}
const memory = new Map<string, string>()
function useStored(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => read(key) ?? memory.get(key) ?? null,
    () => null
  )
}

/**
 * The scripts page's "Script | Comandos CLI" choice, the router mode (new or configured) and the pieces marked done
 * for the open deployment (`scope`).
 */
export function CliProvider({ scope, children }: { scope: string; children: ReactNode }) {
  const rawView = useStored(VIEW_KEY)
  const rawMode = useStored(MODE_KEY)
  const rawDone = useStored(doneKey(scope))
  const [exportText, setExportText] = useState("")
  const view: ScriptView = rawView === "cli" ? "cli" : "script"
  const mode: CliMode = rawMode === "existing" ? "existing" : "new"
  const done = useMemo(() => {
    try {
      const raw = JSON.parse(rawDone ?? "[]") as unknown
      return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : []
    } catch {
      return []
    }
  }, [rawDone])

  const setView = useCallback((v: ScriptView) => write(VIEW_KEY, v), [])
  const setMode = useCallback((m: CliMode) => write(MODE_KEY, m), [])
  const setDone = useCallback(
    (id: string, on: boolean) => {
      const next = on ? [...new Set([...done, id])] : done.filter((x) => x !== id)
      write(doneKey(scope), JSON.stringify(next))
    },
    [done, scope]
  )
  const clearDone = useCallback(() => write(doneKey(scope), "[]"), [scope])

  const value = useMemo<CliState>(() => {
    const set = new Set(done)
    return { view, setView, mode, setMode, exportText, setExportText, isDone: (id) => set.has(id), setDone, clearDone, doneCount: done.length }
  }, [view, setView, mode, setMode, exportText, done, setDone, clearDone])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** The page's CLI choices; null outside the scripts page (then everything shows as scripts). */
export const useCli = () => useContext(Ctx)
