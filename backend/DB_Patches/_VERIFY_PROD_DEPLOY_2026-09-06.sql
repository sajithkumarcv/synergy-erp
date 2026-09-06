-- =====================================================================
-- PRE / POST DEPLOY VERIFICATION - Synergy ERP, 2026-09-06 delivery
--
-- Run against EACH production database (SYNERPINDIA, SYNERPUAE, ESI_PMS_IND).
--
--   BEFORE deploying -> section A should read MISSING/OLD throughout,
--                       section B should already read OK.
--   AFTER  deploying -> every row in A and B must read OK.
--
--   *** If section B reads MISSING before you start, that database is BEHIND
--       the assumed baseline. Stop. The app build expects those objects. ***
--
-- Checks the DATABASE for each object, independently of any document.
-- Read-only. Makes no changes.
-- =====================================================================

SET NOCOUNT ON;

PRINT '';
PRINT '=== A. THIS DELIVERY (all must read OK after deploying) ===';

SELECT Item, Status, Note FROM (
    SELECT 1 AS Ord,
           'sp_SetPO - discount recompute' AS Item,
           CASE WHEN CHARINDEX('@HeaderDiscountPct',
                    ISNULL(OBJECT_DEFINITION(OBJECT_ID('proj.sp_SetPO')), '')) > 0
                THEN 'OK' ELSE 'MISSING' END AS Status,
           'Script 1 (2026-08-23). Header Discount % is stored but never deducted without it.' AS Note
    UNION ALL
    SELECT 2,
           'sp_SubmitForApproval - self-approval per role',
           CASE WHEN CHARINDEX('al2.ApproverType',
                    ISNULL(OBJECT_DEFINITION(OBJECT_ID('proj.sp_SubmitForApproval')), '')) > 0
                THEN 'OK' ELSE 'OLD (level-wide)' END,
           'Script 2 (2026-08-23b). BEHAVIOUR CHANGE - read section 4 of the runbook first.'
    UNION ALL
    SELECT 3,
           'sp_ImportJobBudgetItem - header is a default',
           CASE WHEN CHARINDEX('deliberately no longer part of this decision',
                    ISNULL(OBJECT_DEFINITION(OBJECT_ID('proj.sp_ImportJobBudgetItem')), '')) > 0
                THEN 'OK' ELSE 'MISSING' END,
           'Script 3 (2026-08-31). Without it an in-house job forces every imported row onto its own header.'
    UNION ALL
    SELECT 4,
           'sp_SearchBoms - @JobTypeIds',
           CASE WHEN EXISTS (SELECT 1 FROM sys.parameters
                             WHERE object_id = OBJECT_ID('proj.sp_SearchBoms') AND name = '@JobTypeIds')
                THEN 'OK' ELSE 'MISSING' END,
           'Script 4 (2026-08-31b). The new BOM list build sends this - MISSING means every BOM search throws.'
    UNION ALL
    SELECT 5,
           'sp_SearchBoms - @CustomerId',
           CASE WHEN EXISTS (SELECT 1 FROM sys.parameters
                             WHERE object_id = OBJECT_ID('proj.sp_SearchBoms') AND name = '@CustomerId')
                THEN 'OK' ELSE 'MISSING' END,
           'Script 4 (2026-08-31b).'
    UNION ALL
    SELECT 6,
           'sp_SearchBoms - sort whitelist',
           CASE WHEN CHARINDEX('TotalBomValue'' THEN ''TotalBomValue',
                    ISNULL(OBJECT_DEFINITION(OBJECT_ID('proj.sp_SearchBoms')), '')) > 0
                THEN 'OK' ELSE 'MISSING' END,
           'Script 4 (2026-08-31b). Without it column sorting silently does nothing.'
    UNION ALL
    SELECT 7,
           'TR_BOM_RecalcTotalValue (trigger)',
           CASE WHEN OBJECT_ID('proj.TR_BOM_RecalcTotalValue', 'TR') IS NULL
                THEN 'MISSING' ELSE 'OK' END,
           'Script 5 (2026-08-31c). TotalBomValue goes stale on most write paths without it.'
    UNION ALL
    SELECT 8,
           'sp_ImportBomDetail (procedure)',
           CASE WHEN OBJECT_ID('proj.sp_ImportBomDetail', 'P') IS NULL
                THEN 'MISSING' ELSE 'OK' END,
           'Script 6 (2026-08-31d). The Import Excel button fails without it.'
) A ORDER BY Ord;

PRINT '';
PRINT '=== B. ASSUMED BASELINE (must ALREADY be OK before you deploy) ===';

