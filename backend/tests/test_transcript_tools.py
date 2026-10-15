from fastapi.testclient import TestClient
from app.main import app

def test_compare_identical_text():
    response = TestClient(app).post("/api/v1/transcripts/compare", json={
        "reference_text": "नमस्ते दुनिया", "hypothesis_text": "नमस्ते दुनिया"
    })
    assert response.status_code == 200
    assert response.json()["wer_percent"] == 0
    assert response.json()["cer_percent"] == 0

def test_compare_rejects_empty_reference():
    response = TestClient(app).post("/api/v1/transcripts/compare", json={
        "reference_text": "   ", "hypothesis_text": "hello"
    })
    assert response.status_code == 422

def test_external_product_comparison_is_attached_to_same_run(tmp_path, monkeypatch):
    import json
    from app.core.config import settings

    monkeypatch.setattr(settings, "audio_storage_dir", str(tmp_path))
    run = {
        "run_id": "run_same_audio_123", "created_at": "2026-10-13T12:00:00+00:00",
        "provider": "sarvam", "model": "saaras:v4", "status": "success",
        "audio_filename": "same-audio.wav", "raw_transcript": "नमस्ते दुनिया", "audio_sha256": "abc123"
    }
    (tmp_path / "runs.json").write_text(json.dumps([run], ensure_ascii=False), encoding="utf-8")
    response = TestClient(app).post(
        "/api/v1/audio-tests/run_same_audio_123/compare-external",
        json={"provider": "My product", "model": "stt-v1", "transcript": "नमस्ते दुनिया"},
    )
    assert response.status_code == 200
    assert response.json()["comparison"]["wer_percent"] == 0
    saved = json.loads((tmp_path / "runs.json").read_text(encoding="utf-8"))
    assert saved[0]["external_comparison"]["provider"] == "My product"


def test_compare_returns_word_level_differences():
    response = TestClient(app).post("/api/v1/transcripts/compare", json={
        "reference_text": "hello brave world",
        "hypothesis_text": "hello new world extra"
    })
    assert response.status_code == 200
    body = response.json()
    assert body["word_edits"] > 0
    assert body["word_differences"]
    assert any(item["type"] in {"different", "extra_in_hypothesis", "missing_from_hypothesis"}
               for item in body["word_differences"])


def test_system_status_never_exposes_provider_secrets():
    response = TestClient(app).get("/api/v1/system/status")
    assert response.status_code == 200
    body = response.json()
    assert body["secrets_exposed"] is False
    assert "sarvam_api_key" not in str(body)
    assert any(item["path"] == "/api/v1/audio-tests/export.csv" for item in body["endpoints"])
