// Bundles the /mikrotik capacity worker into /public. Turbopack copies the
// target of `new Worker(new URL(...))` as a raw asset instead of bundling it,
// so the page loads this prebuilt file by URL. Runs before dev and build.
import path from "node:path"
import { build } from "esbuild"

const root = path.resolve(import.meta.dirname, "..")
// Not under /mikrotik: the proxy rewrites any path starting with it.
const out = "public/capacity-worker.js"
await build({
  entryPoints: [path.join(root, "lib/mikrotik/capacity.worker.ts")],
  outfile: path.join(root, out),
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  legalComments: "none",
  logLevel: "warning",
})
console.log(`[capacity] worker → ${out}`)
