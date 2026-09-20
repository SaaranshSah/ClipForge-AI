# ClipForge AI — V2 Cloudinary Video System (Professional)

> **V1 preserved** — Firebase Auth/Firestore/Cloudinary-connected (now expanded), ClipForge fpq, all UI kept. V2 adds **Cloudinary-first** video pipeline with **no Firebase Storage, no R2** — only Cloudinary for actual video bytes; Firestore only for metadata.

---

## 1) What was built

### Server-only Cloudinary core (`lib/cloudinary/server.ts` — `import "server-only"`)

- **Never exposes `CLOUDINARY_API_SECRET`** — only `cloudName`, `apiKey`, `timestamp`, `signature`, `folder`, `publicId`, `uploadUrl` go to browser.
- `getCloudinaryConfig()` — reads `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (+ `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` for public); mock mode when missing or `CLOUDINARY_MOCK=true`.
- `generateCloudinarySignature({ uid, videoId, filename, folderType })`:
  - Folder `users/{uid}/videos/{videoId}/{folderType}` where `folderType` ∈ `original | clips | shorts | thumbnails` — covers all required folders.
  - Sanitized `publicId = {folder}/{baseName}_{timestamp}` — no extension, preserves original extension via Cloudinary.
  - Signs `{ folder, public_id, timestamp }` via `cloudinary.utils.api_sign_request(..., api_secret)` — sorted SHA1, Cloudinary spec; mock returns `mock_signature_*`.
  - Returns `uploadUrl = https://api.cloudinary.com/v1_1/<cloud>/video/upload`.
- `deleteCloudinaryAsset(publicId, resourceType)` — server `cloudinary.uploader.destroy(publicId, { resource_type, invalidate:true })` — mock no-op.
- Helpers `getCloudinaryThumbnailUrl`, `getCloudinaryVideoUrl`, `mapCloudinaryToMetadata`.

### Firestore types (`lib/cloudinary/firestore.ts`)

```ts
path: users/{uid}/videos/{videoId}
fields: fileName, cloudinaryPublicId, cloudinaryUrl, resourceType, format, fileSize, duration, width, height, status, processingStatus, ownerId, createdAt, updatedAt, thumbnailUrl, originalFolder, version, error
folders: getCloudinaryFolders(uid, videoId) -> { original, clips, shorts, thumbnails } all under users/{uid}/videos/{videoId}/
```

> Do NOT store actual video files in Firestore — only metadata. Firestore Security Rules: `request.auth.uid == uid` (see `firestore.rules.example`).

### Extended Firebase Admin mock (`lib/firebase-admin.ts`)

- Generic `mockStore: Map<collectionPath, Map<docId, data>>` now supports any `users/{uid}/videos` and `users/{uid}/jobs` etc. — `collection(path).doc(id).set/get/delete`, `collection.get()` etc., so local dev works without `FIREBASE_ADMIN_CREDENTIALS`.

### API Routes (all per-user, secure, `server-only`)

- `POST /api/cloudinary/signature` — auth via `getClipForgeUser` (JWT cookie or `Authorization: Bearer <Firebase ID token>`). Validates `filename`, mime `video/*`, size ≤2GB. Generates `videoId` if not provided. Returns signed params for **direct browser → Cloudinary** upload. Never returns secret.
- `POST /api/cloudinary/complete` — after Cloudinary success, body `{ videoId, cloudinaryPublicId, cloudinaryUrl, format, fileSize, duration, width, height }` or raw `public_id/secure_url`. Verifies `publicId` prefix `users/{uid}/videos/{videoId}/` (or mock). Upserts `users/{uid}/videos/{videoId}` with `ownerId`, `originalFolder`, `thumbnailUrl` (derived), `status:ready`, `processingStatus:completed`.
- `GET /api/cloudinary/videos?limit=50` — lists own videos sorted `createdAt desc` — checks `Authorization` header or JWT cookie, queries `users/{uid}/videos`.
- `GET /api/cloudinary/videos/[videoId]` — single video, owner check (`ownerId === uid`).
- `DELETE /api/cloudinary/videos/[videoId]` — owner check → `deleteCloudinaryAsset(publicId)` server-side (with secret) → `Firestore delete`. Per-user only — 403/404 otherwise.

All: 401 if not logged in, 403 if publicId not owned, 413 for >2GB, 415 for unsupported mime.

### UI (professional, no redesign breakage)

