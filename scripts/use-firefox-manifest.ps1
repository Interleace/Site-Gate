# Kopiert manifest.firefox.json nach manifest.json (nur scripts, kein service_worker).
# Für Firefox < 121 oder wenn das Standard-Manifest einen Background-Fehler wirft.
$root = Split-Path -Parent $PSScriptRoot
Copy-Item -Path (Join-Path $root "manifest.firefox.json") -Destination (Join-Path $root "manifest.json") -Force
Write-Host "manifest.json <- manifest.firefox.json (background.scripts only)"
