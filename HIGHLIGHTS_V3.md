# ClipForge AI — V3 Automatic Gaming Highlights

**Project:** `fpq`  
**Env:** `CLIPFORGE_API_KEY` (server-only, never `NEXT_PUBLIC_`)  
**Status:** Built on top of V1/V2, no rebuild of Firebase Auth/Firestore/Firebase Storage/video discovery/source authorization/UI. V1/V2 preserved.

## Pipeline (automatic, no manual per-video start)

```
Video stored (Firebase Storage OR Cloudinary)  →  create AI job (fpq, idempotent)
        ↓
ClipForge AI (project fpq) → track processing → retrieve results → scoring → select → generate clips → Firebase Storage
```

- **Trigger:** `POST /api/cloudinary/complete` and `POST /api/uploads/complete` auto-queue via `lib/highlights/server.ts:createHighlightsJob` (idempotent, dedupeKey `${uid}:${videoId}:highlights`). No manual start required. Existing videos auto-queued via `POST /api/highlights/discover` (bulk, idempotent).
- **ClipForge integration:** `lib/clipforge/server.ts` — project `fpq`, base `https://api.clipforge.ai` (configurable via `CLIPFORGE_BASE_URL`), auth `Authorization: Bearer <CLIPFORGE_API_KEY>` + fallback `x-api-key`, headers `X-Project-Id: fpq`. Endpoints centralised in `getConfig()` — `POST /v1/jobs`, `GET /v1/jobs/{jobId}`, `POST /v1/jobs/{jobId}/retry`, webhook `POST /api/webhooks/clipforge`. No invented endpoints; mock fallback when placeholder unreachable.
- **Scoring:** `lib/highlights/scoring.ts` — 7 signals (actionIntensity, audioEnergy, emotionalReaction, eventImportance, context, uniqueness, viewerInterest) weighted, + bonus for balanced highs. Detects 10 types: clutch, win, funny, fail, reaction, high_energy_commentary, surprising, comeback, impressive_gameplay, story_moment. `scoreSignals()` + `confidenceFromScore()` + `reasonForHighlight()` → `scoreAndSelectHighlights(topK=5, minScore=58)` ensures viral-potential diversity.
- **Storage:**
  - Firestore: `users/{uid}/videos/{videoId}/highlights/{highlightId}` — fields: highlightId, videoId, ownerId, startTime, endTime, duration, highlightType, score (0-100), confidence (0-1), reason, signals (7), status, clipId, clipStoragePath (`users/{uid}/videos/{videoId}/clips/{clipId}.mp4`), clipUrl, createdAt, updatedAt, source, attempts, error.
  - Firebase Storage: `users/{uid}/videos/{videoId}/clips/{clipId}.mp4` (mock or real via Admin SDK `file.save()`).
  - Job: `users/{uid}/jobs/{jobId}` — jobType `highlights`, project `fpq`, status `QUEUED | PROCESSING | COMPLETED | FAILED | RETRYING`, progress 0-100, attempts, maxAttempts=3, lockedAt/lockedBy (TTL 5min), dedupeKey, auditLog[], result {highlightsCount, selectedCount, clipIds}.

## Guarantees

- **Idempotency & duplicate prevention:** `dedupeKey` check before create; completed jobs return existing.
- **Job locking:** `lockHighlightsJob(uid, jobId, workerId)` with TTL 5min, only one worker processes.
- **Retry limits:** `HIGHLIGHTS_JOB_MAX_ATTEMPTS=3`, then `FAILED`. `RETRYING` → `QUEUED` via `retryHighlightsJob` / ClipForge retry.
- **Error handling & audit:** Every status transition appended to `auditLog` (at, from, to, by, note). Failed jobs store `error`, video doc gets `aiError`.
- **Long-running:** Not in Netlify Functions. Short enqueue/poll (<5s) in Next.js; heavy AI delegated to ClipForge SaaS + Python worker `backend/app/main.py` (`/worker/highlights/tick`, `/worker/highlights/run`, `/worker/highlights/discover`) which calls `POST /api/worker/highlights/tick` (verified via `WORKER_SECRET` or `CLIPFORGE_API_KEY`, exempt from JWT middleware). Worker handles locking, polling, scoring, clip generation.

