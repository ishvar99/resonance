import { cn } from "@/lib/utils";

/**
 * Resonance mark — a point of origin with sound radiating outwards.
 * `currentColor` throughout so it inherits from whatever it sits on.
 */
export function ResonanceMark({
  className,
  ...props
}: React.ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("size-6", className)}
      {...props}
    >
      <circle cx="16" cy="16" r="3" fill="currentColor" />
      <path
        d="M22.4 9.6a9 9 0 0 1 0 12.8"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M9.6 22.4a9 9 0 0 1 0-12.8"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M26.6 5.4a15 15 0 0 1 0 21.2"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        opacity="0.4"
      />
      <path
        d="M5.4 26.6a15 15 0 0 1 0-21.2"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        opacity="0.4"
      />
    </svg>
  );
}

export function ResonanceWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <ResonanceMark className="text-primary size-6 shrink-0" />
      <span className="text-[15px] font-semibold tracking-tight">Resonance</span>
    </span>
  );
}
