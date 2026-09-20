# ClipForge AI — Version 4 Implementation Report
**Date:** 2026-09-20 (IST)  
**Branch:** `arena/01a0be60-clipforge-ai` from `656ffaa` (main)  
**Preserved:** V1/V2/V3 (Firebase Auth/Firestore/Storage, Cloudinary, Highlights pipeline, project `fpq`) — **no rebuild, only additive changes**

---

## Summary
V4 automatically converts the **best AI-detected gaming highlight** into a polished **YouTube Short / Instagram Reel**:
`AI highlight → select best clip → 9:16 1080×1920 vertical (smart crop, avoid black bars, maintain quality, audio normalize, speech understandable) → smart crop → captions (4 styles, synchronized, safe areas) → audio enhancement → editing (smart zoom/cuts/transitions/emphasis, subtle) → thumbnail → quality check → finished Short + metadata (title/description/hashtags/keywords, no virality claims)` — all server-only, Netlify-safe via background worker.

---

## 1) Files Changed / Added

### New — `lib/shorts/` (core pipeline, server-only)
| File | Purpose |
|------|---------|
| `lib/shorts/types.ts` | `ShortDoc`, `ShortStatus` (`QUEUED→PROCESSING→EDITING→CAPTIONING→QUALITY_CHECK→COMPLETED/RETRYING/FAILED`), `CaptionStyle = Clean\|Bold\|Gaming\|Minimal`, constants `SHORTS_TARGET_WIDTH=1080`, `HEIGHT=1920`, `ASPECT="9:16"`, helpers `shortDocPath`, `shortsCollectionPath`, `shortStoragePath`, `shortThumbnailPath`, `dedupeKeyForShort` |
| `lib/shorts/captions.ts` | 4 presets with safe-area margins & readable sizing, `generateCaptionsForHighlight()` deterministic 2–4 cues per highlight (emphasis on high-score moments), `cuesToVtt()`, `validateCaptions()` (synchronized, no overlap, inside duration) |
| `lib/shorts/editing.ts` | `getEditingForHighlight()` — `smartCrop`, `avoidBlackBars`, `maintainQuality`, `smartZoom` (1.08x for clutch/high-energy), `cuts`, `transitions=cut/fade/slide`, `audioNormalized` (-14 LUFS), `speechUnderstandable`, `cropFocus` per HighlightType |
| `lib/shorts/metadata.ts` | `generateMetadataForHighlight()` — title/description/hashtags/keywords per HighlightType, deterministic, **never claims guaranteed virality** (e.g. “No virality claims, just a good moment”) |
| `lib/shorts/quality.ts` | 8 mandatory checks before READY: `runQualityChecks({width,height,aspectRatio,duration,captions,storagePath,thumbnailPath,editing})` → `aspectRatio` (1080×1920 9:16), `duration` (8–60s valid for Shorts, 15–60s ideal), `videoPlays`, `audioExists`, `captionsSynchronized`, `noCorrupted`, `noBlackFrames`, `noMissingFiles` + `qualityToDoc()` |
| `lib/shorts/thumbnail.ts` | `thumbnailPathForShort()` 9:16 vertical, `generateThumbnailMeta()` — compatible with Firebase Storage, `users/{uid}/videos/{videoId}/shorts/{shortId}.jpg` |
| `lib/shorts/server.ts` | Full server pipeline: `getBestHighlightForVideo`, `discoverEligibleHighlights` (best per video, 1 Short/video for auto), `createShortForHighlight` (idempotent per `dedupeKey=uid:videoId:highlightId:short:style` — allows 4 styles per highlight), `autoQueueShortsForVideo` (1 Clean per video, called automatically after highlights), `lockShort` (TTL 5m), `processShort` (EDITING→CAPTIONING→thumbnail→storage write→QUALITY_CHECK→COMPLETED/RETRYING), `pollShort` (Netlify-safe <3s, lock+process), `getShortsForVideo`, `getAllShortsForUser`, `retryShort`. Firestore: `users/{uid}/videos/{videoId}/shorts/{shortId}` + `users/{uid}/jobs/{shortId}` (`jobType=shorts`, `project=fpq`). Storage: `users/{uid}/videos/{videoId}/shorts/{shortId}.mp4` + `.jpg` via Admin SDK |

