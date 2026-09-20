# ClipForge AI — V1 Foundation

**Turn long streams into Shorts automatically.**

ClipForge AI is a premium dark SaaS for creators to upload long-form streams and generate vertical, captioned Shorts. **V1 is the complete frontend foundation + backend contracts** — no AI, no auto-posting yet, just a rock-solid architecture ready for V2 velocity.

> **Scope:** V1 ships upload, projects, clip library, settings, integrations (placeholder), and the signed-URL storage architecture. YouTube/Instagram OAuth, AI clip detection, creator scraping, and advanced analytics are explicitly deferred to V2.

---

## Architecture

```
Frontend (Next.js 14, App Router, Netlify-compatible)
  ├─ (marketing)   /              Landing — hero, features, how it works
  ├─ (auth)        /login, /signup  Auth with JWT httpOnly cookies
  └─ (dashboard)   /dashboard, /upload, /projects, /clips, /settings, /integrations
       └─ Sidebar navigation (desktop + mobile drawer), dark zinc palette
  └─ /api/*       Next.js Route Handlers (auth, uploads, videos, clips, settings, integrations)

Database (PostgreSQL + Prisma)
  └─ Prisma schema with 7 models, enums, indexes, cascades

Storage (S3-compatible via signed URLs)
  └─ Browser PUTs directly to bucket; Next.js only mints URL + records metadata

Worker (FastAPI — optional, separate deploy)
  └─ backend/app/main.py  — health, job contracts, webhook placeholder for V2

Netlify
  └─ netlify.toml + @netlify/plugin-nextjs handles SSR/API
```

### Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14.2 (App Router, TypeScript strict), Tailwind 3.4, shadcn/ui pattern, lucide-react, sonner, framer-motion |
| Auth | Custom JWT (jose) + bcryptjs, httpOnly cookie `clipforge_token`, middleware-protected routes |
| DB | PostgreSQL, Prisma ORM 5.19 |
| Storage | S3 / R2 / Supabase via signed PUT URL abstraction (`lib/storage.ts`) |
| Worker | FastAPI (Python) — V2 will add FFmpeg/Whisper |
| Deploy | Netlify (Next Runtime) — `netlify.toml` included |

### Folder Structure

```
clipforge-ai/
├─ app/
│  ├─ layout.tsx                 Root layout (dark, AuthProvider, Toaster)
│  ├─ globals.css                Tailwind + CSS variables (zinc dark theme)
│  ├─ page.tsx                   Landing page (Logo, Hero, Features, How it works, CTA)
│  ├─ (auth)/
│  │  ├─ layout.tsx              Split panel: form + brand preview
│  │  ├─ login/page.tsx          Login + password show/hide + error states
│  │  └─ signup/page.tsx         Signup + password strength + validation
│  ├─ (dashboard)/
│  │  ├─ layout.tsx              Auth gate + Sidebar shell
│  │  ├─ dashboard/page.tsx      Stats, processing jobs, recent clips, platforms
│  │  ├─ upload/page.tsx         Dropzone + contract docs
│  │  ├─ projects/page.tsx       Search/filter, status, duration, clips count
│  │  ├─ clips/page.tsx          Card grid, thumbnail, duration, preview
│  │  ├─ settings/page.tsx       Profile, niche, language, timezone, clip defaults
│  │  └─ integrations/page.tsx   YouTube/Instagram cards — honest placeholder
│  └─ api/
│     ├─ auth/{login,signup,logout,me}/route.ts
│     ├─ uploads/{signed-url,complete,mock}/route.ts
│     ├─ videos/route.ts
│     ├─ clips/route.ts
│     ├─ integrations/route.ts
│     ├─ settings/route.ts
│     └─ processing-jobs/route.ts
├─ components/
│  ├─ ui/         button, card, input, label, badge, separator, select, switch, textarea, progress, toaster
│  ├─ layout/    logo, sidebar
│  └─ upload/    dropzone (drag-drop, validation, progress, cancel, preview)
├─ lib/
│  ├─ prisma.ts           Singleton PrismaClient (with offline mock fallback)
│  ├─ auth.ts             sign/verify JWT, cookies, requireAuth
│  ├─ auth-client.tsx     AuthContext + useAuth()
│  ├─ storage.ts          Signed URL abstraction (S3/R2/local mock)
│  ├─ validations.ts      zod schemas + video constants
│  └─ utils.ts            cn, formatBytes, formatDuration, timeAgo
├─ prisma/
│  ├─ schema.prisma       7 models + 5 enums, indexes, relations
│  └─ seed.ts             Demo user: demo@clipforge.ai / Demo1234!
├─ backend/
│  ├─ app/main.py         FastAPI worker (health, job placeholder)
│  ├─ app/config.py
│  └─ requirements.txt
├─ middleware.ts          JWT guard for /dashboard/* and /api/* (except /api/auth)
├─ netlify.toml           Build + headers + @netlify/plugin-nextjs
├─ tailwind.config.ts     Dark zinc theme, radius, animations
├─ next.config.mjs        Netlify-compatible, remotePatterns
└─ .env.example           All env vars documented
```

