import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// Only the "@/…" path alias from tsconfig, so tests can import app files (robots, sitemap); everything else is the default.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
})
