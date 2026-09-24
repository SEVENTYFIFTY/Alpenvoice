import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

/**
 * Spotlight is built to static files (`npm run build` -> out/) that Atelier's Python
 * server serves at /spotlight, next to its /api. During `npm run dev`, /api calls are
 * forwarded to the Python server instead (static export doesn't allow rewrites).
 */
const ATELIER_API = process.env.ATELIER_API ?? "http://localhost:8000";

export default function config(phase: string): NextConfig {
  const shared: NextConfig = { basePath: "/spotlight", trailingSlash: true };
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    return {
      ...shared,
      async rewrites() {
        return [{ source: "/api/:path*", destination: `${ATELIER_API}/api/:path*`, basePath: false }];
      },
    };
  }
  return { ...shared, output: "export", images: { unoptimized: true } };
}
