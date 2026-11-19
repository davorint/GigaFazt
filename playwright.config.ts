/**
 * End-to-end checks of the main flows against a production build (`npm run build` first), run in CI
 * (.github/workflows/checks.yml) and locally with `npm run e2e`. The server runs without a database (DATABASE_URL
 * empty) and with a throwaway /interno password (E2E_PASSWORD; its hash in .env.production.local), so nothing real is
 * touched. Files: e2e/*.e2e.ts (vitest ignores them).
 */
import { defineConfig, devices } from "@playwright/test"

const PORT = 3200

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, locale: "es-MX", trace: "retain-on-failure" },
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"] } }],
  webServer: { command: `npx next start -p ${PORT}`, url: `http://localhost:${PORT}/es`, reuseExistingServer: false, timeout: 120_000 },
})
