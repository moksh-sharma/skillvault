# Convenience wrapper - native nginx reverse proxy on :80 (see nginx/nginx.host-dev-native.conf)
param(
    [switch] $Reload,
    [switch] $Stop
)
$script = Join-Path $PSScriptRoot "scripts\start-nginx-local-reverse-proxy.ps1"
if ($Stop) {
    & $script -Stop
} elseif ($Reload) {
    & $script -Reload
} else {
    & $script
}
