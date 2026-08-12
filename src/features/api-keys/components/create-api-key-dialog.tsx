"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, Loader2, Plus, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createApiKeyAction } from "@/features/api-keys/server/actions";

/**
 * Two-phase dialog: name the key, then show the secret exactly once.
 *
 * The secret exists only in this component's state — it is never routed,
 * persisted or logged. Closing the dialog is the point of no return, and the
 * copy says so.
 */
export function CreateApiKeyDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isCreating, startCreating] = useTransition();

  function handleOpenChange(next: boolean) {
    if (isCreating) return;
    setOpen(next);
    if (!next) {
      setName("");
      setSecret(null);
      setCopied(false);
      router.refresh();
    }
  }

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startCreating(async () => {
      const result = await createApiKeyAction({ name });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setSecret(result.data.secret);
    });
  }

  async function copySecret() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed — select the key and copy it manually.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus aria-hidden="true" />
          Create key
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        {secret === null ? (
          <>
            <DialogHeader>
              <DialogTitle>Create an API key</DialogTitle>
              <DialogDescription>
                The key authenticates requests to the Resonance REST API on
                behalf of this workspace.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="api-key-name">Key name</Label>
                <Input
                  id="api-key-name"
                  value={name}
                  autoFocus
                  required
                  maxLength={60}
                  placeholder="Production server"
                  onChange={(event) => setName(event.target.value)}
                />
                <p className="text-muted-foreground text-xs">
                  Name it after where it will live, so it is obvious what to
                  revoke later.
                </p>
              </div>

              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={isCreating}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={isCreating || name.trim().length < 2}>
                  {isCreating ? (
                    <>
                      <Loader2 className="animate-spin" aria-hidden="true" />
                      Creating…
                    </>
                  ) : (
                    <>
                      <KeyRound aria-hidden="true" />
                      Create key
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Copy your API key</DialogTitle>
              <DialogDescription>
                This is the only time the full key is shown. Store it in your
                secret manager now.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={secret}
                  aria-label="Your new API key"
                  className="font-mono text-xs"
                  onFocus={(event) => event.currentTarget.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => void copySecret()}
                  aria-label={copied ? "Copied" : "Copy API key"}
                >
                  {copied ? (
                    <Check className="text-emerald-600" aria-hidden="true" />
                  ) : (
                    <Copy aria-hidden="true" />
                  )}
                </Button>
              </div>

              <Alert>
                <TriangleAlert aria-hidden="true" />
                <AlertTitle>Shown once, stored never</AlertTitle>
                <AlertDescription>
                  Resonance keeps only a hash. If you lose this key, revoke it
                  and create a new one.
                </AlertDescription>
              </Alert>
            </div>

            <DialogFooter>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
