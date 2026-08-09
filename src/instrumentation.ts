import * as Sentry from "@sentry/nextjs";

/**
 * Server + edge runtime bootstrap.
 *
 * Also the place where a misconfigured production deployment is caught:
 * `assertProductionIntegrations()` throws at boot rather than letting the first
 * user request silently fall through to a development adapter.
 */
export async function register() {
  const { env, assertProductionIntegrations } = await import("@/lib/environment");

  assertProductionIntegrations();

  if (!env.NEXT_PUBLIC_SENTRY_DSN) return;

  Sentry.init({
    dsn: env.NEXT_PUBLIC_SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 1,
    // Request bodies can contain the user's script text; never send them.
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        delete event.request.headers;
      }
      return event;
    },
  });
}

export const onRequestError = Sentry.captureRequestError;
