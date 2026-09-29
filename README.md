# Reels Generator

Turn a YouTube video into vertical (9:16) short-form clips with automatic,
styled captions — powered by an AI clip-detection step and an FFmpeg rendering
pipeline. Built with Next.js (App Router), TypeScript, Tailwind, Prisma and
FFmpeg.

The app ships with **offline mock providers as the default**, so the entire
flow — video retrieval → transcription → clip detection → vertical rendering
with burned-in captions → preview → export — runs and can be verified with **no
API keys, no `yt-dlp`, and no external database**. Swap in real providers via
environment variables when you're ready.

---

## What it does

1. Paste a YouTube URL → the app validates it and retrieves the video.
2. Transcribes the video (word-level timestamps).
3. AI analyzes the transcript and suggests the best short-form segments
   (start/end, duration, transcript preview, title/hook, score, reason).
4. Select one or more clips and generate vertical 1080×1920 MP4s:
   - center-crop / reframe to 9:16,
   - word/phrase-timed captions in one of four styles,
   - hook/title overlay.
5. Preview each clip, edit start/end, title, and caption style, re-render, and
   download the finished MP4.

Processing runs as background jobs with a live status/progress UI (polling).

---

## Quick start

```bash
# 1. Install dependencies (also generates the Prisma client)
npm install

# 2. Create your env file and initialise the dev database (SQLite)
cp .env.example .env
npm run db:push

# 3. Run the dev server
npm run dev
# open http://localhost:3000
```

With the default `.env`, everything works offline — the mock video provider
generates a real synthetic source video with FFmpeg, so you can exercise the
whole pipeline immediately.

### Other commands

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm run test        # vitest (url parsing, framing math, caption generation)
npm run build       # production build
npm run start       # run the production build
npm run db:studio   # inspect the database
```

---

## Environment variables

See `.env.example` for the full list. Key ones:

| Variable                 | Default             | Purpose |
|--------------------------|---------------------|---------|
| `DATABASE_URL`           | `file:./dev.db`     | Prisma connection string |
| `VIDEO_SOURCE_PROVIDER`  | `mock`              | `mock` (synthetic) or `ytdlp` (real download) |
| `YTDLP_PATH`             | `yt-dlp`            | Path to the yt-dlp binary |
| `TRANSCRIPTION_PROVIDER` | `mock`              | `mock` or `openai` (Whisper) |
| `TRANSCRIPTION_API_KEY`  | —                   | Key for the OpenAI-compatible transcription API |
| `CLIP_PROVIDER`          | `mock`              | `mock` (heuristic) or `anthropic` (Claude) |
| `AI_API_KEY`             | —                   | Anthropic API key for clip detection |
| `AI_MODEL`               | `claude-opus-4-8`   | Model used for clip detection |
| `STORAGE_PROVIDER`       | `local`             | Storage backend (local filesystem) |
| `STORAGE_PATH`           | `./storage`         | Local storage root |
| `CLIP_MIN_SECONDS` / `CLIP_MAX_SECONDS` | `20` / `60` | Preferred clip length bounds |
| `MAX_CLIP_SUGGESTIONS`   | `8`                 | Max suggestions per video |

API keys are read server-side only and are never exposed to the client.

---

## External services / requirements

- **FFmpeg / ffprobe** — bundled via the `ffmpeg-static` / `ffprobe-static` npm
  packages; no system install required.
- **Real YouTube download** (`VIDEO_SOURCE_PROVIDER=ytdlp`) — requires the
  [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) binary on `PATH`. The app does not
  bypass authentication, DRM, or age/region restrictions; private, age-restricted
  and unavailable videos surface as clear user-facing errors.
- **Real transcription** (`TRANSCRIPTION_PROVIDER=openai`) — an OpenAI Whisper
  (or compatible) API key.
- **Real AI clip detection** (`CLIP_PROVIDER=anthropic`) — an Anthropic API key.

---

## Using PostgreSQL

The default runnable configuration uses **SQLite** so the app works without
Docker or a running database. To use PostgreSQL:

1. In `prisma/schema.prisma`, change `datasource.provider` from `"sqlite"` to
   `"postgresql"`.
2. Set `DATABASE_URL` to a postgres connection string in `.env`.
3. Run `npm run db:push`.

The schema is provider-agnostic (JSON payloads are stored as text), so this is a
one-line change.

---

## Project structure

```
prisma/schema.prisma        Project / SourceVideo / Transcript /
                            ClipSuggestion / GeneratedClip / Job models

