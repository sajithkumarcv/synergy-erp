-- =====================================================================
-- PRE / POST DEPLOY VERIFICATION — Synergy ERP
-- Baseline: production as of 2026-08-06 22:06 (commit 4f15134)
--
-- Run this against PRODUCTION.
--   * BEFORE deploying  -> every row should read MISSING/OLD (nothing applied yet)
--   * AFTER  deploying  -> every row must read OK. Any MISSING = a script did
--                          not run. Do not sign off until all rows are OK.
--
-- This exists so the deployment list does not have to be taken on trust:
-- it checks the DATABASE for each object, independently of any document.
--
-- Read-only. Makes no changes.
-- =====================================================================

SET NOCOUNT ON;

PRINT '=== A. NEW TABLES (missing = hard failure at runtime) ===';
SELECT 'TBL_DASHBOARD_ROLE_CONFIG' AS Object,
       CASE WHEN OBJECT_ID('proj.TBL_DASHBOARD_ROLE_CONFIG') IS NULL THEN 'MISSING' ELSE 'OK' END AS Status,
       'Script 3 (2026-08-07c). Dashboard role config page fails without it.' AS Note
UNION ALL
SELECT 'TBL_PR_LINE_STATUS_LOG',
       CASE WHEN OBJECT_ID('proj.TBL_PR_LINE_STATUS_LOG') IS NULL THEN 'MISSING' ELSE 'OK' END,
       'Script 4 (2026-08-08). sp_ChangePrLineStatus writes here - PR line status changes fail without it.';

PRINT '=== B. NEW COLUMNS ===';
SELECT 'TBL_MOM_TASK.RefModuleCode' AS Object,
       CASE WHEN COL_LENGTH('proj.TBL_MOM_TASK','RefModuleCode') IS NULL THEN 'MISSING' ELSE 'OK' END AS Status,
       'Script 1 (2026-08-07).' AS Note
UNION ALL
SELECT 'TBL_MOM_TASK.RefDocumentId',
       CASE WHEN COL_LENGTH('proj.TBL_MOM_TASK','RefDocumentId') IS NULL THEN 'MISSING' ELSE 'OK' END,
       'Script 1 (2026-08-07).';

PRINT '=== C. NEW PROCEDURES ===';
SELECT o.Object,
       CASE WHEN OBJECT_ID('proj.' + o.Object) IS NULL THEN 'MISSING' ELSE 'OK' END AS Status,
       o.Note
FROM (VALUES
    ('sp_CreateProcurementPOTasks', 'Script 1 (2026-08-07)'),
    ('sp_CloseProcurementPOTasks',  'Script 1 (2026-08-07)'),
    ('sp_GetDashboardRoleConfig',   'Script 3 (2026-08-07c)'),
    ('sp_SetDashboardRoleConfig',   'Script 3 (2026-08-07c)')
) o(Object, Note);

