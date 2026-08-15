# apply-backend-patch.ps1
# Copies a fresh API publish over a company's IIS api folder WITHOUT touching
# that company's per-deployment files: appsettings*.json (connection string + JWT),
# web.config, and license.json (per-client signed license - NOT part of the build
# output, so /MIR would otherwise delete it and LicenseMiddleware blocks every
# request with 402); and runtime data folders: Docs/ (uploaded document
# attachments - LPO copies etc, saved under ContentRootPath/Docs, NOT part of the
# build output either), wwwroot/uploads/ (see below) and logs/. Drops
# app_offline.htm first so the ASP.NET Core process releases ERPWEB.dll
# (otherwise the DLL is locked and the copy fails), then removes it.
#
# wwwroot/uploads/ - ADDED 2026-08-15. This one fails DIFFERENTLY from the
# 2026-07-28 case and is easy to miss: CompanyController.UploadLogo writes to
# ContentRootPath/wwwroot/uploads/company-logo{ext} - a FIXED filename - and
# backend/wwwroot/uploads/company-logo.{png,jpeg} are COMMITTED TO THE REPO, so
# they DO appear in the publish output. /MIR therefore does not delete the
# target's logo, it OVERWRITES it with the repo's logo. Every company would
# silently get the same wrong branding. Excluded via /XD uploads so each site
# keeps its own.
#
# IMPORTANT: anything that lives in the api root but is NOT part of the published
# build (license.json, Docs/, future runtime data) MUST be added to the /XF or
# /XD list below, or /MIR silently deletes it as "not in source". And anything
# that IS in the build but is per-company at runtime (wwwroot/uploads) must be
# excluded too, or /MIR overwrites it. That exclusion list is a "we thought of
# everything" claim, and history says that claim is sometimes wrong - which is
# why the unconditional backup below exists as the real safety net, not the
# exclusion list.
#
# MANDATORY, NON-SKIPPABLE: before touching anything, this script makes a full
# copy of the CURRENT target into C:\ERP\_backups\. This cannot be disabled by a
# flag on purpose - 2026-07-28 taught us that skippable safety steps get skipped.
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

# -- MANDATORY backup of the target, taken BEFORE any change. Always runs. --
$backupRoot = "C:\ERP\_backups"
$stamp      = Get-Date -Format 'yyyyMMdd_HHmmss'
$leaf       = Split-Path $Target -Leaf
$clientTag  = Split-Path (Split-Path $Target -Parent) -Leaf
$backupDir  = Join-Path $backupRoot "$clientTag`_$leaf`_$stamp"

Write-Host "Backing up $Target -> $backupDir" -ForegroundColor Yellow
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
robocopy $Target $backupDir /E /NFL /NDL /NP /R:2 /W:2 | Out-Null
if ($LASTEXITCODE -ge 8) {
    Write-Error "Backup failed (robocopy exit $LASTEXITCODE) - ABORTING before touching $Target. Nothing was patched."
    exit 1
}
Write-Host "Backup complete." -ForegroundColor Yellow

Write-Host "Patching backend: $Target" -ForegroundColor Cyan
Write-Host "  (preserving appsettings*.json + web.config + license.json + Docs/ + logs/ + wwwroot/uploads/)"

# Take the app offline so it releases the DLL lock.
$offline = Join-Path $Target 'app_offline.htm'
Set-Content -Path $offline -Value '<h1>Updating. Back shortly.</h1>' -Encoding UTF8
Start-Sleep -Seconds 2

# /MIR mirrors; exclude the per-company files and app_offline.htm from copy+delete,
# and the Docs (uploaded document attachments) + logs + wwwroot/uploads (company
# logo) folders from mirroring entirely so existing runtime data survives.
robocopy $Source $Target /MIR /XF web.config "appsettings*.json" license.json app_offline.htm /XD logs Docs uploads /NFL /NDL /NP /R:2 /W:2 | Out-Null
$rc = $LASTEXITCODE

# Bring the app back online whatever happened.
Remove-Item $offline -ErrorAction SilentlyContinue

if ($rc -ge 8) { Write-Error "robocopy failed (exit $rc). App brought back online."; exit 1 }
Write-Host "Done. Backend patched, per-company config + license + documents preserved." -ForegroundColor Green
