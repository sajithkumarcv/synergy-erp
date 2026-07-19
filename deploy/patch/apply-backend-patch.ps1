# apply-backend-patch.ps1
# Copies a fresh API publish over a company's IIS api folder WITHOUT touching
# that company's per-deployment files: appsettings*.json (connection string + JWT)
# and web.config. Drops app_offline.htm first so the ASP.NET Core process releases
# ERPWEB.dll (otherwise the DLL is locked and the copy fails), then removes it.
#
#   .\apply-backend-patch.ps1 -Source D:\Projects\WebErp\deploy\api -Target C:\inetpub\erp-api-c1
#
# Run once per company (c1/c2/c3), each with its own -Target.

param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Target
)

if (-not (Test-Path $Source)) { Write-Error "Source not found: $Source"; exit 1 }
if (-not (Test-Path $Target)) { Write-Error "Target not found: $Target"; exit 1 }

Write-Host "Patching backend: $Target" -ForegroundColor Cyan
Write-Host "  (preserving appsettings*.json + web.config + logs)"

# Take the app offline so it releases the DLL lock.
$offline = Join-Path $Target 'app_offline.htm'
Set-Content -Path $offline -Value '<h1>Updating. Back shortly.</h1>' -Encoding UTF8
Start-Sleep -Seconds 2

# /MIR mirrors; exclude the per-company files and app_offline.htm from copy+delete,
# and the logs folder from mirroring so existing logs survive.
robocopy $Source $Target /MIR /XF web.config "appsettings*.json" app_offline.htm /XD logs /NFL /NDL /NP /R:2 /W:2 | Out-Null
$rc = $LASTEXITCODE

# Bring the app back online whatever happened.
Remove-Item $offline -ErrorAction SilentlyContinue

if ($rc -ge 8) { Write-Error "robocopy failed (exit $rc). App brought back online."; exit 1 }
Write-Host "Done. Backend patched, per-company config preserved." -ForegroundColor Green
