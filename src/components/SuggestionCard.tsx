"use client";

import { Button } from "./ui/button";
import { cn } from "@/utils/cn";
import { formatDuration, formatTimecode } from "@/utils/format";
import type { SuggestionDto } from "./types";

/**
 * A single suggestion rendered as a dividered list row — scannable like an
 * editor's cue sheet, not a card in a grid. The index doubles as the select
 * control.
 */
export function SuggestionRow({
  suggestion,
  index,
  selected,
  onToggle,
  onGenerate,
  generating,
}: {
  suggestion: SuggestionDto;
  index: number;
  selected: boolean;
  onToggle: () => void;
  onGenerate: () => void;
  generating: boolean;
}) {
  const num = String(index + 1).padStart(2, "0");
  const duration = suggestion.end - suggestion.start;

  return (
    <li
      data-testid="suggestion-row"
      className={cn(
        "grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-2 border-b border-border py-4 transition-colors sm:grid-cols-[auto_1fr_auto]",
        selected ? "bg-primary/[0.04]" : "hover:bg-foreground/[0.02]",
      )}
    >
      {/* Index / select toggle */}
      <button
        type="button"
        onClick={onToggle}
        role="checkbox"
        aria-checked={selected}
        aria-label={selected ? "Deselect clip" : "Select clip"}
        className={cn(
          "mt-0.5 h-7 w-7 rounded-sm border font-mono text-xs tabular-nums transition-colors",
          selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
        )}
      >
        {num}
      </button>

      {/* Content */}
      <div className="min-w-0">
        <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {formatTimecode(suggestion.start)} – {formatTimecode(suggestion.end)}
          <span className="mx-1.5 text-foreground/25">·</span>
          {formatDuration(duration)}
        </div>
        <h4 className="mt-1 text-[15px] font-medium leading-snug">{suggestion.title}</h4>
        <p className="mt-1 line-clamp-2 max-w-prose text-[13px] leading-relaxed text-muted-foreground">
          {suggestion.reason}
        </p>
        {/* Actions stack under content on narrow screens */}
        <div className="mt-2 sm:hidden">
          <Button size="sm" variant="secondary" onClick={onGenerate} disabled={generating}>
            {generating ? "Generating…" : "Generate"}
          </Button>
        </div>
      </div>

      {/* Score + action (wide screens) */}
      <div className="col-start-2 row-start-1 hidden flex-col items-end gap-2 sm:col-start-3 sm:flex">
        <div className="text-right">
          <span className="text-base font-medium tabular-nums">{suggestion.score}</span>
          <span className="font-mono text-[11px] text-muted-foreground">/100</span>
        </div>
        <Button size="sm" variant="ghost" onClick={onGenerate} disabled={generating}>
          {generating ? "…" : "Generate →"}
        </Button>
      </div>
    </li>
  );
}