---

## Database — Prisma Models

All models use `cuid` IDs, `createdAt`/`updatedAt`, proper FKs (`onDelete: Cascade`), and indexes.

| Model | Key fields |
|---|---|
| **User** | `id`, `email @unique`, `password` (hash), `name`, timestamps · relations → Profile, Video[], Clip[], ProcessingJob[], NicheSettings, Integration[] |
| **Profile** | `userId @unique`, `avatarUrl`, `bio`, `niche`, `language`, `timezone` |
| **Video** | `userId`, `filename`, `storageUrl`, `storageKey`, `duration?`, `fileSize`, `mimeType`, `status: VideoStatus` |
| **Clip** | `userId`, `videoId`, `startTime`, `endTime`, `duration`, `title?`, `status: ClipStatus`, `outputUrl?`, `thumbnailUrl?` |
| **ProcessingJob** | `userId`, `videoId`, `type: JobType`, `status: JobStatus`, `progress 0-100`, `error?` |
| **NicheSettings** | `userId @unique`, `niche`, `targetDuration` (15/30/45/60), `captionStyle`, `captionEnabled`, `language` |
| **Integration** | `userId`, `provider: YOUTUBE/INSTAGRAM/TIKTOK`, `status`, `accessToken?`, `externalAccountName?`, `@@unique([userId, provider])` |

**Enums:** `VideoStatus` (PENDING→UPLOADING→UPLOADED→PROCESSING→READY→FAILED), `ClipStatus`, `JobType`, `JobStatus`, `IntegrationProvider`, `IntegrationStatus`.

See `prisma/schema.prisma` for full definitions.

### Video / Clip / ProcessingJob contracts (V1)

- **Video** creation happens in `POST /api/uploads/signed-url` (status `UPLOADING`).
- **Upload** completes via `POST /api/uploads/complete` → status `UPLOADED` + creates `ProcessingJob(type=TRANSCODE, status=QUEUED)`.
- **Clip** is read-only in V1; V2 worker will populate `outputUrl`/`thumbnailUrl` and flip `status` to `READY`.

---

## Upload Architecture — Signed URLs

**Do not send huge videos through a Next.js serverless function.** V1 implements the correct contract:

```
1. Frontend → POST /api/uploads/signed-url  { filename, fileSize, mimeType }
      - Auth, validate (ext, mime, 1KB–2GB), create Video(status=UPLOADING)
      - Mint storageKey = uploads/{userId}/{date}/{rand}-{safeFilename}
      - Create signed PUT URL (S3/R2) or mock same-origin URL if no creds
      - Returns { videoId, uploadUrl, storageKey, expiresAt, headers }

2. Browser → PUT uploadUrl  (direct to bucket, with Content-Type)
      - Progress via XHR upload.onprogress
      - Cancellable via xhr.abort()
      - Never touches Next.js memory

3. Frontend → POST /api/uploads/complete  { videoId, storageKey }
      - Verify key is scoped to user (startsWith uploads/{userId}/)
      - Set storageUrl = getPublicUrl(key), status=UPLOADED
      - Create ProcessingJob — worker picks it up in V2

Large-file future (V2): multipart — POST /init → PUT parts (signed) → POST /complete.
```

