# Port to WebERP: approval-level changes + duplicate-rows bug

Paste the block below into a Claude Code session opened on the **main WebERP repo**
(`D:\Projects\WebErp`). It is written to be self-contained.

---

## PROMPT — copy from here

Context: our Synergy fork (`D:\Projects\WebErp-Synergy`, DB `SYNERP`) reworked the
approval-policy level editor. Main WebERP (`D:\Projects\WebErp`, dev DB `ERPDB`) has
not received those changes. Port them, and fix a duplication bug that exists in both.

**Only touch the dev ERPDB. Do not apply anything to APT/prod or other databases.**

### Part 1 — port the approval-level capability

Synergy supports **parallel approvers**: several approver rows sharing the same
`LevelNo`, meaning "any/all of these act at this stage". Making that work required
levels to be saved **in place by `LevelId`** rather than wiped-and-reinserted.

Reference implementation in Synergy (read these, then compare against WebERP's
equivalents):

| Layer | Synergy file / object | What it does |
|---|---|---|
| SP (save) | `proj.sp_SaveApprovalPolicy` | Reads `$.levelId` from `@LevelsJson` via OPENJSON. Step 1 soft-deletes (`IsActive=0`) rows whose LevelId is absent from the payload; step 2 UPDATEs existing rows by LevelId; step 3 INSERTs only rows with null/0 LevelId. Sets `TotalLevels = COUNT(DISTINCT LevelNo) WHERE IsActive=1`. |
| SP (read) | `proj.sp_GetApprovalPolicies` | Second result set filters `lv.IsActive = 1` so retired rows never reach the UI. |
| DTO | `backend/Models/Approval/ApprovalModels.cs` → `SaveLevelRequest` | Has `public int LevelId { get; set; }  // 0 = new row; existing id = update in place`. Without this property model binding drops the id and every save reinserts. |
| Controller | `backend/Controllers/Approval/ApprovalController.cs` → `SavePolicy` | Serializes `req.Levels` camelCase into `LevelsJson`, calls `sp_SaveApprovalPolicy`. |
| UI | `frontend/src/approval/ApprovalPoliciesPage.js` | `addParallel(i)` inserts a row with the *same* `levelNo`; `removeLevel` deliberately does **not** renumber (duplicate LevelNos are legitimate); `LevelRow`'s `set()` uses `onChange(index, { ...level, [k]: v })` so `levelId` survives edits; save payload sends `levelId: Number(l.levelId) || 0`. Rows sharing a LevelNo render with a "PARALLEL" badge. |

Also check the `proj.TBL_APPROVAL_LEVEL` schema matches — Synergy has `IsActive`
(soft delete), `EscalateToLevelId` (self-FK), and `PendingStatus`. Add columns to
ERPDB only if genuinely missing, and generate the DDL for me to run rather than
running it yourself.

Note `TBL_APPROVAL_LOG.LevelId` is a **nullable** FK to `TBL_APPROVAL_LEVEL`; the log
row carries its own `LevelNo`/`Action`/`ActionBy`/`ActionByName`/`ActionDate`/`Remarks`,
so it stays readable if that link is ever cleared.

### Part 2 — the duplication bug (unsolved; do not assume a cause)

Symptom in SYNERP: every policy save retired the whole existing level set and inserted
a fresh one — identical approvers, brand-new LevelIds. `TBL_APPROVAL_LEVEL` reached 135
rows (45 active / 90 inactive) across 10 "save batches" on one policy. Users also
report approvals feeling slow, plausibly because the approval engine joins this table.

**Important:** in the Synergy source all four layers above were inspected and each one
looked correct — the DTO has `LevelId`, the UI preserves it, the SP updates in place,
the read filters `IsActive`. The duplication was still happening anyway. A root cause
was **never confirmed**. The leading untested hypothesis is that the *running build*
predates the source changes (i.e. it needs a rebuild/deploy, not a code edit) — treat
that as a lead to verify, not a conclusion.

