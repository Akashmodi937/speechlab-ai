$ErrorActionPreference = "Stop"
$backend = Join-Path $PSScriptRoot "backend"
if (-not (Test-Path (Join-Path $backend "app\main.py"))) { throw "Backend source not found: $backend" }
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) { throw "uv is not installed or not on PATH. Install uv first." }
$envFile = Join-Path $backend ".env"
if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $backend ".env.example") $envFile
    Write-Host "Created backend\.env from the example. Add SARVAM_API_KEY and confirm MONGODB_URI, then rerun this script." -ForegroundColor Yellow
    notepad $envFile
    exit 1
}
Set-Location $backend
Write-Host "SpeechLab AI backend starting at http://localhost:8000" -ForegroundColor Cyan
Write-Host "API docs: http://localhost:8000/docs" -ForegroundColor Cyan
uv sync
if ($LASTEXITCODE -ne 0) { throw "uv sync failed. Check Python/uv installation and internet access." }
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
