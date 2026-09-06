# Production deployment — Synergy ERP (2026-09-06)

Six changes. Four are from the 2026-08-31 session (`aed35e4`); two have been
sitting undelivered since 2026-08-23 (`f45ec6c`).

**Nothing here has been run against production.** All six are applied and
verified on dev `SYNERP` only.

---

## 0. Confirm the baseline first — do not skip

This document assumes production last received the **2026-08-23** delivery
(`sp_GetMyApprovals` job/supplier, PO job-type filter, grid filters + sorting),
on **SynergyIN and SynergyUAE**. ESI's baseline is **not known** — it may be
further behind.

The 2026-08-15 runbook got this wrong once by measuring from the last *commit*
instead of the last *deployment*. Verify rather than trust:

```sql
-- What has actually changed in this database, and when
SELECT o.type_desc, o.name, o.modify_date
FROM sys.objects o
WHERE o.is_ms_shipped = 0 AND o.type IN ('P','U','V','FN','IF','TF','TR')
  AND o.modify_date > '2026-08-15'
ORDER BY o.modify_date DESC;
```

Then run **`_VERIFY_PROD_DEPLOY_2026-09-06.sql`** against each target database.
Before deploying, section A should read MISSING/OLD throughout and section B
should read OK. **If section B shows MISSING, that database is behind the
assumed baseline** — stop and reconcile before continuing, because the app build
you are about to deploy expects those objects.

> This exact failure already happened on dev: `sp_SearchPOs` was missing
> `@JobTypeIds` while the binary passed it, and every PO search threw
> *"@JobTypeIds is not a parameter for procedure sp_SearchPOs"* until it was
> patched on 2026-08-31.

---

## 1. Database scripts — run in this order

| # | Script | Changes | Risk |
|---|--------|---------|------|
| 1 | `2026-08-23_po_header_discount_recompute.sql` | `sp_SetPO` — recompute header `TotalAmount` after a header save | **Behaviour change — §3** |
| 2 | `2026-08-23b_self_approval_per_role.sql` | `sp_SubmitForApproval` — self-approval per approver row, not per level | **Behaviour change — §4** |
| 3 | `2026-08-31_inhouse_multi_budget_header.sql` | `sp_ImportJobBudgetItem` — sheet's BudgetHeader wins, job header is fallback | Low |
| 4 | `2026-08-31b_bom_list_filters_sort.sql` | `sp_SearchBoms` — `@JobTypeIds`, `@CustomerId`, CSV `@BomStatus`, sort whitelist, `CustomerId` in projection | Low — new optional params |
| 5 | `2026-08-31c_bom_total_value_trigger.sql` | **new trigger** `TR_BOM_RecalcTotalValue` on `TBL_BOM_DETAILS` + one-off backfill of `TotalBomValue` | Low — §5 |
| 6 | `2026-08-31d_bom_import_from_excel.sql` | **new proc** `sp_ImportBomDetail` | Low — new object, nothing calls it until the new UI ships |

All six are idempotent or abort safely if the target has drifted. Scripts 1–3
read the live definition and replace one block rather than pasting a whole
procedure body, so a client-specific divergence elsewhere in those procs is
preserved — but each **aborts with a message** if its anchor text is not found.
If one aborts, do not force it; send me the message.

**Order note:** no two scripts touch the same object, so the order above is for
sanity, not correctness. Run 1 and 2 first anyway — they are the behaviour
changes and deserve their own attention rather than being buried after routine
work.

### Per company

| Script | SynergyIN | SynergyUAE | ESI |
|---|---|---|---|
| 1 — PO discount | ✓ | ✓ | ✓ (bug exists in base `ERPDB`, so ESI has it too) |
| 2 — self-approval | ✓ | ✓ | ✓ *(read §4 first)* |
| 3 — budget header | ✓ | ✓ | ✓ |
| 4 — BOM list | ✓ | ✓ | ✓ |
| 5 — BOM value | ✓ | ✓ | ✓ |
| 6 — BOM import | ✓ | ✓ | ✓ |

Scripts 4 and 6 **require the matching API build** (§2). Applying the SQL early
is harmless — new optional parameters and an uncalled procedure — but the
features stay invisible until the backend is redeployed.

---

## 2. Application code

### Backend — rebuild + restart required

| File | Why |
|---|---|
| `Controllers/Bom/BomController.cs` | `Search` gains `jobTypeIds`, `customerId`, `sortColumn`, `sortDirection`; new `POST bom/detail/import` |
| `Models/Bom/Bom.cs` | new `BomImportRow`, `BomImportRequest` |

`dotnet publish -c Release`. The API holds `ERPWEB.exe`/`ERPWEB.dll` open — stop
the site (or the app pool) before copying, or the copy silently fails.

> Without this rebuild, the BOM list sends `jobTypeIds` to a backend that does
> not declare it — the parameter is ignored, so filters appear to do nothing.
> The import modal would 404.

### Frontend — rebuild

| File | Why |
|---|---|
| `src/bom/Bom.js` | filters, column boxes, working sort |
| `src/bom/BomDetailPage.js` | Import Excel button + modal wiring |
| `src/bom/BomImportModal.js` | **new** |
| `src/jobs/tabs/JobBudgetTab.js` | in-house header scoping removed |
| `src/jobs/tabs/BudgetImportModal.js` | job header is a default, not a lock |

`npm run build`, then deploy per company.

