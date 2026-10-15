# SpeechLab AI — Simplified STT Test Runner

Windows-friendly FastAPI + Next.js app for comparing Sarvam Saaras v4 output against a reference transcript and an optional Whisper transcript, with Bulbul text-to-speech generation and comparison on the same STT page. This package is separate from `knowledgehub-ai`.

## What is in the form
- Audio upload or microphone recording
- Automatically generated test case ID
- Input language: Auto, Hindi, English, Marathi
- Desired output: Auto/mixed, Devanagari, Roman
- Verbatim and Translate checkboxes
- Optional reference transcript
- Critical terms (one per line)
- Optional Whisper transcript for the same audio
- Text-to-speech generation and concurrent comparison using Bulbul v4 Flash and v3

Results contain only four columns: **Test case ID**, **Raw Sarvam transcript**, **CER / WER**, and **Critical-term accuracy**. The script conversion panel and separate reference comparison form have been removed.

## Prerequisites
- Windows PowerShell
- Node.js 20+ and npm
- `uv` installed and available on PATH
- Python 3.12 (the backend pins this runtime in `.python-version`; `uv` may download it when online)
- MongoDB running locally or remotely
- Sarvam API key

## First-time setup
1. Extract the ZIP to a new folder, for example `B:\R\Final project\Audio Compare\speechlab-ai`.
2. Open `backend\.env` (the backend launcher creates it from `.env.example` on first run) and set `SARVAM_API_KEY`. Confirm `MONGODB_URI` points to a running MongoDB instance. Keep secrets in this file only.
3. Run `START-BACKEND.ps1`. On its first run it creates `.env`, opens it in Notepad, and exits so you can fill in the settings. Save it and run the script again.
4. Run `START-FRONTEND.ps1` in a second PowerShell window.
5. Open `http://localhost:3000`. API docs are at `http://localhost:8000/docs`.

For convenience, `START-ALL.ps1` opens two PowerShell windows. If the backend stops because configuration is incomplete, fix `backend\.env` and rerun `START-BACKEND.ps1`.

If PowerShell blocks scripts, run this once in that PowerShell window:
```powershell
Set-ExecutionPolicy -Scope Process Bypass
```

## Important behavior
- Saaras model is fixed to `saaras:v4`.
- Desired output maps to Saaras modes: Auto/mixed → `codemix`, Devanagari → `transcribe`, Roman → `translit`.
- Translate overrides the desired output. Verbatim applies when Translate is off.
- Critical terms are sent as Saaras `keyterms`; they are also checked against the returned transcript. Keyterms can improve recognition but do not guarantee preservation.
- CER/WER are calculated against the reference transcript when provided. The optional Whisper transcript is compared with the Sarvam transcript for the same audio; when a reference is present, both can also be measured against it.
- Microphone recording requires browser microphone permission. Audio up to 30 seconds uses Saaras REST; longer audio automatically uses Sarvam's Batch API (up to 2 hours). The backend detects duration from decoded audio metadata and retains the original audio for every run.
- Test runs and comparisons are persisted to MongoDB (`speechlab.audio_test_runs`) and can be exported as a formatted Excel report or CSV.
- TTS is an additive section on the existing STT page. It calls the backend with `SARVAM_API_KEY`, and the key is never sent to the browser.
- Compare uses one concurrent request per model for a selected common language. Each card uses that model's own default voice; voices are different and the comparison is not a controlled same-voice quality test.
- Bulbul v3 and v4 Flash accept up to 2,500 characters and support the documented output format and temperature options. The UI uses MP3/WAV for browser playback and displays only voices valid for the selected model and language. Deprecated Bulbul v2 is not offered.
- The TTS panel includes 11 featured Bulbul v4 Flash voices grouped by Companion, Customer Support, Narration, News & Sports, and Educational use cases. Each voice can be selected directly, copied as a `speaker` value, or copied as a ready-to-run PowerShell `curl.exe` request.
- If Sarvam rejects a TTS request with a validation error, the backend includes its bounded validation detail in the UI error message when available.
- TTS audio is returned as binary and held in temporary browser object URLs; it is not written to MongoDB.

## API routes
- `GET /api/v1/health`
- `GET /api/v1/system/status`
- `POST /api/v1/audio-tests/run`
- `GET /api/v1/tts/options`
- `POST /api/v1/tts/generate`
- `GET /api/v1/audio-tests/runs`
- `POST /api/v1/audio-tests/{run_id}/compare-external`
- `GET /api/v1/audio-tests/export.xlsx`
- `GET /api/v1/audio-tests/export.csv`

## Environment variables
- Required on the backend for Sarvam STT and TTS: `SARVAM_API_KEY`
- Required when MongoDB persistence is enabled: `MONGODB_URI`
- Optional for the frontend when the backend is not at its default local URL: `NEXT_PUBLIC_API_BASE_URL`
