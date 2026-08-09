"use client";

import { useTransition } from "react";
import { CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  createCheckoutAction,
  openBillingPortalAction,
} from "@/features/billing/server/actions";

export function UpgradeButton({ label = "Upgrade" }: { label?: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await createCheckoutAction();
          if (!result.ok) {
            toast.error(result.message);
            return;
          }
          window.location.assign(result.data.url);
        })
      }
    >
      {isPending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden="true" />
          Opening checkout…
        </>
      ) : (
        <>
          <CreditCard aria-hidden="true" />
          {label}
        </>
      )}
    </Button>
  );
}

export function ManageBillingButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await openBillingPortalAction();
          if (!result.ok) {
            toast.error(result.message);
            return;
          }
          window.open(result.data.url, "_blank", "noopener,noreferrer");
        })
      }
    >
      {isPending ? (
        <Loader2 className="animate-spin" aria-hidden="true" />
      ) : (
        <ExternalLink aria-hidden="true" />
      )}
      Manage billing
    </Button>
  );
}