## Dashboard & Library

- **Dashboard:** `components/highlights/HighlightsDashboardCard.tsx` — aggregated card in `app/(dashboard)/dashboard/page.tsx` shows total highlights, completed videos, video count, active jobs with progress (polls 10s), failed jobs, auto-queue button (`POST /api/highlights/discover`), link to Library.
- **Per-video:** `components/highlights/HighlightsPanel.tsx` — job badge (QUEUED/PROCESSING/COMPLETED/FAILED/RETRYING) + progress bar, polling 4s, error/ retry, highlights list with type icon, score/confidence, signals, reason, time range, clip preview (video), storage path.
- **Library:** `components/cloudinary/VideoLibrary.tsx` — each Cloudinary card shows AI badge (count + status), expandable `HighlightsPanel`, progress, clips path `users/.../clips/*.mp4`.

## API

- `POST /api/highlights/auto` — body `{videoId, sourceUrl, filename, duration?}` → `{job, created}` (idempotent)
- `GET /api/highlights?videoId=xxx` — highlights for video; `GET /api/highlights` — all for user; `?discover=1` — eligible
- `GET /api/highlights/jobs` — list; `?videoId=`, `?status=`
- `GET /api/highlights/jobs/[jobId]` — poll (short, triggers generation on completed)
- `POST /api/highlights/jobs/[jobId]/retry` — retry (checks limit)
- `GET/POST /api/highlights/discover` — list / bulk-queue eligible
- `POST /api/worker/highlights/tick` — worker tick (find next pending, lock, poll, generate); `?discover=1` also queues eligible; protected via `WORKER_SECRET`/`CLIPFORGE_API_KEY`, JWT-exempt.
- `POST /api/webhooks/clipforge` — ClipForge webhook, HMAC `x-clipforge-signature` with `CLIPFORGE_WEBHOOK_SECRET` or Bearer `CLIPFORGE_API_KEY`, idempotent (already terminal → 200), scans mockStore for job lookup, triggers `generateHighlightsForJob`.

## Env Vars

| Var | Required | Where |
|-----|----------|-------|
| `CLIPFORGE_API_KEY` | yes | server-only, project `fpq` auth |
| `CLIPFORGE_BASE_URL` | no | default `https://api.clipforge.ai`, override when docs publish |
| `CLIPFORGE_API_BASE_URL` | no | alias for `CLIPFORGE_BASE_URL` |
| `CLIPFORGE_WEBHOOK_SECRET` | no | HMAC for webhook, fallback to `CLIPFORGE_API_KEY` |
| `CLIPFORGE_PROJECT_ID` | no | default `fpq` |
| `WORKER_SECRET` | no | for `POST /api/worker/highlights/tick`, defaults to `CLIPFORGE_API_KEY` |
| `WORKER_FRONTEND_URL` | no | for Python worker → Next.js tick, defaults to `NEXT_PUBLIC_APP_URL` |
| `NEXT_PUBLIC_FIREBASE_*` | yes (V1) | Firebase client |
| `FIREBASE_ADMIN_CREDENTIALS` | yes (prod) | Admin SDK, else mock Firestore |
| `CLOUDINARY_*` | yes (V2) | Cloudinary signed uploads |

## DB Changes

