/**
 * Team accounts (owner, 2026-11-19: "owner + team, same access"): one per person, a name and their own password
 * (PBKDF2-SHA256 with its own salt, same format as INTERNO_PASS_HASH), so every change carries who made it. Admins add
 * people, reset passwords and deactivate them; everyone can change their own password. Once an active admin exists,
 * the shared team password no longer signs anyone in (and its open sessions stop reaching the data).
 *
 * Lookups are cached for CACHE_MS per server instance: a deactivated person loses access within that time, and so do
 * the sessions signed in before a password change (a reset ends a lost phone's session; owner review 2026-11-20).
 */
import "server-only"
import { pbkdf2 } from "../internal-auth"
import { getPool, hasDatabase } from "../db/client"

export const MIN_PASSWORD = 10
const ITERATIONS = 600_000
const CACHE_MS = 30_000

export type Member = {
  id: string
  name: string
  admin: boolean
  active: boolean
  createdAt: string
  /** When the password last changed ("" = not since the account was made). */
  passwordChangedAt: string
}

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url")

/** A new stored hash for a password ("pbkdf2-sha256:<iterations>:<salt>:<hash>"). */
export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(crypto.getRandomValues(new Uint8Array(16)))
  return `pbkdf2-sha256:${ITERATIONS}:${b64url(salt)}:${await pbkdf2(password, salt, ITERATIONS)}`
}

/** Whether a password matches a stored hash (compared without stopping at the first difference). */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [prefix, iter, saltText, hash] = stored.split(":")
  const iterations = Number(iter)
  if (prefix !== "pbkdf2-sha256" || !Number.isInteger(iterations) || iterations < 100_000 || !saltText || !hash) return false
  const got = await pbkdf2(password, new Uint8Array(Buffer.from(saltText, "base64url")), iterations)
  if (got.length !== hash.length) return false
  let d = 0
  for (let i = 0; i < got.length; i++) d |= got.charCodeAt(i) ^ hash.charCodeAt(i)
  return d === 0
}

/** A name as stored: trimmed, single spaces, at most 40 characters. */
export const cleanName = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 40)

type Row = { id: string; name: string; pass_hash: string; admin: boolean; active: boolean; created_at: Date; password_changed_at: Date | null }
const toMember = (r: Row): Member => ({
  id: r.id,
  name: r.name,
  admin: r.admin,
  active: r.active,
  createdAt: r.created_at.toISOString(),
  passwordChangedAt: r.password_changed_at ? r.password_changed_at.toISOString() : "",
})
const COLS = "id, name, pass_hash, admin, active, created_at, password_changed_at"

/** Seconds of clock difference between this server and the database allowed when comparing the two times. */
const SKEW_MS = 5_000

/** A session signed in before the person's last password change no longer counts. */
export const sessionCurrent = (m: Member, issuedAt: number) => !m.passwordChangedAt || issuedAt >= Date.parse(m.passwordChangedAt) - SKEW_MS

let cache: { at: number; members: Member[] } | null = null
/** Forget the cached list (after a change on this instance). */
const forget = () => {
  cache = null
}

/** Every account (no password hashes), cached briefly. Empty without a database. */
export async function members(fresh = false): Promise<Member[]> {
  if (!hasDatabase()) return []
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.members
  const rows = (await getPool().query(`select ${COLS} from team_members order by name`)).rows as Row[]
  cache = { at: Date.now(), members: rows.map(toMember) }
  return cache.members
}

export const memberById = async (id: string) => (await members()).find((m) => m.id === id) ?? null

/** Accounts exist (an active admin): the shared team password stops working. */
export const accountsOn = async () => (await members()).some((m) => m.active && m.admin)

/** The account for a name and password (names compared without case), or null. */
export async function signIn(name: string, password: string): Promise<Member | null> {
  if (!hasDatabase() || !password) return null
  const r = (await getPool().query(`select ${COLS} from team_members where lower(name) = lower($1) limit 1`, [cleanName(name)])).rows[0] as Row | undefined
  if (!r || !r.active || !(await verifyPassword(password, r.pass_hash))) return null
  return toMember(r)
}

export type TeamError = "name" | "password" | "taken" | "lastAdmin" | "notFound" | "forbidden"

export async function createMember(name: string, password: string, admin: boolean): Promise<Member | TeamError> {
  const n = cleanName(name)
  if (n.length < 2) return "name"
  if (password.length < MIN_PASSWORD) return "password"
  try {
    const r = (await getPool().query(`insert into team_members (name, pass_hash, admin) values ($1, $2, $3) returning ${COLS}`, [n, await hashPassword(password), admin])).rows[0] as Row
    forget()
    return toMember(r)
  } catch (e) {
    if (e instanceof Error && /unique|duplicate/i.test(e.message)) return "taken"
    throw e
  }
}

/** Changes an account; never leaves the team without an active admin. */
export async function updateMember(id: string, p: { password?: string; active?: boolean; admin?: boolean }): Promise<Member | TeamError> {
  const all = await members(true)
  const m = all.find((x) => x.id === id)
  if (!m) return "notFound"
  if (p.password !== undefined && p.password.length < MIN_PASSWORD) return "password"
  const losesAdmin = m.admin && m.active && (p.active === false || p.admin === false)
  if (losesAdmin && all.filter((x) => x.admin && x.active).length <= 1) return "lastAdmin"
  const sets: string[] = []
  const vals: unknown[] = [id]
  const set = (col: string, v: unknown) => {
    vals.push(v)
    sets.push(`${col} = $${vals.length}`)
  }
  if (p.password !== undefined) set("pass_hash", await hashPassword(p.password))
  // This server's clock, the one the session's sign-in time comes from (not the database's).
  if (p.password !== undefined) set("password_changed_at", new Date())
  if (p.active !== undefined) set("active", p.active)
  if (p.admin !== undefined) set("admin", p.admin)
  if (!sets.length) return m
  const r = (await getPool().query(`update team_members set ${sets.join(", ")}, updated_at = now() where id = $1 returning ${COLS}`, vals)).rows[0] as Row
  forget()
  return toMember(r)
}
