# Stellt manifest.json fuer Chrome/Edge (scripts + service_worker) wieder her.
$root = Split-Path -Parent $PSScriptRoot
Copy-Item -Path (Join-Path $root "manifest.chromium.json") -Destination (Join-Path $root "manifest.json") -Force
Write-Host "manifest.json <- manifest.chromium.json (scripts + service_worker)"
