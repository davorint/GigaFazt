/**
 * The Técnico view's outbox (owner, 2026-11-21: photos and signatures without signal): a photo or a signature that can't
 * be uploaded right away waits here, in this phone's IndexedDB (it holds image files, which localStorage can't), and is
 * sent when there's signal again (TecnicoApp flushes it on load, when the phone comes back online, and on demand).
 * Browser only; every call fails soft (private mode or no IndexedDB → nothing is kept, the technician is told).
 */
import type { FieldFileKind, JobRef } from "./model"

export type Pending = { key?: number; ref: JobRef; kind: FieldFileKind; name: string; blob: Blob; signedBy: string; at: string }

const DB = "gigafazt-campo"
const STORE = "pendientes"

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no-idb"))
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "key", autoIncrement: true })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error("idb"))
  })
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const r = run(db.transaction(STORE, mode).objectStore(STORE))
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error ?? new Error("idb"))
    })
  } finally {
    db.close()
  }
}

/** Keeps a file to send later; false when this phone can't keep it. */
export async function enqueue(p: Omit<Pending, "key" | "at">): Promise<boolean> {
  try {
    await tx("readwrite", (s) => s.add({ ...p, at: new Date().toISOString() }))
    return true
  } catch {
    return false
  }
}

export async function pending(): Promise<Pending[]> {
  try {
    return await tx("readonly", (s) => s.getAll() as IDBRequest<Pending[]>)
  } catch {
    return []
  }
}

export async function drop(key: number): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(key))
  } catch {
    // Already gone, or the phone can't keep anything: nothing to drop.
  }
}