PRINT '=== D. ALTERED PROCEDURES - checked by CONTENT, not by date ===';
-- A proc can exist and still be the OLD version, so each row looks for a
-- fingerprint that only the new version contains.
SELECT x.Object, x.Status, x.Note FROM (
    SELECT 'sp_SubmitForApproval' AS Object,
           CASE WHEN OBJECT_DEFINITION(OBJECT_ID('proj.sp_SubmitForApproval'))
                     LIKE '%@PoExchangeRate%' THEN 'OK' ELSE 'OLD' END AS Status,
           'Script 10. GST excluded from submit-time PO budget guard.' AS Note
    UNION ALL
    SELECT 'sp_ProcessApproval',
           CASE WHEN OBJECT_DEFINITION(OBJECT_ID('proj.sp_ProcessApproval'))
                     LIKE '%@ApExchangeRate%' THEN 'OK' ELSE 'OLD' END,
           'Script 11. GST excluded from approve-time PO budget guard.'
    UNION ALL
    SELECT 'sp_SearchJobs',
           CASE WHEN OBJECT_DEFINITION(OBJECT_ID('proj.sp_SearchJobs')) LIKE '%@JobTypeIds%'
                 AND OBJECT_DEFINITION(OBJECT_ID('proj.sp_SearchJobs')) LIKE '%@JobNumId%'
                THEN 'OK' ELSE 'OLD' END,
           'Script 5 must run AFTER script 2, or the filters are reverted.'
    UNION ALL
    SELECT 'sp_GetDashboard',
           CASE WHEN OBJECT_DEFINITION(OBJECT_ID('proj.sp_GetDashboard'))
                     LIKE '%ActiveJobsInHouse%' THEN 'OK' ELSE 'OLD' END,
           'Script 7.'
    UNION ALL
    SELECT 'sp_GetJobsForOverview',
           CASE WHEN OBJECT_DEFINITION(OBJECT_ID('proj.sp_GetJobsForOverview'))
                     LIKE '%@JobTypeIds%' THEN 'OK' ELSE 'OLD' END,
           'Script 6.'
    UNION ALL
    SELECT 'sp_GetAllApprovals',
           CASE WHEN OBJECT_DEFINITION(OBJECT_ID('proj.sp_GetAllApprovals'))
                     LIKE '%@DocumentStatus%' THEN 'OK' ELSE 'OLD' END,
           'Script 8.'
    UNION ALL
    SELECT 'sp_ChangePrLineStatus',
           CASE WHEN OBJECT_DEFINITION(OBJECT_ID('proj.sp_ChangePrLineStatus'))
                     LIKE '%TBL_PR_LINE_STATUS_LOG%' THEN 'OK' ELSE 'OLD' END,
           'Script 4.'
    UNION ALL
    SELECT 'sp_GetPRHistory',
           CASE WHEN OBJECT_DEFINITION(OBJECT_ID('proj.sp_GetPRHistory'))
                     LIKE '%TBL_PR_LINE_STATUS_LOG%' THEN 'OK' ELSE 'OLD' END,
           'Script 4.'
    UNION ALL
    SELECT 'sp_SetPOLine',
           CASE WHEN OBJECT_DEFINITION(OBJECT_ID('proj.sp_SetPOLine'))
                     LIKE '%sp_CloseProcurementPOTasks%' THEN 'OK' ELSE 'OLD' END,
           'Script 1.'
    UNION ALL
    SELECT 'VW_JOB',
           CASE WHEN OBJECT_ID('proj.VW_JOB') IS NULL THEN 'MISSING' ELSE 'OK' END,
           'Script 2. Check job list default sort manually.'
) x;

PRINT '=== E. MENU ROW 1120 (PR & PO Approvals) ===';
SELECT 'TBL_MENU 1120' AS Object,
       CASE WHEN EXISTS (SELECT 1 FROM proj.TBL_MENU WHERE MenuId = 1120)
            THEN 'OK' ELSE 'MISSING' END AS Status,
       'Script 9. If MISSING, the page exists but nobody can navigate to it.' AS Note
UNION ALL
SELECT 'TBL_ROLE_MENU grants for 1120',
       CASE WHEN EXISTS (SELECT 1 FROM proj.TBL_ROLE_MENU WHERE MenuId = 1120)
            THEN 'OK' ELSE 'MISSING' END,
       'Script 9. Expect ADMIN (1) and DEPARTMENT HEAD (1010).';

PRINT '=== F. ANSI settings - both must be 1 on every altered proc ===';
SELECT o.name, m.uses_quoted_identifier, m.uses_ansi_nulls,
       CASE WHEN m.uses_quoted_identifier = 1 AND m.uses_ansi_nulls = 1
            THEN 'OK' ELSE '*** BAD - re-apply this proc ***' END AS Status
FROM sys.sql_modules m
JOIN sys.objects o ON o.object_id = m.object_id
WHERE o.name IN ('sp_SubmitForApproval','sp_ProcessApproval','sp_SearchJobs',
                 'sp_GetDashboard','sp_GetJobsForOverview','sp_GetAllApprovals',
                 'sp_ChangePrLineStatus','sp_GetPRHistory','sp_RevisePR','sp_SetPOLine',
                 'sp_GetMOMTaskList','sp_SetMOMTask','sp_CreateProcurementPOTasks',
                 'sp_CloseProcurementPOTasks','sp_GetDashboardRoleConfig','sp_SetDashboardRoleConfig')
ORDER BY Status DESC, o.name;

PRINT '=== G. INDEPENDENT SWEEP - anything dev changed that prod has not got ===';
-- Run the SAME query on dev and on prod and compare the row counts / names.
-- Dev (post-2026-08-06 deploy) returns 23 objects. Prod must match after deploy.
SELECT o.type_desc, o.name, o.create_date, o.modify_date
FROM sys.objects o
WHERE o.is_ms_shipped = 0
  AND o.type IN ('P','U','V','FN','IF','TF','TR')
  AND o.modify_date > '2026-08-06 22:06'
ORDER BY o.type_desc, o.name;
