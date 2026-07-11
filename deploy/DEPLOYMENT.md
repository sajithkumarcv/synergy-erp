# ERP Web — Client Deployment Guide

Package contents:
- `api/` — ASP.NET Core 8.0 REST API (Release publish)
- `web/` — React production build (static files)

## Prerequisites on the client server
- .NET 8.0 **ASP.NET Core Hosting Bundle** (for IIS) or .NET 8 runtime (for self-host)
- IIS **URL Rewrite** module (needed by `web/web.config`)
- SQL Server with the `ERPDB` database restored (schema `proj`, all `sp_*` procedures)

## 1. Database
Restore/create the client's `ERPDB` database and confirm the `proj` schema,
tables, and stored procedures exist. SMTP settings live in
`proj.TBL_APP_SETTINGS` (not in appsettings) — update them there.

## 2. Backend (`api/`)
1. Copy `api/` to the server (e.g. `C:\inetpub\erp-api`).
2. Pick the client config: the package ships `appsettings.ClientA.json` and
   `appsettings.ClientB.json`. Set the environment on the site/service:
   `ASPNETCORE_ENVIRONMENT=ClientA` (or `ClientB`).
   For a new client, copy one of these files, rename, and edit:
   - `ConnectionStrings:DefaultConnection` — client SQL Server + credentials
   - `Jwt:Key` — generate a fresh 32+ char secret per client
   - `App:FrontendUrl` — the URL the frontend is served from
3. IIS: create a site/app pointing at the folder, app pool = **No Managed Code**.
   Set the environment variable in IIS Configuration Editor
   (`system.webServer/aspNetCore` → environmentVariables) or at machine level.
4. Browse `https://<api-host>/swagger` to verify it starts (dev only — disable
   or restrict Swagger for production if required).

## 3. Frontend (`web/`)
1. Copy `web/` to the server (e.g. `C:\inetpub\erp-web`) and create an IIS site.
2. Edit `web/config.json` and point it at the client's API:
   ```json
   { "API_URL": "https://<api-host>/api/" }
   ```
   No rebuild needed — the app reads this at load time.
3. `web.config` (included) handles React Router deep links; requires the IIS
   URL Rewrite module.
4. Optional client branding: replace `logo.png` / company details
   (company details are compiled in `src/Variable.js` — changing those
   requires a rebuild).

## 4. Smoke test
1. Open the frontend URL — login page loads.
2. Log in — verifies API connectivity, SQL connection, and JWT issuance.
3. Open a module with lookups (e.g. Customer) — verifies stored procedures.
4. Check `proj.TBL_APP_LOG` for startup/login errors if anything fails.

## Notes
- JWT tokens expire after 480 minutes; token is held in `sessionStorage`
  (session ends when the browser closes).
- CORS is currently `AllowAnyOrigin` in `Program.cs`.
- Keep client `appsettings.Client*.json` passwords out of source control /
  shared drives; fill real credentials only on the client server.
