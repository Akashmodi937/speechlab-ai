import base64

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.v1.endpoints import tts
from app.core.config import settings
from app.main import app


def _request(model: str, **overrides) -> dict:
    defaults = {
        "text": "नमस्ते, this is a speech test.",
        "model": model,
        "language_code": "hi-IN",
        "speaker": {
            "bulbul:v4-flash": "ritu_hi_customer",
            "bulbul:v3": "shubh",
        }[model],
        "pace": 1.0,
    }
    defaults.update(overrides)
    return defaults


def _mock_provider(monkeypatch, *, status_code=200, payload=None, exception=None):
    captured = {}

    class MockAsyncClient:
        def __init__(self, **kwargs):
            captured["timeout"] = kwargs["timeout"]

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc_value, traceback):
            return None

        async def post(self, url, **kwargs):
            captured["url"] = url
            captured.update(kwargs)
            if exception:
                raise exception
            return httpx.Response(
                status_code,
                json=payload if payload is not None else {"audios": [base64.b64encode(b"audio").decode()]},
            )

    monkeypatch.setattr(tts.httpx, "AsyncClient", MockAsyncClient)
    return captured


def test_options_expose_model_specific_voices_and_languages():
    response = TestClient(app).get(
        "/api/v1/tts/options",
        headers={"Origin": "http://localhost:3000"},
    )

    assert response.status_code == 200
    data = response.json()
    models = {model["id"]: model for model in data["models"]}
    assert set(models) == {"bulbul:v4-flash", "bulbul:v3"}
    assert models["bulbul:v4-flash"]["speakers"]["hi-IN"] == [
        "ritu_hi_customer", "ishita_hi_devotional", "shubh_hi_devotional"
    ]
    assert "shubh" in models["bulbul:v3"]["speakers"]["hi-IN"]
    assert "ml-IN" not in models["bulbul:v4-flash"]["languages"]
    assert "ml-IN" in models["bulbul:v3"]["languages"]
    assert data["comparison_languages"] == models["bulbul:v4-flash"]["languages"]
    assert "X-TTS-Latency-Seconds" in response.headers["access-control-expose-headers"]


def test_deprecated_v2_model_is_not_available():
    response = TestClient(app).post(
        "/api/v1/tts/generate",
        json={
            "text": "This model is deprecated.",
            "model": "bulbul:v2",
            "language_code": "hi-IN",
            "speaker": "anushka",
        },
    )

    assert response.status_code == 422


@pytest.mark.parametrize(
    ("model", "expected_speaker"),
    [
        ("bulbul:v4-flash", "ritu_hi_customer"),
        ("bulbul:v3", "shubh"),
    ],
)
def test_generate_sends_model_speaker_and_api_key(monkeypatch, model, expected_speaker):
    monkeypatch.setattr(settings, "sarvam_api_key", "test-secret")
    captured = _mock_provider(monkeypatch)

    response = TestClient(app).post("/api/v1/tts/generate", json=_request(model))

    assert response.status_code == 200
    assert response.content == b"audio"
    assert captured["url"] == tts.SARVAM_TTS_URL
    assert captured["headers"] == {"api-subscription-key": "test-secret"}
    assert captured["json"]["model"] == model
    assert captured["json"]["speaker"] == expected_speaker
    assert "test-secret" not in response.text


def test_model_controls_are_sent(monkeypatch):
    monkeypatch.setattr(settings, "sarvam_api_key", "test-secret")
    captured = _mock_provider(monkeypatch)

    response = TestClient(app).post(
        "/api/v1/tts/generate",
        json=_request("bulbul:v3", pace=1.5, output_audio_codec="mp3", temperature=0.7),
    )

    assert response.status_code == 200
    assert captured["json"] == {
        **_request("bulbul:v3", pace=1.5, output_audio_codec="mp3", temperature=0.7),
    }


@pytest.mark.parametrize(
    ("model", "overrides"),
    [
        ("bulbul:v3", {"speaker": "anushka"}),
        ("bulbul:v4-flash", {"speaker": "shubh"}),
        ("bulbul:v3", {"language_code": "xx-IN"}),
        ("bulbul:v3", {"pace": 2.1}),
        ("bulbul:v3", {"pitch": 0.1}),
        ("bulbul:v3", {"loudness": 1.0}),
        ("bulbul:v3", {"output_audio_codec": "opus"}),
        ("bulbul:v3", {"temperature": 1.1}),
    ],
)
def test_invalid_speakers_languages_and_model_parameters_are_rejected(model, overrides):
    response = TestClient(app).post(
        "/api/v1/tts/generate",
        json=_request(model, **overrides),
    )

    assert response.status_code == 422


