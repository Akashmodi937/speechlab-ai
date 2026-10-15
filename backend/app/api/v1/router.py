from fastapi import APIRouter

from app.api.v1.endpoints.audio_tests import router as audio_tests_router
from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.system import router as system_router
from app.api.v1.endpoints.transcript_tools import router as transcript_tools_router
from app.api.v1.endpoints.tts import router as tts_router

api_router = APIRouter()
api_router.include_router(health_router, tags=["Health"])
api_router.include_router(audio_tests_router)
api_router.include_router(transcript_tools_router)
api_router.include_router(system_router)
api_router.include_router(tts_router)
