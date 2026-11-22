/**
 * The activity log on screen (phase 14): runs of the same person doing the same thing to the same kind of record within
 * GROUP_MINUTES are one row ("Carga desde la web created 80 materials"), so bulk work doesn't bury the rest. Pure.
 */
export type Entry = { at: string; who: string; kind: string; ref: string; what: string; label: string; detail: string }
export type Group = Entry & { n: number; labels: string[]; first: string }

export const GROUP_MINUTES = 10

/** Entries newest first → groups newest first; `at` is the newest of the group, `first` the oldest. */
export function groupEntries(entries: Entry[]): Group[] {
  const out: Group[] = []
  for (const e of entries) {
    const g = out[out.length - 1]
    // Actions and sends keep their own detail (router, template): only record changes group.
    const groupable = e.what !== "action" && e.what !== "send"
    if (g && groupable && g.who === e.who && g.kind === e.kind && g.what === e.what && Date.parse(g.first) - Date.parse(e.at) <= GROUP_MINUTES * 60000) {
      g.n++
      g.first = e.at
      if (!g.labels.includes(e.label)) g.labels.push(e.label)
      continue
    }
    out.push({ ...e, n: 1, labels: [e.label], first: e.at })
  }
  return out
}
