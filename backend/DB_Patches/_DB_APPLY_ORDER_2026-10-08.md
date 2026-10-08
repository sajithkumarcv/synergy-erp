# Database patches, in apply order (as of 2026-10-08)

Run each with `sqlcmd -S <server> -d <db> -I -b -f 65001 -i <file>` (`-I` = QUOTED_IDENTIFIER ON, `-f 65001` = UTF-8).
Never paste proc bodies inline with `-Q`, and do not use the MCP execute tool (it silently no-ops).
All of these are applied on dev SYNERP. Every file is idempotent unless noted.

## A. PRs Pending PO, PO line report, Job Overview (10-06)

| # | File | What it does |
|---|---|---|
| 1 | `2026-10-06_pr_pending_po_screen.sql` | New `sp_GetPrPendingPo`, menu 1121 |
| 2 | `2026-10-06_po_line_report.sql` | New `sp_ReportPoLines`, menu 1122 |
| 3 | `2026-10-06_job_overview_hide_closed_jobs.sql` | Alters `sp_GetJobsForOverview`: Completed/Cancelled hidden unless picked in the Status filter. Compare with the target's version first. |

## B. Issue Request

| # | File | What it does |
|---|---|---|
| 4 | `2026-09-07b_issue_request_step1.sql` | Request tables, ISR document series + approval module, menu 1123 |
| 5 | `2026-09-07c_issue_request_step2_procs.sql` | Request procs |
| 6 | `2026-09-07d_issue_request_step2_statuses.sql` | The 11 ISR statuses |
| 7 | `2026-09-07e_issue_request_step2_menu_on.sql` | Turns menu 1123 on |
| 8 | `2026-09-07f_issue_request_step3a_schema.sql` | `TBL_STOCK_ISSUE.RequestId/IssueTypeId`, `TBL_STOCK_ISSUE_LINE.RequestLineId`, `TBL_ISSUE_TYPE.RequiresRequest` (default 1) |
| 9 | `2026-09-07f2_issue_request_gate_off.sql` | **Sets `RequiresRequest = 0` for both issue types. Must run before 11 and 15.** |
| 10 | `2026-09-07g_issue_request_step3b_procs.sql` | Issue note procs |
| 11 | `2026-09-07h_issue_request_step3c_confirm.sql` | `sp_ConfirmStockIssue` request gate (replaced by 15) |
| 12 | `2026-09-07i_issue_request_step3d_getissue.sql` | `sp_GetStockIssue` |
| 13 | `2026-09-09_issue_request_step4a_schema.sql` | `TBL_STOCK_BALANCE.QtyReserved` + computed `QtyAvailable`, reservation-days setting |
| 14 | `2026-09-09b_issue_request_step4b_procs.sql` | Reservation procs, approval hook `sp_PostIssueRequestApproval` |
| 15 | `2026-09-09c_issue_request_step4c_confirm_release.sql` | `sp_ConfirmStockIssue` gate + release of the hold |
| 16 | `2026-09-09d_issue_request_step4d_read_paths.sql` | `sp_GetStockAvailability`, `sp_GetStockBalance` |
| 17 | `2026-09-09e_issue_request_step5_bom_import.sql` | `TBL_BOM_DETAILS.IsrCreatedQty`, BOM import procs |
| 18 | `2026-10-06_issue_request_bom_draft_pr.sql` | Draft PRs no longer reserve BOM balance (`sp_GetBomLinesForIssueRequest`, `sp_SetIssueRequestLine`) |
| 19 | `2026-10-06b_issue_types_requires_request.sql` | `sp_GetIssueTypes` returns `RequiresRequest` |
| 20 | `2026-10-06c_isr_approval_policy_like_pr.sql` | ISR approval policy, one level, same approvers as PR (skipped if ISR already has a policy) |

To make an approved request mandatory later: `UPDATE proj.TBL_ISSUE_TYPE SET RequiresRequest = 1;` (no redeploy).
Before that: the ISR policy (20) and approvers must exist, and every Draft issue note must be confirmed or cancelled.

## C. PO approval policy by job type, and PO budget (10-08)

| # | File | What it does |
|---|---|---|
| 21 | `2026-10-08_po_policy_by_job_type.sql` | `TBL_APPROVAL_POLICY.JobTypeId`; policy selection in `sp_SubmitForApproval`; `sp_SaveApprovalPolicy` / `sp_GetApprovalPolicies`; creates "PO In-House Jobs" (job type IH) |
| 22 | `2026-10-08b_approval_level_noskip.sql` | `TBL_APPROVAL_LEVEL.NoSkip`; `sp_ProcessApproval` / `sp_SubmitForApproval` stop a senior approver jumping over a NoSkip level; NoSkip set on in-house level 1 |
| 23 | `2026-10-08c_po_budget_approved_revision.sql` | PO budget checks use the latest APPROVED revision (`sp_SubmitForApproval`, `sp_ProcessApproval`, `sp_GetPOBudgetCheck`, `sp_SetPOLine`) |

Run 21, 22, 23 in this order: they all replace `sp_SubmitForApproval` (22 and 23 also `sp_ProcessApproval`) and each builds on the previous text.
Revert scripts for 21-23 are in `D:\Projects\_synergy_backups\` (`_REVERT_2026-10-08_po_policy_by_job_type.sql` undoes 21 and 22; `_REVERT_2026-10-08c_po_budget_approved_revision.sql` undoes 23).

## Not in this list
- `2026-10-07_zoho_po_interface.sql`, `2026-10-07b_zoho_po_interface_amend_hook.sql`: untracked, written outside this work; dependencies unchecked.
- `PROD_2026-09-29_supplier_migration_from_ENGSERVICE_FZEERP.sql`: the supplier migration was cancelled.
- Application code that goes with these (API + frontend): Issue Request controller/screens, approval policies page, `PrPendingPo`, `PoLineReport`. See the git log for the commits.