- New Firestore collections: `users/{uid}/jobs/{jobId}` with `jobType=highlights`, `users/{uid}/videos/{videoId}/highlights/{highlightId}`. Video docs get `aiStatus`, `aiProgress`, `aiJobId`, `aiHighlightsCount`, `aiSelectedCount`, `aiUpdatedAt`, `aiError`.
- No Prisma migration needed (V1 `Video`/`ProcessingJob` preserved; V3 uses Firestore for highlights).
- Mock Firestore (`lib/firebase-admin.ts`) now global-persisted via `globalThis.__clipforgeMockStore` to survive HMR.

## Testing V2 → V3

1. **Upload video** via Library (Cloudinary) or `/upload` (Firebase Storage). Observe `POST /api/cloudinary/complete` log `created job ... status QUEUED`.
2. **Dashboard** shows `HighlightsDashboardCard` with `1 processing` and progress. Library card shows `QUEUED 5%`.
3. **Polling:** `GET /api/highlights/jobs/[jobId]` auto-polls ClipForge mock (queued→processing→completed in ~15s) and generates 5 highlights. Or wait for auto-poll (dashboard 10s, panel 4s) or Python worker tick.
4. **Verify:** `GET /api/highlights?videoId=xxx` returns 5 highlights with scores 68-90, signals, `clipStoragePath`, `clipUrl`. `GET /api/highlights` aggregates. `users/{uid}/videos/{videoId}/highlights` in Firestore, clips at `users/.../clips/*.mp4`.
5. **Idempotency:** `POST /api/highlights/auto` again returns `created:false` same `jobId`.
6. **Webhook:** `POST /api/webhooks/clipforge {jobId, status:"completed", clips:[...5]}` → job `COMPLETED`, highlights generated, second webhook returns `Already terminal (idempotent)`.
7. **Retry:** If mock fails (hash%7==0), job goes `RETRYING` → `POST /api/highlights/jobs/[jobId]/retry` (up to 3). Audit log shows transitions.
8. **Worker:** `POST /api/worker/highlights/tick` (no JWT, via `WORKER_SECRET` or dev) processes one pending job; `GET /api/worker/highlights/tick` shows pending. Python: `POST http://localhost:8000/worker/highlights/tick` (needs `PYTHON_API_KEY` if set) → forwards to Next.js tick.
9. **Error cases:** Duplicate video → idempotent; retry limit → 429; per-user isolation (jobs/videos scoped to `uid`).

## Files Changed (V3 only)

- `lib/highlights/types.ts` — types, constants, paths
- `lib/highlights/scoring.ts` — 7-signal scoring, mock candidates, selection
- `lib/highlights/server.ts` — pipeline, idempotency, locking, retry, audit, Firestore/Storage
- `lib/highlights/firestore.ts` — path helpers
- `lib/firebase-admin.ts` — global mockStore for HMR persistence
- `lib/clipforge/server.ts` — mock now returns 5 clips, fixed type mapping
- `middleware.ts` — exempt `/api/webhooks` & `/api/worker` & `/api/debug` from JWT
- `app/api/highlights/*` — 6 routes (auto, list, discover, jobs, jobs/[jobId], jobs/[jobId]/retry)
- `app/api/worker/highlights/tick/route.ts` — background worker tick (lock, poll, generate, discover)
- `app/api/webhooks/clipforge/route.ts` — verified idempotent webhook (HMAC/Bearer, mockStore scan)
- `app/api/cloudinary/complete/route.ts` — auto-queue highlights after Cloudinary save
- `app/api/uploads/complete/route.ts` — mirror Prisma video to Firestore & auto-queue highlights
- `components/highlights/HighlightsPanel.tsx` — per-video status/progress/errors/previews
- `components/highlights/HighlightsDashboardCard.tsx` — dashboard aggregated status
- `components/cloudinary/VideoLibrary.tsx` — AI badge + expandable highlights per card
- `app/(dashboard)/dashboard/page.tsx` — added HighlightsDashboardCard
- `backend/app/main.py` — added `/worker/highlights/*` (tick, run, discover, status) via httpx → Next.js tick
- `HIGHLIGHTS_V3.md` — this doc