**Validation:** extension `.mp4/.mov/.avi/.webm/.mkv`, mime `video/*`, size 1KB–2GB. **Security:** auth on both endpoints, scoped keys, no secrets in browser, `storageKey` checked server-side.

Local dev without S3 creds: returns a mock `https://app/api/uploads/mock?key=...` URL; `Dropzone` simulates progress and still calls `/complete` so the DB flow is exercised.

---

## Pages (V1)

| Route | What it shows | Empty state |
|---|---|---|
| `/` | Logo, Hero “Turn long streams into Shorts automatically”, Features (6 cards), How it works (3 steps + V1 scope note), CTA, Footer. Login / Get Started buttons. | — |
| `/login` | Email + password, show/hide, error banner, demo creds hint, link to signup | — |
| `/signup` | Name (opt), email, password with live strength checks (8 chars, upper/lower/number), error banner | — |
| `/dashboard` | 4 stat cards (total videos, clips, scheduled, published), Processing jobs, Recent clips, Connected platforms, Recent uploads | All panels show realistic empty-state cards with CTA, no fake numbers |
| `/upload` | Drag-drop + file picker, validation, video preview, progress, cancel, signed-URL flow, helper cards, developer contract docs | Dropzone empty state |
| `/projects` | List of streams with search + status filter, columns: filename, status badge, duration, clips count, date | “No streams yet” + upload CTA |
| `/clips` | Card grid (thumbnail 9:16, duration badge, status, title, source video, start→end, preview button) | “No clips yet” + explanation of card fields |
| `/settings` | Profile (name, bio), Workspace (niche, language, timezone), Clip defaults (duration 15/30/45/60/90, caption style, toggle) | Loads existing or defaults, scoped saves |
| `/integrations` | YouTube (red) + Instagram (gradient) cards, status badge, shield note for V2 scopes, honest 501 toast on “Connect” | Shows DISCONNECTED, never fakes CONNECTED; contract docs |

All dashboard pages are **auth-gated** (`middleware.ts` + `app/(dashboard)/layout.tsx`).

---

## Security

- **Never expose secrets:** `JWT_SECRET`, `STORAGE_*` stay server-only. Frontend only sees `NEXT_PUBLIC_APP_URL`.
- **Validate uploads:** extension, mime, size checked in `POST /api/uploads/signed-url` and re-checked in `complete` (scoped key).
- **Authenticate protected routes:** `middleware.ts` verifies `clipforge_token` (jose, issuer `clipforge`) for `/dashboard/*` and `/api/*` (except `/api/auth/*`). `lib/auth.ts` `requireAuth()` also guards handlers.
- **Users only access own data:** every query is `where: { userId: session.id }`. `complete` checks `storageKey.startsWith(uploads/{userId}/)`.
- **Passwords:** `bcryptjs` hash, zod `passwordSchema` (8–72 chars, upper+lower+number).

---

## Code Quality

- TypeScript strict, no `any` leaks (except intentional Prisma `any` for mock fallback), proper error handling
- Reusable `components/ui/*` (shadcn-style, `cva` variants), `lib/utils` (`cn`, formatters)
- Clean folders: `app` (routes), `components`, `lib`, `prisma`, `backend`
- Loading states (`Loader2`), error states (red banners), empty states (dashed cards, no fake data), responsive (sidebar drawer, grid breakpoints)
- Black / zinc-950 design, clean typography, subtle animations

---

## Local Development

### Prerequisites
- Node 20+, npm 10+
- PostgreSQL 14+ (or Neon/Supabase)
- (Optional) S3/R2 bucket for real uploads; otherwise mock mode works

### 1. Install

```bash
git clone <this-repo>
cd ClipForge-AI
npm install
# postinstall tries prisma generate; offline it gracefully skips — you can run it again after setting DATABASE_URL
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env:
# DATABASE_URL="postgresql://clipforge:clipforge@localhost:5432/clipforge?schema=public"
# JWT_SECRET="generate-with: openssl rand -base64 32"
```

