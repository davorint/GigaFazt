# GigaFazt

Marketing site of GigaFazt (gigafazt.com): symmetrical fiber internet in the Mexico City metro area and in Cuernavaca, Tepoztlán and Amatlán (Morelos). Spanish (es-MX, default) and English.

Pages: home (plans, fiber, Wi-Fi, coverage map, FAQ), `/planes`, `/empresas` (business internet and fiber networks), `/cobertura/[cdmx|estado-de-mexico|morelos]`, `/aviso-de-privacidad`.

## Commands
```bash
npm install
npm run dev          # http://localhost:3000 → /es
npm run typecheck    # tsc --noEmit
npm run lint
npm test             # vitest
npm run build && npm start          # production (verify against this, not dev)
npm run shot http://localhost:3000/es   # Playwright screenshots of every [data-section] → .screenshots/
```
`predev` / `prebuild` copy MapLibre's worker into `public/` (`scripts/copy-maplibre-worker.mjs`).

## Configuration
- `NEXT_PUBLIC_SITE_URL`: site origin for canonical URLs, sitemap and OG. Defaults to `https://gigafazt.com` (from `lib/company.ts`). Set it on preview deployments, or add noindex there.
- `CRM_WEBHOOK_URL`: where `/api/leads` posts consumer leads; without it, leads are only logged.

## Where things live
- Content and data: `docs/BUSINESS.md` (outside this repo, in the project folder) → `lib/company.ts`, `lib/plans.ts`, `lib/business.ts`. Copy: `messages/{es,en}.json`.
- Project rules, spec, design and progress: `../CLAUDE.md` and `../docs/` (`SPEC.md`, `DESIGN.md`, `PROGRESS.md`).
- Map geo data: `public/geo/`, rebuilt with the scripts described in `scripts/fetch-geo.md`.

Stack: Next.js 16 (App Router, Cache Components), React 19, TypeScript, Tailwind CSS v4, shadcn/ui (Base UI), next-intl, @react-three/fiber, MapLibre GL, Lenis, Vitest, Playwright.