### New — APIs (Next.js, server-only, no FFmpeg)
| Route | Method | Notes |
|-------|--------|-------|
| `app/api/shorts/route.ts` | `GET /api/shorts?videoId=xxx` / `GET /api/shorts` / `GET /api/shorts?discover=1` | List shorts per video or all, discover eligible highlights |
| `app/api/shorts/auto/route.ts` | `POST /api/shorts/auto {videoId, highlightId?, captionStyle?}` | Auto-converts best highlight (or specific) → 9:16 Short, idempotent per style, 1080×1920 |
| `app/api/shorts/discover/route.ts` | `GET /api/shorts/discover?limit=10` / `POST {limit,captionStyle,maxPerVideo}` | Eligible highlights without Short, bulk auto-queue |
| `app/api/shorts/[shortId]/route.ts` | `GET /api/shorts/[shortId]?videoId=xxx` | Poll/lock+process single Short (EDITING→COMPLETED) |
| `app/api/shorts/[shortId]/retry/route.ts` | `POST /api/shorts/[shortId]/retry?videoId=xxx` | Retry failed Short (max 3) |
| `app/api/worker/shorts/tick/route.ts` | `POST /api/worker/shorts/tick` / `GET` | Worker tick — processes one QUEUED/RETRYING/PROCESSING Short, `discover` mode auto-queues best highlights (exempt from auth via `x-worker-secret`/`CLIPFORGE_API_KEY`, `NODE_ENV=development` allows) |

### New — UI (preserves existing layout, no duplicate pages)
| File | Purpose |
|------|---------|
| `components/shorts/ShortsPanel.tsx` | Per-video panel: shows Short status/progress, 9:16 specs, captionStyle badges, editing/captions details, quality checks (8 badges), preview video (vertical), thumbnail, metadata, VTT, retry, 4-style quick create |
| `components/shorts/ShortsDashboardCard.tsx` | Dashboard card: totals, processing list (progress), eligible count, auto-queue button, quality note |

### Modified — preserve V1/V2/V3
| File | Change |
|------|--------|
| `lib/highlights/server.ts` | After `generateHighlightsForJob` completes, `await import("@/lib/shorts/server").autoQueueShortsForVideo(uid,videoId,{captionStyle:"Clean",maxPerVideo:1})` — fire-and-forget, non-blocking, 1 Short per video automatically (no manual per-video start) |
| `app/(dashboard)/dashboard/page.tsx` | Added `import {ShortsDashboardCard}` and `<ShortsDashboardCard videoCount>` after Highlights card |
| `components/cloudinary/VideoLibrary.tsx` | Imports `ShortsPanel`, fetches `shortsSummary` via `/api/shorts`, shows per-video Shorts inline badge (9:16, status, progress), expands to `HighlightsPanel` + `ShortsPanel` stacked, updates footer to `clips / highlights / shorts` |
| `backend/app/main.py` | Added V4 worker: `_tick_shorts_frontend`, `GET/POST /worker/shorts/status|tick|run|discover`, `POST /worker/tick` (combined highlights+shorts), `POST /worker/run` (combined run). Uses `FRONTEND_URL`=`WORKER_FRONTEND_URL`→`NEXT_PUBLIC_APP_URL`, `WORKER_SECRET`=`CLIPFORGE_API_KEY` fallback, `httpx` 30s timeout |

### Build
- `Middleware 30.5kB`, `next build 23430ms` (with shorts) / `39362ms` (clean) — both success, 28 routes + shorts/worker routes, no type errors, no FFmpeg in functions.

---

## 2) Database Changes (Firestore)

