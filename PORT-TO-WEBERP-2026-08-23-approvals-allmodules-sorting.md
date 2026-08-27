# Port to base WebERP — approvals: job on every module + column sorting

Paste the block below into a Claude Code session opened at `D:\Projects\WebErp`.

This is a **delta on top of the 2026-08-18 port**, which base has already taken. Checked
against `D:\Projects\WebErp` on 2026-08-23:

- already there: `quickFind`, supplier name, `MyApprovalItem.JobId/JobTitle/SupplierName`,
  and `backend/DB_Patches/2026-08-18_my_approvals_jobno.sql`
- missing: job resolution beyond PO/PR (`JOB_MODULES`), and column sorting (`SortTh`)
- **not applicable**: the PO job-type filter fix — base's PO page has no Job Type filter at all

Those facts are in the prompt so the session doesn't re-derive them.

---

```
Two changes to My Approvals, both from the Synergy fork (D:\Projects\WebErp-Synergy).
Work only in this repo. Read each target file before editing.

This repo already has the 2026-08-18 approvals work: the quick-find box, the Job No. column,
the supplier line, MyApprovalItem.JobId/JobTitle/SupplierName, and
backend/DB_Patches/2026-08-18_my_approvals_jobno.sql. Do not redo any of that.

────────────────────────────────────────────────────────────────────────
1. Job No. for every module that has one (DB + frontend, no API change)
────────────────────────────────────────────────────────────────────────
The existing script resolves the job for PO and PR only, so Invoices, BOMs, Jobs, Service
Receipts and the rest show a blank Job No. Extend the OUTER APPLY in sp_GetMyApprovals to
every module whose document actually carries a job.

FIRST, find out which modules this database actually has - do not assume Synergy's list:

    SELECT ModuleCode, ModuleName, DocumentTable, DocumentIdColumn
    FROM PROJ.TBL_APPROVAL_MODULE ORDER BY ModuleId;

Then check which of those DocumentTables really have a JobId column:

    SELECT t.name AS TableName, c.name AS ColName
    FROM sys.tables t JOIN sys.columns c ON c.object_id = t.object_id
    WHERE c.name IN ('JobId','JobNumId') AND SCHEMA_NAME(t.schema_id) = 'PROJ'
    ORDER BY t.name;

Write a NEW numbered patch under backend/DB_Patches/ (do not edit the 2026-08-18 one - it may
already be applied) that re-ALTERs sp_GetMyApprovals with one UNION ALL branch per module that
qualifies. In Synergy that came to:

  PO  -> TBL_PURCHASE_ORDER   (PoId)  + supplier   PR  -> TBL_PURCHASE_REQUEST (PrId)
  INV -> TBL_INVOICE          (InvoiceId)          BOM -> TBL_BOM_HEADER       (BomHeaderId)
  JOB -> TBL_JOB              (JobNumId)           SRV -> TBL_SRV_HEADER       (SrvId)
  IRN -> TBL_STOCK_ISSUE_RETURN.IssueId -> TBL_STOCK_ISSUE.JobId
  MH  -> TBL_MANHOUR          (BatchId)            STR -> TBL_STOCK_TRANSFER.FromJobId
  ADJ, RV, PV, CN, DN have no job on the document and stay NULL.

Include only the modules and tables that exist HERE. Three details that matter:

- JOB's document is the job itself, and approvals reference it by the numeric surrogate
  JobNumId, not the JobId string. Getting this wrong silently yields NULL for every job.
- A manhour batch is many rows and they can belong to different jobs. Show the job only when
  the whole batch is one job - never an arbitrary TOP 1 from a mixed batch:
      SELECT CASE WHEN COUNT(DISTINCT mh.JobId) = 1 THEN MIN(mh.JobId) END, CAST(NULL AS NVARCHAR(200))
      FROM PROJ.TBL_MANHOUR mh
      WHERE p.ModuleCode = 'MH' AND mh.BatchId = p.DocumentId
      HAVING COUNT(*) > 0
  The HAVING is load-bearing: without it the bare aggregate returns an all-NULL row for every
  non-MH document, which can win the outer TOP 1.
- Order the outer select so a real value beats a NULL:
      ORDER BY CASE WHEN src.JobId IS NULL THEN 1 ELSE 0 END

Build it by reading THIS database's current sp_GetMyApprovals definition and splicing into it,
not by copying Synergy's file - the forks' procs have diverged before. Hand the script over for
the user to run; do not execute it.

No API change: MyApprovalItem already carries JobId/JobTitle/SupplierName, so the SP simply
populates them for more rows. No backend rebuild needed for this part.

Frontend, in frontend/src/approval/MyApprovalsPage.js: replace the hardcoded
(moduleCode === 'PO' || moduleCode === 'PR') test that decides whether to render the Job No.
filter box with a JOB_MODULES set listing the modules you actually covered above. A filter box
on a section where the job is always blank can only ever match nothing.

────────────────────────────────────────────────────────────────────────
2. Sortable columns in the approvals grid (frontend only)
────────────────────────────────────────────────────────────────────────
Every data column of each CategorySection table sorts: Document No, Job No., Amount, Current
Level, Next Level, Submitted By, Submitted On. The checkbox, eye and action columns do not.

Add next to the TH constant: a SORT_VALUE map of column -> accessor, a sortItems(rows, sort)
helper, and a SortTh component rendering a clickable header with the app's existing indicator
convention (⇅ inactive, ↑/↓ active in navy, as the Jobs and PO grids use).

Five behaviours, each deliberate:
- Sort state lives INSIDE CategorySection, so sorting Purchase Orders leaves Purchase Requests
  alone - same as the column filters.
- Apply it AFTER the column filters: sortItems(applyColFilters(items, colF), sort).
- Default state is { col: null } and sortItems returns rows untouched then, so the queue keeps
  the server's order (oldest submitted first) until the user actually clicks something.
- Blank/null values sort LAST in both directions - a document with no job or no amount must
  never float to the top just because it is empty.
- Compare strings with localeCompare(..., { numeric: true }) so PO-26-0009 precedes
  PO-26-0010 rather than following it.

Current Level sorts by the level NUMBER (currentLevelNo), not the role name - that is what is
useful when working down a queue by stage.

One CategorySection renders all 13 module sections, so this lands on every one at once.

────────────────────────────────────────────────────────────────────────
NOT APPLICABLE HERE - do not port
────────────────────────────────────────────────────────────────────────
Synergy also fixed its PO list, where the Job Type filter narrowed only the Job ID dropdown and
never reached the query (sp_SearchPOs gained @JobTypeIds). This repo's PO page has NO Job Type
filter at all - DEFAULT_FILTERS has no jobTypeIds and there is no such chip - so there is
nothing to fix. Ignore that change unless the user explicitly asks for the Job Type filter to
be ADDED here, which is a feature, not a port.

────────────────────────────────────────────────────────────────────────
Verify
────────────────────────────────────────────────────────────────────────
Build with `CI=false npx react-scripts build` in frontend/ and confirm no new warnings from the
files you touched. Confirm the header row and the filter row still render the same number of
cells, and that the data row matches.

Tell the user the sorting works immediately, but the extra Job No. values appear only once the
new DB script is applied.
```
