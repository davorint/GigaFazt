/**
 * New records nobody filled in. "Agregar…" saves a blank record right away (so it opens like any other); if the person
 * leaves it without typing anything, it would stay in the list, and in every phone after syncing, as "Sin nombre".
 * The add buttons remember the record as it was created; when its editor closes, a record still identical to that
 * (edit times aside) is removed.
 */
const fresh = new Map<string, string>()

const sig = (r: object) => JSON.stringify(r, (k, v) => (k === "updatedAt" || k === "createdAt" ? undefined : v))

/** Called right after saving a new blank record. */
export const markFresh = (r: { id: string }) => fresh.set(r.id, sig(r))

/** Removes the remembered new records that are still untouched (`except`: the one still open). */
export function dropUntouched<T extends { id: string }>(list: T[], remove: (id: string) => void, except?: string | null) {
  for (const [id, s] of [...fresh]) {
    if (id === except) continue
    fresh.delete(id)
    const r = list.find((x) => x.id === id)
    if (r && sig(r) === s) remove(id)
  }
}
