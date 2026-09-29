"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { CaptionStylePicker } from "./CaptionStylePicker";
import { mediaUrl } from "./api";
import { cn } from "@/utils/cn";
import { formatTimecode } from "@/utils/format";
import { isCaptionStyle, type CaptionStyle } from "@/types";
import type { ClipDto } from "./types";

const STATUS_LABEL: Record<string, string> = {
  completed: "ready",
  rendering: "rendering",
  queued: "queued",
  failed: "failed",
};

export function GeneratedClipCard({
  clip,
  projectId,
  durationSec,
  onSave,
  onRetry,
}: {
  clip: ClipDto;
  projectId: string;
  durationSec: number;
  onSave: (edit: {
    title: string;
    start: number;
    end: number;
    captionStyle: CaptionStyle;
  }) => Promise<void>;
  onRetry: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(clip.title);
  const [start, setStart] = useState(clip.start);
  const [end, setEnd] = useState(clip.end);
  const [style, setStyle] = useState<CaptionStyle>(
    isCaptionStyle(clip.captionStyle) ? clip.captionStyle : "classic",
  );
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const path = `projects/${projectId}/clips/${clip.id}.mp4`;
  const src = `${mediaUrl(path)}?v=${clip.status}`;
  const ready = clip.status === "completed" && clip.hasVideo;

  async function save() {
    setLocalError(null);
    if (end <= start) {
      setLocalError("End must come after start.");
      return;
    }
    setSaving(true);
    try {
      await onSave({ title, start, end, captionStyle: style });
      setEditing(false);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col">
      {/* The clip itself is the hero. Capped width reads as a contact sheet. */}
      <div className="w-full max-w-[240px] overflow-hidden rounded-sm bg-ink">
        <div className="relative aspect-[9/16] w-full">
          {ready ? (
            <video
              key={src}
              src={src}
              controls
              playsInline
              className="h-full w-full"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center px-5 text-center">
              {clip.status === "failed" ? (
                <p className="text-[13px] text-primary-foreground/70">
                  {clip.error ?? "Render failed."}
                </p>
              ) : (
                <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-primary-foreground/60">
                  <span className="rec-dot inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                  rendering
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Metadata + actions */}
      <div className="mt-3 max-w-[240px]">
        <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          <span>
            {formatTimecode(clip.start)}–{formatTimecode(clip.end)}
          </span>
          <span
            className={cn(
              "flex items-center gap-1.5",
              clip.status === "failed" && "text-destructive",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                ready
                  ? "bg-primary"
                  : clip.status === "failed"
                    ? "bg-destructive"
                    : "bg-foreground/30",
              )}
            />
            {STATUS_LABEL[clip.status] ?? clip.status}
          </span>
        </div>

        <h4 className="mt-1.5 text-sm font-medium leading-snug">{clip.title}</h4>
        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{clip.captionStyle}</p>

        <div className="mt-2.5 flex items-center gap-4">
          {ready && (
            <a
              href={mediaUrl(path, clip.title || "clip")}
              className="text-[13px] font-medium text-primary underline decoration-primary/40 decoration-1 underline-offset-4 hover:decoration-primary"
            >
              Download
            </a>
          )}
          {clip.status === "failed" && (
            <button
              onClick={onRetry}
              className="text-[13px] font-medium text-foreground underline decoration-foreground/30 decoration-1 underline-offset-4 hover:decoration-foreground"
            >
              Retry
            </button>
          )}
          {(ready || clip.status === "failed") && (
            <button
              onClick={() => setEditing((v) => !v)}
              className="text-[13px] text-muted-foreground underline decoration-transparent underline-offset-4 hover:text-foreground hover:decoration-foreground/40"
            >
              {editing ? "Close" : "Edit"}
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="mt-4 flex max-w-[280px] flex-col gap-3 border-t border-border pt-4">
          <div>
            <Label htmlFor={`title-${clip.id}`}>Title / hook</Label>
            <Input
              id={`title-${clip.id}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1.5 h-9 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor={`start-${clip.id}`}>Start · s</Label>
              <Input
                id={`start-${clip.id}`}
                type="number"
                step="0.1"
                min={0}
                max={durationSec}
                value={start}
                onChange={(e) => setStart(Number(e.target.value))}
                className="mt-1.5 h-9 font-mono text-sm"
              />
            </div>
            <div>
              <Label htmlFor={`end-${clip.id}`}>End · s</Label>
              <Input
                id={`end-${clip.id}`}
                type="number"
                step="0.1"
                min={0}
                max={durationSec}
                value={end}
                onChange={(e) => setEnd(Number(e.target.value))}
                className="mt-1.5 h-9 font-mono text-sm"
              />
            </div>
          </div>
          <div>
            <Label>Caption style</Label>
            <div className="mt-1.5">
              <CaptionStylePicker value={style} onChange={setStyle} />
            </div>
          </div>
          {localError && <p className="text-[13px] text-destructive">{localError}</p>}
          <div>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? "Re-rendering…" : "Save & re-render"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
