from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.db import close_db, connect_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    yield
    await close_db()

app = FastAPI(title="SpeechLab AI API", description="Speech tests, Sarvam STT runs and external result imports.",
              version="0.2.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"],
                   expose_headers=["Content-Disposition", "X-TTS-Model", "X-TTS-Speaker",
                                   "X-TTS-Language", "X-TTS-Audio-Format", "X-TTS-Latency-Seconds"])
app.include_router(api_router, prefix=settings.api_prefix)

@app.get("/")
async def root():
    return {"name": "SpeechLab AI API", "docs": "/docs", "health": f"{settings.api_prefix}/health"}
