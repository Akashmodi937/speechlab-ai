$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
if (-not (Get-Command pwsh -ErrorAction SilentlyContinue) -and -not (Get-Command powershell -ErrorAction SilentlyContinue)) { throw "PowerShell is required." }
$ps = if (Get-Command pwsh -ErrorAction SilentlyContinue) { "pwsh" } else { "powershell" }
Start-Process $ps -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $root "START-BACKEND.ps1")) -WorkingDirectory $root
Start-Process $ps -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $root "START-FRONTEND.ps1")) -WorkingDirectory $root
Write-Host "Opened backend and frontend terminals. Once both start, open http://localhost:3000" -ForegroundColor Green
