"use client";

import { useCallback, useEffect, useState } from "react";
import { api, mediaUrl } from "./api";
import type { ProjectDetailDto } from "./types";
import { UrlForm } from "./UrlForm";
import { JobProgress } from "./JobProgress";
import { SuggestionRow } from "./SuggestionCard";
import { GeneratedClipCard } from "./GeneratedClipCard";
import { CaptionStylePicker } from "./CaptionStylePicker";
import { Button } from "./ui/button";
import { formatDuration } from "@/utils/format";
import type { CaptionStyle } from "@/types";

type Phase = "idle" | "analyzing" | "ready" | "error";

/** Numbered section header with a hairline rule; the index hangs left on wide screens. */
function SectionHead({
  index,
  title,
  meta,
}: {
  index: string;
  title: string;
  meta?: string;
}) {
  return (
    <div className="mb-6 flex items-baseline justify-between gap-4 border-b border-border pb-2">
      <h2 className="flex items-baseline gap-3 text-[17px] font-semibold tracking-tight">
        <span className="font-mono text-xs font-normal text-primary">{index}</span>
        <span>{title}</span>
      </h2>
      {meta ? <div className="kicker shrink-0">{meta}</div> : null}
    </div>
  );
}

export function ReelsApp() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>("classic");
  const [busyGenerate, setBusyGenerate] = useState(false);

  const refresh = useCallback(async (id: string) => {
    try {
      const p = await api.getProject(id);
      setProject(p);
      if (p.status === "completed") setPhase((prev) => (prev === "analyzing" ? "ready" : prev));
      if (p.status === "failed") {
        setPhase("error");
        setError(p.error ?? "Analysis failed.");
      }
    } catch {
      /* transient — keep polling */
    }
  }, []);

  const shouldPoll =
    phase === "analyzing" ||
    !!project?.clips.some((c) => c.status === "queued" || c.status === "rendering");

  useEffect(() => {
    if (!projectId) return;
    void refresh(projectId);
    if (!shouldPoll) return;
    const iv = setInterval(() => void refresh(projectId), 1800);
    return () => clearInterval(iv);
  }, [projectId, shouldPoll, refresh]);

  async function onAnalyze(url: string) {
    setError(null);
    setProject(null);
    setSelected(new Set());
    setPhase("analyzing");
    try {
      const { projectId: id } = await api.createProject(url);
      setProjectId(id);
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : "Could not start analysis.");
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function generate(ids: string[]) {
    if (!projectId || ids.length === 0) return;
    setBusyGenerate(true);
    setError(null);
    try {
      await api.generateClips(projectId, ids, captionStyle);
      setSelected(new Set());
      await refresh(projectId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate clips.");
    } finally {
      setBusyGenerate(false);
    }
  }

  async function saveClip(
    clipId: string,
    edit: { title: string; start: number; end: number; captionStyle: CaptionStyle },
  ) {
    if (!projectId) return;
    await api.patchClip(clipId, edit);
    await refresh(projectId);
  }

  async function retryClip(clipId: string) {
    if (!projectId) return;
    await api.rerenderClip(clipId);
    await refresh(projectId);
  }

  function reset() {
    setPhase("idle");
    setProjectId(null);
    setProject(null);
    setSelected(new Set());
    setError(null);
  }

  const durationSec = project?.sourceVideo?.durationSec ?? 0;
  const showResults =
    project && (phase === "ready" || phase === "analyzing") && project.sourceVideo;

  return (
    <main className="mx-auto max-w-[60rem] px-5 pb-24 pt-12 sm:px-8 sm:pt-16">
      {/* Masthead — left aligned, deliberately asymmetric */}
      <header className="flex flex-col gap-6 border-b border-border pb-10 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <p className="kicker">Reels Generator</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-[2.1rem]">
            Cut a long video into clips people actually watch.
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            Paste a YouTube link. It transcribes the video, finds the moments worth posting,
            and reframes them to vertical 9:16 with captions.
          </p>
        </div>
        <div className="shrink-0 font-mono text-[11px] leading-relaxed text-muted-foreground sm:text-right">
          <div>9:16 · 1080×1920</div>
          <div>h.264 / aac · mp4</div>
        </div>
      </header>

      {/* Intake — the primary action, given room to breathe (no card) */}
      <section className="mt-10 max-w-2xl">
        <label htmlFor="yt-url" className="kicker">
          YouTube URL
        </label>
        <div className="mt-2">
          <UrlForm onSubmit={onAnalyze} disabled={phase === "analyzing"} />
        </div>
        {(phase === "ready" || phase === "error") && (
          <button
            onClick={reset}
            className="mt-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
          >
            Start over
          </button>
        )}
      </section>

      {error && (
        <div className="mt-8 max-w-2xl border-l-2 border-destructive bg-destructive/[0.05] py-2.5 pl-4 pr-3 text-sm text-foreground">
          {error}
        </div>
      )}

      {phase === "analyzing" && (
        <section className="mt-8 max-w-2xl">
          <JobProgress job={project?.job ?? null} />
        </section>
      )}

      {/* 01 — Source */}
      {showResults && project?.sourceVideo && (
        <section className="mt-16">
          <SectionHead index="01" title="Source" />
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="w-full overflow-hidden rounded-sm bg-ink sm:w-[300px] sm:shrink-0">
              <video
                src={mediaUrl(project.sourceVideo.storagePath)}
                controls
                playsInline
                className="aspect-video w-full"
              />
            </div>
            <div className="pt-1">
              <h3 className="text-lg font-medium tracking-tight">
                {project.title ?? "Untitled source"}
              </h3>
              <dl className="mt-3 space-y-1 font-mono text-xs text-muted-foreground">
                <div>
                  <span className="text-foreground/50">runtime </span>
                  {formatDuration(durationSec)}
                </div>
                <div>
                  <span className="text-foreground/50">frame </span>
                  {project.sourceVideo.width}×{project.sourceVideo.height}
                </div>
              </dl>
            </div>
          </div>
        </section>
      )}

      {/* 02 — Suggested clips */}
      {phase === "ready" && project && (
        <section className="mt-16">
          <SectionHead
            index="02"
            title="Suggested clips"
            meta={
              project.suggestions.length > 0
                ? `${project.suggestions.length} found`
                : undefined
            }
          />

          {project.suggestions.length === 0 ? (
            <p className="max-w-prose text-sm text-muted-foreground">
              Nothing in this video reads as a strong, self-contained short. Try a more
              conversational or advice-driven video.
            </p>
          ) : (
            <>
              <ol className="border-t border-border">
                {project.suggestions.map((s, i) => (
                  <SuggestionRow
                    key={s.id}
                    suggestion={s}
                    index={i}
                    selected={selected.has(s.id)}
                    onToggle={() => toggle(s.id)}
                    onGenerate={() => generate([s.id])}
                    generating={busyGenerate}
                  />
                ))}
              </ol>

              {/* Action bar — flat, opaque, functional (no glass) */}
              <div className="sticky bottom-0 -mx-5 mt-4 flex flex-col gap-3 border-t border-border bg-background px-5 py-3 sm:-mx-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                <div className="flex items-center gap-3">
                  <span className="kicker">Captions</span>
                  <CaptionStylePicker value={captionStyle} onChange={setCaptionStyle} />
                </div>
                <Button
                  onClick={() => generate([...selected])}
                  disabled={selected.size === 0 || busyGenerate}
                >
                  {busyGenerate
                    ? "Generating…"
                    : `Generate selected${selected.size ? ` (${selected.size})` : ""}`}
                </Button>
              </div>
            </>
          )}
        </section>
      )}

      {/* 03 — Your clips (contact sheet) */}
      {project && project.clips.length > 0 && (
        <section className="mt-16">
          <SectionHead index="03" title="Your clips" meta={`${project.clips.length} rendered`} />
          <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {project.clips.map((c) => (
              <GeneratedClipCard
                key={c.id}
                clip={c}
                projectId={project.id}
                durationSec={durationSec}
                onSave={(edit) => saveClip(c.id, edit)}
                onRetry={() => retryClip(c.id)}
              />
            ))}
          </div>
        </section>
      )}

      <footer className="mt-20 border-t border-border pt-6 font-mono text-[11px] text-muted-foreground">
        Providers: mock by default — set yt-dlp, transcription and AI keys in .env for live use.
      </footer>
    </main>
  );
}
