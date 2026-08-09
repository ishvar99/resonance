"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Mic, Plus, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  VOICE_CATEGORIES,
  VOICE_LANGUAGES,
} from "@/features/voices/constants";
import { VoiceRecorder } from "@/features/voices/components/voice-recorder";
import { VoiceUploader } from "@/features/voices/components/voice-uploader";
import { createVoiceAction } from "@/features/voices/server/actions";

type Step = "sample" | "details";

const INITIAL_METADATA = {
  name: "",
  description: "",
  category: "GENERAL",
  language: "en-US",
};

/**
 * Two-step voice creation: capture a sample (upload or record), then describe
 * it. Audio only leaves the browser when "Create voice" is pressed.
 */
export function CreateVoiceDialog({
  triggerVariant = "default",
  triggerLabel = "Create voice",
}: {
  triggerVariant?: "default" | "outline" | "secondary";
  triggerLabel?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [openedLocally, setOpenedLocally] = useState(false);
  const [step, setStep] = useState<Step>("sample");
  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState(INITIAL_METADATA);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isSubmitting, startSubmit] = useTransition();

  // `/voices?create=1` (the sidebar's Voice Cloning entry) opens the dialog.
  // Deriving rather than syncing into state keeps the URL the single source of
  // truth for that entry point.
  const openedByUrl = searchParams.get("create") === "1";
  const open = openedLocally || openedByUrl;

  function reset() {
    setStep("sample");
    setFile(null);
    setMetadata(INITIAL_METADATA);
    setFieldErrors({});
  }

  function handleOpenChange(next: boolean) {
    if (isSubmitting) return; // Never close mid-upload.
    setOpenedLocally(next);

    if (!next) {
      reset();
      if (openedByUrl) {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("create");
        const query = params.toString();
        router.replace(query ? `/voices?${query}` : "/voices", { scroll: false });
      }
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;

    const formData = new FormData();
    formData.set("name", metadata.name);
    formData.set("description", metadata.description);
    formData.set("category", metadata.category);
    formData.set("language", metadata.language);
    formData.set("sample", file);

    startSubmit(async () => {
      const result = await createVoiceAction(formData);

      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});

        if (result.code === "BILLING_REQUIRED" && result.checkoutUrl) {
          const url = result.checkoutUrl;
          toast.error(result.message, {
            action: { label: "Upgrade", onClick: () => window.location.assign(url) },
            duration: 10_000,
          });
          return;
        }

        toast.error(result.message);
        return;
      }

      toast.success(`"${result.data.name}" is ready`, {
        description: "Your new voice is available across this workspace.",
      });
      handleOpenChange(false);
      router.refresh();
    });
  }

  const firstError = (field: string) => fieldErrors[field]?.[0];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant}>
          <Plus aria-hidden="true" />
          {triggerLabel}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === "sample" ? "Create a voice" : "Describe your voice"}
          </DialogTitle>
          <DialogDescription>
            {step === "sample"
              ? "Give Resonance a clean sample of the voice you want to clone."
              : "These details help your team find the voice later."}
          </DialogDescription>
        </DialogHeader>

        {step === "sample" ? (
          <div className="space-y-5">
            <Tabs defaultValue="upload">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="upload">
                  <UploadCloud aria-hidden="true" />
                  Upload
                </TabsTrigger>
                <TabsTrigger value="record">
                  <Mic aria-hidden="true" />
                  Record
                </TabsTrigger>
              </TabsList>

              <TabsContent value="upload" className="mt-4">
                <VoiceUploader file={file} onFileChange={setFile} />
              </TabsContent>

              <TabsContent value="record" className="mt-4">
                <VoiceRecorder onRecorded={setFile} />
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button
                type="button"
                disabled={!file}
                onClick={() => setStep("details")}
              >
                Continue
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="voice-name">Voice name</Label>
              <Input
                id="voice-name"
                value={metadata.name}
                autoFocus
                required
                maxLength={60}
                placeholder="Aurora — warm narrator"
                aria-invalid={Boolean(firstError("name"))}
                aria-describedby={firstError("name") ? "voice-name-error" : undefined}
                onChange={(event) =>
                  setMetadata((m) => ({ ...m, name: event.target.value }))
                }
              />
              {firstError("name") ? (
                <p id="voice-name-error" className="text-destructive text-xs">
                  {firstError("name")}
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="voice-category">Category</Label>
                <Select
                  value={metadata.category}
                  onValueChange={(value) =>
                    setMetadata((m) => ({ ...m, category: value }))
                  }
                >
                  <SelectTrigger id="voice-category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VOICE_CATEGORIES.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="voice-language">Language</Label>
                <Select
                  value={metadata.language}
                  onValueChange={(value) =>
                    setMetadata((m) => ({ ...m, language: value }))
                  }
                >
                  <SelectTrigger id="voice-language" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VOICE_LANGUAGES.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        <span aria-hidden="true">{item.flag}</span> {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="voice-description">
                Description <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="voice-description"
                rows={3}
                maxLength={300}
                placeholder="Calm, mid-range, good for long-form narration."
                value={metadata.description}
                onChange={(event) =>
                  setMetadata((m) => ({ ...m, description: event.target.value }))
                }
              />
              <p className="text-muted-foreground text-right text-xs tabular-nums">
                {metadata.description.length}/300
              </p>
            </div>

            {fieldErrors.form?.[0] ? (
              <p className="text-destructive text-xs">{fieldErrors.form[0]}</p>
            ) : null}

            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                disabled={isSubmitting}
                onClick={() => setStep("sample")}
              >
                <ArrowLeft aria-hidden="true" />
                Back
              </Button>
              <Button type="submit" disabled={isSubmitting || !metadata.name.trim()}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden="true" />
                    Creating voice…
                  </>
                ) : (
                  "Create voice"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
