import { cn } from "@/lib/utils";

/**
 * Ambient background: three slow, offset sine waves fading out towards the
 * bottom. Pure CSS/SVG — no client component, no animation frame loop — and it
 * stops moving entirely under `prefers-reduced-motion` (see `globals.css`).
 */
export function WaveField({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none overflow-hidden select-none", className)}
    >
      {/* Warm wash so the waves sit on something rather than floating. */}
      <div className="from-primary/[0.07] absolute inset-0 bg-gradient-to-b via-transparent to-transparent" />

      <svg
        className="absolute inset-x-0 top-0 h-[420px] w-full"
        viewBox="0 0 1440 420"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="resonance-wave-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0.55" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <mask id="resonance-wave-mask">
            <rect width="1440" height="420" fill="url(#resonance-wave-fade)" />
          </mask>
        </defs>

        <g mask="url(#resonance-wave-mask)" className="text-primary">
          {/* Each path is 2× viewBox width so a -50% translate loops seamlessly. */}
          <path
            className="resonance-wave resonance-wave--slow"
            d="M0 190 C 180 120, 360 260, 540 190 S 900 120, 1080 190 S 1440 260, 1620 190 S 1980 120, 2160 190 S 2520 260, 2880 190 L2880 420 L0 420 Z"
            fill="currentColor"
            opacity="0.05"
          />
          <path
            className="resonance-wave resonance-wave--medium"
            d="M0 230 C 200 170, 400 300, 600 230 S 1000 170, 1200 230 S 1600 300, 1800 230 S 2200 170, 2400 230 S 2700 300, 2880 230 L2880 420 L0 420 Z"
            fill="currentColor"
            opacity="0.045"
          />
          <path
            className="resonance-wave resonance-wave--fast"
            d="M0 270 C 240 220, 480 330, 720 270 S 1200 220, 1440 270 S 1920 330, 2160 270 S 2640 220, 2880 270 L2880 420 L0 420 Z"
            fill="currentColor"
            opacity="0.04"
          />
        </g>
      </svg>
    </div>
  );
}
