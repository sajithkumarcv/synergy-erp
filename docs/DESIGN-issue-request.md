# Design — Issue Request → Issue Note

Draft, 2026-08-31. **Revised 2026-09-06** — every claim about the existing schema is
now verified against live `SYNERP`, five errors found in that pass are corrected below,
and **all five open decisions are now answered** (§9). Nothing in this document is built. It is the schema and flow sketch for adding
the *request* stage in front of the existing issue note, in the shape standard ERPs
use, and in the shape this codebase already uses for PR → PO.

What the 2026-09-06 pass changed, all of it in §3–§5 and §9:

| # | Found | Fixed in |
|---|---|---|
| 1 | The issue note has no `IssueTypeId` — only `CostingType nvarchar(40)` as text, so `RequiresRequest` had nothing to enforce against | §3, §4 |
| 2 | `TBL_STOCK_BALANCE.QtyStoreStock` is nullable, which makes `QtyStoreStock - QtyReserved` NULL and every availability check silently false | §4 |
| 3 | The BOM line has `PrCreatedQty` / `PoCreatedQty` but no issue-side counter, leaving §8's "open balance" undefined and the line requestable twice | §4 |
| 4 | The approval INSERT omitted `ModifiedByColumn` / `ModifiedDateColumn`, which all fourteen live modules set — nullable, so it fails silently | §5 |
| 5 | The `TBL_DOCUMENT_SERIES` row left seven NOT NULL columns unstated, and the numbering proc was unnamed | §5 |

Verified as originally written: `BomId` really is the PK of `TBL_BOM_DETAILS`;
`TBL_ISSUE_TYPE` holds exactly `INC_COSTING` / `EXC_COSTING`; `CancelledStatus = 'Draft'`
is the house norm; `ISR` is unused in both the module and series tables; the issue note
genuinely has no approval module while the return does.

---

## 1. What exists today

| Document | Table | Series | Approval module | Posting |
|---|---|---|---|---|
| Issue Note | `TBL_STOCK_ISSUE` / `_LINE` | `ISN` → `ISS-26-0001` | **none** — confirmed directly | `sp_ConfirmStockIssue` |
| Issue Return | `TBL_STOCK_ISSUE_RETURN` / `_LINE` | `IRN` | `IRN` | `sp_PostIssueReturnApproval` |

So material *leaves* the store on a document that nobody approves, and only the
*return* is controlled. There is no record of who asked for the material, no
approval before it moves, and no reservation — two jobs both see the same stock
as available and both plan on it.

`TBL_ISSUE_TYPE` already exists with `INC_COSTING` / `EXC_COSTING`, which is the
natural place to hang "does this type of issue need a request first".

## 2. Target flow

```
BOM line  ─┬─→  PR  ──(approval)──→  PO  ──→  GRN        (buy it)
           └─→  ISR ──(approval)──→  Issue Note ──→ [IRN] (take it from store)
                 │                        │
            reserves stock          moves stock, posts ledger, charges job
```

Deliberately the same shape as PR → PO:

- one request can be satisfied by **many** issue notes (partial issue),
- the request line carries `RequestedQty / IssuedQty / BalanceQty` and a line
  status, exactly like `PrCreatedQty` on a BOM line and `PoCreatedQty` on a PR line,
- the request is editable until it is approved; the issue note is final once posted.

## 3. New tables

### `TBL_STOCK_ISSUE_REQUEST`

| Column | Type | Notes |
|---|---|---|
| `RequestId` | int identity | PK |
| `RequestNo` | nvarchar(30) | from `TBL_DOCUMENT_SERIES`, new row `ISR` → `ISR-26-0001` |
| `RequestDate` | date | |
| `JobId` | nvarchar(50) | FK `TBL_JOB`; the cost target |
| `IssueTypeId` | int **not null** | FK `TBL_ISSUE_TYPE`. The request is where the issue type is *decided* — it drives `RequiresRequest` and is copied onto every issue note raised against it. ⚠ The receiving end needs work: the note has no `IssueTypeId` column yet, only the string `CostingType`. §4 adds it |
| `RequiredDate` | date null | when site needs it — drives the store's work queue |
| `RequestedBy` | nvarchar(100) | the person, not the creator |
| `Department` / `RequestedFor` | nvarchar null | optional, for non-job issues later |
| `Status` | nvarchar(20) | see §6 |
| `ReservationExpiryDate` | date null | approval date + `Inventory.IssueRequest.ReservationDays` (14). Stamped on approval, null until then — see §9 answer 4 |
| `Priority` | nvarchar(20) null | same vocabulary as PR |
| `Notes` | nvarchar(500) null | |
| `IsActive`, `CreatedBy/Date`, `ModifiedBy/Date` | | house standard |

### `TBL_STOCK_ISSUE_REQUEST_LINE`

