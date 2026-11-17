/**
 * The /interno password (owner, 2026-11-17). Only two SHA-256 hashes live here, never the password:
 * - the login hash, sha256("login|" + password), checked when the form is sent;
 * - the cookie hash, sha256(cookie), where the session cookie is sha256("cookie|" + password).
 * Neither hash lets anyone build the cookie without the password. To change it: `node scripts/interno-hash.mjs "CLAVE"`
 * and paste the result here, or set INTERNO_PASS_SHA256 and INTERNO_COOKIE_SHA256 on the host (they win). Changing it
 * signs everyone out. Runs in the proxy and in the login route (Web Crypto only).
 */

export const AUTH_COOKIE = "gf_interno"
/** Days a sign-in lasts on a device. */
export const AUTH_DAYS = 30

const PASS_SHA256 = process.env.INTERNO_PASS_SHA256 || "764ebace7c0c2e46a186386509c724d3fe61d2b33804aa5b40c3b0391cca1307"
const COOKIE_SHA256 = process.env.INTERNO_COOKIE_SHA256 || "32189bc1486b50ee4bc6d6c30171fe74c469020c16df83a0bb6fbc89f0aa5e77"

async function sha256(text: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

/** Same-length hex strings compared without stopping at the first difference. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

export async function passwordOk(password: string): Promise<boolean> {
  return same(await sha256(`login|${password}`), PASS_SHA256)
}

/** The session cookie's value for a correct password. */
export function cookieFor(password: string): Promise<string> {
  return sha256(`cookie|${password}`)
}

export async function cookieOk(value: string | undefined): Promise<boolean> {
  if (!value || value.length !== 64) return false
  return same(await sha256(value), COOKIE_SHA256)
}

/** Where to go after signing in: only a page under /interno (never another site). */
export function safeNext(next: unknown): string {
  return typeof next === "string" && /^\/interno(?:\/[a-z0-9-]+){0,2}$/i.test(next) ? next : "/interno"
}
