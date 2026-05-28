# Site Gate — Release-Artefakte: Firefox .xpi + Chromium .zip
# Ausfuehren: pwsh -File scripts/package.ps1
param(
  [string]$Version = "",
  [switch]$SkipIcons
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $SkipIcons) {
  $genIcons = Join-Path $PSScriptRoot "gen-icons.py"
  $iconOk = Test-Path "icons/icon48.png"
  if (-not $iconOk) {
    foreach ($py in @("python", "py", "python3")) {
      try {
        & $py $genIcons 2>$null
        if (Test-Path "icons/icon48.png") { break }
      } catch { }
    }
  }
  if (-not (Test-Path "icons/icon48.png")) {
    throw "icons/icon48.png fehlt — Python + gen-icons.py ausfuehren oder -SkipIcons wenn Icons schon da sind."
  }
}

$manifest = Get-Content "manifest.json" -Raw | ConvertFrom-Json
if (-not $Version) { $Version = $manifest.version }
$slug = "site-gate-$Version"

$dist = Join-Path $root "dist"
$stagingRoot = Join-Path $dist $slug
if (Test-Path $stagingRoot) { Remove-Item $stagingRoot -Recurse -Force }
New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null

$copyItems = @(
  "background.js",
  "gate",
  "icons",
  "options",
  "shared"
)

foreach ($item in $copyItems) {
  $src = Join-Path $root $item
  if (-not (Test-Path $src)) { throw "Fehlt: $item" }
  Copy-Item -Path $src -Destination (Join-Path $stagingRoot $item) -Recurse -Force
}

function Stage-Variant {
  param(
    [string]$Name,
    [string]$ManifestFile,
    [string]$OutExt
  )
  $variantDir = Join-Path $dist "$slug-$Name"
  if (Test-Path $variantDir) { Remove-Item $variantDir -Recurse -Force }
  Copy-Item -Path $stagingRoot -Destination $variantDir -Recurse -Force
  Copy-Item -Path (Join-Path $root $ManifestFile) -Destination (Join-Path $variantDir "manifest.json") -Force

  $artifact = Join-Path $dist "$slug-$Name.$OutExt"
  if (Test-Path $artifact) { Remove-Item $artifact -Force }

  Push-Location $variantDir
  try {
    Compress-Archive -Path * -DestinationPath $artifact -CompressionLevel Optimal -Force
  } finally {
    Pop-Location
  }

  $bytes = (Get-Item $artifact).Length
  Write-Host "OK  $artifact  ($([math]::Round($bytes / 1KB, 1)) KB)"
  return $artifact
}

Write-Host ""
Write-Host "Site Gate packager — v$Version"
Write-Host "Staging: $stagingRoot"
Write-Host ""

$firefox = Stage-Variant -Name "firefox" -ManifestFile "manifest.firefox.json" -OutExt "xpi"
$chromium = Stage-Variant -Name "chromium" -ManifestFile "manifest.chromium.json" -OutExt "zip"

$checksums = Join-Path $dist "SHA256SUMS.txt"
@(
  "Site Gate v$Version",
  "$(Get-FileHash $firefox -Algorithm SHA256 | ForEach-Object Hash)  $(Split-Path $firefox -Leaf)",
  "$(Get-FileHash $chromium -Algorithm SHA256 | ForEach-Object Hash)  $(Split-Path $chromium -Leaf)"
) | Set-Content -Path $checksums -Encoding utf8

Write-Host ""
Write-Host "Checksums: $checksums"
Write-Host ""
Write-Host "Firefox:   about:debugging -> temporaeres Add-on -> $firefox"
Write-Host "Chromium:  chrome://extensions -> Entwicklermodus -> ZIP entpacken oder Ordner laden"
Write-Host "           (manifest.json aus $slug-chromium.zip enthaelt service_worker)"
