# Fixing SpeechLab AI API 404s

The backend source registers the routers under `settings.api_prefix` (default `/api/v1`). The expected routes include:
- GET `/api/v1/health`
- GET `/api/v1/system/status`
- GET `/api/v1/audio-tests/runs`
- POST `/api/v1/audio-tests/run`

If all these routes return 404 while Uvicorn says startup completed, the process is likely serving a different `app.main:app` module or running from the wrong directory.

## Start the exact backend
1. Stop all Uvicorn processes with Ctrl+C in every backend terminal.
2. Extract this archive into `B:\R\Final project\Audio Compare\speechlab-ai`, preserving your `.env` files.
3. Open PowerShell in that folder and run:
   ```powershell
   .\START-BACKEND.ps1
   ```
   The script explicitly changes directory to this archive's `backend` folder before starting Uvicorn.
4. Open `http://127.0.0.1:8000/docs`. Search for `audio-tests` and `system/status`.
5. Verify `http://127.0.0.1:8000/api/v1/health` returns `{"status":"ok","service":"speechlab-ai-backend"}`.

Run frontend separately with `.\START-FRONTEND.ps1`.

Do not run `uv run uvicorn app.main:app` from the parent `Audio Compare` directory. Run it from `speechlab-ai\backend`, or use the included launcher.