SELECT Item, Status, Note FROM (
    SELECT 1 AS Ord,
           'sp_SearchPOs - @JobTypeIds' AS Item,
           CASE WHEN EXISTS (SELECT 1 FROM sys.parameters
                             WHERE object_id = OBJECT_ID('proj.sp_SearchPOs') AND name = '@JobTypeIds')
                THEN 'OK' ELSE 'MISSING' END AS Status,
           'From the 2026-08-18 delivery. MISSING = every PO search throws once the API is rebuilt.' AS Note
    UNION ALL
    SELECT 2,
           'sp_GetMyApprovals - job/supplier columns',
           CASE WHEN CHARINDEX('SupplierName',
                    ISNULL(OBJECT_DEFINITION(OBJECT_ID('proj.sp_GetMyApprovals')), '')) > 0
                THEN 'OK' ELSE 'MISSING' END,
           'From the 2026-08-18/23 delivery. MISSING = My Approvals shows blank Job No. and Supplier.'
    -- REMOVED 2026-09-06: there was a check here for JobId in sp_GetAllApprovals.
    -- It was wrong. No patch ever adds JobId to that procedure (2026-08-13d, the
    -- only script that touches it, never mentions JobId) and ApprovalsAdminPage.js
    -- has no job column at all. It reported MISSING on both production databases
    -- during the 2026-09-06 deployment and sent us looking for a gap that does not
    -- exist. The 08-23 job/supplier work was on sp_GetMyApprovals - checked above.
    UNION ALL
    SELECT 3,
           'sp_GetPRApprovalNotify - Procurement GROUP',
           CASE WHEN CHARINDEX('TBL_USER_GROUP',
                    ISNULL(OBJECT_DEFINITION(OBJECT_ID('proj.sp_GetPRApprovalNotify')), '')) > 0
                THEN 'OK' ELSE 'OLD (role-based)' END,
           'From the 2026-08-07 delivery. OLD = PR-approved emails go to the PROCUREMENT OFFICER role, not the Procurement group.'
) B ORDER BY Ord;

PRINT '';
PRINT '=== C. DATA SANITY - BOM headers whose TotalBomValue disagrees with their lines ===';
PRINT '    Before script 5: any rows here are stale totals the backfill will correct.';
PRINT '    After  script 5: this MUST return zero rows.';

SELECT h.BomHeaderId, h.JobId, h.BomStatus,
       h.TotalBomValue AS StoredTotal,
       ISNULL(SUM(d.BomRequestedQty * d.BomPrice * ISNULL(d.ExchangeRate, 1)), 0) AS RecomputedTotal
FROM   proj.TBL_BOM_HEADER h
LEFT JOIN proj.TBL_BOM_DETAILS d
       ON d.BomHeaderId = h.BomHeaderId AND d.IsActive = 1
GROUP BY h.BomHeaderId, h.JobId, h.BomStatus, h.TotalBomValue
HAVING h.TotalBomValue <> ISNULL(SUM(d.BomRequestedQty * d.BomPrice * ISNULL(d.ExchangeRate, 1)), 0)
ORDER BY h.BomHeaderId;

PRINT '';
PRINT '=== D. REVIEW BEFORE SCRIPT 2 - who can currently self-approve ===';
PRINT '    Script 2 stops a role inheriting self-approval from a neighbour at the same level.';
PRINT '    Any row below with AllowSelfApproval = 0 sharing a LevelNo with a row set to 1';
PRINT '    can self-approve today and will NOT be able to afterwards. That is the fix -';
PRINT '    but confirm it is what you want before applying.';

SELECT p.PolicyId, p.PolicyName, l.LevelNo, l.ApproverType, l.ApproverId,
       l.AllowSelfApproval,
       MAX(CAST(l.AllowSelfApproval AS INT)) OVER (PARTITION BY l.PolicyId, l.LevelNo)
           AS LevelWideToday
FROM proj.TBL_APPROVAL_POLICY p
JOIN proj.TBL_APPROVAL_LEVEL  l ON l.PolicyId = p.PolicyId
WHERE l.IsActive = 1
ORDER BY p.PolicyId, l.LevelNo, l.ApproverType, l.ApproverId;

PRINT '';
PRINT '=== E. CAPTURE ROLLBACK DEFINITIONS BEFORE APPLYING ===';
PRINT '    Save the output of these four to a file per database. This is the only';
PRINT '    rollback that works for scripts 1-4.';
PRINT '';
PRINT '    SELECT OBJECT_DEFINITION(OBJECT_ID(''proj.sp_SetPO''));';
PRINT '    SELECT OBJECT_DEFINITION(OBJECT_ID(''proj.sp_SubmitForApproval''));';
PRINT '    SELECT OBJECT_DEFINITION(OBJECT_ID(''proj.sp_ImportJobBudgetItem''));';
PRINT '    SELECT OBJECT_DEFINITION(OBJECT_ID(''proj.sp_SearchBoms''));';
