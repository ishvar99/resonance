"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { revokeApiKeyAction } from "@/features/api-keys/server/actions";

export function RevokeApiKeyButton({
  keyId,
  keyName,
}: {
  keyId: string;
  keyName: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isRevoking, startRevoking] = useTransition();

  function handleRevoke() {
    startRevoking(async () => {
      const result = await revokeApiKeyAction({ keyId });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setConfirming(false);
      toast.success(`"${keyName}" was revoked`, {
        description: "Requests using it will start failing immediately.",
      });
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Revoke ${keyName}`}
        onClick={() => setConfirming(true)}
      >
        <Trash2 aria-hidden="true" />
      </Button>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Revoke &ldquo;{keyName}&rdquo;?</DialogTitle>
            <DialogDescription>
              Every request signed with this key fails from the moment you
              confirm. This cannot be undone — create a new key to restore
              access.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={isRevoking}>
                Cancel
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleRevoke} disabled={isRevoking}>
              {isRevoking ? "Revoking…" : "Revoke key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
