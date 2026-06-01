# TechBank.ai - Start the three portal servers (Guest 3005, Freelancer 3006, Employee 3007)
# NETWORK MODE: Portals listen on 0.0.0.0 so other devices on your network can access them.
# Usage: .\start-portals.ps1  (from techbankai folder)
# For local-only (this PC only): .\start-portals-local.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

# Your network IP (other devices use these URLs). Set $env:TECHBANK_NETWORK_IP to override.
$networkIP = $env:TECHBANK_NETWORK_IP
if (-not $networkIP) {
  try {
    $addr = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceAlias -notmatch 'Loopback' -and $_.IPAddress -match '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)' } | Select-Object -First 1
    if ($addr) { $networkIP = $addr.IPAddress }
  } catch {}
  if (-not $networkIP) { $networkIP = "192.168.0.107" }
}

Write-Host ''
Write-Host 'TechBank.ai - Portal Servers (Network Mode)' -ForegroundColor Cyan
Write-Host 'Guest: 3005 | Freelancer: 3006 | Employee: 3007' -ForegroundColor Cyan
Write-Host ''
Write-Host 'On this PC:' -ForegroundColor White
Write-Host '  http://localhost:3005/guest' -ForegroundColor Gray
Write-Host '  http://localhost:3006/freelancer' -ForegroundColor Gray
Write-Host '  http://localhost:3007/employee' -ForegroundColor Gray
Write-Host ''
Write-Host 'On your network (other laptops/PCs):' -ForegroundColor Green
Write-Host "  http://${networkIP}:3005/guest" -ForegroundColor Cyan
Write-Host "  http://${networkIP}:3006/freelancer" -ForegroundColor Cyan
Write-Host "  http://${networkIP}:3007/employee" -ForegroundColor Cyan
Write-Host ''
# Write network links to a file so you can copy/share with other PCs
$linksFile = Join-Path $root "PORTAL_NETWORK_LINKS.txt"
@"
# TechBank.ai - Portal links for other PCs on the same network
# Replace YOUR_PC_IP with your machine's IP (see below) or use the detected IP already filled in.
# Run: .\start-portals.ps1 (network mode) so these ports are listening.

Guest:              http://${networkIP}:3005/guest
Freelancer:         http://${networkIP}:3006/freelancer
Company Employee:   http://${networkIP}:3007/employee

# How to find your IP on Windows: Run in PowerShell: (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { !`$_.InterfaceAlias.Match('Loopback') }).IPAddress
# Or: ipconfig  (look for IPv4 Address under your active adapter, e.g. 192.168.1.5)
"@ | Set-Content -Path $linksFile -Encoding UTF8
Write-Host "Network links saved to: $linksFile" -ForegroundColor DarkGray
Write-Host ''
Write-Host 'Backend: run .\start-backend.ps1 (HOST=0.0.0.0). For network CORS use CORS_ORIGINS=* in backend .env' -ForegroundColor Yellow
Write-Host 'Local-only? Run: .\start-portals-local.ps1 and .\start-backend-local.ps1' -ForegroundColor Yellow
Write-Host 'Press Ctrl+C to stop all three.' -ForegroundColor Yellow
Write-Host ''
Write-Host 'If links show "closed" or "can''t connect": run this script first so the servers are running.' -ForegroundColor Gray
Write-Host 'For network URLs, ensure your PC IP is correct (or set $env:TECHBANK_NETWORK_IP).' -ForegroundColor Gray
Write-Host ''

$frontendDir = Join-Path $root "frontend"
if (-not (Test-Path $frontendDir)) {
    Write-Host 'Frontend directory not found.' -ForegroundColor Red
    exit 1
}

$nodeModulesPath = Join-Path $frontendDir "node_modules"
if (-not (Test-Path $nodeModulesPath)) {
    Write-Host 'Installing dependencies...' -ForegroundColor Yellow
    Set-Location $frontendDir
    npm install
    if ($LASTEXITCODE -ne 0) { exit 1 }
    Write-Host 'Dependencies installed.' -ForegroundColor Green
}

Set-Location $frontendDir
npm run dev:portals
