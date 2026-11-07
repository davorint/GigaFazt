// Copies MapLibre's self-contained worker into /public, version-stamped, so the
// lazy map can load it via setWorkerUrl() (its default URL resolution breaks
// when bundled by Turbopack). Runs before dev and build.
import { copyFile, readFile, readdir, unlink } from "node:fs/promises"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "..")
const pkg = JSON.parse(await readFile(path.join(root, "node_modules/maplibre-gl/package.json"), "utf8"))
const name = `maplibre-gl-worker-${pkg.version}.mjs`
const pub = path.join(root, "public")
for (const f of await readdir(pub)) {
  if (f.startsWith("maplibre-gl-worker-") && f !== name) await unlink(path.join(pub, f))
}
await copyFile(path.join(root, "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs"), path.join(pub, name))
console.log(`[maplibre] worker → public/${name}`)