src/
  app/
    page.tsx                landing page (renders the client app)
    layout.tsx, globals.css dark, creator-tool UI shell
    api/
      projects/             create project + fetch detail
      projects/[id]/clips/  generate clips from suggestions
      clips/[id]/           get / edit (PATCH) a clip
      clips/[id]/render/    re-render a clip
      jobs/[id]/            job status polling
      media/[...path]/      serve/stream stored media (Range + download)
  components/               React UI (URL form, progress, cards, editor)
  lib/
    config.ts               typed env configuration
    errors.ts, logger.ts    typed errors + structured logging
    db.ts                   Prisma client
    youtube/                VideoSourceProvider: url parsing, mock, yt-dlp
    transcription/          TranscriptionProvider: mock, OpenAI Whisper
    ai/                     ClipSelectionProvider: heuristic mock, Claude
    video/                  ffmpeg exec, ffprobe metadata, framing strategy,
                            caption/ASS generation, render pipeline
    storage/                StorageProvider: local filesystem
    jobs/                   in-process job manager (analysis + render)
  server/
    services/               orchestration used by API routes
    http.ts                 JSON success/error envelope
  types/                    shared domain types
  utils/                    formatting, filename sanitisation, path safety
```

### Key abstractions (all swappable via env)

- `VideoSourceProvider` — `getVideo(url)` (mock / yt-dlp)
- `TranscriptionProvider` — `transcribe(videoPath)` (mock / OpenAI)
- `ClipSelectionProvider` — `findClips(transcript, duration, opts)` (mock / Claude)
- `VideoFramingStrategy` — `getCrop(video, segment)` (`CenterCropStrategy`; a
  future face/subject tracker implements the same interface)
- `StorageProvider` — `save/get/delete/...` (local; S3-ready)

### Caption styles

`classic`, `bold`, `minimal`, `highlight` — rendered as an ASS subtitle track and
burned in by FFmpeg, sized for the 1080×1920 output and readable on mobile.

---

## Security notes

- All user input is validated (Zod on API routes, URL parser, timestamp checks).
- FFmpeg/ffprobe/yt-dlp are invoked with `execFile` and argument arrays — never a
  shell string — so untrusted input can't be interpreted as a command.
- Filenames are sanitised; media access is confined to the `projects/` storage
  subtree with path-traversal rejection.
- API keys stay server-side.

---

## Rendering pipeline

```
Source video → trim (-ss/-t) → crop/reframe to 9:16 → scale 1080×1920
  → burn captions + hook/title (ASS) → H.264/AAC → +faststart MP4
```

The pipeline is a single, self-contained FFmpeg invocation
(`src/lib/video/render.ts`) and the job manager (`src/lib/jobs/manager.ts`) is
deliberately thin, so both can be lifted into a dedicated background worker with
minimal change.

---

## Limitations

- **Jobs run in-process** (same Node process as the web server) — fine for local
  dev and single-node use; move to a real queue/worker for production scale.
- **Center-crop only** for reframing — no face/subject tracking yet (the
  `VideoFramingStrategy` interface is the extension point).
- **SQLite by default** for zero-setup local runs; see "Using PostgreSQL".
- **Local filesystem storage** only (the `StorageProvider` interface is ready for
  an S3 implementation).
- Media is served by buffering the file in the route handler (with Range
  support) — adequate for the MVP; stream from object storage / a CDN in
  production.
- No authentication, billing, or analytics (intentionally out of scope).
