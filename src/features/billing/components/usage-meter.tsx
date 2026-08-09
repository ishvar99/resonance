import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/**
 * Usage against an allowance. `included === null` means the plan is unmetered,
 * in which case the bar is replaced by a plain total — a full-looking meter on
 * an unlimited plan would read as a warning.
 */
export function UsageMeter({
  label,
  used,
  included,
  unit,
}: {
  label: string;
  used: number;
  included: number | null;
  unit: string;
}) {
  const percentage =
    included && included > 0 ? Math.min(100, (used / included) * 100) : 0;
  const nearLimit = percentage >= 80;
  const atLimit = included !== null && used >= included;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span
          className={cn(
            "text-xs tabular-nums",
            atLimit
              ? "text-destructive font-medium"
              : nearLimit
                ? "font-medium"
                : "text-muted-foreground",
          )}
        >
          {used.toLocaleString()}
          {included === null ? (
            <span className="text-muted-foreground"> {unit}</span>
          ) : (
            <span className="text-muted-foreground">
              {" "}
              / {included.toLocaleString()} {unit}
            </span>
          )}
        </span>
      </div>

      {included === null ? (
        <p className="text-muted-foreground text-xs">
          Unmetered on this plan — billed per use.
        </p>
      ) : (
        <Progress
          value={percentage}
          aria-label={`${label}: ${used.toLocaleString()} of ${included.toLocaleString()} ${unit} used`}
        />
      )}
    </div>
  );
}
