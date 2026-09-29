import { cn } from "@/utils/cn";

/* A thin, honest determinate bar — solid ink track, vermilion fill. */
export function Progress({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("h-px w-full bg-foreground/15", className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full bg-primary transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
