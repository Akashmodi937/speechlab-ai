import json
from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app


def test_health_endpoint():
    response = TestClient(app).get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

def test_external_import_requires_transcript():
    response = TestClient(app).post("/api/v1/audio-tests/import-external", json={"provider": "external"})
    assert response.status_code == 422

def test_external_import_accepts_transcript():
    response = TestClient(app).post("/api/v1/audio-tests/import-external",
        json={"provider": "external-whisper", "transcript": "नमस्ते world"})
    assert response.status_code == 200
    assert response.json()["raw_transcript"] == "नमस्ते world"
    assert response.json()["status"] == "imported"

def test_audio_upload_strips_codec_parameters_from_content_type(tmp_path, monkeypatch):
    from app.api.v1.endpoints import audio_tests
    from app.core.config import settings

    captured = {}

    class MockResponse:
        def raise_for_status(self):
            pass

        def json(self):
            return {"transcript": "hello"}

    class MockAsyncClient:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc_value, traceback):
            pass

        async def post(self, *args, **kwargs):
            captured["files"] = kwargs["files"]
            return MockResponse()

    async def mock_save_local_run(doc):
        pass

    monkeypatch.setattr(audio_tests.httpx, "AsyncClient", MockAsyncClient)
    monkeypatch.setattr(audio_tests, "detect_audio_duration_seconds", lambda *args: 10.0)
    monkeypatch.setattr(audio_tests, "get_database", lambda: None)
    monkeypatch.setattr(audio_tests, "save_local_run", mock_save_local_run)
    monkeypatch.setattr(settings, "sarvam_api_key", "test-key")
    monkeypatch.setattr(settings, "audio_storage_dir", str(tmp_path))

    response = TestClient(app).post(
        "/api/v1/audio-tests/run",
        files={"file": ("recording.webm", b"audio data", "Audio/WebM;codecs=opus")},
    )

    assert response.status_code == 200
    assert captured["files"]["file"] == ("recording.webm", b"audio data", "audio/webm")


