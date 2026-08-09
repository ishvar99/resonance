"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Last-resort boundary for errors thrown while rendering the root layout.
 * It replaces the whole document, so it must render its own <html>/<body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          display: "flex",
          minHeight: "100dvh",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          margin: 0,
        }}
      >
        <main style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: "0.5rem", opacity: 0.7, fontSize: "0.875rem" }}>
            Resonance hit an unexpected error. The team has been notified.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "1px solid currentColor",
              background: "transparent",
              cursor: "pointer",
              font: "inherit",
              fontSize: "0.875rem",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
