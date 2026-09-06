# Design — Issue Request → Issue Note

Draft, 2026-08-31. Nothing in this document is built. It is the schema and flow
sketch for adding the *request* stage in front of the existing issue note, in the
shape standard ERPs use, and in the shape this codebase already uses for PR → PO.

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
| `IssueTypeId` | int | FK `TBL_ISSUE_TYPE` — carried onto the issue note |
| `RequiredDate` | date null | when site needs it — drives the store's work queue |
| `RequestedBy` | nvarchar(100) | the person, not the creator |
| `Department` / `RequestedFor` | nvarchar null | optional, for non-job issues later |
| `Status` | nvarchar(20) | see §6 |
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
| `BomId` | int null | FK `TBL_BOM_DETAILS` — set when the line was pulled from the BOM, so consumption can be traced back to the plan |
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
| `TBL_STOCK_ISSUE_LINE` | `+ RequestLineId int null` | line-level link — this is what drives `IssuedQty` back onto the request |
| `TBL_STOCK_BALANCE` | `+ QtyReserved decimal(18,4) not null default 0` | the whole point of the request stage |
| `TBL_ISSUE_TYPE` | `+ RequiresRequest bit not null default 0` | lets consumables keep the direct-issue path |

**Reservation pool.** `TBL_STOCK_BALANCE` already splits `QtyOnHand` into
`QtyStoreStock` and `QtyJobStock`. A reservation must say which pool it holds, or
job stock reserved for one job will look available to another. Simplest workable
rule: reservations apply to **store stock only**, and job stock is implicitly
reserved to its own job already. Confirm before building.

**Available quantity** becomes `QtyStoreStock - QtyReserved` and must be used
everywhere stock is offered for selection — the issue line picker, `sp_GetStockBalance`,
the stock-by-job screen, and the low-stock alert views. Missing one of those is how
a reservation system quietly does nothing.

## 5. Approval wiring — one row, no engine changes

The approval engine is fully metadata driven, so the request registers like any
other module:

```sql
INSERT INTO proj.TBL_APPROVAL_MODULE
  (ModuleCode, ModuleName, IsAmountBased, DocumentTable, DocumentIdColumn,
   StatusColumn, ApprovedStatus, RejectedStatus, CancelledStatus, PostApprovalSP, IsActive)
VALUES
  ('ISR', 'Issue Request', 0, 'TBL_STOCK_ISSUE_REQUEST', 'RequestId',
   'Status', 'Approved', 'Rejected', 'Draft', 'proj.sp_PostIssueRequestApproval', 1);
```

`IsAmountBased = 0` — an issue request has no value of its own; it is authorised on
who is asking and for which job, not on money. Approval levels are then configured
in the existing Approvals admin screen with no code change.

`sp_PostIssueRequestApproval` is where the **reservation is taken** — see §7.

Also needed: one `TBL_DOCUMENT_SERIES` row (`ISR`, prefix `ISR`, `PadLength 4`,
`ResetYearly 1`, `SourceTable TBL_STOCK_ISSUE_REQUEST`, `SourceNumberColumn RequestNo`)
and one `TBL_MENU` row plus its `TBL_MENU_ACTIONS` codes.

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
| `sp_PostIssueRequestApproval` | **takes the reservation**: `+ReservedQty` on the line, `+QtyReserved` on balance, capped at available |
| `sp_GetRequestLinesForIssue` | the "pull into issue note" picker — open balance only |
| `sp_CloseIssueRequest` | manual close of the remaining balance, releases reservation |
| `sp_ConfirmStockIssue` *(modify)* | on confirm: `+IssuedQty`, `-ReservedQty`, `-QtyReserved`, recompute line + header status |
| `sp_PostIssueReturnApproval` *(decide)* | does a return restore the request balance, or is the request done? See §9 |

## 8. Frontend

Mirror `procurement/pr/` — the pattern is already there and users know it.

- `inventory/issuerequest/IssueRequest.js` — list, same filter panel + column filters
- `IssueRequestDetailPage.js` — header, lines tab, `ApprovalHistoryTab` with `moduleCode="ISR"`
- **Import from BOM** — the same modal shape as the PR's BOM import, offering BOM lines with an open balance
- Issue Note page — a "Pull from Request" picker beside the existing manual line entry
- Stock screens — show *Available* (net of reserved) alongside *On Hand*, or the reservation is invisible

## 9. Decisions needed before building

1. **Reservation pool** — store stock only, or job stock too? (§4)
2. **Over-issue** — may an issue note exceed the approved request qty? Standard ERPs
   allow a tolerance %, others block outright. Blocking is simpler and matches the
   PR→PO guard already in `sp_SetBomDetail`.
3. **Returns** — does an IRN put quantity back on the request balance (re-issuable)
   or not (request stays fully issued)? SAP treats them as independent movements.
4. **Direct issue** — keep it for `EXC_COSTING`/consumables via `RequiresRequest = 0`,
   or force every issue through a request? Forcing it is cleaner but will be resisted
   by the store for small items.
5. **Reservation expiry** — should an approved request that nobody issues against
   hold stock forever? Most ERPs age them out; needs a required-date rule if so.

## 10. Suggested build order

1. Tables + series + menu + approval module row *(no behaviour yet)*
2. Request CRUD + list + approval wiring — usable as a paper trail on its own
3. Link into the issue note: `RequestId`, the picker, `IssuedQty` write-back, statuses
4. Reservation: `QtyReserved`, available-qty everywhere, release on issue/close
5. BOM → request import, and the reports

Steps 1–3 deliver the audit and approval value. Step 4 is where the double-promising
problem actually gets solved, and it is the step that touches the most existing screens.