@pytest.mark.parametrize(
    ("model", "text_length", "status_code"),
    [
        ("bulbul:v3", 2501, 422),
        ("bulbul:v4-flash", 2501, 422),
        ("bulbul:v3", 2500, 503),
        ("bulbul:v4-flash", 2500, 503),
    ],
)
def test_model_specific_text_limits_and_missing_api_key(model, text_length, status_code, monkeypatch):
    monkeypatch.setattr(settings, "sarvam_api_key", "")

    response = TestClient(app).post(
        "/api/v1/tts/generate",
        json=_request(model, text="x" * text_length),
    )

    assert response.status_code == status_code
    if status_code == 503:
        assert "SARVAM_API_KEY" in response.json()["detail"]


@pytest.mark.parametrize(
    ("status_code", "expected_status", "message"),
    [
        (401, 502, "credentials"),
        (400, 422, "rejected"),
        (429, 429, "rate limit"),
        (500, 502, "service error"),
    ],
)
def test_provider_http_errors_are_mapped_safely(
    monkeypatch, status_code, expected_status, message
):
    monkeypatch.setattr(settings, "sarvam_api_key", "test-secret")
    _mock_provider(monkeypatch, status_code=status_code, payload={"detail": "Invalid speaker."})

    response = TestClient(app).post(
        "/api/v1/tts/generate",
        json=_request("bulbul:v3"),
    )

    assert response.status_code == expected_status
    assert message in response.json()["detail"].lower()
    if status_code == 400:
        assert "Invalid speaker." in response.json()["detail"]
    else:
        assert "Invalid speaker." not in response.json()["detail"]


@pytest.mark.parametrize(
    "payload",
    [
        {"message": "Invalid speaker."},
        {"error": {"message": "Invalid speaker."}},
        {"error": "Invalid speaker."},
        {"unexpected": "provider error"},
        [],
    ],
)
def test_provider_validation_errors_include_safe_detail_when_available(
    monkeypatch, payload
):
    monkeypatch.setattr(settings, "sarvam_api_key", "test-secret")
    _mock_provider(monkeypatch, status_code=422, payload=payload)

    response = TestClient(app).post(
        "/api/v1/tts/generate",
        json=_request("bulbul:v3"),
    )

    assert response.status_code == 422
    if payload in (
        {"message": "Invalid speaker."},
        {"error": {"message": "Invalid speaker."}},
        {"error": "Invalid speaker."},
    ):
        assert "Invalid speaker." in response.json()["detail"]
    else:
        assert response.json()["detail"] == "Sarvam rejected the text-to-speech request."


def test_provider_timeout_returns_gateway_timeout(monkeypatch):
    monkeypatch.setattr(settings, "sarvam_api_key", "test-secret")
    _mock_provider(monkeypatch, exception=httpx.ReadTimeout("slow"))

    response = TestClient(app).post(
        "/api/v1/tts/generate",
        json=_request("bulbul:v3"),
    )

    assert response.status_code == 504


@pytest.mark.parametrize(
    ("model", "codec", "expected_type", "expected_extension"),
    [
        ("bulbul:v4-flash", "mp3", "audio/mpeg", "mp3"),
        ("bulbul:v3", "flac", "audio/flac", "flac"),
    ],
)
def test_success_decodes_audio_and_returns_its_format_headers(
    monkeypatch, model, codec, expected_type, expected_extension
):
    monkeypatch.setattr(settings, "sarvam_api_key", "test-secret")
    raw_audio = b"model-specific audio bytes"
    _mock_provider(monkeypatch, payload={"audios": [base64.b64encode(raw_audio).decode()]})
    request = _request(model)
    if codec:
        request["output_audio_codec"] = codec

    response = TestClient(app).post("/api/v1/tts/generate", json=request)

    assert response.status_code == 200
    assert response.content == raw_audio
    assert response.headers["content-type"] == expected_type
    assert response.headers["x-tts-model"] == model
    assert response.headers["x-tts-speaker"] == request["speaker"]
    assert response.headers["x-tts-language"] == request["language_code"]
    assert response.headers["x-tts-audio-format"] == (codec or "wav")
    assert response.headers["content-disposition"].endswith(f".{expected_extension}" + '"')
    assert float(response.headers["x-tts-latency-seconds"]) >= 0


@pytest.mark.parametrize(
    "payload",
    [
        [],
        {},
        {"audios": []},
        {"audios": [""]},
        {"audios": ["not valid base64!"]},
    ],
)
def test_malformed_or_empty_audio_response_is_rejected(monkeypatch, payload):
    monkeypatch.setattr(settings, "sarvam_api_key", "test-secret")
    _mock_provider(monkeypatch, payload=payload)

    response = TestClient(app).post(
        "/api/v1/tts/generate",
        json=_request("bulbul:v3"),
    )

    assert response.status_code == 502