def _wav_audio(duration_seconds: int) -> bytes:
    import wave

    output = BytesIO()
    with wave.open(output, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(16_000)
        wav_file.writeframes(b"\0\0" * 16_000 * duration_seconds)
    return output.getvalue()


@pytest.mark.parametrize(
    ("language_code", "mode", "transcript", "verbatim", "translate"),
    [
        ("hi-IN", "transcribe", "नमस्ते दुनिया", False, False),
        ("en-IN", "transcribe", "Hello world", False, False),
        ("mr-IN", "transcribe", "नमस्कार जग", False, False),
        ("auto", "codemix", "नमस्ते world", False, False),
        ("en-IN", "verbatim", "Hello uh world", True, False),
        ("mr-IN", "translate", "Hello world", False, True),
    ],
)
@pytest.mark.parametrize(("duration", "expected_api"), [(10, "rest"), (30, "rest"), (31, "batch")])
def test_sarvam_routes_audio_by_decoded_duration_and_preserves_settings(
    tmp_path, monkeypatch, language_code, mode, transcript, verbatim, translate, duration, expected_api
):
    from app.api.v1.endpoints import audio_tests
    from app.core.config import settings

    captured = {"calls": []}

    class MockResponse:
        def __init__(self, payload=None, content=b""):
            self.payload = payload
            self.content = content
            self.text = ""

        def raise_for_status(self):
            pass

        def json(self):
            return self.payload if self.payload is not None else json.loads(self.content)

    class MockAsyncClient:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc_value, traceback):
            pass

        async def post(self, url, **kwargs):
            captured["calls"].append(("post", url, kwargs))
            if url == audio_tests.SARVAM_STT_URL:
                return MockResponse({"transcript": transcript, "language_code": language_code})
            if url == audio_tests.SARVAM_BATCH_JOB_URL:
                return MockResponse({"job_id": "job-123"})
            if url.endswith("/upload-files"):
                return MockResponse({
                    "storage_container_type": "Azure_V1",
                    "upload_urls": {"recording.wav": {"file_url": "https://upload"}},
                })
            if url.endswith("/start"):
                return MockResponse({"job_state": "Running"})
            if url.endswith("/download-files"):
                return MockResponse({"download_urls": {"0.json": {"file_url": "https://result"}}})
            raise AssertionError(f"Unexpected POST {url}")

        async def put(self, url, **kwargs):
            captured["calls"].append(("put", url, kwargs))
            return MockResponse()

        async def get(self, url, **kwargs):
            captured["calls"].append(("get", url, kwargs))
            if url.endswith("/status"):
                return MockResponse({
                    "job_state": "Completed",
                    "job_details": [{
                        "state": "Success",
                        "outputs": [{"file_name": "0.json"}],
                    }],
                })
            return MockResponse({"transcript": transcript, "language_code": language_code})

    async def mock_save_local_run(doc):
        captured["saved"] = doc

    monkeypatch.setattr(audio_tests.httpx, "AsyncClient", MockAsyncClient)
    monkeypatch.setattr(audio_tests, "get_database", lambda: None)
    monkeypatch.setattr(audio_tests, "save_local_run", mock_save_local_run)
    monkeypatch.setattr(settings, "sarvam_api_key", "test-key")
    monkeypatch.setattr(settings, "audio_storage_dir", str(tmp_path))

    response = TestClient(app).post(
        "/api/v1/audio-tests/run",
        data={
            "language_code": language_code,
            "mode": mode,
            "keyterms_json": '["SpeechLab"]',
            "with_timestamps": "true",
            "desired_output": "roman",
            "verbatim": str(verbatim).lower(),
            "translate": str(translate).lower(),
        },
        files={"file": ("recording.wav", _wav_audio(duration), "audio/wav")},
    )

    assert response.status_code == 200
    run = response.json()
    assert run["status"] == "success"
    assert run["transcription_api"] == expected_api
    assert run["audio_duration_seconds"] == duration
    assert run["raw_transcript"] == transcript
    assert Path(run["audio_path"]).read_bytes() == _wav_audio(duration)
    assert run["desired_output"] == "roman"
    assert run["verbatim"] is verbatim
    assert run["translate"] is translate

    if expected_api == "rest":
        rest_call = next(call for call in captured["calls"] if call[1] == audio_tests.SARVAM_STT_URL)
        assert rest_call[2]["data"]["mode"] == mode
        assert rest_call[2]["data"]["language_code"] == audio_tests.LANGUAGE_CODES[language_code]
        assert rest_call[2]["data"]["keyterms"] == '["SpeechLab"]'
    else:
        init_call = next(call for call in captured["calls"] if call[1] == audio_tests.SARVAM_BATCH_JOB_URL)
        parameters = init_call[2]["json"]["job_parameters"]
        assert parameters == {
            "model": "saaras:v4",
            "mode": mode,
            "language_code": audio_tests.LANGUAGE_CODES[language_code],
            "keyterms": ["SpeechLab"],
            "with_timestamps": True,
        }
        upload_call = next(call for call in captured["calls"] if call[0] == "put")
        assert upload_call[2]["content"] == _wav_audio(duration)
        assert upload_call[2]["headers"] == {
            "x-ms-blob-type": "BlockBlob",
            "Content-Type": "audio/wav",
        }
        batch_api_calls = [
            call for call in captured["calls"]
            if call[1].startswith(audio_tests.SARVAM_BATCH_JOB_URL)
        ]
        assert all(
            call[2]["headers"]["api-subscription-key"] == "test-key"
            for call in batch_api_calls
        )
        signed_url_calls = [
            call for call in captured["calls"] if call[1] in {"https://upload", "https://result"}
        ]
        assert all("api-subscription-key" not in call[2].get("headers", {}) for call in signed_url_calls)
        assert run["batch_job_id"] == "job-123"


def test_duration_detection_reads_container_duration_and_raw_pcm():
    from app.api.v1.endpoints.audio_tests import detect_audio_duration_seconds

    assert detect_audio_duration_seconds(_wav_audio(31), "recording.wav", "auto") == 31
    assert detect_audio_duration_seconds(b"\0\0" * 16_000 * 31, "recording.pcm", "pcm_s16le") == 31


def test_audio_over_batch_duration_limit_is_saved_as_failed_without_provider_call(tmp_path, monkeypatch):
    from app.api.v1.endpoints import audio_tests
    from app.core.config import settings

    saved = {}

    class UnexpectedAsyncClient:
        def __init__(self, **kwargs):
            raise AssertionError("Audio over two hours must not be sent to Sarvam.")

    async def mock_save_local_run(doc):
        saved.update(doc)

    monkeypatch.setattr(audio_tests.httpx, "AsyncClient", UnexpectedAsyncClient)
    monkeypatch.setattr(audio_tests, "detect_audio_duration_seconds", lambda *args: 7201.0)
    monkeypatch.setattr(audio_tests, "get_database", lambda: None)
    monkeypatch.setattr(audio_tests, "save_local_run", mock_save_local_run)
    monkeypatch.setattr(settings, "sarvam_api_key", "test-key")
    monkeypatch.setattr(settings, "audio_storage_dir", str(tmp_path))

    response = TestClient(app).post(
        "/api/v1/audio-tests/run",
        files={"file": ("recording.wav", _wav_audio(1), "audio/wav")},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "failed"
    assert "up to 2 hours" in response.json()["error"]
    assert Path(saved["audio_path"]).read_bytes() == _wav_audio(1)