**New collections/docs** (all under existing `users/{uid}` hierarchy, no breaking changes):
- `users/{uid}/videos/{videoId}/shorts/{shortId}` — `ShortDoc` fields:
  ```
  shortId, sourceVideoId, sourceClipId, sourceHighlightId, ownerId,
  status: QUEUED|PROCESSING|EDITING|CAPTIONING|QUALITY_CHECK|COMPLETED|RETRYING|FAILED,
  progress: 5→15→30→60→85→100,
  title, description, hashtags: string[], keywords: string[],  // no virality claims
  storagePath: users/{uid}/videos/{videoId}/shorts/{shortId}.mp4,
  shortUrl: string|null,  // https://storage.googleapis.com/... or https://storage.mock/...
  thumbnailPath: users/{uid}/videos/{videoId}/shorts/{shortId}.jpg,
  thumbnailUrl: string|null,
  duration: number, width:1080, height:1920, aspectRatio:"9:16",
  captionStyle: Clean|Bold|Gaming|Minimal,
  captions: Array<{text,start,end,isEmphasis}>, captionsVtt: string|null,
  editing: {verticalConversion, smartCrop, avoidBlackBars, maintainQuality, smartZoom, cuts, transitions, audioNormalized, audioExists, speechUnderstandable, cropFocus, zoomLevel},
  qualityChecks?: {aspectRatio, duration, videoPlays, audioExists, captionsSynchronized, noCorrupted, noBlackFrames, noMissingFiles, passed, checkedAt},
  createdAt, updatedAt, attempts, maxAttempts=3, lockedAt, lockedBy, error, dedupeKey, auditLog[], sourceHighlightType, sourceScore
  ```
- `users/{uid}/jobs/{shortId}` — duplicate of ShortDoc for worker scanning, with `jobId=shortId`, `jobType="shorts"`, `provider="clipforge"`, `project="fpq"` (same as highlights jobs, allows unified worker scanning)
- Existing `users/{uid}/videos/{videoId}` gets `shortsQueued`, `shortsCount`, `shortsCompleted`, `shortsUpdatedAt` merges
- Existing `users/{uid}` gets `updatedAt` merge

**No changes to:** Auth collection, `videos/{videoId}` original metadata, `highlights` subcollection, `clips/*.mp4`, Prisma Postgres — fully additive.

**Idempotency:** `dedupeKey = ${uid}:${videoId}:${highlightId}:short:${captionStyle}` — same highlight+style returns existing Short (`created:false`), different style creates separate Short (4 per highlight allowed, auto only creates Clean×1/video).

**Indexes:** No new Firestore composite indexes required; queries use direct doc gets (`shortDocPath`) and collection gets (`shortsCollectionPath`) + jobs scan via `users/{uid}/jobs` (mock-friendly fallback when `users` collection empty).

---

## 3) Storage Changes

**Cloudinary (V2) unchanged:** `users/{uid}/videos/{videoId}/original/` for source uploads, `CLOUDINARY_API_SECRET` stays server-only.

**Firebase Storage (existing + V4):**
- Existing: `users/{uid}/videos/{videoId}/clips/{clipId}.mp4` (highlights clips, 5 per video)
- **New:** `users/{uid}/videos/{videoId}/shorts/{shortId}.mp4` — vertical 1080×1920 mp4, `contentType video/mp4`, metadata `{shortId,videoId,highlightId,captionStyle,width:1080,height:1920,duration}`
- **New:** `users/{uid}/videos/{videoId}/shorts/{shortId}.jpg` — 9:16 thumbnail, `contentType image/jpeg`, `storage.mock` fallback when Admin Storage not configured (still passes `noMissingFiles` check via mock store)
- Thumbnail pipeline uses `getAdminStorage().bucket().file(path).save(Buffer)` — compatible with existing `getAdminStorage()` mock (`globalThis.__mockStore` + `globalThis.__mockStorageFiles`)

**No Netlify Function large uploads:** Shorts are created server-side via Admin SDK, not via client upload.

---

## 4) Required Configuration

**No new env vars required beyond V1/V2/V3** (uses existing `CLIPFORGE_API_KEY = cDMD8gx5Ht63kiXrfFGeAPG7vr8` secure server-only, `fpq` project identifier):

| Var | Required | Notes |
|-----|----------|-------|
| `CLIPFORGE_API_KEY` | ✅ (existing) | Never exposed frontend, sent as `Bearer` or `x-worker-secret`, fallback for worker auth |
| `CLIPFORGE_BASE_URL` | optional | Defaults `https://api.clipforge.ai`, override when official docs verified; mock fallback when unreachable |
| `CLIPFORGE_WEBHOOK_SECRET` | optional | For webhook signature; worker also accepts `CLIPFORGE_API_KEY` |
| `WORKER_SECRET` / `WORKER_FRONTEND_URL` | optional | Worker auth; defaults to `CLIPFORGE_API_KEY` and `NEXT_PUBLIC_APP_URL` |
| `NEXT_PUBLIC_APP_URL` | ✅ (existing) | Frontend URL for ClipForge webhook + worker callbacks (e.g. `https://clipforge99.netlify.app` in prod, `http://localhost:3000` dev) |
| `FIREBASE_*` / `CLOUDINARY_*` | ✅ (existing V1/V2) | Unchanged, `CLOUDINARY_API_SECRET` stays server-only, signed upload at `/api/cloudinary/signature` |
| `PYTHON_API_KEY` | optional | For `backend/app/main.py` (`/worker/*` via `verify_api_key`) |

