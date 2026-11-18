"use client"

import { useEffect } from "react"
import { dropUntouched } from "@/lib/fresh"

/**
 * Removes new records left blank (lib/fresh.ts) when the open record changes (back to the list, another one opened)
 * and when the page is left.
 */
export function useDropUntouched<T extends { id: string }>(openId: string | null | undefined, list: () => T[], remove: (id: string) => void) {
  useEffect(() => {
    dropUntouched(list(), remove, openId)
    const leave = () => dropUntouched(list(), remove)
    window.addEventListener("pagehide", leave)
    return () => window.removeEventListener("pagehide", leave)
  }, [openId, list, remove])
}
