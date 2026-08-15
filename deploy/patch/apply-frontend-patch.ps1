# apply-frontend-patch.ps1
# Copies a fresh frontend build over a company's IIS web folder WITHOUT touching
# that company's per-deployment files: config.json (BRAND + API_URL) and
# web.config (SPA routing). Static files, so no app-stop needed.
#
# MANDATORY, NON-SKIPPABLE: before touching anything, this script makes a full
# copy of the CURRENT target into C:\ERP\_backups\. Not optional - a 2026-07-28
# incident on the backend script (same /MIR pattern) deleted live customer data
# because there was no backup step. Never ship a /MIR-based patch without one.
#
#   .\apply-frontend-patch.ps1 -Source D:\Projects\WebErp\frontend\build -Target C:\inetpub\erp-web-c1
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

Write-Host "Patching frontend: $Target" -ForegroundColor Cyan
Write-Host "  (preserving config.json + web.config)"

# /MIR mirrors (removes stale hashed js/css); /XF excludes the per-company files
# from BOTH copy and delete, so the target keeps its own config.json / web.config.
robocopy $Source $Target /MIR /XF config.json web.config /NFL /NDL /NP /R:2 /W:2 | Out-Null
$rc = $LASTEXITCODE

if ($rc -ge 8) { Write-Error "robocopy failed (exit $rc)"; exit 1 }
Write-Host "Done. Frontend patched, per-company config preserved." -ForegroundColor Green
