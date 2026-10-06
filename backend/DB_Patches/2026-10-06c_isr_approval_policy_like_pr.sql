-- 2026-10-06c: Issue Request approval policy - one level, same approvers as PR
--
-- Apply to: SYNERP
-- Requires: 2026-09-07b (ISR approval module row)
--
-- Copies the active PR policy and its level rows (same roles, same self-approval
-- setting) onto the ISR module. Skipped if ISR already has a policy.

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
GO

BEGIN TRAN;

DECLARE @IsrModule INT = (SELECT ModuleId FROM proj.TBL_APPROVAL_MODULE WHERE ModuleCode = 'ISR');
DECLARE @PrModule  INT = (SELECT ModuleId FROM proj.TBL_APPROVAL_MODULE WHERE ModuleCode = 'PR');
DECLARE @PrPolicy  INT = (SELECT TOP 1 PolicyId FROM proj.TBL_APPROVAL_POLICY WHERE ModuleId = @PrModule AND IsActive = 1 ORDER BY SortOrder, PolicyId);

IF @IsrModule IS NULL OR @PrPolicy IS NULL
BEGIN
    PRINT 'ISR module or active PR policy not found - nothing done';
    ROLLBACK; RETURN;
END

IF EXISTS (SELECT 1 FROM proj.TBL_APPROVAL_POLICY WHERE ModuleId = @IsrModule)
BEGIN
    PRINT 'ISR already has a policy - skipped';
    ROLLBACK; RETURN;
END

INSERT INTO proj.TBL_APPROVAL_POLICY
    (ModuleId, PolicyName, Description, AmountFrom, AmountTo, TotalLevels, IsSequential, IsActive, SortOrder, CreatedBy)
SELECT @IsrModule, 'Standard Issue Request Approval', 'One level, same approvers as PR',
       AmountFrom, AmountTo, TotalLevels, IsSequential, 1, SortOrder, 'system'
FROM proj.TBL_APPROVAL_POLICY WHERE PolicyId = @PrPolicy;

DECLARE @NewPolicy INT = SCOPE_IDENTITY();

INSERT INTO proj.TBL_APPROVAL_LEVEL
    (PolicyId, LevelNo, LevelName, ApproverType, ApproverId, IsMandatory, AllowSelfApproval,
     TimeoutHours, OnTimeoutAction, EscalateToLevelId, IsActive, CreatedBy, PendingStatus)
SELECT @NewPolicy, LevelNo, LevelName, ApproverType, ApproverId, IsMandatory, AllowSelfApproval,
       TimeoutHours, OnTimeoutAction, NULL, 1, 'system', PendingStatus
FROM proj.TBL_APPROVAL_LEVEL WHERE PolicyId = @PrPolicy AND IsActive = 1;

PRINT CONCAT('Created ISR policy ', @NewPolicy, ' with ', @@ROWCOUNT, ' approver rows (copied from PR policy ', @PrPolicy, ')');
COMMIT;
GO

SELECT p.PolicyId, p.PolicyName, p.TotalLevels, p.IsActive, l.LevelNo, l.ApproverType, l.ApproverId, l.AllowSelfApproval
FROM proj.TBL_APPROVAL_POLICY p JOIN proj.TBL_APPROVAL_MODULE m ON m.ModuleId = p.ModuleId
LEFT JOIN proj.TBL_APPROVAL_LEVEL l ON l.PolicyId = p.PolicyId
WHERE m.ModuleCode = 'ISR' ORDER BY l.LevelNo, l.ApproverId;
GO
