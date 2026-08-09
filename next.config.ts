import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Fail the build on type errors rather than shipping them. Next 16 no longer
  // runs ESLint during `next build` — `npm run lint` covers that in CI.
  typescript: { ignoreBuildErrors: false },

  serverExternalPackages: ["@prisma/adapter-pg"],

  experimental: {
    serverActions: {
      // Voice samples are uploaded through a server action.
      bodySizeLimit: "30mb",
    },
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            // The voice recorder needs the microphone; nothing else is used.
            value: "camera=(), geolocation=(), microphone=(self)",
          },
        ],
      },
    ];
  },
};

/**
 * Source maps are uploaded only when a Sentry auth token is present, so local
 * and unconfigured builds are unaffected.
 */
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  // Strip source maps from the client bundle after upload.
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  // Routes ad-blocked Sentry requests through the app's own origin.
  tunnelRoute: "/monitoring",
});
