import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendor MapLibre worker copied from node_modules (scripts/copy-maplibre-worker.mjs).
    "public/maplibre-gl-worker-*.mjs",
    "public/capacity-worker.js",
    // Screenshots and local one-off scripts (git-ignored).
    ".screenshots/**",
  ]),
  // The dev end-to-end scenarios (e2e-dev/, `npm run e2e:dev`) are plain Node CommonJS scripts: require() is how they load.
  {
    files: ["e2e-dev/**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

export default eslintConfig;
