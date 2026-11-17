/**
 * Prints the two hashes lib/internal-auth.ts compares for the /interno password: the login hash and the hash of the
 * session cookie. The password itself never goes into the repository.
 *
 *   node scripts/interno-hash.mjs "NUEVA-CLAVE"
 *
 * Paste them into lib/internal-auth.ts, or set INTERNO_PASS_SHA256 and INTERNO_COOKIE_SHA256 on the host.
 * Changing the password signs everyone out.
 */
import { createHash } from "node:crypto"
const pass = process.argv[2]
if (!pass) {
  console.error('uso: node scripts/interno-hash.mjs "CLAVE"')
  process.exit(1)
}
const h = (s) => createHash("sha256").update(s, "utf8").digest("hex")
console.log(`INTERNO_PASS_SHA256=${h(`login|${pass}`)}`)
console.log(`INTERNO_COOKIE_SHA256=${h(h(`cookie|${pass}`))}`)
