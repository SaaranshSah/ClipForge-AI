"""
ClipForge AI — Python Backend (FastAPI)
V1: Lightweight worker / webhook service.
Heavy video processing (transcode, clip extraction) will land in V2.
This service is deliberately separate from the Next.js frontend so it can
scale independently on Netlify Functions vs. a container worker.

Run: uvicorn app.main:app --reload --port 8000
"""

from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os

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
