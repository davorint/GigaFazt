"use client"

import { useSyncExternalStore } from "react"

const subscribe = (cb: () => void) => {
  window.addEventListener("popstate", cb)
  return () => window.removeEventListener("popstate", cb)
}
const read = () => window.location.search

/**
 * The record open in a list (Clientes, Proveedores) kept in the URL (?<key>=<id>): opening adds a history step, so the
 * phone's back button closes it instead of leaving the page; closing it by tapping steps back the same way.
 */
export function useOpenParam(key: string): [string | null, (id: string | null) => void] {
  const search = useSyncExternalStore(subscribe, read, () => "")
  const open = new URLSearchParams(search).get(key)
  const set = (id: string | null) => {
    const state = window.history.state as { opened?: string } | null
    if (!id && state?.opened && state.opened === open) {
      window.history.back()
      return
    }
    const p = new URLSearchParams(window.location.search)
    if (id) p.set(key, id)
    else p.delete(key)
    const url = p.toString() ? `?${p}` : window.location.pathname
    if (id) window.history.pushState({ opened: id }, "", url)
    else window.history.replaceState(null, "", url)
    window.dispatchEvent(new PopStateEvent("popstate"))
  }
  return [open, set]
}
