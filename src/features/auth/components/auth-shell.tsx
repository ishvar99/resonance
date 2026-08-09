import Link from "next/link";

import { ResonanceWordmark } from "@/components/brand/resonance-mark";
import { WaveField } from "@/features/dashboard/components/wave-field";

/**
 * Shared frame for sign-in, sign-up and workspace selection so the three screens
 * read as one product rather than three Clerk widgets.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-12">
      <WaveField className="absolute inset-0 -z-10" />

      <Link
        href="/"
        className="focus-visible:ring-ring absolute top-6 left-6 rounded-md focus-visible:ring-2 focus-visible:outline-none"
      >
        <ResonanceWordmark />
        <span className="sr-only">Resonance home</span>
      </Link>

      <div className="w-full max-w-md space-y-8">
        <header className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            {title}
          </h1>
          <p className="text-muted-foreground text-sm text-pretty">{subtitle}</p>
        </header>

        <div className="flex justify-center">{children}</div>
      </div>
    </main>
  );
}
