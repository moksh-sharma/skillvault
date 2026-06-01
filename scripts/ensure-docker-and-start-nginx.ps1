#Requires -Version 5.1
<#
.SYNOPSIS
  Ensures Docker Desktop is running, waits for the engine, then starts the dev nginx proxy (:80 → Vite :3005 + API).

.PARAMETER BackendPort
  Port your FastAPI/uvicorn listens on (default 8000).

.EXAMPLE
  .\scripts\ensure-docker-and-start-nginx.ps1 -BackendPort 8002
#>
param(
    [int] $BackendPort = 8000
)

$ErrorActionPreference = "Stop"

$dockerExe = "${env:ProgramFiles}\Docker\Docker\resources\bin\docker.exe"
$dockerDesktop = "${env:ProgramFiles}\Docker\Docker\Docker Desktop.exe"

if (-not (Test-Path $dockerExe)) {
    Write-Host "Docker CLI not found at: $dockerExe" -ForegroundColor Red
    Write-Host "Install with: winget install Docker.DockerDesktop" -ForegroundColor Yellow
    exit 1
}

function Test-DockerEngine {
    & $dockerExe info 2>$null | Out-Null
    return ($LASTEXITCODE -eq 0)
}

if (-not (Test-DockerEngine)) {
    if (Test-Path $dockerDesktop) {
        Write-Host "Starting Docker Desktop (engine was not running)..." -ForegroundColor Yellow
        Start-Process $dockerDesktop
    }
    $maxWait = [TimeSpan]::FromMinutes(5)
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed -lt $maxWait) {
        if (Test-DockerEngine) {
            Write-Host "Docker engine is ready." -ForegroundColor Green
            break
        }
        Start-Sleep -Seconds 2
    }
    if (-not (Test-DockerEngine)) {
        Write-Host @"

Docker engine still not responding after $($maxWait.TotalMinutes) minutes.

Do this manually:
  1. Open "Docker Desktop" from the Start menu.
  2. Wait until it says "Engine running" (whale icon steady).
  3. If prompted, finish WSL 2 / Linux kernel setup and reboot if required.
  4. Run this script again.

"@ -ForegroundColor Yellow
        exit 1
    }
}

# This file lives in <repo>/scripts - repo root is one level up
$root = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $root "docker-compose.host-dev.yml"))) {
    Write-Host "Run this from the bank.ai repo (missing docker-compose.host-dev.yml next to scripts/)." -ForegroundColor Red
    exit 1
}
$env:BACKEND_UPSTREAM = "host.docker.internal:$BackendPort"
$env:FRONTEND_UPSTREAM = "host.docker.internal:3005"
$env:PATH = "$(Split-Path $dockerExe -Parent);$env:PATH"

Write-Host ""
Write-Host "Starting nginx proxy on http://127.0.0.1 (port 80)..." -ForegroundColor Green
Write-Host "  Frontend -> $($env:FRONTEND_UPSTREAM)" -ForegroundColor Gray
Write-Host "  Backend  -> $($env:BACKEND_UPSTREAM)" -ForegroundColor Gray
Write-Host ""
Write-Host "In another terminal:  cd frontend; npm run dev:behind-proxy" -ForegroundColor Cyan
Write-Host "Backend must listen on 0.0.0.0:$BackendPort" -ForegroundColor Cyan
Write-Host ""

Set-Location $root
& $dockerExe compose -f docker-compose.host-dev.yml up
