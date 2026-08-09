import * as Sentry from "@sentry/nextjs";

/**
 * Browser-side Sentry.
 *
 * `NEXT_PUBLIC_*` values are read directly from `process.env` rather than
 * through `@/lib/environment`. Importing that module here would bundle the
 * whole server schema — every server variable name and validation rule — into
 * the client chunk. No secret *values* would leak (the bundler replaces
 * server-side `process.env` reads with `undefined`), but publishing the shape
 * of the infrastructure to anyone who opens devtools is free information for an
 * attacker and buys nothing.
 *
 * Session replay is deliberately off: the composer holds whatever the user is
 * about to have spoken aloud.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,
    sendDefaultPii: false,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
