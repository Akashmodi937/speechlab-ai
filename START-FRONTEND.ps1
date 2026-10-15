$ErrorActionPreference = "Stop"
$frontend = Join-Path $PSScriptRoot "frontend"
if (-not (Test-Path (Join-Path $frontend "package.json"))) { throw "Frontend source not found: $frontend" }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "Node.js/npm is not installed or not on PATH." }
Set-Location $frontend
if (-not (Test-Path (Join-Path $frontend ".env.local"))) {
    Copy-Item (Join-Path $frontend ".env.example") (Join-Path $frontend ".env.local")
}
if (-not (Test-Path (Join-Path $frontend "node_modules"))) {
    Write-Host "Installing frontend dependencies (first run only)…" -ForegroundColor Cyan
    npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed. Check Node.js/npm and internet access." }
}
Write-Host "SpeechLab AI frontend starting at http://localhost:3000" -ForegroundColor Cyan
npm run dev
