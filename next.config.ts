import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Which Vercel deployment this is ("production", "preview"; empty locally), for the browser: analytics only counts
  // production (components/layout/SiteAnalytics.tsx).
  env: { NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV ?? "" },
  experimental: {
    agentFeedback: true,
    // app/global-not-found.tsx: the 404 for URLs that match no route (the root layout is [locale]).
    globalNotFound: true,
  },
  cacheComponents: true,
  async headers() {
    return [
      // Every response: no framing by other sites (clickjacking), no MIME sniffing, HTTPS only, and no browser features
      // the site doesn't use (geolocation stays for the site itself: the surveys' "Usar mi ubicación"). The referrer
      // policy is the browser default (strict-origin-when-cross-origin); /interno sets no-referrer in proxy.ts.
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=(), browsing-topics=()" },
        ],
      },
      // API responses are never search results, including the ones Next itself answers (405s on /api/interno/*), which
      // proxy.ts doesn't see.
      {
        source: "/api/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
        ],
      },
      // Internal tools: never indexed (proxy.ts also sets this).
      {
        source: "/:locale/mikrotik/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
        ],
      },
    ]
  },
  // The report form moved into the client area (owner, 2026-11-18).
  async redirects() {
    return [{ source: "/:locale(es|en)/reportar", destination: "/:locale/clientes#reportar", permanent: true }]
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