Do this:
1. Check whether WebERP reproduces it. Save a policy twice without changing anything and
   watch for new LevelIds:
   ```sql
   SELECT LevelId, PolicyId, LevelNo, LevelName, ApproverId, IsActive, CreatedBy, CreatedDate
   FROM proj.TBL_APPROVAL_LEVEL WHERE PolicyId = <id> ORDER BY CreatedDate, LevelId;
   ```
   Row count unchanged + same LevelIds = healthy. New ids each save = reproduced.
2. Survey existing damage:
   ```sql
   SELECT PolicyId, COUNT(*) total,
          SUM(CASE WHEN IsActive=1 THEN 1 ELSE 0 END) active,
          COUNT(DISTINCT CreatedDate) save_batches
   FROM proj.TBL_APPROVAL_LEVEL GROUP BY PolicyId ORDER BY total DESC;
   ```
3. If reproduced, trace the actual payload — log the JSON reaching `sp_SaveApprovalPolicy`
   and confirm whether `levelId` arrives populated or as 0/null. That single fact
   separates a UI/binding problem from an SP problem. **Find the cause before writing
   any fix**; state plainly what you verified and what you did not.
4. Separately, look for multiple *active* approvers stacked on one LevelNo — legitimate
   for parallel approval, but worth surfacing:
   ```sql
   SELECT PolicyId, LevelNo, COUNT(*) approvers,
          STRING_AGG(CAST(LevelId AS varchar) + ':' + LevelName, ', ')
   FROM proj.TBL_APPROVAL_LEVEL WHERE IsActive = 1
   GROUP BY PolicyId, LevelNo HAVING COUNT(*) > 1;
   ```

### Part 3 — approval document preview (eye icon) + full-page view

Synergy added an in-approvals document viewer so an approver can inspect what they are
approving without leaving the queue. Port this too.

**Files:**

`frontend/src/approval/MyApprovalsPage.js` (approvals inbox)
- A 👁 column in the queue table and a "👁 Preview" action on the expanded row; the
  selected row goes into `previewItem` state and renders
  `<DocPreviewDrawer item={previewItem} onOpenFull={openDocument} />`.
- `openDocument(item)` resolves `moduleMeta(item.moduleCode).route(documentId)`. If that
  module's meta has `newTab: true` it does `window.open(url, '_blank', 'noopener')`,
  otherwise `navigate(url)`. **PO is flagged `newTab`** deliberately — the approver
  reviews the full read-only PO in a separate tab and keeps their place in the list.

`frontend/src/approval/DocPreviewDrawer.js` (the drawer itself)
- A registry keyed by `moduleCode` — PR, PO, JOB, BOM, INV, MANHOUR, STOCKADJ, SRV,
  stock-issue-return, RV, PV, CN, DN. Each entry is `{ fetch(id), render({header, lines}) }`.
  `fetch` pulls header and lines **in parallel** via `Promise.all`.
- Drawer header carries an "Open full page →" button; when a module has no renderer it
  falls back to "Open full page instead →" rather than showing an empty drawer.
- The PO entry fetches `purchaseorder/{id}` + `purchaseorder/lines/{id}` and renders:
  - header: PO Number, Date, Status badge, Supplier, Linked Job, Currency (with
    `@ exchangeRate` when it isn't 1), Delivery Date, Payment Terms, Total Amount, Notes
  - lines: `lineNum` (#), `itemCode` (mono), `itemDesc` (Description), `uomName` (UOM),
    `orderedQty` (Qty), `unitPrice`, `lineTotal`

**The correction to carry over:** the lines grid must show **resolved names** —
`itemCode` / `itemDesc` / `uomName` — not raw ids. Check WebERP's
`purchaseorder/lines/{id}` endpoint and its SP actually return those resolved columns;
if they only return `ItemId`/`UomId` the UOM and description cells render blank and the
whole preview looks broken. Same applies to the other modules' line endpoints before you
wire up their renderers.

### Working rules

- Cleanup is pointless until the cause is fixed — rows regrow on the next save.
- Hand me any bulk or destructive SQL to run myself; don't execute it.
- Before any script that deletes or overwrites, tell me up front exactly what it
  adds/overwrites/deletes and whether it is reversible.
- Don't copy row counts or specific LevelIds from Synergy — ERPDB's will differ.
  Derive them from ERPDB.

## PROMPT — copy to here