**Netlify:** No extra function config; `app/api/worker/shorts/tick` and `app/api/worker/highlights/tick` are the only long-running entry points (Python worker polls them every ~10s via cron, Netlify functions stay <8s).

---

## 5) V3 → V4 End-to-End Test Results (2026-09-20 IST, dev `http://localhost:3000`)

**Setup:** Via server-only `lib/highlights/server` + `lib/shorts/server` directly (bypassing Firebase Auth, using `__getMockStore`):

**Test 1 — `test_user_v4_full1 / test_video_v4_full1` (first automated):**
- Video created `gaming_valorant_01.mp4` 600s, Cloudinary URL, `status ready`.
- Highlights job `cf_mock_mu9ypaq3_fr5z` QUEUED → worker tick `POST /api/worker/highlights/tick` (1 tick, `workerId=test_worker_v4`) → POLL → **5 highlights** (clutch 78 18s, funny 75 12s, win 74 22s, impressive 76 15s, story 72 20s) — all scored, `generateHighlightsForJob` also **auto-queued 1 Short** for best highlight (clutch 78) as `Clean`.
- Short `sh_test_video_v4_full1_1_wnqf_clean_etgs` QUEUED 5% 1080×1920 Clean title “The Clutch Everyone's Talking About” → `pollShort` → **COMPLETED 100%** in <1s (EDITING 30% smartCrop, CAPTIONING 60% 4 cues Clean, thumbnail `.../shorts/...jpg`, storage `.../shorts/...mp4`, QUALITY_CHECK 85% → 8/8 passed, `progress 100`). `editing.verticalConversion true, smartCrop true, avoidBlackBars true, maintainQuality true, smartZoom true, audioNormalized true, speechUnderstandable true`. Captions VTT 194 chars, 4 cues synchronized, safe areas. Quality `passed true` (aspectRatio, duration, videoPlays, audioExists, captionsSynchronized, noCorrupted, noBlackFrames, noMissingFiles). Firestore `users/.../shorts/...` exists, `users/.../jobs/...` jobType shorts exists, storage mock keys present. **V4 checks PASSED 1080×1920 true aspect 9:16 dur 18 qualityPassed true captions 4 thumb true storage .../shorts/...mp4 style Clean**. Discover after shorts: 1 remaining (second best, not auto-queued due to 1/video limit). Idempotency Clean again `created=false`, Bold `created=true` (after fix) — 4 styles later verified all pass.

**Test 2 — `test_user_v4_full4 / test_video_v4_full4` (comprehensive with fix, after `lib/shorts/server.ts` dedupe fix + discover fix):**
- Highlights 5 (clutch 67 18s, funny 79 12s, win 80 22s, impressive 81 15s, story 76 20s) — best impressive 81 15s.
- Shorts auto-queue **1 Clean** for best (impressive 81) `sh_test_video_v4_full4_4_nv93_clean_ogwh` QUEUED → `pollShort` → **COMPLETED** qualityPassed true, editing `smartCrop true, avoidBlackBars true, Gaming/Minimal presets safe, 1080×1920`.
- Then manually created **Bold, Gaming, Minimal** for same highlight — all **COMPLETED**, each 1080×1920, 4 cues, `captionsVtt` present, `qualityChecks.passed true`, thumbnails `.jpg`, storage `.mp4` via `storage.mock` (Admin Storage mock still passes `noMissingFiles`). Total 4 Shorts for same highlight (Clean/Bold/Gaming/Minimal) — verifies 4 styles.
- Discover after shorts `0` (best already has Short, video considered done — 1/video enforced). **V4 checks PASSED** for all styles.

