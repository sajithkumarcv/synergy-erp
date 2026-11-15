/* =====================================================================
   Migration: SYN_PMS_IND -> SYNERP (proj schema)
   Scope: backfill missing rows only (both tables already have partial
   data in target, so this uses WHERE NOT EXISTS, not a fresh insert).

   TBL_JOB_BAY and TBL_JOB_QUALITY were checked and need NO action -
   every source row already exists identically in target; the extra
   row in each ("Default") is target-only, not something source has
   that target is missing.

   Verified before generating:
     - Column structures match exactly, no diffs
     - Identity columns (LevelId, RoleMenuActionId) confirmed matching
       on both sides
     - No computed columns
     - TBL_APPROVAL_LEVEL.PolicyId -> TBL_APPROVAL_POLICY already fully
       matches (18=18), no orphan risk
     - TBL_APPROVAL_LEVEL.EscalateToLevelId self-reference: clean
       (resolves either to an existing target row or another row in
       this same missing-45 batch - safe within one INSERT statement)
     - TBL_ROLE_MENU_ACTION.RoleId/ActionId orphan check against
       TBL_ROLES/TBL_MENU_ACTIONS (both already fully matching): clean
   ===================================================================== */

USE SYNERP;
GO

BEGIN TRANSACTION;

-- 1. TBL_APPROVAL_LEVEL - backfill 45 missing rows (LevelId 1069-1113)
SET IDENTITY_INSERT proj.TBL_APPROVAL_LEVEL ON;
INSERT INTO proj.TBL_APPROVAL_LEVEL
  (LevelId, PolicyId, LevelNo, LevelName, ApproverType, ApproverId, IsMandatory, AllowSelfApproval,
   TimeoutHours, OnTimeoutAction, EscalateToLevelId, IsActive, CreatedBy, CreatedDate, ModifiedBy,
   ModifiedDate, PendingStatus)
SELECT
  l.LevelId, l.PolicyId, l.LevelNo, l.LevelName, l.ApproverType, l.ApproverId, l.IsMandatory, l.AllowSelfApproval,
  l.TimeoutHours, l.OnTimeoutAction, l.EscalateToLevelId, l.IsActive, l.CreatedBy, l.CreatedDate, l.ModifiedBy,
  l.ModifiedDate, l.PendingStatus
FROM SYN_PMS_IND.proj.TBL_APPROVAL_LEVEL l
WHERE NOT EXISTS (SELECT 1 FROM proj.TBL_APPROVAL_LEVEL x WHERE x.LevelId = l.LevelId);
SET IDENTITY_INSERT proj.TBL_APPROVAL_LEVEL OFF;

-- 2. TBL_ROLE_MENU_ACTION - backfill 177 missing rows
--    (Procurement Manager, SR.ENGINEER, PROCUREMENT OFFICER, Store,
--    ENGINEER, PROJ.MANAGER, SR.PROJ.MANAGER role permissions)
SET IDENTITY_INSERT proj.TBL_ROLE_MENU_ACTION ON;
INSERT INTO proj.TBL_ROLE_MENU_ACTION
  (RoleMenuActionId, RoleId, MenuId, ActionId, IsAllowed)
SELECT
  r.RoleMenuActionId, r.RoleId, r.MenuId, r.ActionId, r.IsAllowed
FROM SYN_PMS_IND.proj.TBL_ROLE_MENU_ACTION r
WHERE NOT EXISTS (SELECT 1 FROM proj.TBL_ROLE_MENU_ACTION x WHERE x.RoleMenuActionId = r.RoleMenuActionId);
SET IDENTITY_INSERT proj.TBL_ROLE_MENU_ACTION OFF;

COMMIT TRANSACTION;
GO

-- Verify: should return 0 rows for both if backfill is complete
SELECT 'TBL_APPROVAL_LEVEL still missing' t, COUNT(*) c
FROM SYN_PMS_IND.proj.TBL_APPROVAL_LEVEL l
WHERE NOT EXISTS (SELECT 1 FROM proj.TBL_APPROVAL_LEVEL x WHERE x.LevelId = l.LevelId)
UNION ALL
SELECT 'TBL_ROLE_MENU_ACTION still missing', COUNT(*)
FROM SYN_PMS_IND.proj.TBL_ROLE_MENU_ACTION r
WHERE NOT EXISTS (SELECT 1 FROM proj.TBL_ROLE_MENU_ACTION x WHERE x.RoleMenuActionId = r.RoleMenuActionId);
GO
