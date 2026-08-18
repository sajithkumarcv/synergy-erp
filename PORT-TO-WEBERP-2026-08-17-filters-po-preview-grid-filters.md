# Port to base WebERP — session filters, PO preview, PO review print, grid column filters

Paste the block below into a Claude Code session opened at `D:\Projects\WebErp`.
Everything is frontend-only — no SQL, no controller changes, no DB touched.

Divergences already checked against `D:\Projects\WebErp` (2026-08-17) are noted inline
in the prompt, so the session doesn't re-derive them or port something already correct.

---

```
Port five changes made in the Synergy fork (D:\Projects\WebErp-Synergy) into this repo.
All are frontend-only: no SQL, no API/controller changes, no database of any kind is
touched. Work only in this repo. Read each target file before editing; the two repos
have diverged, and I've noted where below. Build with `CI=false npx react-scripts build`
in frontend/ at the end and confirm no new warnings come from files you touched.

────────────────────────────────────────────────────────────────────────
1. Session-persistent list filters
────────────────────────────────────────────────────────────────────────
Problem: filter a list page, click into a record, come back — the filters are gone,
because each page re-registers with its DEFAULT_FILTERS on mount.

Create `frontend/src/utils/filterSession.js`: a per-tab sessionStorage snapshot of each
list page's filters, keyed `erp_filters:<page>`. Export `loadFilters(page)`,
`saveFilters(page, vals)`, `hasSavedFilters(page)`, `clearSavedFilters(page)`,
`clearAllSavedFilters()`. Wrap every storage access in try/catch and treat a corrupt
entry as "nothing saved". sessionStorage (not localStorage) to match how AuthContext
stores the JWT: per-tab, survives reload and back/forward, dies with the tab. No default
export (it trips the CRA `import/no-anonymous-default-export` lint).

`frontend/src/utils/useInitialFilters.js` — add an optional second arg `pageKey`.
Precedence: `location.state.initialFilters` → saved snapshot → defaults. A tile-supplied
filter set must WIN OUTRIGHT and not be merged with the snapshot: a dashboard tile
represents one specific filtered count, and mixing in a leftover customer/date filter
would show fewer rows than the number the user clicked. With no `pageKey`, behaviour is
exactly as today.

`frontend/src/FilterContext.js` — call `saveFilters(page, …)` in `registerFilters`
(the values the page passed), `applyFilters`, and `clearFilters` (save the cleared
state too — "Clear" has to survive the round trip like any other change).

`frontend/src/AuthContext.js` — call `clearAllSavedFilters()` inside `clearSession()`,
next to the token/user removal, so the next user on the machine starts clean.

Opt the list pages in by passing their page key — it must be the SAME string the page
gives `registerFilters`, since that's what the save side uses:
  jobs/Job.js                  → useInitialFilters(DEFAULT_FILTERS, 'job')
  procurement/po/Po.js         → 'purchaseorder'
  procurement/pr/Pr.js         → 'purchaserequest'
  procurement/grn/Grn.js       → 'grn'
  invoice/Invoice.js           → 'invoice'
  bom/Bom.js                   → 'bom'
  inventory/grn/Grn.js         → 'inventory-grn'  (see the key collision below)

Bom.js and inventory/grn/Grn.js don't use useInitialFilters at all yet — add the import,
then replace the three DEFAULT_FILTERS uses (the `applied` useState, the initial
`load(...)` effect, and the `registerFilters` call) with `initialFilters`. The other
pages already use it and need only the key argument.

KEY COLLISION — must fix, or this feature actively breaks: `/grn` (procurement/grn/Grn.js)
and `/inventory-grn` (inventory/grn/Grn.js) BOTH register as `'grn'`. Harmless today, but
with persistence one page restores the other's differently-shaped filters. Rename the
inventory one to `'inventory-grn'` in both registerFilters and unregisterFilters —
it matches its route and its siblings ('inventory-issue', 'inventory-issue-return').
Nothing else references the string (Dashboard.js's `key: 'grn'` is a tile id, unrelated).

NOT APPLICABLE HERE: the Synergy Job page defaults Job Type to "everything except In
House" and needed a `hasSavedFilters('job')` guard so an intentionally cleared filter
isn't re-defaulted on return. This repo's Job.js has no 'IH' default — skip that guard.

────────────────────────────────────────────────────────────────────────
2. PO quick-view (👁 View on the PO list) — wrong field names
────────────────────────────────────────────────────────────────────────
`sp_GetPO` returns `SupplierNameResolved` (the supplier master name; `VendorName` is what
was typed on the PO) and `PaymentTermName` — singular. `PoQuickView` in
procurement/po/Po.js reads `po.paymentTermsName`, which doesn't exist, so Payment Terms
silently renders "—".

In the KPI strip: fix Payment Terms to the precedence used by PoDetailPage and the print
modals — `(po.paymentTermCode === 'OTHER' && po.paymentTermsOther) ? po.paymentTermsOther
: po.paymentTermName`. Then ADD two entries the strip lacks: **Supplier**
(`po.supplierNameResolved || po.vendorName || '—'`) and **Total PO Value**
(`po.totalAmount ?? grandTotal`, prefixed with `po.currencyShort`; the header total is
null on a draft, so fall back to the line sum already computed as `grandTotal`). Style
the total slightly heavier than the other cells. Also switch the modal's sub-header from
`po?.vendorName` to `po?.supplierNameResolved || po?.vendorName`.

ALREADY CORRECT HERE — do not "fix": approval/DocPreviewDrawer.js's PO block in this repo
already uses `supplierNameResolved || vendorName` and `paymentTermName`. Only the Synergy
copy had drifted. Optional polish, your call: rename its "Total Amount" to "Total PO
Value" and show `currencyShort` with `totalAmount ?? linesTotalWithTax`.

────────────────────────────────────────────────────────────────────────
3. PO filter panel — Supplier and Job ID as type-ahead dropdowns
────────────────────────────────────────────────────────────────────────
Both are plain `type: 'select'` fed by a 500-row preload. Make them search the server.

Layout.js already has a `searchable-select` widget, but `SearchableSelectFilter` is
hardwired to `item/search` / itemId / itemCode / itemName. Generalise it so the endpoint
comes from the filter def, keeping item search as the DEFAULT so the existing Item filters
(inventory adjustment, stock alerts, stock balance) are untouched:
  { type: 'searchable-select',
    search:  { url, valueKey, codeKey, nameKey, params },   // params = extra query args
    options: [...] }
Build the query as `URLSearchParams({ searchText, page: 1, pageSize: 20, ...cfg.params })`,
map rows to `{ value, code, name }`, and label them `code – name`.

Pass `search={def.search}` and `options={def.options}` from the FilterPanel render.

Label resolution for a value that arrives already set (a session-restored filter or a
dashboard tile): look it up in `def.options` and show that label. Without this the widget
renders an empty search box while the filter is quietly active. Fold this into the same
effect that resets local state when the parent clears the value.

Then in procurement/po/Po.js's `buildDefs`, switch:
  supplierId → searchable-select, search { url: 'supplier/search', valueKey: 'supplierId',
               codeKey: 'supplierCode', nameKey: 'supplierName' }, options: supplierOpts
  jobId      → searchable-select, search { url: 'job/search', valueKey: 'jobId',
               codeKey: 'jobId', nameKey: 'projectName',
               params: { excludeClosedStatus: true } }, options: jobOpts
Keep `options` on both — that's what resolves a restored value's label.

DIVERGENCE: the Synergy PO page cascades the Job ID list off the Job Type chips
(`loadJobOptions(jobTypeIds)`) and threads the applied jobTypeIds into the job search
params. This repo's PO page has no Job Type filter and no `loadJobOptions` — just pass
`excludeClosedStatus` and skip the cascade entirely.

────────────────────────────────────────────────────────────────────────
4. PO approval review page — no header
────────────────────────────────────────────────────────────────────────
procurement/po/PoApprovalPrintPage.js (route /purchase-orders/:poId/review, opened in a
new tab from the My Approvals 👁 drawer → "Open full page"). It should be the Format 3
document (PoPrintModal3) with NO header block at all.

- Delete the dark "Internal Approval Review Copy — not for issue to supplier /
  PURCHASE ORDER / PO number" banner inside `.po3-doc`. (There is no company banner here
  to remove — that was already dropped when the page was written.) No CSS change needed;
  the banner is inline-styled only, `.po3-banner` has no rules in PoPrint.css.
- Add PO No. as the FIRST cell of the info strip (grid goes 4 → 5 columns, monospaced,
  showing `PO-xx-xxxx  (Rev.n)` when revised). Without this, removing the header leaves
  the printed page with no PO number anywhere on it.
- T&C: apply the same `{CompanyName}` substitution Format 3 does
  (`text.replace(/\{CompanyName\}/g, company?.companyName || '')` via `useOwnerCompany`) —
  otherwise a term stored as "…supplied to {CompanyName}…" prints the placeholder.
- Footer right-hand note: match Format 3 — "This is a computer generated purchase order."
  plus the company name, which with no header is the only place the company is named.
- Print title → `Purchase Order - ${poNumber}` (drop "(Review)").

Two deliberate calls I made; keep them unless you disagree:
- KEEP the left footer wording "Last Action Date / Last Action By" rather than Format 3's
  "Authorized Date / By". On a PO still in approval, `approvedBy` is null and the value
  falls back to `createdBy` — "Authorized By" would mislabel an unapproved PO.
- KEEP the dark toolbar at the top of the tab (Print / Close Tab). It's screen-only:
  `openPrintWindow('.po3-doc', …)` extracts just the document, so it never prints.

Flag to the user when done: with the header gone, so is the "not for issue to supplier"
marking — a printout is no longer visibly distinguishable from a real vendor PO.

────────────────────────────────────────────────────────────────────────
5. Per-column filter boxes in the list grids
────────────────────────────────────────────────────────────────────────
CLIENT-SIDE ONLY — filter the rows already fetched for the current page. Do NOT add
SP parameters, controller params, or any server round trip.

Create `frontend/src/common/GridColumnFilter.js` exporting:
- `ColFilter` — a `<th>` holding a small text input with an inline `×` to clear,
  for use in a SECOND header row under the sortable one.
- `applyColFilters(rows, filters)` — case-insensitive "contains", non-empty filters ANDed.
- `hasColFilters(filters)`, and `matchNote(filters, shownCount, pageCount)` returning
  ` · showing N of M on this page` when any filter is active.

Wire it into three grids (filter row cell count must equal the column count — pad the
unfiltered columns with `<th />`):
  jobs/Job.js          → Job No. (jobId), Customer (customerName), Project (projectName)
  procurement/po/Po.js → Job No. (jobId), Supplier (vendorName)   [Job column precedes Vendor]
  procurement/pr/Pr.js → Job No. (jobId)
Render `shownRows` instead of `rows` in each tbody.

These grids are server-paged (200/page), so a column filter searches the current page
only. Keep that visible rather than silent:
- Append `matchNote(...)` to each page's record count, leaving the headline number as the
  server-side total (a page-local filter doesn't change it).
- When rows exist but none match, the empty row must say so and point at the sidebar —
  e.g. "No jobs on this page match the column filters. The filter panel on the left
  searches every page." — not the usual "no records found", which reads as "doesn't exist".

The column boxes are transient view state: they persist across sorting and paging but are
NOT saved to the session store from change 1.
```