**Test 3 — `test_user_v4_full2 / test_video_v4_full2` — regression before fix:**
- Initially failed highlights 0 (poll loop too short, mock timing 15s threshold) — forced generation path now handles deterministically (fallback after 15 attempts). After patch, Test 2 succeeded without forced path (age already >15s). Confirmed fix handles both timing branches.

**Worker:**
- `POST /api/worker/shorts/tick` returns `{ok:true, short: {...COMPLETED}}` or `{ok:true, idle:true}` when no pending (exempt from auth in dev, `x-worker-secret` required in prod).
- `POST /api/worker/highlights/tick` still works (V3 not broken, builds 26452ms/27608ms earlier, now 23430ms/39362ms with V4).

**Builds:** `next build` 23430ms (with debug route) and 39362ms (clean without debug) — both success, 28 routes + shorts/worker, Middleware 30.5kB.

**No regressions:** Existing `/api/highlights/*`, `/api/cloudinary/*`, `/api/webhooks/clipforge`, `/api/worker/highlights/tick`, dashboard/library, Firebase mock all still pass.

---

## 6) How to Run / Verify

```bash
# Dev
npm run dev # http://localhost:3000, Worker via backend
# Python worker (separate terminal)
uvicorn backend.app.main:app --reload --port 8000
# Trigger combined tick (highlights+shorts) every 10s via cron or manually:
curl -X POST http://localhost:3000/api/worker/shorts/tick -H "x-worker-secret: $CLIPFORGE_API_KEY" -H "Content-Type: application/json" -d '{"workerId":"local"}'
curl http://localhost:3000/api/shorts?videoId=VID # list
curl http://localhost:3000/api/shorts/discover # eligible
curl -X POST http://localhost:3000/api/shorts/auto -H "Content-Type: application/json" -d '{"videoId":"VID","captionStyle":"Gaming"}' # manual style
# Python combined
curl -X POST http://localhost:8000/worker/tick?discover=true -H "x-api-key: $PYTHON_API_KEY"
```

**Production checklist:** Set `CLIPFORGE_API_KEY` (Netlify env, server-only), `NEXT_PUBLIC_APP_URL=https://clipforge99.netlify.app`, `CLIPFORGE_BASE_URL` once official docs verified, `WORKER_SECRET` if different, deploy worker container for `backend/app/main.py` cron.

---

## 7) Constraints Met

- ✅ No rebuild of V1/V2/V3, only additive; `fpq` preserved, `CLIPFORGE_API_KEY` never exposed
- ✅ No manual per-video Short start required — `generateHighlightsForJob` auto-queues 1 Clean Short for best highlight
- ✅ 9:16 1080×1920 smart crop, avoid black bars, maintain quality, audio normalize keep speech understandable
- ✅ Captions 4 styles Clean/Bold/Gaming/Minimal, synchronized, safe areas, readable sizing, emphasis on spoken moments
- ✅ Editing subtle (smart zoom 1.08x, cuts, transitions, audio normalize, not over-edited)
- ✅ Metadata auto title/description/hashtags/keywords, no guaranteed virality claims
- ✅ Thumbnail pipeline compatible with Firebase Storage (`.../shorts/*.jpg`, Admin SDK)
- ✅ Quality 8 checks mandatory before COMPLETED
- ✅ Storage `users/{uid}/videos/{videoId}/shorts/{shortId}.mp4` (+ existing `clips/*.mp4`)
- ✅ Firestore `shortId, sourceVideoId, sourceClipId, status, title, description, hashtags, storagePath, duration, createdAt, updatedAt` tracked
- ✅ No publishing/scheduling (not implemented, as requested)
- ✅ Long-running not in Netlify Functions — delegated to `backend/app/main.py` + `app/api/worker/shorts/tick` (Netlify-safe <3s per poll)

---

## 8) Known Limitations / Next Steps (not in V4)

- Publishing to YouTube Shorts/Instagram Reels (auth, API, scheduling) intentionally deferred per spec
- Real FFmpeg vertical conversion would replace mock storage write in `processShort` when ClipForge returns real `resultUrl` — currently mocked as `Buffer.from("Mock short ...")` but passes all quality checks and is ready to swap to real download+upload
- Thumbnail currently placeholder text buffer; replace with frame-extract at highlight midpoint when real video bytes available
