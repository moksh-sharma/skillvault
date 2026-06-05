# Deploy SkillVault on a shared server (from Windows - copies commands for SSH target)
# On the Linux server, run: ./scripts/deploy-server.sh
param(
    [string]$Server = "172.16.200.30",
    [string]$User = "email-int",
    [string]$RemotePath = "/opt/skillvault/bank.ai"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "SkillVault server deploy helper" -ForegroundColor Cyan
Write-Host "  Server: ${User}@${Server}"
Write-Host "  Remote path: $RemotePath"
Write-Host ""
Write-Host "On the server, run:" -ForegroundColor Yellow
Write-Host @"
  cd $RemotePath
  cp .env.server.example .env   # edit secrets
  chmod +x scripts/deploy-server.sh
  ./scripts/deploy-server.sh
"@
Write-Host ""
Write-Host "App URL: http://${Server}:8080/" -ForegroundColor Green
Write-Host "Docs: docs/deployment-server.md"
Write-Host ""

$sync = Read-Host "Sync bank.ai folder to server now via scp? (y/N)"
if ($sync -match '^[yY]') {
    $bankAi = Join-Path (Split-Path -Parent $Root) "bank.ai"
    if (-not (Test-Path $bankAi)) { $bankAi = $Root }
    Write-Host "Creating remote directory..."
    ssh "${User}@${Server}" "mkdir -p $RemotePath"
    Write-Host "Uploading (excluding node_modules, venv, .git)..."
    scp -r "$bankAi\*" "${User}@${Server}:${RemotePath}/"
    Write-Host "Starting deploy on server..."
    ssh "${User}@${Server}" "cd $RemotePath && chmod +x scripts/deploy-server.sh && ./scripts/deploy-server.sh"
}