> ⚠️ **`/MIR` and runtime paths.** The 2026-07-28 incident deleted `license.json`
> and the `Docs/` uploads on three live sites. `wwwroot/uploads` is the *overwrite*
> case — each company's own logo lives there. Use the existing patch scripts with
> their `/XF` + `/XD` exclusions; do not hand-roll a robocopy.

---

## 3. PO header discount — what changes (script 1)

`sp_SetPO` never recomputed `TotalAmount` after a header save, so changing the
Discount % stored the new percentage but left the total untouched: the printed PO
showed a discount line while the total ignored it. It corrected itself by accident
on the next line save.

After this script, a header save recomputes:

```
TotalAmount = lines subtotal
            - (lines subtotal × header Discount %)
            + line tax
            + header tax
```

**Existing POs are not touched.** The script ships a read-only query listing POs
whose stored total disagrees with the recomputed value — run it, and expect some
historical POs to appear. Decide deliberately whether to correct them; a PO that
has been approved and sent to a supplier at the old figure probably should not be
silently re-totalled.

---

## 4. Self-approval per role — read before applying (script 2)

`sp_SubmitForApproval` decided self-approval for a whole **level**:
`MAX(CAST(AllowSelfApproval AS INT))` across every active approver row at that
level. One role with the flag therefore granted self-approval to **every**
approver at that level, including roles explicitly set to 0. After this script the
flag is evaluated only on the rows the submitter actually matches (ANY / their
Role / their UserId).

**This changes who can approve their own documents, the moment it lands.** On
2026-08-23 ten of vijay.bhusnar's POs auto-approved past Level 1 because of the
old behaviour and had to be reverted with `sp_ProcessApproval @Action='Cancel'`.

Before applying, review the live flags on each database:

```sql
SELECT p.PolicyId, p.PolicyName, l.LevelNo, l.ApproverType, l.ApproverId,
       l.AllowSelfApproval, l.IsActive
FROM proj.TBL_APPROVAL_POLICY p
JOIN proj.TBL_APPROVAL_LEVEL l ON l.PolicyId = p.PolicyId
WHERE l.IsActive = 1
ORDER BY p.PolicyId, l.LevelNo, l.ApproverType;
```

Anyone relying on a *neighbour's* flag to self-approve will stop being able to.
That is the intended fix, but it should not be a surprise on Monday morning.

**Not touched by this script:** the separate seniority short-circuit, which clears
lower levels when the submitter is an approver at a higher level regardless of the
flag. Tell them apart by the approval-log remark — `Auto-approved (submitter is
approver)` is the flag; `Auto-approved by senior approver (submitter)` is seniority.

---

## 5. BOM total value trigger (script 5)

`TotalBomValue` was maintained by hand in three procedures and left stale by every
other path. The trigger recalculates it on any line insert/update/delete:

```
SUM(BomRequestedQty × BomPrice × ISNULL(ExchangeRate,1))  WHERE IsActive = 1
```

It deliberately does nothing on a status-only update, so the PR/PO/GRN write path
(which constantly writes `PrCreatedQty` / `PoCreatedQty` / `BomReceivedQty`) is
unaffected. The three procedures keep their own now-redundant UPDATE — identical
expression, so dropping the trigger later cannot silently break them.

The script prints every header it corrects before backfilling. **On dev, nothing
changed** — because every BOM line has `BomPrice = 0`, so the totals were already
arithmetically correct at zero. If prod carries real line prices, expect the
backfill to move some headers. Review that list before signing off.

---

## 6. Post-deploy smoke test

1. **BOM list** — filter by Job Type and by Customer; click a column header and
   confirm the order actually changes (it did nothing before this build).
2. **BOM detail** — Import Excel → Download Template → the workbook has Sections,
   UOMs and Items sheets. Import two rows, one repeating an existing
   Section+Item; that row must report *"Merged into existing line (qty now N)"*,
   not create a duplicate.
3. **In-house job budget** — open a job whose type is In House. All cost headers
   must now list, not only the job's own Budget Header.
4. **PO** — open a PO, change Discount %, save, and confirm the header total drops
   accordingly on screen and on the print.
5. **Approvals** — submit one PO as a user who is an approver at that level with
   `AllowSelfApproval = 0`. It must stop and wait, not auto-approve.
6. Re-run `_VERIFY_PROD_DEPLOY_2026-09-06.sql`. Every row in sections A and B must
   read OK.
7. Check `proj.TBL_APP_LOG` for anything new:

```sql
SELECT TOP 50 LogId, LogLevel, Controller, Action, Message, LogDate
FROM proj.TBL_APP_LOG ORDER BY LogId DESC;
```

---

## 7. Rollback

| Script | Rollback |
|---|---|
| 1, 2, 3 | Re-run the *previous* definition. Capture it first: `SELECT OBJECT_DEFINITION(OBJECT_ID('proj.<proc>'))` into a file **before** applying, per database. |
| 4 | Same — capture `sp_SearchBoms` first. |
| 5 | `DROP TRIGGER proj.TR_BOM_RecalcTotalValue;` — the three procs still maintain the total on their own paths. The backfilled values stay. |
| 6 | `DROP PROCEDURE proj.sp_ImportBomDetail;` — nothing else references it. |
| Backend/frontend | Keep the previous `publish` output and `build/` folder; redeploy them. |

Capturing the four "before" definitions per database takes two minutes and is the
only rollback that actually works for scripts 1–4. Do it.
