# ClipForge AI — Project `fpq` Integration (V1)

> Firebase Auth / Firestore / Storage **preserved**. No redesign, no Supabase, no login page changes. ClipForge runs **server-side only** with strict per-user isolation.

---

## 1) What was built

### Server-only core (never in browser)
- **`lib/clipforge/server.ts`** — `import "server-only"`; reads `CLIPFORGE_API_KEY` only from `process.env`; project constant `fpq` sent as `X-Project-Id` + `X-ClipForge-Project` + body field. Functions:
  - `createClipForgeJob(req)` → `POST {baseUrl}/v1/jobs`
  - `getClipForgeJobStatus(jobId)` → `GET /v1/jobs/{jobId}`
  - `retryClipForgeJob(jobId)` → `POST /v1/jobs/{jobId}/retry`
  - `cancelClipForgeJob(jobId)` → `POST /v1/jobs/{jobId}/cancel`
  - `verifyWebhookSignature(req, rawBody)` + `normalizeClipForgeStatus`
  - Error taxonomy: `UNAUTHORIZED (401/403)`, `FILE_TOO_LARGE (413)`, `UNSUPPORTED_FILE (415/422)`, `TIMEOUT (408)`, `RATE_LIMIT (429)`, `CLIPFORGE_FAILURE (5xx)`, `DUPLICATE_JOB (400 duplicate)`, `NETWORK_FAILURE`, `MISSING_RESULT` — retryable flag, key redaction.
  - Mock mode when `CLIPFORGE_API_KEY` missing/`mock` or placeholder `api.clipforge.ai` unreachable (local dev fallback).

- **`lib/firebase-admin.ts`** — server-only Admin SDK helper: real Firestore/Storage if `FIREBASE_ADMIN_CREDENTIALS` or `FIREBASE_SERVICE_ACCOUNT` set, otherwise in-memory mock (`users/{uid}/jobs`). Exports `getAdminDb()`, `getAdminStorage()`, `verifyFirebaseIdToken(idToken)`.
- **`lib/firebase.ts`** — extended with `getFirebaseDb()` + `getFirebaseStorage()` (client).
- **`lib/clipforge/firestore.ts`** — type `ClipForgeJobDoc` with `provider:"clipforge"`, `project:"fpq"`, path `users/{uid}/jobs/{jobId}`.
- **`lib/clipforge/auth.ts`** — hybrid `getClipForgeUser(req)` : tries `clipforge_token` JWT (`getSessionUser`) **then** `Authorization: Bearer <Firebase ID token>` via `verifyFirebaseIdToken`; ensures Prisma user exists; throws 401 otherwise. Enforces per-user.

### API (all `X-Project-Id: fpq`)
- `POST /api/clipforge/jobs` — validate `sourceVideoId`, `sourceUrl`, `filename`; mime/size ≤2GB; project must be `fpq`; 409 on duplicate; calls `createClipForgeJob` server-side; writes Firestore `users/{uid}/jobs/{jobId}` with `status queued|uploading`.
- `GET /api/clipforge/jobs` — list per-user jobs sorted `createdAt desc`.
- `GET /api/clipforge/jobs/[jobId]` — owner check (404 if not owned); `getClipForgeJobStatus`; `normalize`; progress/error/resultUrl; if `completed` copies `resultUrl` → Firebase Storage `users/{uid}/videos/{videoId}/clips/{clipId}.mp4` (admin storage if available else mock), then merges Firestore update; polling endpoint.
- `POST /api/clipforge/jobs/[jobId]/retry` — only `failed|cancelled`, else 409; increments `attempts`.
- `POST /api/clipforge/jobs/[jobId]/cancel` — only `queued|uploading|processing`.
- `POST /api/clipforge/webhook` — reads raw body, `verifyWebhookSignature`, checks `project === fpq`, requires `userId/uid`; idempotent `set(...,{merge:true})`; `202` polling fallback when `userId` absent.
- `GET /api/clipforge/webhook` — health: `{ ok, project: fpq }`.

### UI (no redesign)
- **`components/clipforge/ClipForgeUploader.tsx`** — client: pick file (MP4/MOV/WebM ≤2GB), shows Firebase Auth guard, uploads to **Firebase Storage** `users/{uid}/videos/{videoId}/source.mp4` via `uploadBytesResumable` + `getDownloadURL()`, then `POST /api/clipforge/jobs` with `sourceVideoId`, `filename`, `sourceUrl`, `project:fpq` and Firebase ID token (`Authorization: Bearer`). Handles all error codes with friendly messages.
- **`components/clipforge/ClipForgeJobs.tsx`** — list + polling every **5s** (stops on `completed/failed/cancelled`), `Retry` (failed) + `Cancel` (active) + `Check status`; shows per-job badges: `Queued / Uploading / Processing / Completed / Failed / Cancelled`, progress, Firestore path.
- **`components/clipforge/DashboardClipForgeCard.tsx`** — top of `/dashboard` (after fix) — recent 3 jobs with `fpq` badge.
- **`app/(dashboard)/upload/page.tsx`** — rebuilt as **Tabs**: `ClipForge (fpq) — Firebase` (default) and `Legacy S3` (preserved `Dropzone`). Contracts card documents both flows.
- **`components/ui/tabs.tsx`** — minimal accessible tabs (no external dep).

