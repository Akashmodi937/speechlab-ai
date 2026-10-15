import base64
import binascii
import time
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.config import settings

router = APIRouter(prefix="/tts", tags=["Text to speech"])
SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech"

V3_SPEAKERS = (
    "shubh", "aditya", "ritu", "priya", "neha", "rahul", "pooja", "rohan",
    "simran", "kavya", "amit", "dev", "ishita", "shreya", "ratan", "varun",
    "manan", "sumit", "roopa", "kabir", "aayan", "ashutosh", "advait", "anand",
    "tanya", "tarun", "sunny", "mani", "gokul", "vijay", "shruti", "suhani",
    "mohit", "kavitha", "rehan", "soham", "rupali",
)
V4_SPEAKERS_BY_LANGUAGE = {
    "en-IN": ("simran_en_customer", "shubh_en_ads", "ishita_en_customer"),
    "hi-IN": ("ritu_hi_customer", "ishita_hi_devotional", "shubh_hi_devotional"),
    "bn-IN": ("bappa_bn_conversation", "roopa_bn_conversational", "bimal_bn_suspense"),
    "gu-IN": ("bhavik_gu_conversation", "pooja_gu_conversational", "pooja_gu_customer"),
    "kn-IN": ("chaitra_kn_conversation", "chaitra_kn_narration", "chetan_kn_conversation"),
    "mr-IN": ("ishita_mr_conversational", "mrunal_mr_narration", "ritu_mr_narration"),
    "pa-IN": ("anand_pa_conversation", "anand_pa_customer", "harpreet_pa_narration"),
    "ta-IN": ("gokul_ta_narration", "vetri_ta_ads", "vijay_ta_narration"),
    "te-IN": ("kavitha_te_conversation", "kavitha_te_narration", "pooja_te_conversation"),
}
ALL_LANGUAGE_CODES = (
    "bn-IN", "en-IN", "gu-IN", "hi-IN", "kn-IN", "ml-IN",
    "mr-IN", "od-IN", "pa-IN", "ta-IN", "te-IN",
)
MODELS = {
    "bulbul:v4-flash": {
        "display_name": "Sarvam Bulbul v4 Flash",
        "languages": tuple(V4_SPEAKERS_BY_LANGUAGE),
        "speakers": V4_SPEAKERS_BY_LANGUAGE,
        "default_speakers": {language: speakers[0] for language, speakers in V4_SPEAKERS_BY_LANGUAGE.items()},
        "max_characters": 2500,
        "pace_min": 0.5,
        "pace_max": 2.0,
        "codec": True,
        "temperature": True,
    },
    "bulbul:v3": {
        "display_name": "Sarvam Bulbul v3",
        "languages": ALL_LANGUAGE_CODES,
        "speakers": {language: V3_SPEAKERS for language in ALL_LANGUAGE_CODES},
        "default_speakers": {language: "shubh" for language in ALL_LANGUAGE_CODES},
        "max_characters": 2500,
        "pace_min": 0.5,
        "pace_max": 2.0,
        "codec": True,
        "temperature": True,
    },
}
CODEC_CONTENT_TYPES = {
    "wav": ("audio/wav", "wav"),
    "mp3": ("audio/mpeg", "mp3"),
    "aac": ("audio/aac", "aac"),
    "flac": ("audio/flac", "flac"),
    "linear16": ("audio/L16", "pcm"),
}
SUPPORTED_CODECS = tuple(CODEC_CONTENT_TYPES)
UI_CODECS = ("wav", "mp3")


class TTSRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    model: Literal["bulbul:v4-flash", "bulbul:v3"]
    language_code: str
    speaker: str
    pace: float = Field(default=1.0, ge=0.5, le=2.0)
    output_audio_codec: str | None = None
    temperature: float | None = Field(default=None, ge=0.01, le=1.0)

    @model_validator(mode="after")
    def validate_model_options(self):
        model_options = MODELS[self.model]
        if not self.text.strip():
            raise ValueError("text must not be empty or whitespace.")
        if len(self.text) > model_options["max_characters"]:
            raise ValueError(
                f"{self.model} accepts at most {model_options['max_characters']} characters."
            )
        if self.language_code not in model_options["languages"]:
            raise ValueError(f"{self.language_code} is not supported by {self.model}.")
        if self.speaker not in model_options["speakers"][self.language_code]:
            raise ValueError(
                f"{self.speaker} is not a supported {self.model} speaker for {self.language_code}."
            )
        if not model_options["pace_min"] <= self.pace <= model_options["pace_max"]:
            raise ValueError(
                f"pace for {self.model} must be between "
                f"{model_options['pace_min']} and {model_options['pace_max']}."
            )
        if self.output_audio_codec is not None and self.output_audio_codec not in SUPPORTED_CODECS:
            raise ValueError(f"output_audio_codec must be one of: {', '.join(SUPPORTED_CODECS)}.")
        return self


