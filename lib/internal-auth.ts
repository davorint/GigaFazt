/**
 * The /interno password (owner, 2026-11-17; hardened 2026-11-18). Nothing secret lives in the repository: both values
 * are set on the host, and without them nobody can sign in.
 * - INTERNO_PASS_HASH: "pbkdf2-sha256:<iterations>:<salt>:<hash>" (base64url), a slow salted hash of the password,
 *   checked only when the sign-in form is sent;
 * - INTERNO_SESSION_SECRET: a long random value that signs the session cookie ("<expires>.<nonce>.<signature>"). The
 *   cookie says when it expires and is checked on every request; it can't be made without the secret, and it doesn't
 *   come from the password.
 * Changing either value signs everyone out (the signature also covers the password hash). To make both:
 * `node scripts/interno-hash.mjs "CLAVE"`. Web Crypto only: runs in the proxy and in the API routes.
 */

export const AUTH_COOKIE = "gf_interno"
/** Days a sign-in lasts on a device. */
export const AUTH_DAYS = 30

const PREFIX = "pbkdf2-sha256"
/** Accepted iteration counts: below the minimum is too fast to guess against, above the maximum is a misconfiguration. */
const MIN_ITER = 100_000
const MAX_ITER = 5_000_000

const enc = new TextEncoder()

function b64url(bytes: Uint8Array): string {
  let s = ""
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromB64url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null
  try {
    const s = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4))
    return Uint8Array.from(s, (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

/** Same-length strings compared without stopping at the first difference. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

type Stored = { iterations: number; salt: Uint8Array<ArrayBuffer>; hash: string }

function stored(): Stored | null {
  const parts = (process.env.INTERNO_PASS_HASH ?? "").trim().split(":")
  if (parts.length !== 4 || parts[0] !== PREFIX) return null
  const iterations = Number(parts[1])
  const salt = fromB64url(parts[2])
  if (!Number.isInteger(iterations) || iterations < MIN_ITER || iterations > MAX_ITER || !salt || salt.length < 16 || !fromB64url(parts[3])) return null
  return { iterations, salt: new Uint8Array(salt), hash: parts[3] }
}

function secret(): string | null {
  const s = (process.env.INTERNO_SESSION_SECRET ?? "").trim()
  return s.length >= 32 ? s : null
}

/** Both host values are set and well formed; otherwise every sign-in is refused. */
export function authConfigured(): boolean {
  return stored() !== null && secret() !== null
}

/** The PBKDF2-SHA256 hash of a password, base64url (also used by scripts/interno-hash.mjs's format). */
export async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"])
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256)
  return b64url(new Uint8Array(bits))
}

export async function passwordOk(password: string): Promise<boolean> {
  const s = stored()
  if (!s || !secret() || !password) return false
  return same(await pbkdf2(password, s.salt, s.iterations), s.hash)
}

let keyCache: { material: string; key: Promise<CryptoKey> } | null = null

function hmacKey(sec: string): Promise<CryptoKey> {
  if (keyCache?.material !== sec) {
    keyCache = { material: sec, key: crypto.subtle.importKey("raw", enc.encode(sec), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]) }
  }
  return keyCache.key
}

/**
 * What the signature covers: the expiry, the nonce, the team member (or "-" for the shared password) and the password
 * hash (a new shared password ends every session). v1 cookies (no member) are still read until they expire.
 */
const signed = (exp: string, nonce: string, member?: string) =>
  enc.encode(member === undefined ? `v1|${process.env.INTERNO_PASS_HASH?.trim()}|${exp}|${nonce}` : `v2|${process.env.INTERNO_PASS_HASH?.trim()}|${exp}|${nonce}|${member}`)

/**
 * A new session cookie value, valid for AUTH_DAYS: "<expires>.<nonce>.<member>.<signature>", the member being a team
 * account's id (lib/team) or "-" for the shared team password. Throws when the host values are missing.
 */
export async function newSession(now = Date.now(), memberId = ""): Promise<string> {
  const sec = secret()
  if (!sec || !stored()) throw new Error("interno auth not configured")
  const exp = String(Math.floor(now / 1000) + AUTH_DAYS * 24 * 60 * 60)
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(16)))
  const member = memberId && /^[\w-]{1,64}$/.test(memberId) ? memberId : "-"
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(sec), signed(exp, nonce, member)))
  return `${exp}.${nonce}.${member}.${b64url(sig)}`
}

export type Session = {
  /** The team account's id, "" for the shared password. */
  member: string
  /** When it was signed in (ms): its expiry minus AUTH_DAYS. */
  issuedAt: number
}

/** The session a cookie carries, or null when it's missing, expired, forged or the host values aren't set. */
export async function sessionOf(value: string | undefined, now = Date.now()): Promise<Session | null> {
  const sec = secret()
  if (!value || value.length > 300 || !sec || !stored()) return null
  const parts = value.split(".")
  if ((parts.length !== 3 && parts.length !== 4) || !/^\d{1,12}$/.test(parts[0])) return null
  const [exp, nonce] = parts
  const member = parts.length === 4 ? parts[2] : undefined
  const sigText = parts[parts.length - 1]
  if (Number(exp) * 1000 <= now) return null
  if (member !== undefined && !/^(-|[\w-]{1,64})$/.test(member)) return null
  const sig = fromB64url(sigText)
  if (!sig || sig.length !== 32 || !fromB64url(nonce)) return null
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(sec), new Uint8Array(sig), signed(exp, nonce, member))
  return ok ? { member: member && member !== "-" ? member : "", issuedAt: (Number(exp) - AUTH_DAYS * 24 * 60 * 60) * 1000 } : null
}

/** The session cookie's options (HttpOnly, AUTH_DAYS, secure on https). */
export const sessionCookie = (https: boolean) => ({ httpOnly: true, secure: https, sameSite: "lax" as const, path: "/", maxAge: AUTH_DAYS * 24 * 60 * 60 })

export async function cookieOk(value: string | undefined, now = Date.now()): Promise<boolean> {
  return (await sessionOf(value, now)) !== null
}

/** Where to go after signing in: only a page under /interno (never another site). */
export function safeNext(next: unknown): string {
  return typeof next === "string" && /^\/interno(?:\/[a-z0-9-]+){0,3}$/i.test(next) ? next : "/interno"
}
