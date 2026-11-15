"use client"

import { AlertTriangle, CircleX, Info } from "lucide-react"
import { useTranslations } from "next-intl"

const ICON = { error: CircleX, warn: AlertTriangle, info: Info } as const
const TONE = { error: "text-red-300", warn: "text-amber-300", info: "text-zinc-400" } as const

export type IssueItem = { key: string; level: "error" | "warn" | "info"; text: string; context?: string }

/** Errors, warnings and notes, each with its level spelled out (not only by color). */
export function IssueList({ items }: { items: IssueItem[] }) {
  const t = useTranslations("mikrotik.issues.level")
  if (items.length === 0) return null
  return (
    <ul className="grid gap-2">
      {items.map((i) => {
        const Icon = ICON[i.level]
        return (
          <li key={i.key} className="flex gap-2.5 text-sm leading-snug text-zinc-200">
            <Icon aria-hidden className={`mt-0.5 size-4 shrink-0 ${TONE[i.level]}`} />
            <span>
              <span className={`font-medium ${TONE[i.level]}`}>{t(i.level)}</span>
              {i.context && <span className="text-zinc-400"> · {i.context}</span>}
              {": "}
              {i.text}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
