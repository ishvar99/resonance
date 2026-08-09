"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { regenerateAction } from "@/features/text-to-speech/server/actions";

/** Re-runs a generation with the same text, voice and settings, as a new row. */
export function RegenerateButton({
  generationId,
  disabled,
}: {
  generationId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled || isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await regenerateAction({ generationId });

          if (!result.ok) {
            if (result.code === "BILLING_REQUIRED" && result.checkoutUrl) {
              const url = result.checkoutUrl;
              toast.error(result.message, {
                action: {
                  label: "Upgrade",
                  onClick: () => window.location.assign(url),
                },
                duration: 10_000,
              });
              return;
            }
            toast.error(result.message);
            return;
          }

          toast.success("Regenerated");
          router.push(`/text-to-speech/${result.data.generationId}`);
        })
      }
    >
      {isPending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden="true" />
          Regenerating…
        </>
      ) : (
        <>
          <RefreshCw aria-hidden="true" />
          Regenerate
        </>
      )}
    </Button>
  );
}