- `components/cloudinary/CloudinaryUploader.tsx`:
  - `ACCEPT = video/*` (MP4/MOV/AVI/WebM/MKV), `MAX 2GB`, validation, drag-drop, preview via `URL.createObjectURL`.
  - **Progress**: XHR `upload.onprogress` → `Progress` 10-95% (or mock interval 10→100), `signing → uploading → saving → done`.
  - **Large video support**: direct `POST https://api.cloudinary.com/v1_1/<cloud>/video/upload` via `XMLHttpRequest` (or `fetch` for signature + XHR for file) — **no Netlify function proxy**, so huge files don't hit 10s limit; also works for chunked if Cloudinary auto-chunks.
  - **Cancellation**: `xhr.abort()` + `AbortController` for mock, UI shows `Cancelled` + `Retry`.
  - **Retry**: re-calls `startUpload` with same file — re-fetches signature.
  - **Preview**: local `video` preview before upload, then Cloudinary `secure_url` preview after (`controls autoPlay`).
  - Gets Firebase ID token via `getFirebaseAuth().currentUser.getIdToken()` and sends `Authorization: Bearer` for all server calls.

- `components/cloudinary/VideoLibrary.tsx`:
  - Fetches `/api/cloudinary/videos` with token, client search filter `fileName|videoId|format`.
  - Grid: **Thumbnail** (derived `so_1,w_320,h_180,c_fill` jpg from Cloudinary video, or stored `thumbnailUrl`), **Filename**, **Duration** (`formatDuration`), **Size** (`formatBytes`), **Upload date** (`timeAgo`), **Status** badge (`ready|failed|uploading`), **Processing status**, **Delete** button (with confirm, per-item `Loader2`, owner-only).
  - **Preview** toggle: replaces thumbnail with `<video src={cloudinaryUrl} controls autoPlay>`.
  - Shows `cloudinaryPublicId` and folder `users/{uid}/videos/{videoId}/original/` for audit, plus Cloudinary flag.
  - Responsive `sm:grid-cols-2 lg:grid-cols-3`.

- `components/cloudinary/DashboardCloudinaryCard.tsx` — recent 3 videos on `/dashboard` (alongside ClipForge card).

### Routes

- `/upload` — now **3 tabs**: `Cloudinary — Signed direct` (default, primary), `ClipForge (fpq)`, `Legacy S3` — all preserved; Cloudinary tab shows uploader + link to library.
- `/library` — new `app/(dashboard)/library/page.tsx` — `CloudinaryUploader` on top + `VideoLibrary` + dev contracts card.
- `/dashboard` — adds `DashboardCloudinaryCard` + `DashboardClipForgeCard` in 2-col grid above processing jobs; stats still show Prisma counts.
- `components/layout/sidebar.tsx` — added `Library` nav item (`Video` icon) between Upload and Projects.

### Security

- `CLOUDINARY_API_SECRET` only in `lib/cloudinary/server.ts` (`server-only`), never imported in client; verified via `grep -R CLOUDINARY_API_SECRET .next/static` → only docs string, not value; `grep -R demo_secret .next` → no value leak; server bundle uses `process.env.CLOUDINARY_API_SECRET` at runtime.
- **Signed upload**: HMAC with secret server-side; client only gets signature.
- **Per-user**: every API checks `uid` from auth and that `publicId` starts with `users/{uid}/videos/` and Firestore `ownerId === uid`; `GET/DELETE /api/cloudinary/videos/[videoId]` returns 404/403 for cross-user.
- **No R2, no Firebase Storage for videos** — client never calls `getFirebaseStorage` for new uploads; `lib/storage.ts` kept for legacy but not used for V2 videos; Cloudinary folders auto-created on first upload.

### Env (`/.env.example` + `/.env.local` mock)

```env
CLOUDINARY_CLOUD_NAME="your-cloud-name"
CLOUDINARY_API_KEY="your-api-key"
CLOUDINARY_API_SECRET="your-api-secret-keep-server-only"
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME="your-cloud-name"
CLOUDINARY_MOCK="true" # local mock without real account
```

Netlify: set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (Build & Functions, not `NEXT_PUBLIC` for secret), `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` (Build). Local `.env.local` uses `demo` + `CLOUDINARY_MOCK=true` for preview.

---

## 2) Cloudinary folders prepared

All under `users/{uid}/videos/{videoId}/` — Cloudinary auto-creates on upload; we generate signatures for each:

- `users/{uid}/videos/{videoId}/original/` — primary upload (V2 default)
- `users/{uid}/videos/{videoId}/clips/` — ClipForge-derived clips (future)
- `users/{uid}/videos/{videoId}/shorts/` — Shorts (future)
- `users/{uid}/videos/{videoId}/thumbnails/` — thumbnails (derived via `so_1` transformation, no extra upload needed but folder ready)

Shown in UI `CloudinaryUploader` chips + `DashboardCloudinaryCard` footer + `firestore.rules.example` comment. No pre-creation API call needed — first signed upload to that folder creates it.

---

## 3) Firestore Security Rules (`firestore.rules.example` — add)

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/videos/{videoId} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
      allow create: if request.auth.uid == uid && request.resource.data.ownerId == uid
                    && request.resource.data.cloudinaryPublicId.matches('users/' + uid + '/videos/.*');
    }
    match /users/{uid}/jobs/{jobId} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

