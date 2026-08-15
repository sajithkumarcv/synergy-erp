# Production deployment — Synergy ERP (as of 2026-08-15)

## Baseline: what is actually in production

**Last prod deployment: 2026-08-06 ~22:00.** Corroborated three ways — the user's
own recollection, the Release build `backend/bin/Release/net8.0/ERPWEB.dll`
dated **06/08/2026 22:06**, and the last commit before it, **`4f15134`
(06/08 21:24)**.

So the deployment scope is **everything after `4f15134`**, which is:

| | Count |
|---|---|
| Commits | 4 (`ece7c18`, `79c18ef`, `e748634`, `1d76070`) |
| DB scripts | **11 — all of them**, `2026-08-07*` through `2026-08-15b` |
| Backend files | 8 (incl. 1 new model) |
| Frontend files | 113 (incl. 4 new) |

> ⚠️ An earlier revision of this document listed only the 7 scripts from
> 2026-08-13 onward and only the files uncommitted at the time. That was
> **wrong** — it measured from the last *commit*, not the last *deployment*.
> The 2026-08-07 and 2026-08-08 work (procurement tasks, job sort, dashboard
> role config, PR line status history — including **two new tables**) has
> never been deployed either.

### Completeness check (how this list was verified)

Queried dev SYNERP for every object changed since the deploy:

```sql
SELECT o.type_desc, o.name, o.create_date, o.modify_date
FROM sys.objects o
WHERE o.is_ms_shipped = 0 AND o.type IN ('P','U','V','FN','IF','TF','TR')
  AND o.modify_date > '2026-08-06 22:06';
```

That returned **23 objects**, and every one is covered by real `CREATE`/`ALTER`
DDL in one of the 11 scripts — no orphans. Re-run that query against prod after
deploying; it should return the same 23.

---

## 1. Database scripts

Run against the production Synergy database **in this exact order** (name order
is correct order). Each is idempotent or aborts safely if the target has drifted.

| # | Script | What it changes | Risk |
|---|--------|-----------------|------|
| 1 | `2026-08-07_pr_approval_procurement_task.sql` | **`ALTER TABLE TBL_MOM_TASK` (2 new columns)**; `sp_GetMOMTaskList`, `sp_SetMOMTask`, `sp_SetPOLine`, `sp_GetPRApprovalNotify`; **new** `sp_CreateProcurementPOTasks`, `sp_CloseProcurementPOTasks` | Medium — schema change + `sp_SetPOLine` (PO line save path) |
| 2 | `2026-08-07b_job_default_sort_by_type.sql` | `VW_JOB`, `sp_SearchJobs` — default sort by job type | Low |
| 3 | `2026-08-07c_dashboard_role_config.sql` | **`CREATE TABLE TBL_DASHBOARD_ROLE_CONFIG`** (+FK to `TBL_ROLES`); new `sp_GetDashboardRoleConfig`, `sp_SetDashboardRoleConfig` | Low — new table, additive |
| 4 | `2026-08-08_pr_line_status_history.sql` | **`CREATE TABLE TBL_PR_LINE_STATUS_LOG`** (+FK to `TBL_PURCHASE_REQUEST`); `sp_ChangePrLineStatus`, `sp_GetPRHistory`, `sp_RevisePR` | Low — new table, additive |
| 5 | `2026-08-13_job_type_multiselect_filter.sql` | `sp_SearchJobs` — adds `@JobTypeIds` and `@JobNumId` filters | Low — new optional params, existing calls unaffected |
| 6 | `2026-08-13b_job_overview_type_multiselect.sql` | `sp_GetJobsForOverview` — job-type multiselect | Low |
| 7 | `2026-08-13c_dashboard_active_jobs_exclude_inhouse.sql` | `sp_GetDashboard` — "Active Jobs" KPI excludes In-House; adds `ActiveJobsInHouse` | Low — **KPI will visibly drop** (in-house moves to a sub-count). Expected, not a regression. |
| 8 | `2026-08-13d_pr_po_approvals_document_status.sql` | `sp_GetAllApprovals` — `@DocumentStatus` param; `CurrentApprover` resolves roles to real user names | Low |
| 9 | `2026-08-13e_pr_po_approvals_menu.sql` | Menu row 1120 "PR & PO Approvals" + grants (ADMIN, DEPARTMENT HEAD) | Low — **check MenuId 1120 is free in prod first**; aborts if taken |
| 10 | `2026-08-15_po_submit_budget_check_exclude_gst.sql` | `sp_SubmitForApproval` — **GST excluded from PO budget guard** | **Behaviour change — see §3** |
| 11 | `2026-08-15b_po_approve_budget_check_exclude_gst.sql` | `sp_ProcessApproval` — **GST excluded from PO budget guard** | **Behaviour change — see §3** |

