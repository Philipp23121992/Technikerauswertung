# Nach next build: Prozess auf 3002 beenden und geplanten Task starten.
$ErrorActionPreference = "Stop"
$conn = Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
  Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
}
Start-ScheduledTask -TaskName "APMServicetools"
Start-Sleep -Seconds 10
$buildId = (Get-Content (Join-Path $PSScriptRoot "..\.next\BUILD_ID") -Raw).Trim()
try {
  $r = Invoke-WebRequest -Uri "http://127.0.0.1:3002/_next/static/$buildId/_buildManifest.js" -UseBasicParsing -TimeoutSec 30
  if ($r.StatusCode -ne 200) { exit 1 }
  Write-Host "APMServicetools OK (BUILD_ID=$buildId)"
} catch {
  Write-Error "Neustart fehlgeschlagen oder JS-Bundles nicht erreichbar: $_"
  exit 1
}