def _options_payload() -> dict:
    return {
        "models": [
            {
                "id": model_id,
                "display_name": options["display_name"],
                "languages": list(options["languages"]),
                "speakers": {
                    language: list(speakers)
                    for language, speakers in options["speakers"].items()
                },
                "default_speakers": options["default_speakers"],
                "max_characters": options["max_characters"],
                "pace_min": options["pace_min"],
                "pace_max": options["pace_max"],
                "supports_codec": options["codec"],
                "supports_temperature": options["temperature"],
                "codecs": list(UI_CODECS) if options["codec"] else [],
            }
            for model_id, options in MODELS.items()
        ],
        "languages": list(ALL_LANGUAGE_CODES),
        "comparison_languages": list(V4_SPEAKERS_BY_LANGUAGE),
    }


def _provider_error_detail(response: httpx.Response) -> str | None:
    try:
        body = response.json()
    except (ValueError, TypeError):
        return None
    if not isinstance(body, dict):
        return None
    for key in ("detail", "message", "error"):
        value = body.get(key)
        if isinstance(value, dict):
            value = value.get("message") or value.get("detail")
        if isinstance(value, str) and value.strip():
            return value.strip()[:300]
    return None


@router.get("/options")
async def tts_options():
    return _options_payload()


@router.post("/generate")
async def generate_tts(request: TTSRequest):
    if not settings.sarvam_api_key:
        raise HTTPException(503, "SARVAM_API_KEY is not configured on the backend.")

    payload = {
        "text": request.text,
        "model": request.model,
        "language_code": request.language_code,
        "speaker": request.speaker,
        "pace": request.pace,
    }
    if request.output_audio_codec is not None:
        payload["output_audio_codec"] = request.output_audio_codec
    if request.temperature is not None:
        payload["temperature"] = request.temperature

    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
            provider_response = await client.post(
                SARVAM_TTS_URL,
                headers={"api-subscription-key": settings.sarvam_api_key},
                json=payload,
            )
    except httpx.TimeoutException as exc:
        raise HTTPException(504, "Sarvam text-to-speech request timed out.") from exc
    except httpx.RequestError as exc:
        raise HTTPException(502, "Could not connect to the Sarvam text-to-speech service.") from exc

    status_code = provider_response.status_code
    if status_code in {401, 403}:
        raise HTTPException(502, "Sarvam rejected the configured API credentials.")
    if status_code == 429:
        raise HTTPException(429, "Sarvam rate limit reached. Try again later.")
    if status_code in {400, 422}:
        detail = _provider_error_detail(provider_response)
        message = "Sarvam rejected the text-to-speech request."
        if detail:
            message = f"{message} Provider detail: {detail}"
        raise HTTPException(422, message)
    if status_code >= 500:
        raise HTTPException(502, f"Sarvam text-to-speech service error ({status_code}).")
    if status_code >= 400:
        raise HTTPException(502, f"Sarvam text-to-speech request failed ({status_code}).")

    try:
        result = provider_response.json()
        if not isinstance(result, dict):
            raise TypeError("Sarvam response was not a JSON object.")
        audios = result.get("audios")
        if not isinstance(audios, list) or not audios or not isinstance(audios[0], str):
            raise ValueError("Sarvam response did not contain an audio item.")
        audio_bytes = base64.b64decode(audios[0], validate=True)
        if not audio_bytes:
            raise ValueError("Sarvam returned an empty audio item.")
    except (ValueError, binascii.Error, TypeError) as exc:
        raise HTTPException(502, "Sarvam returned an invalid or empty audio response.") from exc

    codec = request.output_audio_codec or "wav"
    content_type, extension = CODEC_CONTENT_TYPES[codec]
    latency = round(time.perf_counter() - started, 3)
    return Response(
        content=audio_bytes,
        media_type=content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{request.model.split(":")[1].replace("-", "_")}.{extension}"',
            "X-TTS-Model": request.model,
            "X-TTS-Speaker": request.speaker,
            "X-TTS-Language": request.language_code,
            "X-TTS-Audio-Format": codec,
            "X-TTS-Latency-Seconds": str(latency),
        },
    )
