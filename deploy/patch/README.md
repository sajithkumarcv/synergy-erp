# Patch process — after the base version

The **2026-07-19** build is the base. Everything after ships as a numbered patch,
in two independent streams. Golden rule: a patch **swaps shared code** and
**never touches per-company config**.

```
deploy/patch/
├─ db/
│  ├─ _create_patch_table.sql   run ONCE per DB after the base
│  ├─ template_patch.sql        copy → NNNN_name.sql for each DB patch
│  └─ patches/                   put your real NNNN_*.sql here (create as needed)
├─ apply-frontend-patch.ps1     swap build/, keep config.json + web.config
└─ apply-backend-patch.ps1      swap api/,   keep appsettings*.json + web.config
```

## One-time, right after deploying the base
Run `db/_create_patch_table.sql` against **each of the 3 company DBs**. It creates
`proj.TBL_DB_PATCH` (the per-DB ledger) and prints the current patch level (0).

## DB patch (per change)
1. Copy `db/template_patch.sql` → `db/patches/0001_short_name.sql`.
2. Set `@PatchNo` / `@FileName`, write the change **idempotently** (guards like
   `IF COL_LENGTH(...) IS NULL`, `CREATE OR ALTER` via `EXEC(N'…')`).
3. Run it against **all 3 DBs**. It self-records in `TBL_DB_PATCH` and is a no-op
   if already applied — so re-running or applying out of order is safe.
4. Check any DB's level: `SELECT MAX(PatchNo) FROM proj.TBL_DB_PATCH;`

## Frontend patch (per change)
1. `cd frontend && CI=false npm run build` (produces `build/`).
2. For each company web folder:
   ```powershell
   .\apply-frontend-patch.ps1 -Source D:\Projects\WebErp\frontend\build -Target C:\inetpub\erp-web-c1
   .\apply-frontend-patch.ps1 -Source D:\Projects\WebErp\frontend\build -Target C:\inetpub\erp-web-c2
   .\apply-frontend-patch.ps1 -Source D:\Projects\WebErp\frontend\build -Target C:\inetpub\erp-web-c3
   ```
   Each company keeps its own `config.json` (BRAND + API_URL) and `web.config`.

## Backend patch (per change)
1. `cd backend && dotnet publish -c Release -o ..\deploy\api`.
2. For each company api folder:
   ```powershell
   .\apply-backend-patch.ps1 -Source D:\Projects\WebErp\deploy\api -Target C:\inetpub\erp-api-c1
   .\apply-backend-patch.ps1 -Source D:\Projects\WebErp\deploy\api -Target C:\inetpub\erp-api-c2
   .\apply-backend-patch.ps1 -Source D:\Projects\WebErp\deploy\api -Target C:\inetpub\erp-api-c3
   ```
   Each keeps its own `appsettings*.json`, `web.config`, and `logs/`. The script
   drops `app_offline.htm` to release the DLL lock, then removes it.

## Version stamping
Bump the visible build string in each brand's `brand.json` `version` field per
release (shown on the login footer) so you can eyeball which build a site runs.
Order of ops for a combined release: **DB patch first, then backend, then frontend.**

## Rollback
- DB: patches are forward-only; write a paired `NNNN_rollback.sql` if a change is risky.
- Front/back: keep the previous `build/` and `api/` publish; re-run the apply script
  pointed at the old source to revert (configs stay untouched either way).
