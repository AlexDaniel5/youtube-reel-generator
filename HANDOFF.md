# Project handoff — YouTube → vertical Reels generator

A handoff for a fresh Claude session (or developer) picking this up cold. Read
this first, then `README.md` for user-facing docs. Everything here reflects the
**actual working state** as last verified.

---

## 1. What this is

A Next.js (App Router) + TypeScript web app that turns a **YouTube URL** into
**vertical 9:16 short-form clips** with burned-in captions.

User flow: paste URL → app downloads the video → transcribes it → an AI/heuristic
picks the best 10–30s moments → user selects clips → FFmpeg renders vertical MP4s
with captions + a title/hook → preview, edit (start/end/title/caption style),
re-render, download.

**Status: fully working end-to-end and verified.** Real YouTube videos download,
real captions come from YouTube subtitles, clips render as 1080×1920 H.264/AAC
MP4s in the letterbox layout. Typecheck, lint, tests, and production build all
pass.

---

## 2. Tech stack

- **Next.js 15** (App Router), **React 19**, **TypeScript** (strict), **Tailwind v3**.
- **Prisma** ORM. **Dev DB = SQLite** (`prisma/dev.db`) for zero-setup; schema is
  Postgres-ready (one-line `provider` switch — see §7).
- **FFmpeg/ffprobe** via the npm packages `ffmpeg-static` / `ffprobe-static`
  (no system install needed).
- **yt-dlp** standalone binary at `./bin/yt-dlp` (gitignored; fetch with
  `npm run setup:ytdlp`).
