# ClipForge AI — Python Worker (FastAPI)

V1 placeholder. No AI clip detection yet.

## Purpose
- Separate from Next.js frontend (Netlify Functions)
- Will run FFmpeg, Whisper, and clip-ranking in V2
- Contracts already defined: `ProcessingJob` in Postgres

## Run locally
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Docs: http://localhost:8000/docs

## Endpoints (V1)
- `GET /health` — health check
- `GET /jobs` — placeholder list
- `POST /jobs` — enqueue (returns mock)
- `POST /webhooks/storage` — storage event webhook

All worker endpoints (except /health) can be protected with `X-API-Key: $PYTHON_API_KEY`.
