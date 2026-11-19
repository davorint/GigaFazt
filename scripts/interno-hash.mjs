/**
 * Makes the two host values lib/internal-auth.ts needs for the /interno password. Neither goes into the repository:
 * set them on the host (Vercel → Settings → Environment Variables) and in .env.local for the dev server.
 *
 *   node scripts/interno-hash.mjs "NUEVA-CLAVE"            → INTERNO_PASS_HASH and a new INTERNO_SESSION_SECRET
 *   node scripts/interno-hash.mjs "NUEVA-CLAVE" --keep     → only INTERNO_PASS_HASH (keep the current secret)
 *
 * Changing either value signs everyone out. Use at least 12 characters: a phrase of several words is best.
 */
import { pbkdf2Sync, randomBytes } from "node:crypto"

const ITERATIONS = 600_000
const pass = process.argv[2]
if (!pass) {
  console.error('uso: node scripts/interno-hash.mjs "CLAVE" [--keep]')
  process.exit(1)
}
if (pass.length < 12) {
  console.error("La contraseña debe tener al menos 12 caracteres (mejor una frase de varias palabras).")
  process.exit(1)
}
const b64url = (buf) => buf.toString("base64url")
const salt = randomBytes(16)
const hash = pbkdf2Sync(pass, salt, ITERATIONS, 32, "sha256")
console.log(`INTERNO_PASS_HASH=pbkdf2-sha256:${ITERATIONS}:${b64url(salt)}:${b64url(hash)}`)
if (!process.argv.includes("--keep")) console.log(`INTERNO_SESSION_SECRET=${b64url(randomBytes(32))}`)
