"use client";

import { CAPTION_STYLES, type CaptionStyle } from "@/types";
import { cn } from "@/utils/cn";

const LABELS: Record<CaptionStyle, string> = {
  classic: "Classic",
  bold: "Bold",
  minimal: "Minimal",
  highlight: "Highlight",
};

/** A segmented control — one connected group, one active segment. */
export function CaptionStylePicker({
  value,
  onChange,
}: {
  value: CaptionStyle;
  onChange: (s: CaptionStyle) => void;
}) {
  return (
    <div
      role="radiogroup"
      className="inline-flex divide-x divide-border overflow-hidden rounded-sm border border-border"
    >
      {CAPTION_STYLES.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          onClick={() => onChange(s)}
          className={cn(
            "h-8 px-2.5 text-[13px] transition-colors",
            value === s
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
          )}
        >
          {LABELS[s]}
        </button>
      ))}
    </div>
  );
}
