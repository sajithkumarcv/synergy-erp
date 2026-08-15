# Production deployment — Synergy ERP (as of 2026-08-15)

Everything below is applied to **dev SYNERP only**. Nothing in this list has
been run against production yet.

Run the DB scripts **in the order listed**, then deploy backend, then frontend.

---

## 1. Database scripts

Run against the production Synergy database. Each script is idempotent or
aborts safely if the target has drifted.

| # | Script | What it changes | Risk |
|---|--------|-----------------|------|
| 1 | `2026-08-13_job_type_multiselect_filter.sql` | `sp_SearchJobs` — adds `@JobTypeIds` and `@JobNumId` filters | Low — new optional params, existing calls unaffected |
| 2 | `2026-08-13b_job_overview_type_multiselect.sql` | Job Overview job-type multiselect support | Low |
| 3 | `2026-08-13c_dashboard_active_jobs_exclude_inhouse.sql` | `sp_GetDashboard` — "Active Jobs" KPI now excludes In-House jobs; adds `ActiveJobsInHouse` column | Low — **KPI number on the dashboard will visibly drop** (in-house jobs move to a sub-count). Expected, not a regression. |
| 4 | `2026-08-13d_pr_po_approvals_document_status.sql` | `sp_GetAllApprovals` — adds `@DocumentStatus` param; `CurrentApprover` now resolves roles to real user names | Low |
| 5 | `2026-08-13e_pr_po_approvals_menu.sql` | Menu row 1120 "PR & PO Approvals" + role grants (ADMIN, DEPARTMENT HEAD) | Low — **check MenuId 1120 is free in prod first**; the script aborts if it is taken by a different page |
| 6 | `2026-08-15_po_submit_budget_check_exclude_gst.sql` | `sp_SubmitForApproval` — **GST excluded from PO budget guard** | **Behaviour change — see §3** |
| 7 | `2026-08-15b_po_approve_budget_check_exclude_gst.sql` | `sp_ProcessApproval` — **GST excluded from PO budget guard** | **Behaviour change — see §3** |

> Scripts 6 and 7 are a **pair**. Applying only one leaves the other guard
> still blocking documents with the GST-inflated figure. Apply both.

After each script, confirm `uses_quoted_identifier = 1` and
`uses_ansi_nulls = 1` for the altered proc (scripts 6 and 7 include this
check at the end).

---

## 2. Application code

### Backend — requires **rebuild + restart** (no hot reload)

- `Controllers/Approval/ApprovalController.cs` — budget-override password removed (§4); `GetAll` gained `documentStatus` param + document-status fields
- `Controllers/General/DashboardController.cs` — exposes `activeJobsInHouse`
- `Controllers/Job/JobOverviewController.cs`

> The build will fail with a file-lock error if the API is still running.
> Stop the site/service first, then build, then start.

### Frontend — rebuild and deploy

Modified:
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
