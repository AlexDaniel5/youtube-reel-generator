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
npm run test        # vitest unit tests
npm run test:e2e    # Playwright end-to-end tests (see Testing)
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

e2e/                        Playwright end-to-end tests
  pages/                    page objects (HomePage, SuggestionRow, ClipCard)
  support/                  env, db/storage reset, fixtures, API + media helpers
  api/                      HTTP-contract tests (jobs, media Range, traversal)
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

## Testing

The suite has two layers. They are kept separate on purpose.

| Layer | Tool | Location | What it covers |
|---|---|---|---|
| Unit | Vitest | `src/**/*.test.ts` | Pure logic: URL parsing, framing math, caption/VTT generation, clip narrative, storage path safety, the mock provider |
| End-to-end | Playwright | `e2e/**/*.spec.ts` | Real user flows in Chromium against a production build, plus the HTTP contract of the API |

Vitest only collects `src/**/*.test.ts` and explicitly excludes `e2e/`.
Playwright only looks in `e2e/`, so neither runner picks up the other's files.

### Running the tests

```bash
npm run test                      # unit tests
npx playwright install chromium   # first time only (Linux/WSL also: sudo npx playwright install-deps chromium)
npm run test:e2e                  # full e2e suite, headless
npm run test:e2e:ui               # Playwright UI mode (watch, time-travel debugging)
npm run test:e2e:report           # open the last HTML report
```

`npm run test:e2e` needs no setup beyond installing the browser. Playwright's
`webServer` runs these steps:

1. Reset the test database and storage.
2. Build the app.
3. Serve the app on port 3100.

It never attaches to an already-running dev server. That server would be using
`dev.db`.

### Why the e2e suite is deterministic

The suite always runs the offline **mock providers**. It never reads your
`.env` for this. Every variable the app reads is pinned in
`e2e/support/env.ts`.

- **Video:** the mock generates a real H.264/AAC test-pattern video with FFmpeg.
  Its length comes from a hash of the video ID. The test IDs in
  `e2e/support/urls.ts` all hash to ~70s, so analysis takes seconds.
- **Transcript and clip suggestions:** the transcript is synthetic and the clip
  heuristic is deterministic, so the same URL always yields the same
  suggestions.
- **Error paths:** the test-only `MOCK_PRIVATE_VIDEO_IDS` setting makes chosen IDs
  fail exactly as a private YouTube video does. It is empty by default.
- **Network and keys:** no network access and no API keys are needed.

### Isolation

| Resource | Development | E2E |
|---|---|---|
| Database | `prisma/dev.db` | `prisma/e2e.db`, deleted and recreated from the schema before each run, removed afterwards |
| Media storage | `./storage` | `./.e2e-storage`, wiped before each run, removed afterwards |
| Server | `:3000` (dev) | `:3100` (production build) |

### What the e2e suite covers

- **Happy path:** submit a URL and watch job progress, then check:
  - the suggestions list
  - a clip rendered with a chosen caption style
  - the in-browser preview: metadata loads and the duration matches
  - the downloaded MP4: non-empty, has an `ftyp` header, and its duration checked with ffprobe
- **Editing:** change start/end, title and caption style, re-render, then
  reload. The UI, the API and the re-rendered file (checked with ffprobe) all
  reflect the edit. An end time before the start is rejected without a
  request being sent.
- **Input validation:** these inputs each show the exact user-facing message
  and create no project, which is checked against the database:
  - malformed URLs
  - non-http schemes
  - YouTube URLs with no valid video ID
  - non-YouTube hosts

  Empty and whitespace-only input never sends a request.
- **Error handling:** a private video shows a clear error. The error survives a
  reload, and "Start over" resets the form.
- **API** (Playwright `request` fixture):
  - Job polling: stages only move forward and progress never goes backwards.
  - Media Range support: 200, 206 for bounded and open-ended ranges, 416 past
    the end, and the sanitised `Content-Disposition` header.
  - Path traversal: attempts using encoded `/`, `\` and double-encoded
    separators are rejected with a 4xx and leak no file contents.

### Conventions

- **Selectors:** elements are selected by role or label first. A small set of
  `data-testid`s is used only where an element has no accessible name: the
  error banner, job progress, suggestion rows and clip card parts. Page objects
  in `e2e/pages` own all selectors.
- **No fixed sleeps:** tests use web-first assertions and `expect.poll` on real
  state (job status, clip status, video `readyState`).
- **Timeouts:** the default is 30s per test and 10s per assertion. Groups that
  render video raise their own limit with `test.setTimeout`. There is no single
  large global timeout.
- **Serial runs:** jobs run in the server process and FFmpeg is CPU-bound, so
  the suite uses one worker. Every test creates its own project, so order
  doesn't matter.
- **Failure artifacts:** traces, screenshots and video are kept only for failed
  tests.

### CI

`.github/workflows/ci.yml` runs on every push and pull request, in this order:

1. typecheck
2. lint
3. Vitest
4. Playwright (Chromium)

If the run fails, the HTML report and `test-results/` (traces, screenshots,
videos) are uploaded as the `playwright-report` artifact. Open a trace with
`npx playwright show-trace <trace.zip>` or at trace.playwright.dev.

### Not covered by automated tests

- **Real providers:** yt-dlp, Whisper and Claude need network access and keys,
  and their results are not deterministic.
- **How burned-in captions look:** the tests check the container and duration,
  not individual frames.
- **Other browsers:** Firefox and WebKit are not run yet. The suite is
  Chromium-only for now.

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
