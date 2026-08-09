"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";
import * as Sentry from "@sentry/nextjs";

import { Button } from "@/components/ui/button";

/** Dashboard-level boundary — keeps the sidebar and chrome intact. */
export default function DashboardError({
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
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="bg-destructive/10 text-destructive rounded-full p-3">
        <AlertCircle className="size-6" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <h2 className="text-sm font-medium">This page could not load</h2>
        <p className="text-muted-foreground max-w-sm text-sm text-pretty">
          Something went wrong on our end. Try again, and if it keeps happening
          let us know.
        </p>
      </div>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
