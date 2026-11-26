"use client"

import type { Access } from "./roles"

/** GET /api/interno/yo's answer: who this session is and what it reaches (status 401 = no longer signed in). */
export type Me = { status: number; member: { id: string; name: string; admin: boolean; role: string } | null; access?: Access }

let request: Promise<Me> | null = null

/**
 * One /api/interno/yo request per page load, shared by the session guard and the sync bar (each used to ask on its
 * own, and the sync bar again on every page opened: one more function call each time). A failed request isn't kept,
 * so the next caller asks again.
 */
export function fetchMe(): Promise<Me> {
  request ??= fetch("/api/interno/yo", { cache: "no-store" })
    .then(async (r) => ({ status: r.status, member: null, ...(r.ok ? ((await r.json().catch(() => ({}))) as Partial<Me>) : {}) }))
    .catch(() => {
      request = null
      return { status: 0, member: null }
    })
  return request
}