**Storage Rules** — Firebase Storage **not used for videos** in V2 (Cloudinary only). Keep Storage rules for back-compat but videos go to Cloudinary.

---

## 4) Complete test workflow

### Prerequisites

- `npm install` (cloudinary added), `CLOUDINARY_MOCK=true` for local without account (or real keys + `CLOUDINARY_MOCK=false`).
- Firebase Auth configured (`clipforge-ai-910f9`), user signed in via `/login` (existing, untouched) → Firebase UID available.

### Steps

1. **Login** → `/login` → Firebase email/pass or Google → verify `Firebase UID` in browser devtools `getFirebaseAuth().currentUser.uid`, and `Authorization: Bearer <ID token>` works (check `/api/cloudinary/signature` 401 without token, 200 with).
2. **Upload** → `/upload` (Cloudinary tab default) or `/library` top → drag MP4, see local preview, click `Upload to Cloudinary` → UI shows `Signing 5% → Uploading 10-95%` with `Progress` bar, bytes/sec via XHR.
3. **Progress** → watch `Progress` increment; for mock it animates to 100 in ~2s; for real Cloudinary it follows XHR `onprogress`.
4. **Cancellation** → during `uploading`, click `Cancel` → XHR aborts, toast “Upload cancelled”, state `cancelled`, `Retry` appears.
5. **Retry** → after `error` or `cancelled`, click `Retry upload` → re-fetches signature + re-uploads same file.
6. **Firestore metadata** → Firebase Console → Firestore → `users/{uid}/videos/{videoId}` → check fields: `fileName`, `cloudinaryPublicId` (`users/{uid}/videos/{videoId}/original/...`), `cloudinaryUrl` (`https://res.cloudinary.com/.../video/upload/...mp4`), `resourceType:video`, `format`, `fileSize`, `duration`, `width`, `height`, `status:ready`, `ownerId: uid`, `createdAt/updatedAt` ISO, `thumbnailUrl`.
7. **Preview** → `/library` grid card → click `Preview` → `<video>` loads from `cloudinaryUrl`; thumbnail shows before preview (`so_1` frame). Also `/library` uploader shows final Cloudinary `secure_url` preview after upload.
8. **Video Library** → `/library` → `VideoLibrary` shows grid thumbnails, filename, duration (`formatDuration`), size (`formatBytes`), upload date (`timeAgo`), status badge, processing status, folder path, Cloudinary publicId. Search filter works. `Refresh` re-fetches. Also `/dashboard` → `Cloudinary Library` card shows 3 recent videos.
9. **Delete** → in `VideoLibrary` card → `Delete` → confirm → `DELETE /api/cloudinary/videos/{videoId}` → server checks `ownerId === uid` then `cloudinary.uploader.destroy(publicId)` (mock logs) then Firestore delete → toast success, card removed. Try deleting another user's `videoId` (change `videoId` in fetch manually with your token but other's `videoId`) → 404/403.
10. **Security checks**:
   - `grep -R CLOUDINARY_API_SECRET .next/static` → only docs, no value; `grep -R demo_secret .next` → no leak; network tab `POST /api/cloudinary/signature` response contains `apiKey, signature, timestamp` but never `apiSecret`; `POST` to Cloudinary uses signature, not secret.
   - `GET /api/cloudinary/videos` without auth → 401; with `userA` token cannot fetch `userB` video → 404/403.
   - Firestore rules: emulator `request.auth.uid != uid` → denied.

### Verification checklist (local)

```bash
npm run build # 28/28 pages, 4 cloudinary routes, no type errors
grep -R "CLOUDINARY_API_SECRET" .next/static | grep -v "CLOUDINARY_API_SECRET —" && echo "LEAK!" || echo "ok"
# mock quick unit (if you bypass server-only):
# Test folders, signature folder prefix, per-user delete
```

---

## 5) Architecture note (Netlify-safe)

- **Direct signed upload** → browser streams straight to `https://api.cloudinary.com` — huge videos never traverse Netlify Functions (10s limit). Only tiny JSON (`/signature`, `/complete`) hits Functions — well under limit.
- No `getFirebaseStorage` for V2 videos, no R2 SDK, no `Buffer` of file on server.
- Mock mode (`CLOUDINARY_MOCK=true`) lets Netlify preview and local dev work without Cloudinary billing — real keys just flip the flag.

---

## 6) Next steps (if you add clipping)

- Generate `clips/` and `shorts/` by posting a Cloudinary transformation job or ClipForge job that reads `cloudinaryUrl` and writes back to `users/{uid}/videos/{videoId}/clips/{clipId}.mp4` (Cloudinary folder), then upsert Firestore with new `clipPublicId`.
- Thumbnails already derived via `so_1,w_320...`; for custom thumbnails upload to `.../thumbnails/` via same signature flow with `folderType: thumbnails`.