### Security hardening
- `CLIPFORGE_API_KEY` **never** in client bundle: `server-only`, read via `process.env` at runtime, `Authorization: Bearer` + `X-Project-Id: fpq`; verified with `grep -R cDMD .next` = no hit; `grep CLIPFORGE_API_KEY .next/static` only shows docs string in upload contracts card.
- `.env.local` listed in `.gitignore`; `.env.example` documents server vars without value.
- Firestore rules example (`firestore.rules.example`) enforces `request.auth.uid == uid` + `provider==clipforge && project==fpq` on create. Storage rules (`storage.rules.example`) enforce per-user + 2GB + `video/*`.
- Netlify: key in **Build environment variables**, not in repo; no long FFmpeg in Functions (short JSON calls <8s).

### Storage contracts
- Source: `users/{uid}/videos/{videoId}/source.mp4` (Firebase Storage)
- Clip result: `users/{uid}/videos/{videoId}/clips/{clipId}.mp4`
- Firestore job: `users/{uid}/jobs/{jobId}` fields: `clipforgeJobId`, `provider:"clipforge"`, `project:"fpq"`, `sourceVideoId`, `filename`, `sourceUrl`, `userId`, `status`, `createdAt/updatedAt`, `error?`, `progress?`, `resultUrl?`, `clipStoragePath?`, `attempts`, `mock?`

---

## 2) API documentation check (before implementing)

**Searches run** (2026-09-20): `site:github.com clipforge`, `clipforge api docs`, `api.clipforge.ai`, `docs.clipforge.ai`, rapidapi, etc. via `web_search`.

**Finding**: **No official public ClipForge AI SaaS REST docs** under `api.clipforge.ai` / `docs.clipforge.ai`. Results are all open-source clones named *clipforge* (Groq/fal.ai, ZAI, Gemini, RapidAPI wrappers, Shotstack, Cloudinary). No canonical endpoint, auth, webhook spec.

**Decision** (per instruction — do not invent):
- Centralised all endpoints in `getConfig()` so you update **one place** when official docs arrive.
- Used common video-AI convention as placeholder:
  ```
  Base URL:  https://api.clipforge.ai  (override via CLIPFORGE_BASE_URL)
  Auth:      Authorization: Bearer <CLIPFORGE_API_KEY>  (fallback x-api-key via CLIPFORGE_AUTH_MODE=x-api-key)
  Endpoints: POST /v1/jobs, GET /v1/jobs/{id}, POST /v1/jobs/{id}/retry, POST /v1/jobs/{id}/cancel
  Webhook:   POST /api/clipforge/webhook  (+ HMAC-SHA256 X-ClipForge-Signature if provided)
  ```
- If `baseUrl` is placeholder and fetch fails (`NETWORK_FAILURE` / 5xx), server **falls back to mock** with warning so local + Netlify preview stay testable until you paste the real URL. Set `CLIPFORGE_BASE_URL` to the real URL from the ClipForge portal and the mock fallback disappears.

> **Action before production**: open the ClipForge portal where you got `cDMD8gx5Ht63kiXrfFGeAPG7vr8` and confirm exact `base URL`, `auth header`, `JSON body`, and `webhook secret`. Replace `CLIPFORGE_BASE_URL` / `CLIPFORGE_AUTH_MODE` / payload shape in `lib/clipforge/server.ts` (single file) and redeploy.

---

## 3) Local environment variables (`.env.local` — not committed)

Create `ClipForge-AI/.env.local` (see `.env.example`):

