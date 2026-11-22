"use client"

import type { ReactNode } from "react"
import { useId } from "react"

/**
 * A Tablero card: title, one-line takeaway, the chart, and "Ver tabla" with the same numbers (the text equivalent of the
 * chart, WCAG). `empty` replaces the chart with a quiet note when there's nothing to draw yet.
 */
export function Panel({
  title,
  takeaway,
  children,
  table,
  tableLabel,
  empty,
  className = "",
}: {
  title: string
  takeaway?: string
  children: ReactNode
  table?: { head: string[]; rows: (string | number)[][] }
  tableLabel: string
  empty?: string | null
  className?: string
}) {
  const id = useId()
  return (
    <section aria-labelledby={`${id}-t`} className={`grid content-start gap-2 rounded-2xl border border-white/10 bg-[#0e0e10] p-4 ${className}`}>
      <h3 id={`${id}-t`} className="text-sm font-medium text-zinc-100">
        {title}
      </h3>
      {takeaway && <p className="text-xs text-zinc-400">{takeaway}</p>}
      {empty ? <p className="grid min-h-24 place-items-center rounded-xl border border-dashed border-white/10 px-3 text-center text-xs text-zinc-400">{empty}</p> : children}
      {table && !empty && table.rows.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-zinc-400 hover:text-zinc-200">{tableLabel}</summary>
          <div tabIndex={0} role="region" aria-label={title} className="mt-2 max-h-64 overflow-auto rounded-lg border border-white/10">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10 text-zinc-400">
                  {table.head.map((h) => (
                    <th key={h} scope="col" className="px-2 py-1.5 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, i) => (
                  <tr key={i} className="border-b border-white/5">
                    {r.map((c, j) => (
                      <td key={j} className={`px-2 py-1.5 ${j ? "text-right font-mono tabular-nums text-zinc-200" : "text-zinc-300"}`}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  )
}
