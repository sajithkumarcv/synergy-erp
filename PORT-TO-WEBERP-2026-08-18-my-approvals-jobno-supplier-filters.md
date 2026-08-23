# Port to base WebERP — My Approvals: quick find, Job No. + Supplier, column filters

Paste the block below into a Claude Code session opened at `D:\Projects\WebErp`.

Unlike the 2026-08-17 port, this one is **not** frontend-only: it needs a stored-proc
change in ERPDB and an API rebuild.

Checked against `D:\Projects\WebErp` on 2026-08-18 — base is at exactly the pre-change
state (9 header columns, `colSpan={9}`, same `MyApprovalItem`, same search haystack), and
`frontend/src/common/GridColumnFilter.js` already exists from the previous port with the
same exports. Those facts are baked into the prompt so the session doesn't re-derive them.

---

```
Port the My Approvals improvements from the Synergy fork (D:\Projects\WebErp-Synergy)
into this repo. Work only in this repo. Read each target file before editing.

The problem being solved: an approver with ~50 pending POs could not find a particular
one. The queue showed only document no., amount, levels, submitter and date — nothing
about which job or supplier a PO belonged to — and the only search was the sidebar box,
which needs a typed term plus an "Apply Filters" click.

This touches THREE layers. The DB change gates the other two, so do it in this order.

────────────────────────────────────────────────────────────────────────
1. DB — ERPDB: sp_GetMyApprovals returns JobId, JobTitle, SupplierName
────────────────────────────────────────────────────────────────────────
TBL_APPROVAL_TRANSACTION stores only module code + document id, so the queue has no way
to reach the job or supplier. Resolve them per module with one OUTER APPLY.

DO NOT copy the Synergy script file. The two forks' procs have diverged before, so read
THIS database's current definition and splice the change into it:

    SELECT m.definition FROM sys.sql_modules m
    JOIN sys.objects o ON o.object_id = m.object_id
    WHERE o.name = 'sp_GetMyApprovals';

Two edits to that definition. Add to the final SELECT list, next to the NextLevel columns:

    jb.JobId, jb.JobTitle, jb.SupplierName,

and add this after the existing LEFT JOINs to CurLvl / NextLvl (`p` is the Pending CTE,
which already carries ModuleCode and DocumentId):

    OUTER APPLY (
        -- Job + supplier of the underlying document, resolved per module.
        -- Other modules match nothing and yield NULL, as before.
        SELECT TOP 1 src.JobId, j.ProjectName AS JobTitle, src.SupplierName
        FROM (
            -- Supplier master name, falling back to the name typed on the PO —
            -- the same precedence sp_SearchPOs and the PO printouts use.
            SELECT po.JobId, ISNULL(s.SupplierName, po.VendorName) AS SupplierName
            FROM PROJ.TBL_PURCHASE_ORDER po
            LEFT JOIN PROJ.TBL_SUPPLIER s ON s.SupplierId = po.SupplierId
            WHERE p.ModuleCode = 'PO' AND po.PoId = p.DocumentId
            UNION ALL
            -- PRs carry no supplier; NULL for every other module too.
            SELECT pr.JobId, CAST(NULL AS NVARCHAR(200))
            FROM PROJ.TBL_PURCHASE_REQUEST pr
            WHERE p.ModuleCode = 'PR' AND pr.PrId = p.DocumentId
        ) src
        LEFT JOIN PROJ.TBL_JOB j ON j.JobId = src.JobId
    ) jb

Verify the schema/table names against this repo before writing the script — do not assume
they match Synergy's. Save it as a numbered patch under backend/DB_Patches/ following the
existing naming, with a header saying which databases it must be applied to.

It is purely additive: three new output columns, no parameter or filter change, so it is
safe to run before the API is rebuilt (an older API just ignores them).

Hand the script over for the user to run — do not execute it yourself.

────────────────────────────────────────────────────────────────────────
2. API — MyApprovalItem
────────────────────────────────────────────────────────────────────────
backend/Models/Approval/ApprovalModels.cs, class MyApprovalItem — add next to the
NextApproverUsers / CanAct properties:

    public string?  JobId        { get; set; }
    public string?  JobTitle     { get; set; }
    public string?  SupplierName { get; set; }   // PO only

Nothing else changes; the controller passes rows straight through. Needs a Release rebuild
and an API restart before any of the UI below shows data.

────────────────────────────────────────────────────────────────────────
3. UI — frontend/src/approval/MyApprovalsPage.js
────────────────────────────────────────────────────────────────────────
frontend/src/common/GridColumnFilter.js ALREADY EXISTS in this repo from the previous port
and exports ColFilter, applyColFilters, hasColFilters, matchNote. Import it — do not
recreate it.

(a) QUICK FIND — page-level, above the list.
Add a `quickFind` state and an input in the header row next to the ↻ Refresh button
(wrap both in a flex div), with a 🔍 prefix and an inline × to clear. Narrow as you type;
no Apply button. Fold it into the EXISTING `filtered` useMemo (add quickFind to its deps)
matching documentNo, jobId, jobTitle, supplierName, submittedBy, levelName, and the amount
BOTH raw and formatted — so typing "627,019" matches what is on screen.

Why a second search box when the sidebar already has one: the sidebar filter only applies
on "Apply Filters", which is too slow when hunting one document among fifty. Everything is
already in memory — load() fetches up to 500 in one request — so this filters the whole
list, not a page.

Also add jobId + supplierName to the SIDEBAR search haystack so both paths agree.

Fix the existing no-match empty state, which tells the user to "clear filters in the left
panel" — wrong when it is the quick find hiding rows. Make it name the search term and
point at the box above when quickFind is set.

(b) JOB NO. COLUMN — third column, right after Document No.
Header `<th style={{ ...TH, width: 130 }}>Job No.</th>`; cell renders the job as a blue
chip (Courier New 11px, #1e40af on #dbeafe) with `title={item.jobTitle}` on the `<td>` so
hovering shows the project name, and a grey em dash when there is no job. Add the same
chip to the mobile ApprovalCard.

The header row goes 9 cells → 10, so bump the expanded-detail row `colSpan={9}` to 10.
Verify the data row also has 10 `<td>` afterwards.

(c) SUPPLIER NAME — PO only, as a second line UNDER the document number, not its own
column: it is PO-only and the grid is already wide. Bold (fontWeight 700, #475569 — the
lighter #64748b reads muddy when bold at 11px), ellipsised at ~220px with the full name in
a title tooltip. Add it to the mobile card too, and show `Job: … · Supplier: …` in the
expanded Review panel.

(d) PER-COLUMN FILTER ROW — a second header row inside each CategorySection's table,
using ColFilter: Document No (placeholder "PO no." / "PR no." / "Doc no." per section),
Job No., and Submitted By. Pad every other column with `<th />` so the cell count matches
the header exactly.

Four things that matter here:
- State lives INSIDE CategorySection, so filtering Purchase Orders leaves Purchase
  Requests untouched.
- Render the Job No. filter only for PO and PR sections (`<th />` otherwise) — job is
  always blank elsewhere, so a box there would be dead.
- Select-all and the "n selected" count must follow the FILTERED rows, not all items —
  ticking the header box while filtered must never select rows the user cannot see.
- The section count badge shows "12 of 50" while filtering, and an unmatched filter gets a
  "No purchase orders match these column filters" row rather than an empty table.

All of this is client-side over data already in memory — no server round trip, no paging
caveat.

────────────────────────────────────────────────────────────────────────
Verify
────────────────────────────────────────────────────────────────────────
Build with `CI=false npx react-scripts build` in frontend/ and confirm no new warnings come
from files you touched. Then confirm the filter row renders exactly as many cells as the
header in BOTH branches of the PO/PR conditional.

Tell the user explicitly that Job No. and Supplier stay blank until the DB script is
applied AND the API is rebuilt — the UI degrades quietly rather than breaking.

FYI, not a bug and not part of this change: the queue is ordered oldest-submitted-first
(sp_GetMyApprovals ends `ORDER BY p.SubmittedDate`, no DESC) and the frontend does not
re-sort — it only groups by module in the fixed MODULES order. Mention it if the user asks
why their newest document is at the bottom.
```
