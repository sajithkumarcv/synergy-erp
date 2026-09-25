# Maintenance mode

How to take the system offline on purpose and show users a friendly "Under maintenance" page.
There are three switches. They can be combined; the table says when to use which.

| Switch | Where | Effect | Needs the API running? |
|---|---|---|---|
| **A. Web message** | `config.json` in the **web** folder | Anyone who loads/reloads the site sees the maintenance page. The API keeps working. | No |
| **B. API lock** | `appsettings.json` in the **api** folder | Every API call answers HTTP 503 with your message (except `AllowedIps`). People who already have the app open are switched to the maintenance page on their next click. | Yes |
| **C. IIS app_offline** | `app_offline.htm` in the **api** folder | IIS stops the API completely (use while replacing the API files or running DB patches). | No |

Normal planned window (recommended): **B, then A**. Deploys / DB patches: **C** (the patch scripts already `/XF` this file).

## A. Web message (per site: `C:\ERP\<Company>\web\config.json`)

```json
{
  "API_URL": "...keep as is...",
  "BRAND": "...keep as is...",
  "MAINTENANCE": {
    "Enabled": true,
    "Message": "We are upgrading the system. Please try again at 6 PM.",
    "Until": "2026-09-25T18:00:00"
  }
}
```
* Edit the file on the server; no rebuild, no IIS restart. `Until` is optional and is shown as "Expected back".
* To end maintenance set `"Enabled": false`. Open maintenance pages check every 20 s and reload into the app by themselves.
* `config.json` is per-site and is preserved by `apply-frontend-patch.ps1` (`/XF config.json`).

## B. API lock (per site: `C:\ERP\<Company>\api\appsettings.json`)

```json
"Maintenance": {
  "Enabled": true,
  "Message": "We are upgrading the system. Please try again shortly.",
  "Until": "2026-09-25T18:00:00",
  "AllowedIps": [ "192.168.50.10" ]
}
```
* `AllowedIps`: the admin's own IP(s) keep working normally, so the admin can log in and test while everyone else is blocked.
* The app reloads `appsettings.json` when it changes; if it does not pick it up, recycle the app pool.
* `GET /api/maintenance/status` always answers (never 503); it is what the maintenance page polls to know when the system is back.
* Requires the API build that contains `Middleware/MaintenanceMiddleware.cs`.

## C. IIS app_offline.htm (in `C:\ERP\<Company>\api`)

* Create `app_offline.htm` (any HTML) in the api folder: IIS stops the app and answers 503 with that page.
  Delete the file to bring the API back.
* The web app treats an HTML 503 as maintenance too, so open browsers show the maintenance page.
* Both patch scripts `/XF app_offline.htm`, so a patch does not delete it.

## Not-found and error pages (no switch needed)

* Unknown URL -> 404 "Page not found" page. A valid screen the user may not open -> "Access Denied" with a Dashboard button.
* A record id that does not exist (`/purchase-orders/999999`) -> "<Record> not found" page with a button back to the list.
* A page that crashes -> "Something went wrong" page; the menu still works and it clears when you navigate.
* Direct visits to unknown URLs reach the app because each web site's `web.config` rewrites to `index.html` (SPA routing).
