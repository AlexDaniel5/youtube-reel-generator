import * as React from "react";
import { cn } from "@/utils/cn";

type Variant = "default" | "secondary" | "success" | "warning" | "destructive";

/**
 * Understated status marker: a small monospace label with a coloured leading
 * dot. No fills, no glow — just enough to read state at a glance.
 */
const dotColor: Record<Variant, string> = {
  default: "bg-foreground/60",
  secondary: "bg-muted-foreground/60",
  success: "bg-primary",
  warning: "bg-foreground/40",
  destructive: "bg-destructive",
};

export function Badge({
  variant = "default",
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground",
        className,
      )}
      {...props}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dotColor[variant])} />
      {children}
    </span>
  );
}