> Scripts 10 and 11 are a **pair**. Applying only one leaves the other guard
> still blocking documents with the GST-inflated figure. Apply both.

**Order matters — two procs are altered twice:**
- `sp_SearchJobs` by #2 and #5. #5 is a **superset** (verified: it contains
  both the `SortOrder`/`VW_JOB` changes from #2 and the new params), so running
  in order is safe. Running #2 *after* #5 would revert the filters.
- `sp_GetDashboard` is altered **only** by #7 — `sp_GetDashboardRoleConfig` in
  #3 is a *different* proc whose name merely contains the same prefix. No
  conflict (confirmed: the live `sp_GetDashboard` does not reference
  `TBL_DASHBOARD_ROLE_CONFIG`).

After each script, confirm `uses_quoted_identifier = 1` and
`uses_ansi_nulls = 1` for the altered proc (scripts 10 and 11 include this
check at the end).

---

## 2. Application code

Both are deployed as whole build outputs (`ERPWEB.dll`, frontend `build/`), so
the per-file lists below are for **review and smoke-testing**, not for copying
files individually. Deploy the complete build.

### Backend — requires **rebuild + restart** (no hot reload)

The current `bin/Release` DLL is from **06/08 22:06** — i.e. the deployed
version. It **must be rebuilt in Release**; only the Debug build has the
current code.

All 8 changed files since `4f15134`:
- `Controllers/Approval/ApprovalController.cs` — budget-override password removed (§4); `GetAll` gained `documentStatus` + document-status fields
- `Controllers/General/DashboardController.cs` — exposes `activeJobsInHouse`
- `Controllers/Job/JobController.cs` — `jobTypeIds` param; new `GetJobByNumId`
- `Controllers/Job/JobOverviewController.cs` — `jobTypeIds` param
- `Controllers/Item/ItemController.cs`
- `Models/Approval/ApprovalModels.cs`
- `Models/Mom/MomTask.cs`
- `Models/General/DashboardRoleConfig.cs` — **new file**

> The build will fail with a file-lock error if the API is still running.
> Stop the site/service first, then build, then start.

### Frontend — rebuild and deploy

**113 files changed** since `4f15134` — far too many to list individually;
`git diff --name-status 4f15134..HEAD -- frontend/src` gives the full set.
Four are new files:
- `src/jobs/JobTypeMultiSelect.js`
- `src/procurement/PrPoApprovalsPage.js`
- `src/procurement/po/PoApprovalPrintPage.js`
- `src/settings/DashboardRoleConfig.js`
- `src/utils/useInitialFilters.js`

The most-changed areas (worth the heaviest smoke-testing) are **reports**
(~30 files), **procurement**, **approvals**, and **jobs**.

Files touched by this session's fixes specifically:
- `src/Dashboard.js`, `src/Layout.js`
- `src/jobs/Job.js`, `src/jobs/JobOverview.js`
- `src/bom/BomDetailPage.js`
- `src/procurement/po/Po.js`
- `src/approval/ApprovalHistoryTab.js`, `src/approval/ApprovalActionModal.js`, `src/approval/MyApprovalsPage.js`
- `src/approval/ApprovalsAdminPage.js` — "Waiting On" column overflow fix (below)

**"Waiting On" column overflow.** Once `CurrentApprover` started resolving
roles to real user names (DB script 4), a multi-name list overflowed its cell
and overlapped the Amount / Submitted By columns. Cause: `Procurement.css`
sets `white-space: nowrap` on every table cell, so the chip could not wrap,
and `max-width` on a `<td>` does not clip overflowing content without
`overflow: hidden` — measured at 447px inside a 194px cell. Fixed on **both**
pages that render this column (`ApprovalsAdminPage.js` and
`PrPoApprovalsPage.js`) with a fixed-width inner div, ellipsis truncation,
and the full name list in a `title` tooltip.