```env
DATABASE_URL="postgresql://clipforge:clipforge@localhost:5432/clipforge?schema=public"
JWT_SECRET="local-dev-jwt-secret-replace-in-production"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Firebase (client — safe to expose)
NEXT_PUBLIC_FIREBASE_API_KEY="AIzaSyD6gnGoSEraOVbss9QMOaaZT502rtpDETU"
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="clipforge-ai-910f9.firebaseapp.com"
NEXT_PUBLIC_FIREBASE_DATABASE_URL="https://clipforge-ai-910f9-default-rtdb.asia-southeast1.firebasedatabase.app"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="clipforge-ai-910f9"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="clipforge-ai-910f9.firebasestorage.app"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="892050276818"
NEXT_PUBLIC_FIREBASE_APP_ID="1:892050276818:web:c827cf86dee53bd378880b"
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID="G-RV1Z109SRH"

# ClipForge AI — server-side only (never NEXT_PUBLIC_)
CLIPFORGE_API_KEY="cDMD8gx5Ht63kiXrfFGeAPG7vr8"
CLIPFORGE_BASE_URL="https://api.clipforge.ai"
CLIPFORGE_PROJECT_ID="fpq"
# CLIPFORGE_WEBHOOK_SECRET=""  # paste if portal shows one
# CLIPFORGE_API_BASE_URL=""    # alias for CLIPFORGE_BASE_URL
# FIREBASE_ADMIN_CREDENTIALS="" # base64 serviceAccount.json (production)
# FIREBASE_SERVICE_ACCOUNT=""   # or raw JSON
```

Run:
```bash
npm install
npx prisma generate   # if DATABASE_URL reachable else skip — mock DB still boots
npm run dev           # http://localhost:3000
npm run build         # should pass (see build check below)
```

---

## 4) Netlify environment variables

In **Netlify Dashboard → Site → Environment variables** (Build & Functions, not `NEXT_PUBLIC` for secrets):

| Key | Value | Notes |
|-----|-------|-------|
| `CLIPFORGE_API_KEY` | `cDMD8gx5Ht63kiXrfFGeAPG7vr8` | **Secret** — Build & Functions only, never `NEXT_PUBLIC_` |
| `CLIPFORGE_BASE_URL` | `https://api.clipforge.ai` *or real URL from portal* | Override when official URL known |
| `CLIPFORGE_PROJECT_ID` | `fpq` | Project/upload name |
| `CLIPFORGE_WEBHOOK_SECRET` | *(portal value if webhook used)* | Enables HMAC verification |
| `NEXT_PUBLIC_FIREBASE_*` | same as `.env.local` (public) | Paste all 7 `NEXT_PUBLIC_FIREBASE_*` |
| `FIREBASE_ADMIN_CREDENTIALS` | `base64(serviceAccount.json)` | `cat serviceAccount.json \| base64 -w0` — enables real Firestore/Storage on server; omit → mock mode |
| `DATABASE_URL` | `postgresql://...?sslmode=require` | Neon/Supabase |
| `JWT_SECRET` | `openssl rand -base64 32` | Auth |
| `NEXT_PUBLIC_APP_URL` | `https://<your-site>.netlify.app` | Used for webhookUrl auto-construction |

**Build command**: `npm run build` (see `netlify.toml`). Runtime is `@netlify/plugin-nextjs` — Netlify Functions timeout 10s (26s on Pro); all ClipForge calls are short JSON (<8s), compliant with **no long FFmpeg** in Functions.

After setting vars: **Clear cache & deploy** so server bundle picks them up (they are read at runtime via `process.env`).

---

## 5) ClipForge portal settings / permissions

1. **Project**: ensure project named **`fpq`** exists and API key `cDMD8gx5Ht63kiXrfFGeAPG7vr8` has **write** for `jobs:create`, `jobs:read`, `jobs:retry`, `jobs:cancel` scoped to `fpq`.
2. **Allowed source URL**: Firebase Storage download URLs are `https://firebasestorage.googleapis.com/...` — if ClipForge restricts domains, add `firebasestorage.googleapis.com` (and `storage.googleapis.com`) to allowed fetch hosts, or use a proxy signed URL.
3. **Webhook** (if available): register `https://<your-site>.netlify.app/api/clipforge/webhook`. Copy **signing secret** → `CLIPFORGE_WEBHOOK_SECRET`. Our handler is **idempotent** (`set merge:true`) and verifies `X-ClipForge-Signature` (HMAC-SHA256 of raw body) or allows unsigned with warning (for initial setup).
4. **Polling**: if webhook not offered, polling every **5s** (in `ClipForgeJobs`) until `completed/failed/cancelled` is the intended fallback — no additional portal config needed.
5. **Limits**: confirm 2GB / codec allow-list matches our client validation (MP4/MOV/AVI/WebM/MKV). Files >2GB are rejected client-side with `FILE_TOO_LARGE`.
6. **Auth mode**: portal may want `x-api-key` instead of `Bearer` — set `CLIPFORGE_AUTH_MODE=x-api-key` if needed (no code change).

---

## 6) Complete test workflow (`fpq`)

### Prerequisites
- Firebase Auth user signed in (email/password or Google — same as before; login page **untouched**).
- Firebase project `clipforge-ai-910f9` has Firestore + Storage enabled.
- `.env.local` present; `npm run build` passes; Netlify env set if testing deployed.

### Steps