| Column | Type | Notes |
|---|---|---|
| `RequestLineId` | int identity | PK |
| `RequestId` | int | FK |
| `LineNum` | int | |
| `ItemId` | int | FK `TBL_ITEM` |
| `BomId` | int null | FK `TBL_BOM_DETAILS` (`BomId` is that table's PK — verified) — set when the line was pulled from the BOM, so consumption can be traced back to the plan |
| `RequestedQty` | decimal(18,4) | |
| `IssuedQty` | decimal(18,4) | maintained by the issue note, never typed |
| `ReservedQty` | decimal(18,4) | what this line currently holds; released as it issues |
| `UomId` | int | |
| `RequiredDate` | date null | line-level override of the header |
| `LineStatus` | nvarchar(20) | see §6 |
| `Notes` | nvarchar(500) null | |
| `IsActive`, audit columns | | |

`BalanceQty` is **not stored** — it is `RequestedQty - IssuedQty`, computed in the
read procs. Storing it invites the two to disagree.

## 4. Changes to existing tables

| Table | Change | Why |
|---|---|---|
| `TBL_STOCK_ISSUE` | `+ RequestId int null` | links the note to its request; null = direct issue |
| `TBL_STOCK_ISSUE` | `+ IssueTypeId int null` FK `TBL_ISSUE_TYPE` | **the note has no issue type today** — only `CostingType nvarchar(40)`, holding the code as text. Without this column `RequiresRequest` has nothing to test and the gate cannot be enforced. Backfill from `CostingType`, which is 1:1 with `IssueTypeCode` |
| `TBL_STOCK_ISSUE_LINE` | `+ RequestLineId int null` | line-level link — this is what drives `IssuedQty` back onto the request |
| `TBL_STOCK_BALANCE` | `+ QtyReserved decimal(18,4) not null default 0` | the whole point of the request stage |
| `TBL_STOCK_BALANCE` | `QtyStoreStock → NOT NULL DEFAULT 0` *(alter existing)* | it is **nullable today**. `QtyStoreStock - QtyReserved` is NULL wherever it is unset, and every availability comparison against NULL is silently false — the reservation would block nothing and report nothing |
| `TBL_BOM_DETAILS` | `+ IsrCreatedQty decimal(18,4) not null default 0` | the BOM line tracks `PrCreatedQty` and `PoCreatedQty` but has no issue-side counter. §8's "BOM lines with an open balance" is undefined without it, and the same line can be pulled into two requests at full quantity — exactly the double-count `PrCreatedQty` exists to prevent |
| `TBL_ISSUE_TYPE` | `+ RequiresRequest bit not null default 1`, **set to 1 for both existing types** | §9 answer 3 is "request required for everything". The column stays so the rule can be relaxed per type later as a settings change rather than a patch |

**Issue type ownership.** The request holds the authoritative `IssueTypeId`. A note
raised from a request takes its type from the request and must not let the storekeeper
change it — otherwise material approved as `INC_COSTING` could be issued out of the job
cost. A direct issue (`RequiresRequest = 0`) keeps picking its own type as it does now.
Whichever way the note is created, `CostingType` stays in step with `IssueTypeId` until
the old text column can be retired.

**Reservation pool.** `TBL_STOCK_BALANCE` already splits `QtyOnHand` into
`QtyStoreStock` and `QtyJobStock`. A reservation must say which pool it holds, or
job stock reserved for one job will look available to another. Simplest workable
rule: reservations apply to **store stock only**, and job stock is implicitly
reserved to its own job already. Confirm before building.

**Available quantity** becomes `QtyStoreStock - QtyReserved` and must be used
everywhere stock is offered for selection — the issue line picker, `sp_GetStockBalance`,
the stock-by-job screen, and the low-stock alert views. Missing one of those is how
a reservation system quietly does nothing.

That subtraction only holds once `QtyStoreStock` is `NOT NULL` — see the table above.
Fix the column rather than scattering `ISNULL(...)` through every read path; there is
one place to get it right and a dozen places to forget it.

There is **no warehouse or location dimension**: `TBL_STOCK_BALANCE` is keyed on
`ItemId` alone. Reservations are therefore company-wide per item, which is fine for
the current single-store operation but is the assumption to revisit first if
multi-store ever arrives.

## 5. Approval wiring — one row, no engine changes

The approval engine is fully metadata driven, so the request registers like any
other module:

```sql
INSERT INTO proj.TBL_APPROVAL_MODULE
  (ModuleCode, ModuleName, IsAmountBased, DocumentTable, DocumentIdColumn,
   StatusColumn, ApprovedStatus, RejectedStatus, CancelledStatus,
   ModifiedByColumn, ModifiedDateColumn, PostApprovalSP, IsActive)
VALUES
  ('ISR', 'Issue Request', 0, 'TBL_STOCK_ISSUE_REQUEST', 'RequestId',
   'Status', 'Approved', 'Rejected', 'Draft',
   'ModifiedBy', 'ModifiedDate', 'proj.sp_PostIssueRequestApproval', 1);
```

`ModifiedByColumn` / `ModifiedDateColumn` are **not optional in practice**. All
fourteen registered modules set them to `ModifiedBy` / `ModifiedDate` (only `JOB`
differs, using its own `JobLastModifiedBy` / `JobLastUpdatedDate`). They are
nullable, so leaving them out inserts cleanly and then the engine simply stops
stamping who approved the document — a silent gap in the audit trail, which is the
one thing this whole feature exists to provide.

`IsAmountBased = 0` — an issue request has no value of its own; it is authorised on
who is asking and for which job, not on money. Approval levels are then configured
in the existing Approvals admin screen with no code change.

`sp_PostIssueRequestApproval` is where the **reservation is taken** — see §7.

Also needed: one `TBL_DOCUMENT_SERIES` row. Seven of its columns are `NOT NULL` and
were left unstated in the first draft, so here it is in full, matching the house
pattern every other document uses:

```sql
INSERT INTO proj.TBL_DOCUMENT_SERIES
  (DocTypeId, DocTypeName, Prefix, Separator, IncludeYear, YearDigits,
   ResetYearly, PadLength, StartingSeries, CurrentSeries, SortOrder, IsActive,
   SourceTable, SourceNumberColumn, CreatedBy, CreatedDate)
VALUES
  ('ISR', 'Issue Request', 'ISR', '-', 1, 2, 1, 4, 1, 0, 0, 1,
   'TBL_STOCK_ISSUE_REQUEST', 'RequestNo', 'system', GETDATE());
```

Numbers are drawn by **`proj.sp_GetNextDocNumber`** (with `sp_PreviewDocNumber` for
the on-screen preview) — the request's CRUD proc calls it exactly as the other
documents do; it does not format its own number.

Note `DocTypeId` and `Prefix` need not match — the issue note is `DocTypeId 'ISN'`
with prefix `'ISS'`. For the request both are `ISR`, giving `ISR-26-0001`.

Plus one `TBL_MENU` row and its `TBL_MENU_ACTIONS` codes.

## 6. Status model

**Header** — `Draft → Submitted → Approved → PartiallyIssued → FullyIssued → Closed`,
plus `Rejected` and `Cancelled`. `Draft` is the engine's `CancelledStatus`, matching
every other module here.

**Line** — `Pending → PartiallyIssued → FullyIssued → Closed | Cancelled`, derived
from quantities exactly like `BomStatus`:

```sql
LineStatus = CASE
    WHEN IssuedQty >= RequestedQty THEN 'FullyIssued'
    WHEN IssuedQty  > 0            THEN 'PartiallyIssued'
    ELSE 'Pending' END
```

⚠ Same trap as the BOM: this is derived from **both** sides, so every path that
changes `RequestedQty` must recompute it, not only the paths that change `IssuedQty`.
See the BOM qty→status note — `TR_BOM_RecalcStatus` watches only the fulfilled side
and misses requested-qty edits. Do not repeat that here.

**Closed** exists so a store can end a request with 3 of 10 issued and the rest never
coming, without it sitting open forever.

## 7. Procedures

| Proc | Job |
|---|---|
| `sp_SetIssueRequest` / `sp_SetIssueRequestLine` | header/line CRUD, blocked once approved |
| `sp_DeleteIssueRequestLine` | |
| `sp_SearchIssueRequests` | list with the standard filter/sort whitelist |
| `sp_GetIssueRequest` | header + lines + computed balance |
| `sp_PostIssueRequestApproval` | **takes the reservation**: `+ReservedQty` on the line, `+QtyReserved` on balance, capped at available; stamps `ReservationExpiryDate`; expires stale holds first |
| `sp_GetRequestLinesForIssue` | the "pull into issue note" picker — open balance only |
| `sp_CloseIssueRequest` | manual close of the remaining balance, releases reservation |
| `sp_ExpireStockReservations` | releases every hold past `ReservationExpiryDate` — scheduled, and called defensively on approval (§9 answer 4) |
| `sp_ConfirmStockIssue` *(modify)* | on confirm: `+IssuedQty`, `-ReservedQty`, `-QtyReserved`, recompute line + header status. **Blocks over-issue and blocks any new note without an approved request** (§9 answers 2 and 3) |
| `sp_PostIssueReturnApproval` *(decide)* | does a return restore the request balance, or is the request done? See §9 |

## 8. Frontend

Mirror `procurement/pr/` — the pattern is already there and users know it.

- `inventory/issuerequest/IssueRequest.js` — list, same filter panel + column filters
- `IssueRequestDetailPage.js` — header, lines tab, `ApprovalHistoryTab` with `moduleCode="ISR"`
- **Import from BOM** — the same modal shape as the PR's BOM import, offering BOM lines with an open balance
- Issue Note page — a "Pull from Request" picker beside the existing manual line entry
- Stock screens — show *Available* (net of reserved) alongside *On Hand*, or the reservation is invisible

## 9. Decisions — ANSWERED 2026-09-06

All five are settled. The questions are kept below with the answer against each, so
the reasoning is not lost.

| # | Decision | Answer |
|---|---|---|
| 1 | Reservation pool | **Store stock only.** Job stock is committed to its job by definition — there was nothing to decide |
| 2 | Over-issue | **Block it.** The store cannot issue more than the approved quantity; the error tells them to get the request edited or raise a new one |
| 3 | Direct issue | **No exemption — every issue needs an approved request**, consumables included |
| 4 | Reservation expiry | **14 days**, then the hold is released |
| 5 | Returns | Policy only, no schema impact — see the note under question 3 below |

**What answer 2 means to build.** `sp_ConfirmStockIssue` rejects any line whose issue
quantity would push `IssuedQty` above `RequestedQty`, naming the item and the remaining
balance so the message is actionable:

> `Item ABC: requested 10, already issued 7, cannot issue 5. Edit the request or raise a new one.`

The frontend should also cap the input at the open balance, but the proc is what
enforces it — the guard belongs where it cannot be bypassed.

**What answer 3 means to build.** `RequiresRequest` is still worth having as a column,
set to **1 for both issue types**, rather than hardwiring "always" into the procedures.
Same rule today, but relaxing it later for a consumable becomes a settings change
instead of a patch. `TBL_STOCK_ISSUE.RequestId` stays **nullable in the schema** — the
one pre-existing issue note has no request and must not be invented one — while
`sp_ConfirmStockIssue` refuses any *new* note without a request.

**What answer 4 means to build.** Reservations expire 14 days after approval, not after
creation — the clock starts when the stock is actually held.

- `TBL_STOCK_ISSUE_REQUEST + ReservationExpiryDate date null`, set by
  `sp_PostIssueRequestApproval` to approval date + the configured days.
- The period is a setting, not a constant:
  `TBL_APP_SETTINGS` key `Inventory.IssueRequest.ReservationDays` = `'14'`.
  That table is a plain key/value store, already the house pattern.
- `sp_ExpireStockReservations` releases everything past its date — clears `ReservedQty`
  on the lines and decrements `QtyReserved` on the balance. Run it from the scheduler,
  and also call it at the top of `sp_PostIssueRequestApproval` so an expiry can never be
  missed simply because the nightly job did not run.

⚠ **Assumption, flag it if wrong:** expiry releases the *stock hold only*. The request
itself stays Approved and can still be issued against if stock is there — it just no
longer keeps other jobs out. The alternative is to close the request outright, which
would mean site re-raises and re-approves. Say the word if you want that instead.

## 9a. The original questions, for the record

1. **Reservation pool** — store stock only, or job stock too? (§4)
2. **Over-issue** — may an issue note exceed the approved request qty? Standard ERPs
   allow a tolerance %, others block outright. Blocking is simpler and matches the
   PR→PO guard already in `sp_SetBomDetail`.
3. **Returns** — does an IRN put quantity back on the request balance (re-issuable)
   or not (request stays fully issued)? SAP treats them as independent movements.
   **This one is policy only, not schema.** `TBL_STOCK_ISSUE_RETURN_LINE` already
   carries `IssueLineId`, so once the issue line has `RequestLineId` the
   return → issue → request chain exists with no extra column. Either answer costs
   the same to build; decide it on how the store actually works.
4. **Direct issue** — keep it for `EXC_COSTING`/consumables via `RequiresRequest = 0`,
   or force every issue through a request? Forcing it is cleaner but will be resisted
   by the store for small items.
5. **Reservation expiry** — should an approved request that nobody issues against
   hold stock forever? Most ERPs age them out; needs a required-date rule if so.

## 10. Suggested build order

1. Tables + series + menu + approval module row *(no behaviour yet)*
2. Request CRUD + list + approval wiring — usable as a paper trail on its own
3. Link into the issue note: `RequestId`, `IssueTypeId` + its backfill from
   `CostingType`, `RequiresRequest`, the picker, `IssuedQty` write-back, statuses
4. Reservation: `QtyReserved`, `QtyStoreStock` made NOT NULL, available-qty
   everywhere, release on issue/close
5. BOM → request import with `IsrCreatedQty`, and the reports

Steps 1–3 deliver the audit and approval value. Step 4 is where the double-promising
problem actually gets solved, and it is the step that touches the most existing screens.
