# In-House Stock Jobs — Implementation Spec

Status: **DRAFT for review** (pre-build). Author: Claude. Context: in-house (stockable)
jobs that hold stock per budget header, issue to fabrication jobs, with no costing on
the in-house job itself.

---

## 1. Operating model (agreed)

- An **in-house job** is a **stock-holding bucket** tied to **one budget header** (expense category).
- **One in-house job per budget header** at a time (steady state). Yearly roll-over, when used,
  is handled by the **Stock Transfer** module (carry leftover IH-old → IH-new, then close IH-old).
- In-house jobs are **not cost objects** — `TBL_JOBTYPE.IsCostingRequired = 0`. Their purchases are
  **inventory**, not job cost. Cost is recognised **only on the fab job, at issue**.
- Flow:
  1. **Buy** stockable items into the in-house job (PO on the in-house job).
  2. **GRN** → stock held by the in-house job (`IsJobStock = 1`, `JobId = in-house job`).
  3. **Issue** to a fabrication job → deplete the in-house job's stock, charge the fab job's cost.
  4. **Return** → stock goes back to the same in-house job it came from.
  5. **Transfer** (optional) → move stock bucket→bucket (year roll, store↔job) with no cost effect.

Key linkage: `item.BudgetCategoryId` (item's budget header) → the **one** in-house job whose
`BudgetCategoryId` matches. This identifies the source in-house job for any issued item.

---

## 2. Required schema (ensure present after DB clear)

> If "clear DB" = truncate data only, these already exist from prior work. If it's a rebuild
> from scripts, make sure the scripts include all of the following.

Existing (from prior work — keep):
- `TBL_JOBTYPE.IsBudgetHeaderLinked BIT NOT NULL DEFAULT 0`
- `TBL_JOB.BudgetCategoryId INT NULL` → FK `FK_JOB_BUDGETCAT` → `TBL_JOB_EXPENSE_CATEGORY`
- `TBL_ITEM.BudgetCategoryId INT NULL` → FK `FK_ITEM_BUDGETCAT` → `TBL_JOB_EXPENSE_CATEGORY`
- `sp_SearchItems` filters `@BudgetCategoryId`, `@IsStockable`
- `sp_GetItemsMinimal` returns `IsStockable`, `BudgetCategoryId`
- `sp_GetPO` returns `IsBudgetHeaderLinked`; `sp_SetPOLine` item restriction

New for this phase:
- `TBL_STOCK_TRANSFER` (header) — see §5.
- `TBL_STOCK_TRANSFER_LINE` (lines) — see §5.
- No new column needed on issue/return — `TBL_STOCK_ISSUE.JobId` = destination fab job;
  source in-house job is derived from each item's budget header.

---

## 3. Stored-procedure changes

### 3.1 `sp_ConfirmGRN` — in-house receipts become job stock
Today: a receipt line whose job is a **stock job** posts to **general** stock
(`EffIsJobStock = 0`). Change so an in-house (stock) job's receipts are **held by the job**:

```
@EffIsJobStock = CASE WHEN @LineJobId IS NOT NULL THEN 1 ELSE 0 END
```
i.e. any job-tagged receipt is job stock (`IsJobStock = 1, JobId = the job`). General
(no job) receipts stay `IsJobStock = 0`.

### 3.2 `sp_SetJob` — one open in-house job per budget header
When saving a job whose type has `IsBudgetHeaderLinked = 1` and the job is open, reject if
another **open** job already exists with the same `BudgetCategoryId`:
```
RAISERROR('An open in-house job already exists for this budget header. Close it first.',16,1)
```

### 3.3 `sp_ConfirmStockIssue` — derive source, per-job balance, deplete source
For each issue line (issue `JobId` = destination fab job):
1. **Derive source in-house job** = the open job where `BudgetCategoryId = item.BudgetCategoryId`
   and its type `IsBudgetHeaderLinked = 1`.
2. **Per-job balance check** (replaces the current global `QtyJobStock` check): on-hand for that
   item *in that in-house job* = `SUM(QtyIn - QtyOut)` from `TBL_STOCK_LEDGER` where
   `JobId = source`, `IsJobStock = 1`. Must be ≥ issued qty, else reject.
3. **Deplete the source** — ledger `QtyOut` against the **source in-house job**
   (`IsJobStock = 1, JobId = source`), not against the issue's `JobId`.
4. Cost lands on the **fab job** (issue `JobId`) via the existing issue cost roll-up + §3.6.

> Note: this supersedes the current `INC/EXC_COSTING` split for in-house-sourced issues — the
> issue both depletes the in-house bucket and costs the fab job.

### 3.4 `sp_ConfirmIssueReturn` — return to the source job
Returned qty restores to the **same in-house job** the line was issued from (the derived source),
ledger `QtyIn`, `IsJobStock = 1, JobId = source`; reverse the fab job's cost.

### 3.5 `sp_AssertBudgetApproved` — exempt non-costed jobs
Return early (no budget-approval requirement) when the job's type has `IsCostingRequired = 0`:
```
IF EXISTS (SELECT 1 FROM TBL_JOB j JOIN TBL_JOBTYPE jt ON jt.JobTypeId=j.JobTypeId
           WHERE j.JobId=@JobId AND ISNULL(jt.IsCostingRequired,1)=0) RETURN;
```
→ in-house jobs can PO / GRN / issue without an approved budget.

### 3.6 `VW_JOB_COST_ACTUAL` — exclude in-house jobs; categorise issues
- **Exclude** PO commitments (and any cost) where the PO's job type has `IsCostingRequired = 0`
  → in-house POs are inventory, never job cost (no double-count).
- **Add issues** to the cost rollup, attributed to `item.BudgetCategoryId` (the comment in the
  view notes this was disabled only because the item→category link didn't exist — it now does).

---

## 4. Availability / visibility

- `sp_GetStockAvailability` and the store-stock / issue screens must **show in-house job stock**
  (`IsJobStock = 1`) as on-hand and **issuable**, tagged with the in-house job.
- `sp_GetStockByJob` / `sp_GetJobStockBreakdown` already surface `IsJobStock = 1` per job — they
  will now include in-house jobs automatically.

---

## 5. Stock Transfer module (new)

**Tables**
```
TBL_STOCK_TRANSFER       (TransferId, TransferNo, TransferDate, FromJobId, ToJobId,
                          Status['Draft'|'Confirmed'|'Cancelled'], Notes, IsActive, audit cols)
TBL_STOCK_TRANSFER_LINE  (TransferLineId, TransferId, LineNum, ItemId, Qty, UomId, UnitCost,
                          Notes, IsActive, audit cols)
```
**Procs**: `sp_SetStockTransfer`, `sp_SetStockTransferLine`, `sp_GetStockTransfer`,
`sp_SearchStockTransfers`, `sp_ConfirmStockTransfer`, `sp_DeleteStockTransfer(+Line)`,
`sp_CancelStockTransfer`.

**`sp_ConfirmStockTransfer`** (per line): per-job balance check on `FromJobId`; ledger
`QtyOut` against `FromJobId` + `QtyIn` against `ToJobId` (both `IsJobStock = 1`, same `UnitCost`).
Net stock unchanged — pure re-attribution, **no cost effect**.

**Use**: year-end carry-over (IH-old → IH-new), store↔job, job↔job moves.

**Backend/Frontend**: `StockTransferController` (+ model), React page + route + menu row
(`TBL_MENU` / `TBL_ROLE_MENU`, inventory parent).

---

## 6. Backend changes
- `JobController` / models already carry `BudgetCategoryId`, `IsBudgetHeaderLinked`.
- New `StockTransferController` with search/get/save-line/confirm/cancel/delete.
- No new fields on issue/return DTOs (source derived server-side).

## 7. Frontend changes
- **Stock Transfer** page (list + create/confirm), route, menu.
- Issue screen: show in-house job stock as available; (optional) display the derived source
  in-house job per line for transparency.
- Reports: "In-house stock — purchased / issued / on-hand" per in-house job; "Items issued to
  job X grouped by budget header / in-house job".

## 8. `IsCostingRequired` wiring (currently inert)
Today referenced only in JobType admin/preview. Wire into §3.5 and §3.6 so it actually drives
"no costing / no budget" for in-house jobs.

---

## 9. Config & data prerequisites (post-clear)
1. Job types: in-house type → `IsStockJob = 1`, `IsBudgetHeaderLinked = 1`, `IsCostingRequired = 0`.
2. One in-house job per budget header (open).
3. Every stockable item → `BudgetCategoryId` set.
4. Every in-house job → `BudgetCategoryId` set.

## 10. Build & verification order
1. Confirm schema present (§2) after clear.
2. Procs: `sp_ConfirmGRN` → `sp_SetJob` guard → `sp_ConfirmStockIssue` → `sp_ConfirmIssueReturn`
   → `sp_AssertBudgetApproved` → `VW_JOB_COST_ACTUAL` → availability.
3. Stock Transfer tables + procs.
4. Backend build (0 errors).
5. Frontend (transfer page + menu) build.
6. End-to-end: PO→GRN into in-house job → issue to fab job (cost on fab job, IH depleted) →
   return (back to IH) → transfer (IH-old→IH-new) → reports reconcile.

## 11. Assumptions to confirm before build
- A. Issue from in-house stock **always** costs the fab job (no EXC/INC choice for these).
- B. In-house stock is visible in the **common store** view (tagged by job), so any fab job can
  draw it. (vs. restricted to selecting the in-house job explicitly.)
- C. Item valuation = existing average/stock cost (no per-year FIFO layers, since in-house isn't costed).
