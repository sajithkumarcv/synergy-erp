# Synergy patch register (matches proj.TBL_DB_PATCH)

From 2026-11-18 only: every new DB patch is a numbered file in this folder, records itself in ``proj.TBL_DB_PATCH`` (number, date, user), and is listed here. No old data is back-filled in any database.
SYNERP's ledger holds only the original 0000-0002; the next number is 0003.

## Procedure for every delivery
1. Next free number, ``NNNN_short_name.sql``. First batch fails if the ledger table is missing; last batch inserts the ledger row (pattern: ``template_patch.sql``).
2. List it in the table below in the same commit; run the same file on SYNERP.
3. Every delivery has a release note (delivery date, database, last patch before and after, builds, plain-words changes). Layout: the base repo's ``deploy/patch/RELEASE_NOTE_TEMPLATE.md``.
4. After a delivery to India / UAE: read their ledger, check the level, add the line to the deployments table.

## Patches
| No | File | What it does |
|----|------|--------------|
| 0001 | 0001_guard_order_value_below_budget.sql | block reducing a job's order value below its budget |
| 0002 | 0002_whole_job_budget_check.sql | sp_GetPOBudgetCheck: whole-job check |

## Deployments
| Date | Database | Level before | Level after | Build | Notes |
|------|----------|--------------|-------------|-------|-------|