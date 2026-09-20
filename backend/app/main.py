"""
ClipForge AI — Python Backend (FastAPI)
V1: Lightweight worker / webhook service.
Heavy video processing (transcode, clip extraction) will land in V2.
This service is deliberately separate from the Next.js frontend so it can
scale independently on Netlify Functions vs. a container worker.

Run: uvicorn app.main:app --reload --port 8000
"""

from fastapi import FastAPI, Depends, HTTPException, Header, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os
import asyncio
import httpx

app = FastAPI(
    title="ClipForge AI — Worker API",
    version="1.0.0",
    description="V1 foundation: health, job queue contracts, signed URL helper. No AI yet.",
)

# CORS — allow frontend origin
origins = [os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3000"), "http://localhost:3000"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_KEY = os.getenv("PYTHON_API_KEY", "")

def verify_api_key(x_api_key: Optional[str] = Header(default=None)):
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return True

class HealthResponse(BaseModel):
    status: str
    version: str
    storage: str

class JobCreate(BaseModel):
    videoId: str
    userId: str
    type: str = "TRANSCODE"

@app.get("/", tags=["health"])
def root():
    return {"service": "clipforge-worker", "version": "1.0.0", "docs": "/docs"}

@app.get("/health", response_model=HealthResponse, tags=["health"])
def health():
    return HealthResponse(status="ok", version="1.0.0", storage=os.getenv("STORAGE_PROVIDER", "local"))

@app.get("/jobs", tags=["jobs"])
def list_jobs(authorized: bool = Depends(verify_api_key)):
    """V1 placeholder — in V2 this will list ProcessingJobs from Postgres / queue."""
    return {"jobs": [], "note": "V1 placeholder — queue activates in V2"}

@app.post("/jobs", tags=["jobs"])
def create_job(payload: JobCreate, authorized: bool = Depends(verify_api_key)):
    """Enqueue a processing job (V2: triggers FFmpeg / Whisper / LLM clip detection)."""
    return {
        "job": {
            "id": "job_mock_" + payload.videoId[:8],
            "videoId": payload.videoId,
            "type": payload.type,
            "status": "QUEUED",
            "progress": 0,
        },
        "note": "Persisted to Postgres via Next.js API in V1; worker execution lands in V2"
    }

@app.post("/webhooks/storage", tags=["webhooks"])
def storage_webhook(payload: dict, authorized: bool = Depends(verify_api_key)):
    """
    Optional webhook for storage provider to notify that upload completed.
    Next.js already has POST /api/uploads/complete — this is an alternative
    for event-driven architectures (S3 EventBridge / R2 Queues).
    """
    return {"ok": True, "received": payload}


# V3 — Highlights background worker (ClipForge fpq)
# Long-running AI work delegates to ClipForge SaaS; worker only polls status + scoring + clip generation
# Netlify Functions stay short (<8s); heavy AI runs externally. Worker runs in separate container / process.

class HighlightsTickResponse(BaseModel):
    ok: bool
    job: Optional[dict] = None
    idle: Optional[bool] = None
    message: Optional[str] = None

NEXT_APP_URL = os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3000")
# In production, frontend is https://clipforge99.netlify.app — allow override via WORKER_FRONTEND_URL
FRONTEND_URL = os.getenv("WORKER_FRONTEND_URL", NEXT_APP_URL)
WORKER_SECRET = os.getenv("WORKER_SECRET", os.getenv("CLIPFORGE_API_KEY", ""))
WORKER_ID = os.getenv("WORKER_ID", "python_worker_v3")

async def _tick_highlights_frontend(worker_id: str = WORKER_ID, discover: bool = False):
    """Call Next.js worker tick endpoint to process one highlights job."""
    url = f"{FRONTEND_URL.rstrip('/')}/api/worker/highlights/tick"
    if discover:
        url += "?discover=1"
    headers = {}
    if WORKER_SECRET:
        headers["x-worker-secret"] = WORKER_SECRET
        headers["x-worker-id"] = worker_id
    # Also send as Bearer for flexibility
    # headers["Authorization"] = f"Bearer {WORKER_SECRET}"
    async with httpx.AsyncClient(timeout=20) as client:
        try:
            resp = await client.post(url, json={"workerId": worker_id, "discover": discover}, headers=headers)
            return resp.json()
        except Exception as e:
            return {"ok": False, "error": str(e)}

@app.get("/worker/highlights/status", tags=["worker"])
async def highlights_worker_status(authorized: bool = Depends(verify_api_key)):
    """Check pending highlights jobs via frontend tick endpoint (GET)."""
    url = f"{FRONTEND_URL.rstrip('/')}/api/worker/highlights/tick"
    headers = {}
    if WORKER_SECRET:
        headers["x-worker-secret"] = WORKER_SECRET
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(url, headers=headers)
            return resp.json()
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))

@app.post("/worker/highlights/tick", tags=["worker"])
async def highlights_worker_tick(background_tasks: BackgroundTasks, discover: bool = False, authorized: bool = Depends(verify_api_key)):
    """
    Worker tick — processes one QUEUED/RETRYING highlights job.
    Called by cron every ~10s or manually.
    Query ?discover=true to also auto-queue eligible videos (idempotent).
    """
    result = await _tick_highlights_frontend(discover=discover)
    return result

@app.post("/worker/highlights/run", tags=["worker"])
async def highlights_worker_run(iterations: int = 5, delay: float = 2.0, discover: bool = False, authorized: bool = Depends(verify_api_key)):
    """
    Run N ticks sequentially — useful for local testing without cron.
    Example: POST /worker/highlights/run?iterations=10&delay=1.5&discover=true
    """
    results = []
    for i in range(max(1, min(iterations, 20))):
        r = await _tick_highlights_frontend(discover=discover if i == 0 else False)
        results.append(r)
        if r.get("idle"):
            break
        if delay > 0 and i < iterations - 1:
            await asyncio.sleep(delay)
    return {"ok": True, "iterations": len(results), "results": results}

@app.get("/worker/highlights/discover", tags=["worker"])
async def highlights_discover(authorized: bool = Depends(verify_api_key)):
    """Discover eligible videos and auto-queue (idempotent)."""
    return await _tick_highlights_frontend(discover=True)
