/* =====================================================================
   Update: SYNERP.proj.TBL_APPROVAL_LEVEL - PolicyId=2 ("PO Below 10,000,000,000")

   CORRECTED UNDERSTANDING (see conversation): the 39 total rows for this
   policy are NOT an app bug - sp_SaveApprovalPolicy correctly soft-deletes
   (IsActive=0) old rows on every save; 34 of the 39 are already inactive
   audit history. Only 5 rows are currently live (IsActive=1):
     LevelId 1133  LevelNo 1  Manager L1  ApproverId 11
     LevelId 1134  LevelNo 1  Manager L1  ApproverId 12
     LevelId 1135  LevelNo 1  Manager L1  ApproverId 1011
     LevelId 1136  LevelNo 2  HOD         ApproverId 1010
     LevelId 1137  LevelNo 3  ADMIN       ApproverId 1
   (matches the screenshot: 3x "L1 Manager L1" + L2 HOD + L3 ADMIN)

   Per instruction: keep only 1 approver total - LevelId 1133 (the first
   L1 approver). Retire the other 4 active rows the same way the app
   itself retires rows (IsActive=0), not a hard delete, for consistency
   with sp_SaveApprovalPolicy's own convention and to preserve audit trail.
   ===================================================================== */

USE SYNERP;
GO

-- Preview what will be retired (4 rows expected: 1134, 1135, 1136, 1137)
SELECT LevelId, LevelNo, LevelName, ApproverId
FROM proj.TBL_APPROVAL_LEVEL
WHERE PolicyId = 2 AND IsActive = 1 AND LevelId <> 1133
ORDER BY LevelId;
GO

UPDATE proj.TBL_APPROVAL_LEVEL
SET IsActive = 0, ModifiedBy = 'DataCleanup', ModifiedDate = SYSUTCDATETIME()
WHERE PolicyId = 2 AND IsActive = 1 AND LevelId <> 1133;

-- Keep TBL_APPROVAL_POLICY.TotalLevels consistent with the SP's own logic
UPDATE proj.TBL_APPROVAL_POLICY
SET TotalLevels = (
    SELECT COUNT(DISTINCT LevelNo) FROM proj.TBL_APPROVAL_LEVEL
    WHERE PolicyId = 2 AND IsActive = 1
)
WHERE PolicyId = 2;
GO

-- Verify - should show exactly 1 active row: LevelId 1133, "Manager L1"
SELECT LevelId, LevelNo, LevelName, ApproverType, ApproverId, IsMandatory, IsActive
FROM proj.TBL_APPROVAL_LEVEL
WHERE PolicyId = 2 AND IsActive = 1;
GO
