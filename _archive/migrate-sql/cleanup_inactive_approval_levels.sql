/* =====================================================================
   Cleanup: SYNERP.proj.TBL_APPROVAL_LEVEL - delete ALL inactive rows
   (soft-deleted history left behind by repeated sp_SaveApprovalPolicy
   saves - see conversation for full context).

   TBL_APPROVAL_LOG.LevelId has an enforced FK to this table, and 17 of
   the 90 inactive rows are referenced by real approval-log audit entries.
   LevelId is nullable there and the row keeps LevelNo/Action/ActionBy/
   ActionByName/ActionDate/Remarks regardless, so per instruction this
   nulls out just the LevelId link on those 17 log rows (log entry itself
   stays fully readable) to unblock deleting every inactive level row.

   TBL_APPROVAL_DELEGATE (also FK's to this table) is empty - no risk.
   No inactive row is referenced by another row's EscalateToLevelId.
   ===================================================================== */

USE SYNERP;
GO

BEGIN TRANSACTION;

-- 1. Sever the FK link on log rows that reference an inactive level
--    (log entry itself is preserved - only LevelId is nulled)
UPDATE proj.TBL_APPROVAL_LOG
SET LevelId = NULL
WHERE LevelId IN (SELECT LevelId FROM proj.TBL_APPROVAL_LEVEL WHERE IsActive = 0);

-- 2. Delete every inactive TBL_APPROVAL_LEVEL row (all 90)
DELETE FROM proj.TBL_APPROVAL_LEVEL
WHERE IsActive = 0;

COMMIT TRANSACTION;
GO

-- Verify - should show 0 inactive rows remaining, only the active ones left
SELECT
  SUM(CASE WHEN IsActive=1 THEN 1 ELSE 0 END) AS active_rows,
  SUM(CASE WHEN IsActive=0 THEN 1 ELSE 0 END) AS inactive_rows_remaining,
  COUNT(*) AS total_rows
FROM proj.TBL_APPROVAL_LEVEL;
GO