New files:
- `src/jobs/JobTypeMultiSelect.js`
- `src/procurement/PrPoApprovalsPage.js`

---

## 3. GST excluded from PO budget checks — what changes

**The bug.** Three places compare a PO against its job/expense-category
budget. Two of them measured this PO using `TBL_PURCHASE_ORDER.TotalAmount`,
which is **tax-inclusive**, while both other sides of the comparison —
already-committed POs and the budget itself — are **tax-exclusive**. GST was
therefore counted against the budget, blocking POs that were actually within
budget.

| Guard | Location | Before | After |
|-------|----------|--------|-------|
| Line editor (soft warning) | `PoLinesTab.js` | `qty x price` — already correct | unchanged |
| Print watermark | `sp_GetPOBudgetCheck` | already correct | unchanged |
| **Submit for approval** | `sp_SubmitForApproval` | `TotalAmount` (incl. GST) | `SUM(qty x price)` |
| **Approve** | `sp_ProcessApproval` | `TotalAmount` (incl. GST) | `SUM(qty x price)` |

**Verified on dev** against real PO-26-0007 (job IH26-500026, category 23
"Radiator", 10 x 150 @ 15% GST):

```
Budgeted 4,000.00 | Already committed 2,500.00
  before: this PO 1,725.00 (incl. GST) -> 4,225.00 > 4,000  -> BLOCKED, "Over by 225.00"
  after : this PO 1,500.00 (pre-tax)   -> 4,000.00 = 4,000  -> PASSES
```

**Scope of the change — important for reassuring users:**

- Only the *comparison basis* for budget checks changed.
- **No invoice, tax, PO total, or budget figure is calculated differently.**
  `TotalAmount` is still tax-inclusive everywhere it is displayed, printed
  and posted.
- Currency handling is unchanged: `proj.fn_ToBase` multiplies by the stored
  exchange rate, exactly as the old `* ExchangeRate` did.
- The override path (`@OverrideBudget = 1`) is untouched.

**Expected effect in prod:** some POs currently blocked as over-budget will
now submit/approve normally, because the GST portion is no longer charged
against the budget. POs that are genuinely over budget still block.

---

## 4. Budget-override password removed

Requested 2026-08-15: submitting or approving an over-budget document no
longer asks for a **budget password** — the user confirms a prompt and types
a **reason**, which is still recorded on the approval log.

- Backend: `overrideBudget` is now driven by the presence of a reason
  instead of a validated password, in both `Submit()` and `ProcessAction()`.
- Frontend: password field removed from all three override modals
  (`ApprovalHistoryTab.js`, `ApprovalActionModal.js`, `MyApprovalsPage.js`).

**This does not change any calculation** — the password was only ever an
authorisation gate deciding *who may proceed past the warning*.

**Control implications — make sure the business accepts these:**

- Any user who can submit or approve a document can now clear a budget
  overrun on their own. Previously they needed the budget password.
- The audit trail is **unchanged**: who overrode, when, and their reason are
  still written to the approval log.
- Budget passwords are still required elsewhere and were deliberately left
  alone: job budget approve/revise, expense deletion, and the other
  financial guards.
- `sp_ValidateBudgetPassword` is no longer called by the approval flow. The
  proc and users' stored passwords remain in place, so this is reversible.

Dead code left behind (harmless, no build impact): `ModuleMenuUrl()` and
`ModuleSubmitAction()` in `ApprovalController.cs` are now unreferenced. They
document the module→menu mapping; delete them if the password gate is not
coming back.

---

## 5. Post-deploy smoke test

1. Dashboard — "Active Jobs" shows the reduced count with the In-House
   sub-count beneath it.
2. `/jobs` — loads with In-House jobs excluded by default; the Clear link
   appears; Job Type filter renders as the chip/dropdown widget.
3. Procurement → **PR & PO Approvals** — page is visible to ADMIN and
   DEPARTMENT HEAD, defaults to Pending, "Waiting On" shows real user names.
   On a row with several approvers, the names stay inside their column
   (truncated with "…", full list on hover) and do not overlap Amount.
4. Open an over-budget PO → Approval tab → Submit: the prompt shows the
   **pre-tax** "This PO" figure and asks only for a reason, no password.
5. Approve that PO from **My Approvals**: same prompt behaviour.
6. Confirm the override reason appears in the document's approval history.
