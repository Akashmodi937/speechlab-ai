from fastapi import APIRouter

from app.core.config import settings
from app.db import get_database

router = APIRouter(prefix="/system", tags=["System & settings"])

@router.get("/status")
async def system_status():
    db = get_database()
    mongo_connected = db is not None
    return {
        "service": "speechlab-ai",
        "environment": settings.app_env,
        "api_prefix": settings.api_prefix,
        "providers": {
            "sarvam": {"configured": bool(settings.sarvam_api_key), "model": "saaras:v4",
                       "features": ["audio transcription", "mode selection", "keyterms", "timestamps",
                                    "Bulbul v3/v4-flash text-to-speech"]},
            "gemini": {"configured": bool(settings.gemini_api_key), "model": settings.gemini_model,
                       "features": ["Hindi/Marathi script conversion", "protected terms prompt"]},
        },
        "database": {
            "type": "mongodb" if mongo_connected else ("local_json_fallback" if not settings.mongodb_required else "mongodb"),
            "configured": bool(settings.mongodb_uri),
            "connected": mongo_connected,
            "required": settings.mongodb_required,
            "database_name": settings.mongodb_database,
            "collection": "audio_test_runs",
        },
        "limits": {"max_audio_size_mb": settings.max_audio_size_mb, "rest_clip_guidance_seconds": 30},
        "endpoints": [
            {"method": "GET", "path": f"{settings.api_prefix}/health", "purpose": "Backend health"},
            {"method": "GET", "path": f"{settings.api_prefix}/system/status", "purpose": "Provider, database and settings status"},
            {"method": "GET", "path": f"{settings.api_prefix}/tts/options", "purpose": "List supported Bulbul models, languages and voices"},
            {"method": "POST", "path": f"{settings.api_prefix}/tts/generate", "purpose": "Generate speech with a selected Bulbul model"},
            {"method": "POST", "path": f"{settings.api_prefix}/audio-tests/run", "purpose": "Run Saaras v4 audio test"},
            {"method": "GET", "path": f"{settings.api_prefix}/audio-tests/runs", "purpose": "Saved run history"},
            {"method": "POST", "path": f"{settings.api_prefix}/audio-tests/{{run_id}}/compare-external", "purpose": "Compare pasted product transcript and save report"},
            {"method": "POST", "path": f"{settings.api_prefix}/audio-tests/import-external", "purpose": "Import a transcript result from another STT pipeline"},
            {"method": "GET", "path": f"{settings.api_prefix}/audio-tests/export.csv", "purpose": "Export all runs and reports"},
            {"method": "GET", "path": f"{settings.api_prefix}/audio-tests/export.xlsx", "purpose": "Download formatted Excel test report"},
            {"method": "POST", "path": f"{settings.api_prefix}/transcripts/convert-script", "purpose": "Hindi/Marathi script conversion"},
            {"method": "POST", "path": f"{settings.api_prefix}/transcripts/compare", "purpose": "Reference transcript WER/CER"},
        ],
        "secrets_exposed": False,
    }