- **@anthropic-ai/sdk** for optional Claude-powered clip detection.
- **Zod** for API input validation. **Vitest** for unit tests.
- UI: hand-written shadcn-style primitives + a custom "editing-suite" visual
  identity (warm paper, ink, single vermilion accent, monospace for
  timecodes/labels). No gradients/glass/glow (deliberately de-AI'd — see §9).

---

## 3. How to run

```bash
npm install                 # also runs prisma generate (postinstall)
npm run setup:ytdlp         # downloads ./bin/yt-dlp (needs network; Linux build)
cp .env.example .env        # then edit as needed (see §6)
npm run db:push             # creates SQLite dev.db from the schema
npm run build && npm run start   # prod on :3000   (or: npm run dev)
```

Other scripts: `npm run typecheck`, `npm run lint`, `npm run test`.

**Default `.env` already uses real downloads** (`VIDEO_SOURCE_PROVIDER=ytdlp`).
On a brand-new machine you must run `npm run setup:ytdlp` first or it will error.

---

## 4. Architecture / where things live

```
prisma/schema.prisma     Project, SourceVideo, Transcript, ClipSuggestion,
                         GeneratedClip, Job

src/
  app/
    page.tsx             renders <ReelsApp/>
    layout.tsx, globals.css   UI shell + design tokens (CSS vars)
    api/
      projects/route.ts            POST create project (kicks off analysis)
      projects/[id]/route.ts       GET project detail (UI polls this)
      projects/[id]/clips/route.ts POST generate clips from suggestions
      clips/[id]/route.ts          GET clip, PATCH edit+re-render
      clips/[id]/render/route.ts   POST re-render an existing clip
      jobs/[id]/route.ts           GET job status
      media/[...path]/route.ts     serve/stream stored media (Range + download)
  components/            ReelsApp (orchestrator, polling), SuggestionCard
                         (list row), GeneratedClipCard (contact-sheet item),
                         JobProgress, CaptionStylePicker, UrlForm, api.ts, ui/*
  lib/
    config.ts            ALL env access is centralised here (typed)
    errors.ts            typed AppError + user-safe messages
    logger.ts, db.ts
    youtube/             VideoSourceProvider: url.ts (parse/validate),
                         mock-provider.ts, ytdlp-provider.ts, index.ts (factory)
    transcription/       TranscriptionProvider: mock, openai (Whisper),
                         vtt.ts (parses YouTube captions → Transcript)
    ai/                  ClipSelectionProvider: mock (heuristic), anthropic
    video/               ffmpeg.ts (safe execFile, static binaries),
                         metadata.ts (ffprobe), framing.ts (crop + fit layout),
                         captions.ts (cue building + ASS generation), render.ts
    storage/             StorageProvider: local filesystem (S3-ready interface)
    jobs/manager.ts      in-process job manager: runs analysis + render,
                         updates DB; UI polls. Designed to lift into a worker.
  server/services/       project-service.ts, clip-service.ts (orchestration)
  types/index.ts         shared domain types (Transcript, CaptionStyle, etc.)
  utils/                 format, cn, fs (sanitizeFilename, resolveWithin)
```

**Everything is a swappable provider chosen in `config.ts` via env.** To add a
real implementation, implement the interface and wire it in the provider's
`index.ts` factory. Business logic stays out of React components.

---

## 5. The three big pipeline stages (and their real/mock providers)

1. **Video source** (`VIDEO_SOURCE_PROVIDER`)
   - `ytdlp` (**default, real**): downloads via `./bin/yt-dlp`, capped to 1080p
     H.264/AAC mp4, merges with ffmpeg-static. Also fetches English subtitles
     (best-effort, separate call) as WebVTT.
   - `mock`: generates a synthetic color-bar test video with FFmpeg (the
     "rainbow screen"). Offline fallback only — if you see color bars, you're in
     mock mode or looking at an old project.

2. **Transcription** — the manager **prefers the YouTube subtitles** the video
   source returned (parsed by `lib/transcription/vtt.ts`, handles auto-caption
   inline word timings + rolling-duplicate lines). Only if there are no subs does
   it fall back to `TRANSCRIPTION_PROVIDER` (`mock` default, or `openai` Whisper
   with a key). **Caveat:** a video with NO captions (e.g. animation/music) gets
   the mock placeholder transcript → captions won't match the footage. Real
   talking-head videos have captions and work great. For guaranteed captions on
   any video, set `TRANSCRIPTION_PROVIDER=openai` + key.

3. **Clip detection** (`CLIP_PROVIDER`) — `mock` (heuristic scoring of
   hooks/questions/numbers, 10–30s windows) or `anthropic` (Claude, needs
   `AI_API_KEY`; model `claude-opus-4-8`). Returns start/end/title/hook/score/
   reason.

---

## 6. Environment variables (see `.env.example`)

| Var | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | SQLite dev; Postgres string for prod (+ schema switch) |
| `VIDEO_SOURCE_PROVIDER` | `ytdlp` | `ytdlp` \| `mock` |
| `YTDLP_PATH` | `./bin/yt-dlp` | path to the binary |
| `YTDLP_COOKIES_FILE` | (set on this machine) | Netscape cookies.txt for signed-in access |
| `YTDLP_COOKIES_FROM_BROWSER` | "" | alt to cookies file, e.g. `chrome`/`firefox` |
| `YTDLP_PLAYER_CLIENT` | "" | override; provider auto-uses `default` when cookies set |
| `TRANSCRIPTION_PROVIDER` | `mock` | `mock` \| `openai` |
| `TRANSCRIPTION_API_KEY` / `_BASE_URL` / `_MODEL` | — | Whisper-compatible |
| `CLIP_PROVIDER` | `mock` | `mock` \| `anthropic` |
| `AI_API_KEY` / `AI_MODEL` | — / `claude-opus-4-8` | Claude clip detection |
| `STORAGE_PROVIDER` / `STORAGE_PATH` | `local` / `./storage` | |
| `CLIP_MIN_SECONDS` / `CLIP_MAX_SECONDS` | `10` / `30` | clip length range |
| `MAX_CLIP_SUGGESTIONS` | `8` | |
| `VIDEO_FRAMING` | `fit` | `fit` (letterbox) \| `crop` (zoom) — see §8 |
| `VIDEO_BAND_COLOR` | `white` | band color for fit layout |

`.env` is **gitignored**. It currently contains a machine-specific
`YTDLP_COOKIES_FILE` path (under `/mnt/c/...`, this is a WSL setup). Cookies are
NOT committed and must be re-exported per machine.

---

## 7. Database

Default SQLite so it runs with zero setup. To use **PostgreSQL**:
1. `prisma/schema.prisma`: change `datasource.provider` `"sqlite"` → `"postgresql"`.
2. Set `DATABASE_URL` to a postgres string.
3. `npm run db:push`.
Schema is provider-agnostic (JSON stored as TEXT), so it's a one-line change.

---

## 8. Rendering & the two framing layouts (IMPORTANT — recent change)

Rendering is one self-contained FFmpeg call in `lib/video/render.ts`.

- **`fit` (DEFAULT, letterbox)** — what the user explicitly wanted: the WHOLE
  horizontal frame is scaled down and centered on a solid (white) canvas, with
  the **title on the top band** and **timed captions on the bottom band** (dark
  text so it reads on white). Geometry in `framing.ts::computeFitLayout`; band
  centres computed in `render.ts`; ASS positioning via `\pos`+`\an5` in
  `captions.ts::renderFit`.
- **`crop`** — the original center-crop/zoom (light captions over the video via
  `CenterCropStrategy` + `renderCrop`). Available via `VIDEO_FRAMING=crop`.

**Caption styles** (`classic`/`bold`/`minimal`/`highlight`) have separate preset
tables per layout in `captions.ts` (`STYLE_PRESETS` for crop = light+outline;
`FIT_STYLE_PRESETS` for fit = dark; `highlight` = white text on a vermilion box).
Captions are generated as an **ASS** subtitle file and burned in with the
`subtitles` filter. Output: 1080×1920, H.264 high profile, AAC, `+faststart`.

Framing is an interface (`VideoFramingStrategy`) so a future face/subject tracker
can replace center-crop without touching anything else.

---

## 9. UI / design identity (don't regress this)

The UI was deliberately redesigned to NOT look AI-generated. Identity:
"editing-suite / contact sheet" — warm paper bg, near-black ink, ONE vermilion
accent, **monospace for timecodes/indices/labels**, numbered section rules, an
asymmetric left-aligned masthead, suggestions as a **dividered list** (not a card
grid), clips as a flat **contact sheet**, a 3px vermilion "leader-tape" strip at
the very top. Tokens are CSS vars in `globals.css`. **Avoid** reintroducing
gradients, glassmorphism, glow, pill buttons, centered-everything, oversized bold
headings — those were the AI tells we removed.

---

## 10. yt-dlp, cookies & age-restricted videos (hard-won knowledge)

- The binary is standalone at `./bin/yt-dlp` (v2026.08.19 when set up). Fetch via
  `npm run setup:ytdlp`.
- Format string: `bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b/best`, sorted to
  prefer H.264/mp4/AAC, merged with `--ffmpeg-location <ffmpeg-static>`,
  `--max-filesize 2000M`. File is located via yt-dlp's reported `filepath` with a
  "largest non-sidecar file" fallback (do NOT guess the extension — that caused a
  "no file produced" bug).
- **Subtitles are fetched in a SEPARATE best-effort call** (`--skip-download
  --write-subs --write-auto-subs --sub-langs en,en-orig --convert-subs vtt`).
  Reason: requesting many English variants in the main call caused a 429 on one
  language to abort the whole download.
- **Age-restricted / sign-in content:** we do NOT bypass the age gate. Instead the
  user authenticates as their own account via cookies (`YTDLP_COOKIES_FILE` or
  `YTDLP_COOKIES_FROM_BROWSER`). This is a deliberate policy line — do not add
  age-bypass player clients like `tv_embedded`.
- **Cookie gotcha (fixed):** cookies made YouTube return "The page needs to be
  reloaded" and broke ALL downloads. Fix: when cookies are set, the provider pins
  `--extractor-args youtube:player_client=default` (overridable via
  `YTDLP_PLAYER_CLIENT`). Verified working.

---

## 11. Environment gotchas (this dev box)

- **`pkill` destabilizes the shell here** (it killed the tool shell). To stop a
  server, kill by port instead: `fuser 3000/tcp` → `kill <pid>` (guarding `$$`).
- Network **is** available; `curl`/github reachable. No `pip`/`python -m pip`
  (that's why yt-dlp is the standalone binary, not a pip install).
- Multiple stale `next start` servers accumulated during testing on ports
  3000–3400. If a page shows old behavior, you're likely hitting a stale server
  or an old DB project — restart cleanly and create a NEW project.
- `rm -rf .next` requires a rebuild before `npm run start` (else "no production
  build" error).
- Use `/tmp/claude-.../scratchpad` for temp files, not the repo.
- To verify a rendered clip, extract a frame with ffmpeg-static and view the PNG —
  real footage vs. the mock rainbow pattern is the quick sanity check.

---

## 12. Security posture (keep it)

FFmpeg/ffprobe/yt-dlp are invoked with `execFile` + argument arrays (never a
shell string). URLs validated, timestamps validated, filenames sanitised, media
access confined to the `projects/` storage subtree (path-traversal rejected via
`resolveWithin`). API keys/cookies stay server-side and are gitignored. No
auth/billing/analytics (intentionally out of scope).

---

## 13. Git state

Repo was `git init`-ed on branch `main`; **72 files staged, not yet committed**
(the user was going to commit + push from their side). Verified NOT staged:
`.env`, cookies, `bin/`, `node_modules`, `.next`, `storage/` (except
`.gitkeep`), `*.db`. `.gitignore` covers all of these plus `*cookies*.txt`.
A prepared initial-commit message was provided in chat. No remote configured yet.

---

## 14. Known limitations / possible next steps

- Jobs run **in-process** (fine for single-node/dev). Move to a real queue/worker
  for scale — the pipeline is already isolated for this.
- Framing is center-crop or letterbox only; no face/subject tracking yet
  (interface is ready).
- Captions depend on the video having captions unless Whisper is configured
  (see §5 caveat).
- Media is buffered in the route handler (with Range support); stream from object
  storage/CDN for production.
- Local filesystem storage only (S3 provider would implement `StorageProvider`).
- No tests for the FFmpeg render itself (unit tests cover url parsing, framing
  math, caption/VTT generation). Verified manually by rendering + frame extract.
