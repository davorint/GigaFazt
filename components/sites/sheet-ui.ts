import type { useTranslations } from "next-intl"
import type { Site } from "@/lib/sites/model"

/** Shared by the deployment sheet's blocks (components/sites/*Block.tsx). */
export type T = ReturnType<typeof useTranslations>
export type Up = (p: Partial<Site>) => void

/** Fields in a row: two even on phones (short values), more on wide screens; long text spans the row (col-span-full). */
export const FIELDS = "grid grid-cols-2 gap-x-2 gap-y-0.5 lg:grid-cols-3"
export const FIELDS_WIDE = "grid grid-cols-2 gap-x-2 gap-y-0.5 sm:grid-cols-3 lg:grid-cols-4"
/** One item of a list (tower, equipment, carrier…). */
export const ITEM = "grid gap-1 rounded-lg border border-white/10 bg-white/[0.015] p-2"
export const ADD = "inline-flex min-h-9 w-fit items-center rounded-full border border-dashed border-white/20 px-3 text-xs text-zinc-200 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
export const SMALL = "inline-flex min-h-9 w-fit items-center rounded-full border border-white/15 px-3 text-xs text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
export const NOTE = "px-2 font-mono text-xs text-zinc-400"
