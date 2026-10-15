
# SpeechLab AI — fix for API 404

This archive intentionally has a top-level `speechlab-ai` folder. Extract it into:
`B:\R\Final project\Audio Compare`

Then stop every old Uvicorn terminal with Ctrl+C. Do not start Uvicorn from `B:\R\Final project\Audio Compare` or from a different project.

Start the backend from PowerShell:
```powershell
cd "B:\R\Final project\Audio Compare\speechlab-ai"
.\START-BACKEND.ps1
```
The script changes directory into `speechlab-ai\backend`, syncs dependencies, imports the exact `app.main:app`, and verifies the routes before starting the server. It will stop instead of running if the routes are not registered.

Start frontend in a separate PowerShell:
```powershell
cd "B:\R\Final project\Audio Compare\speechlab-ai"
.\START-FRONTEND.ps1
```

Check:
- http://127.0.0.1:8000/docs
- http://127.0.0.1:8000/api/v1/health
- http://127.0.0.1:8000/api/v1/system/status
- http://127.0.0.1:8000/api/v1/audio-tests/runs?limit=100

If the script says port 8000 is occupied, stop the existing Uvicorn terminal first. The `.env` file should be at `speechlab-ai\backend\.env`. This package excludes secret `.env` files; preserve your own existing environment file.