1. **Login** → `http://localhost:3000/login` (existing form, no change). Verify Firebase: browser console → `firebase: initialized clipforge-ai-910f9`.
2. **Upload (fpq)** → `/upload` → tab **ClipForge (fpq) — Firebase** (default).
   - Pick video ≤2GB (MP4). Expect: `Uploading to Firebase — 0→85%` then `Creating ClipForge job (server-side, secure)...` → `Job created: cf_mock_…` (mock if placeholder endpoint).
   - Firestore check (Firebase Console → Firestore): `users/{uid}/jobs/{jobId}` exists, `provider:clipforge`, `project:fpq`, `status:queued`, `sourceVideoId` matches, `clipforgeJobId` same, `mock:true` if fallback.
   - Storage check (Firebase Console → Storage): `users/{uid}/videos/{videoId}/source.mp4` appears (private, per-user).
   - Failure paths:
     - *Unauthorized* (bad key) → `Invalid ClipForge API key…` (401/403)
     - *File too large* → `File exceeds 2GB` client + `FILE_TOO_LARGE` server 413
     - *Unsupported* → 415
     - *Duplicate* while `queued|processing` → 409 `A job for this video is already processing`
     - *Rate limit* → retryable banner
3. **Status — polling** → stays on `/upload` under **ClipForge Jobs — project fpq**; also `/dashboard` card. Expected transitions (mock timing): `queued (0-5s)` → `processing 60% (5-15s)` → `completed 100%` (or `failed` 1/7 jobs — test retry).
   - Each tick calls `GET /api/clipforge/jobs/{jobId}` with `Authorization: Bearer <Firebase ID token>` (server verifies via Admin or mock decode). Poll **every 5s**, auto-stops on terminal.
4. **Success** → badge `Completed`, `View clip` link (mock `https://storage.mock/.../clip.mp4`). Storage check: if real ClipForge `resultUrl` returned, our endpoint fetched and wrote `users/{uid}/videos/{videoId}/clips/{clipId}.mp4` (visible in Storage) and Firestore `clipStoragePath` + `resultUrl` populated.
5. **Failed → Retry** → for `failed` jobs, `Retry` button → `POST /api/clipforge/jobs/{id}/retry` → status resets to `queued`, `attempts+1`; poll resumes. `failed` error text preserved verbatim.
6. **Cancel** → for active job (`queued|uploading|processing`), `Cancel` → `POST .../cancel` → `cancelled` (terminal).
7. **Webhook (optional)** → if ClipForge configured for `…/api/clipforge/webhook`, simulate: `curl -X POST https://<site>/api/clipforge/webhook -H 'Content-Type: application/json' -d '{"jobId":"<id>","userId":"<uid>","project":"fpq","status":"completed","resultUrl":"https://…/clip.mp4"}'` → Firestore merges idempotently; next poll sees `completed`.
8. **Per-user isolation** → log in as different user → `GET /api/clipforge/jobs/{jobId}` of other user → **404 Job not found** (not 403 leak). Firestore rules reject cross-uid reads.

### Verification checklist (run locally)
```bash
npm run build 2>&1 | tail -n 30   # ✓ Compiled successfully (27/27 pages), no type errors
grep -R "cDMD8gx5Ht63kiXrfFGeAPG7vr8" .next && echo "LEAK!" || echo "ok — no key in bundle"
grep -R "CLIPFORGE_API_KEY" .next/server | head  # should show process.env lookup, not literal
# Manual: open /api/clipforge/webhook in browser → { ok, project: fpq }
```

---

## 7) Architecture notes (why this respects constraints)

- **Firebase preserved**: Auth/Firestore/Storage are the source of truth for `fpq`; Prisma/Postgres still holds legacy `Video/Clip/ProcessingJob` — both coexist, dashboard shows both.
- **Key never in browser**: `lib/clipforge/server.ts` has `import "server-only"`; client talks only to `/api/clipforge/*` which proxies with the key.
- **Netlify-safe**: only JSON fetches (<8s) in Functions; no FFmpeg/wasm; heavy transcoding stays in ClipForge.
- **Idempotent**: webhook uses `set({merge:true})`; job create checks duplicate; retries increment `attempts`.
- **Don't invent**: base URL, body, and signature verification all point at one editable file and are gated behind `api.clipforge.ai` placeholder warning.

---

## 8) Next step when official docs arrive

Edit **only** `lib/clipforge/server.ts`:
- `getConfig().baseUrl` default
- `clipForgeFetch` header name + `PROJECT_ID` placement
- `createClipForgeJob` body + `POST` path (`/v1/jobs` vs `/v1/projects/fpq/jobs` / signed `uploadUrl` flow if ClipForge wants direct upload)
- `getClipForgeJobStatus` response mapping (`jobId/status/resultUrl` keys)
- `verifyWebhookSignature` header name + HMAC construction

All call sites stay unchanged.