Required `.env` keys (see `.env.example` for all):

```env
DATABASE_URL="postgresql://..."
JWT_SECRET="strong-random-32+"
NEXT_PUBLIC_APP_URL=http://localhost:3000
# Storage (optional for V1 mock mode — leave empty to use same-origin mock)
STORAGE_PROVIDER=s3
STORAGE_BUCKET=clipforge-uploads
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY_ID=
STORAGE_SECRET_ACCESS_KEY=
STORAGE_ENDPOINT=
STORAGE_PUBLIC_BASE_URL=
```

### 3. Database

```bash
# Create DB if local:
createdb clipforge

# Push schema (no migration files needed for V1) or migrate:
npx prisma db push
# or:
npx prisma migrate dev --name init

# Generate client (needed after schema change):
npx prisma generate

# Seed demo user:
npm run db:seed
# → demo@clipforge.ai / Demo1234!  (gaming niche, 30s bold captions)
```

> **Offline / no DB:** `lib/prisma.ts` has a mock fallback so `next build` and UI empty states work without a DB. API routes will return 500 with a clear message until `DATABASE_URL` is set and migrations run — no fake data is shown.

### 4. Run frontend

```bash
npm run dev
# → http://localhost:3000
# Landing, then /signup → create account → /dashboard
```

### 5. Run Python worker (optional in V1)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# → http://localhost:8000/docs
```

---

## Deploy to Netlify

1. **Push to GitHub** (already on branch `arena/01a0be60-clipforge-ai`).

2. **Netlify dashboard** → Add new site → Import from GitHub → select repo.

3. **Build settings** (auto-detected from `netlify.toml`):
   - Build command: `npm run build`
   - Publish directory: `.next`
   - Node version: `20` (set in `netlify.toml`)

4. **Environment variables** in Netlify → Site settings → Environment:
   ```
   DATABASE_URL=postgresql://... (Neon/Supabase with ?sslmode=require)
   JWT_SECRET=<openssl rand -base64 32>
   NEXT_PUBLIC_APP_URL=https://your-site.netlify.app
   STORAGE_* (as needed)
   ```

5. **Deploy**. Netlify’s Next Runtime will handle SSR + API routes. No extra config.

6. **Migrate production DB** (one-time, from your machine or Netlify build plugin):
   ```bash
   DATABASE_URL="postgresql://prod..." npx prisma migrate deploy
   DATABASE_URL="postgresql://prod..." npx prisma db seed
   ```

### Separation of concerns (already enforced)

| Concern | Where it lives |
|---|---|
| **Frontend** | `app/*`, `components/*` — static + SSR, Netlify publish `.next` |
| **API** | `app/api/*` — Next.js Route Handlers (also deploy as Netlify Functions) |
| **Database** | Neon/Supabase Postgres, Prisma schema, migrations not in Git |
| **Storage** | External bucket (S3/R2), accessed via signed URL, public base separate |
| **Worker** | `backend/` — independent deploy (Fly.io / Render / Netlify Function) when V2 needs compute |

---

## Commands Reference

```bash
npm run dev              # Next dev on 3000
npm run build            # prisma generate (or skip) + next build
npm start                # next start
npm run lint             # next lint

npx prisma generate      # generate @prisma/client from schema.prisma
npx prisma db push       # push schema without migration (dev)
npx prisma migrate dev   # create migration + apply
npx prisma migrate deploy# apply migrations in production
npx prisma studio        # DB GUI on 5555
npm run db:seed          # seed demo user via tsx
```

---

## What’s explicitly NOT in V1

- YouTube/Instagram **auto-posting** — UI shows honest DISCONNECTED badges, POST returns 501
- **AI clip detection** / transcription / ranking — Clip cards are empty-state only
- **Creator scraping** — no crawling
- **Advanced analytics** — stats are counts only

These are DB-ready (enums already include `TIKTOK`, jobs already queued) and will ship in V2 without schema churn.

---

## License

Private — ClipForge AI V1 foundation. Do not move to V2 until V1 is approved.
