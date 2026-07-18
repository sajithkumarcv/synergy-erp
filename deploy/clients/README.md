# Multi-Company Deployment — 3 Independent Sites, One Port, One Server

3 companies on one server, all on **port 8080**, distinguished by hostname via
free `nip.io` wildcard DNS (`*.40.81.227.70.nip.io` → `40.81.227.70`, no DNS
account, no certificate — plain HTTP).

Each company is fully independent: own IIS sites, own app pool, own database.
Nothing shared, so one company can never read another's data.

## URLs

| Company  | App URL (users open this)                     | API URL (browser calls, invisible)                  | DB       |
|----------|-----------------------------------------------|-----------------------------------------------------|----------|
| COMPANY1 | http://company1.40.81.227.70.nip.io:8080/     | http://api-company1.40.81.227.70.nip.io:8080/api/   | ERPDB_C1 |
| COMPANY2 | http://company2.40.81.227.70.nip.io:8080/     | http://api-company2.40.81.227.70.nip.io:8080/api/   | ERPDB_C2 |
| COMPANY3 | http://company3.40.81.227.70.nip.io:8080/     | http://api-company3.40.81.227.70.nip.io:8080/api/   | ERPDB_C3 |

**Why two hostnames per company:** the controllers are routed at `api/[controller]`
with no `UsePathBase`, so the API must sit at a site **root**. Frontend also sits
at root (so the existing build works with **no rebuild**). Two roots on one port =
two hostnames. `nip.io` makes extra hostnames free.

## IIS layout — 6 sites, all bound to port 8080 by host header

| IIS site       | Host name binding                         | Port | Physical folder            | App pool (No Managed Code) |
|----------------|-------------------------------------------|------|----------------------------|----------------------------|
| erp-web-c1     | company1.40.81.227.70.nip.io              | 8080 | C:\inetpub\erp-web-c1      | pool-web-c1                |
| erp-api-c1     | api-company1.40.81.227.70.nip.io          | 8080 | C:\inetpub\erp-api-c1      | pool-api-c1                |
| erp-web-c2     | company2.40.81.227.70.nip.io              | 8080 | C:\inetpub\erp-web-c2      | pool-web-c2                |
| erp-api-c2     | api-company2.40.81.227.70.nip.io          | 8080 | C:\inetpub\erp-api-c2      | pool-api-c2                |
| erp-web-c3     | company3.40.81.227.70.nip.io              | 8080 | C:\inetpub\erp-web-c3      | pool-web-c3                |
| erp-api-c3     | api-company3.40.81.227.70.nip.io          | 8080 | C:\inetpub\erp-api-c3      | pool-api-c3                |

Host-header bindings on the same port do not conflict — IIS routes by the `Host`
header. Make sure port 8080 is open in the server firewall / cloud NSG.

## Per-company steps

For each company (files are in `COMPANY1/`, `COMPANY2/`, `COMPANY3/`):

### 1. Database
- Create/restore the DB (e.g. `ERPDB_C1`); confirm `proj` schema + all `sp_*`.
- Set SMTP in `proj.TBL_APP_SETTINGS` (not in appsettings).

### 2. API site
1. Copy the shipped `../api/` folder to `C:\inetpub\erp-api-c1`.
2. Overwrite its `appsettings.json` + `web.config` with the ones from `COMPANY1\api\`.
3. Edit `appsettings.json`: real DB name + **password**, confirm `DbSchema`
   (case-sensitive: `proj`). `Jwt:Key` is already unique — leave it.
4. IIS: site `erp-api-c1`, binding host `api-company1.40.81.227.70.nip.io` port 8080,
   own app pool = **No Managed Code**.

### 3. Web site
1. Copy the shipped `../web/` folder to `C:\inetpub\erp-web-c1`.
2. Overwrite its `config.json` with `COMPANY1\web\config.json` (already points at
   the company API). Keep the shipped `web.config` (SPA routing).
3. IIS: site `erp-web-c1`, binding host `company1.40.81.227.70.nip.io` port 8080, own app pool.

### 4. Smoke test (per company)
1. `http://api-company1.40.81.227.70.nip.io:8080/swagger` loads → API + DB config OK.
2. `http://company1.40.81.227.70.nip.io:8080/` → login page loads.
3. Log in → verifies DB connection + JWT.
4. Open a lookup module (e.g. Customer) → verifies stored procedures.
5. On failure, check `proj.TBL_APP_LOG` in **that company's** DB.

## Order & gotchas
- **API before SQL passwords:** start the API first, then confirm the DB login —
  a wrong password surfaces as a 500 at login.
- **App pool isolation:** each of the 6 sites gets its own pool so a recycle/crash
  is contained to one company.
- **DbSchema case matters** — must match the actual schema exactly.
- **No cert needed** — everything is plain `http://` on 8080. `nip.io` is only DNS.
  For real production later, point a real domain at the IP (same IIS host-header
  setup) and add certs for HTTPS.
- **Secrets:** don't commit filled DB passwords to source control / shared drives.
- Server prereqs: .NET 8 **ASP.NET Core Hosting Bundle** + IIS **URL Rewrite** module,
  and port 8080 open in the firewall / cloud security group.
