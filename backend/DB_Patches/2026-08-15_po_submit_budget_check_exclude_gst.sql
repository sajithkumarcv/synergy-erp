-- 2026-08-15: Fix GST/tax being incorrectly included in the SUBMIT-time
-- "Budget Exceeded — Authorise Override" guard inside proj.sp_SubmitForApproval.
--
-- Bug: @PoTotalBase (this PO's own value) was computed from
--      TotalAmount * ExchangeRate — TotalAmount is TAX-INCLUSIVE.
--      Meanwhile @SubCommitted (other POs already committed against the
--      same job+expense-category) correctly used the tax-EXCLUSIVE
--      pol.OrderedQty * pol.UnitPrice line sum. Comparing a tax-inclusive
--      "this PO" figure against a tax-exclusive "committed" + "budgeted"
--      figure caused GST to count against budget, falsely blocking POs
--      that were actually within budget (or over-inflating the "Over by"
--      amount on POs that were genuinely over).
--
-- Fix: compute @PoTotalBase the same way as @SubCommitted — pre-tax line
--      sum (OrderedQty * UnitPrice) converted to base currency, no tax.
--
-- Verified against real data (PO-26-0007, Job IH26-500026, ExpenseCategoryId 23):
--   Budgeted 4,000.00 | Committed (other POs) 2,500.00
--   Old (buggy):  This PO 2,587.50 (TotalAmount, incl. GST) -> Over by 1,087.50
--   New (fixed):  This PO 2,250.00 (pre-tax line sum)       -> Over by   750.00
--   (PO-26-0007 is still genuinely over budget after the fix — the fix only
--    removes the GST component from the comparison, it does not change
--    whether the PO is over.)
--
-- This is DISTINCT from the PRINT-time budget check (sp_GetPOBudgetCheck,
-- used by PoDetailPage.js to gate the print watermark) which was already
-- verified correct/tax-exclusive earlier and required no change.
--
-- Run against SYNERP (dev). Backend requires NO rebuild — this proc is
-- called directly by ApprovalController.Submit via Dapper.

CREATE OR ALTER PROCEDURE PROJ.sp_SubmitForApproval
    @ModuleCode      NVARCHAR(20),
    @DocumentId      INT,
    @DocumentNo      NVARCHAR(50),
    @DocumentAmount  DECIMAL(18,4) = NULL,
    @CurrencyId      INT           = NULL,
    @SubmittedBy     NVARCHAR(50),
    @OverrideBudget  BIT           = 0,
    @OverrideReason  NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        BEGIN TRANSACTION;
        DECLARE @ModuleId INT, @IsAmountBased BIT, @DocumentTable NVARCHAR(100),
                @DocumentIdCol NVARCHAR(50), @StatusColumn NVARCHAR(50),
                @ModifiedByCol NVARCHAR(50), @ModifiedDateCol NVARCHAR(50),
                @ApprovedStatus NVARCHAR(30), @PostApprovalSP NVARCHAR(200);
        DECLARE @OvTag NVARCHAR(560) =
            CASE WHEN @OverrideBudget = 1
                 THEN ' [BUDGET OVERRIDE' + ISNULL(': ' + NULLIF(LTRIM(RTRIM(@OverrideReason)), ''), '') + ']'
                 ELSE '' END;
        SELECT @ModuleId = ModuleId, @IsAmountBased = IsAmountBased,
               @DocumentTable = DocumentTable, @DocumentIdCol = DocumentIdColumn,
               @StatusColumn    = ISNULL(StatusColumn,        'Status'),
               @ModifiedByCol   = ISNULL(ModifiedByColumn,    'ModifiedBy'),
               @ModifiedDateCol = ISNULL(ModifiedDateColumn,  'ModifiedDate'),
               @ApprovedStatus  = ISNULL(ApprovedStatus,      'Approved'),
               @PostApprovalSP  = PostApprovalSP
        FROM PROJ.TBL_APPROVAL_MODULE WHERE ModuleCode = @ModuleCode AND IsActive = 1;
        IF @ModuleId IS NULL
        BEGIN
            SELECT -1 AS TransactionId, NULL AS PolicyId, 0 AS TotalLevels, NULL AS NewStatus, 'Approval module not configured.' AS Message;
            ROLLBACK; RETURN;
        END
        IF EXISTS (SELECT 1 FROM PROJ.TBL_APPROVAL_TRANSACTION
            WHERE ModuleId = @ModuleId AND DocumentId = @DocumentId
              AND CurrentStatus NOT IN ('Approved','Rejected','Cancelled','SentBack'))
        BEGIN
            SELECT -1 AS TransactionId, NULL AS PolicyId, 0 AS TotalLevels, NULL AS NewStatus,
                   'An active approval transaction already exists for this document.' AS Message;
            ROLLBACK; RETURN;
        END
        -- PO Budget guard — BASE currency (mirrors sp_GetPOBudgetCheck)
        IF @ModuleCode = 'PO'
        BEGIN
            DECLARE @PoJobId NVARCHAR(50), @PoCategoryId INT, @PoExchangeRate DECIMAL(18,6), @PoTotalBase DECIMAL(18,2);
            SELECT @PoJobId = JobId, @PoCategoryId = ExpenseCategoryId, @PoExchangeRate = ISNULL(ExchangeRate, 1)
            FROM PROJ.TBL_PURCHASE_ORDER WHERE PoId = @DocumentId AND IsActive = 1;
            -- Pre-tax base value of THIS PO's own lines (excludes GST/tax) — mirrors sp_GetPOBudgetCheck / @SubCommitted below.
            -- (Previously used TotalAmount, which is tax-inclusive, causing GST to be wrongly counted against budget.)
            SELECT @PoTotalBase = ISNULL(SUM(PROJ.fn_ToBase(pol.OrderedQty * pol.UnitPrice, @PoExchangeRate)), 0)
            FROM PROJ.TBL_PURCHASE_ORDER_LINE pol WHERE pol.PoId = @DocumentId AND pol.IsActive = 1;
            IF @PoJobId IS NOT NULL AND @PoCategoryId IS NOT NULL
            BEGIN
                DECLARE @JobRate DECIMAL(18,6) = ISNULL((SELECT JobExcRate FROM PROJ.TBL_JOB WHERE JobId = @PoJobId), 1);
                DECLARE @SubBudgeted DECIMAL(18,2) = 0, @SubBudgetExists BIT = 0;
                SELECT @SubBudgetExists = 1,
                       @SubBudgeted = ISNULL(AmountInBaseCurrency, PROJ.fn_ToBase(ISNULL(BudgetedAmount, 0), ISNULL(ExchangeRate, @JobRate)))
                FROM PROJ.TBL_JOB_BUDGET WHERE JobId = @PoJobId AND CostCategoryId = @PoCategoryId AND IsCurrent = 1;
                IF @SubBudgetExists = 0
                BEGIN
                    SELECT -1 AS TransactionId, NULL AS PolicyId, 0 AS TotalLevels, NULL AS NewStatus,
                           'Cannot submit: no approved budget line exists for the selected expense category on this job. Create a budget line first.' AS Message;
                    ROLLBACK; RETURN;
                END
                DECLARE @SubCommitted DECIMAL(18,2) = 0;
                SELECT @SubCommitted = ISNULL(SUM(PROJ.fn_ToBase(pol.OrderedQty * pol.UnitPrice, po.ExchangeRate)), 0)
                FROM PROJ.TBL_PURCHASE_ORDER po
                JOIN PROJ.TBL_PURCHASE_ORDER_LINE pol ON pol.PoId = po.PoId AND pol.IsActive = 1
                WHERE po.JobId = @PoJobId AND po.ExpenseCategoryId = @PoCategoryId
                  AND po.Status != 'Cancelled' AND po.IsActive = 1 AND po.PoId != @DocumentId;
                IF (@SubCommitted + @PoTotalBase) > @SubBudgeted AND @OverrideBudget = 0
                BEGIN
                    DECLARE @SubBudMsg NVARCHAR(600) = 'Cannot submit: PO would exceed the budget for this expense category (base currency). '
                        + 'Budgeted: ' + FORMAT(@SubBudgeted,'N2') + ' | Already committed: ' + FORMAT(@SubCommitted,'N2')
                        + ' | This PO: ' + FORMAT(@PoTotalBase,'N2') + ' | Over by: ' + FORMAT(@SubCommitted+@PoTotalBase-@SubBudgeted,'N2');
                    SELECT -1 AS TransactionId, NULL AS PolicyId, 0 AS TotalLevels, NULL AS NewStatus, @SubBudMsg AS Message;
                    ROLLBACK; RETURN;
                END
            END
        END
        IF @DocumentAmount IS NULL AND @IsAmountBased = 1
        BEGIN
            DECLARE @AmountSql NVARCHAR(500) = N'SELECT @Amt = TotalAmount FROM PROJ.' + QUOTENAME(@DocumentTable) + N' WHERE ' + QUOTENAME(@DocumentIdCol) + N' = @DocId';
            EXEC sp_executesql @AmountSql, N'@Amt DECIMAL(18,4) OUTPUT, @DocId INT', @DocumentAmount OUTPUT, @DocumentId;
        END
        DECLARE @PolicyId INT, @TotalLevels INT, @EffectiveAmt DECIMAL(18,4) = ISNULL(@DocumentAmount, 0);
        IF @IsAmountBased = 1
            SELECT TOP 1 @PolicyId = PolicyId,
                   @TotalLevels = (SELECT COUNT(DISTINCT al.LevelNo) FROM PROJ.TBL_APPROVAL_LEVEL al WHERE al.PolicyId = PROJ.TBL_APPROVAL_POLICY.PolicyId AND al.IsActive = 1)
            FROM PROJ.TBL_APPROVAL_POLICY WHERE ModuleId = @ModuleId AND IsActive = 1
              AND (AmountFrom IS NULL OR @EffectiveAmt >= AmountFrom) AND (AmountTo IS NULL OR @EffectiveAmt <= AmountTo)
            ORDER BY SortOrder, AmountFrom;
        ELSE
            SELECT TOP 1 @PolicyId = PolicyId,
                   @TotalLevels = (SELECT COUNT(DISTINCT al.LevelNo) FROM PROJ.TBL_APPROVAL_LEVEL al WHERE al.PolicyId = PROJ.TBL_APPROVAL_POLICY.PolicyId AND al.IsActive = 1)
            FROM PROJ.TBL_APPROVAL_POLICY WHERE ModuleId = @ModuleId AND IsActive = 1 ORDER BY SortOrder;
        IF @PolicyId IS NULL
        BEGIN
            SELECT -1 AS TransactionId, NULL AS PolicyId, 0 AS TotalLevels, NULL AS NewStatus,
                   CASE WHEN @IsAmountBased = 1 THEN 'No approval policy covers amount ' + CAST(ISNULL(@EffectiveAmt,0) AS NVARCHAR) + '. Please configure a matching policy.'
                        ELSE 'No active approval policy found for this module.' END AS Message;
            ROLLBACK; RETURN;
        END
        IF NOT EXISTS (SELECT 1 FROM PROJ.TBL_APPROVAL_LEVEL WHERE PolicyId = @PolicyId AND IsActive = 1)
        BEGIN
            SELECT -1 AS TransactionId, NULL AS PolicyId, 0 AS TotalLevels, NULL AS NewStatus, 'Approval policy has no active levels configured.' AS Message;
            ROLLBACK; RETURN;
        END
        DECLARE @SubmittedByUserId INT;
        SELECT @SubmittedByUserId = UserId FROM PROJ.TBL_USERS WHERE UserName = @SubmittedBy;
        DECLARE @Level1Id INT, @Level1PendingStatus NVARCHAR(50);
        SELECT TOP 1 @Level1Id = LevelId, @Level1PendingStatus = ISNULL(PendingStatus, 'PendingApproval')
        FROM PROJ.TBL_APPROVAL_LEVEL WHERE PolicyId = @PolicyId AND LevelNo = 1 AND IsActive = 1 ORDER BY LevelId;
        DECLARE @TransactionId INT, @Now DATETIME = GETDATE();
        SELECT @TransactionId = TransactionId FROM PROJ.TBL_APPROVAL_TRANSACTION WHERE ModuleId = @ModuleId AND DocumentId = @DocumentId;
        IF @TransactionId IS NOT NULL
            UPDATE PROJ.TBL_APPROVAL_TRANSACTION
            SET PolicyId = @PolicyId, DocumentAmount = @EffectiveAmt, CurrencyId = @CurrencyId,
                CurrentStatus = 'Pending', CurrentLevelNo = 1, TotalLevels = @TotalLevels,
                SubmittedBy = @SubmittedBy, SubmittedDate = @Now,
                CompletedDate = NULL, FinalAction = NULL, FinalActionBy = NULL, FinalRemarks = NULL,
                ModifiedBy = @SubmittedBy, ModifiedDate = @Now
            WHERE TransactionId = @TransactionId;
        ELSE
        BEGIN
            INSERT INTO PROJ.TBL_APPROVAL_TRANSACTION
                (ModuleId, DocumentNo, DocumentId, DocumentAmount, CurrencyId, PolicyId, CurrentStatus, CurrentLevelNo, TotalLevels, SubmittedBy, SubmittedDate, CreatedBy, CreatedDate)
            VALUES (@ModuleId, @DocumentNo, @DocumentId, @EffectiveAmt, @CurrencyId, @PolicyId, 'Pending', 1, @TotalLevels, @SubmittedBy, @Now, @SubmittedBy, @Now);
            SET @TransactionId = SCOPE_IDENTITY();
        END
        INSERT INTO PROJ.TBL_APPROVAL_LOG (TransactionId, LevelId, LevelNo, Action, ActionBy, ActionByName, ActionDate, Remarks, IsDelegated, IsTimedOut)
        VALUES (@TransactionId, ISNULL(@Level1Id, 0), 0, 'Submitted', ISNULL(@SubmittedByUserId, 0), @SubmittedBy, @Now, NULL, 0, 0);
        DECLARE @SubmitterMaxLevel INT = NULL;
        SELECT @SubmitterMaxLevel = MAX(al.LevelNo) FROM PROJ.TBL_APPROVAL_LEVEL al
        WHERE al.PolicyId = @PolicyId AND al.IsActive = 1
           AND (al.ApproverType = 'ANY'
             OR (al.ApproverType = 'Role' AND EXISTS (SELECT 1 FROM PROJ.TBL_USER_ROLES ur WHERE ur.UserId = @SubmittedByUserId AND ur.RoleId = al.ApproverId))
             OR (al.ApproverType = 'User' AND al.ApproverId = @SubmittedByUserId));
        DECLARE @CurrentLevelNo INT = 1, @IsComplete BIT = 0, @FinalStatus NVARCHAR(50) = @Level1PendingStatus;
        WHILE @CurrentLevelNo <= @TotalLevels AND @IsComplete = 0
        BEGIN
            DECLARE @LvlId INT, @LvlAllowSelf BIT, @LvlPendingStatus NVARCHAR(50);
            SELECT @LvlAllowSelf = CASE WHEN MAX(CAST(AllowSelfApproval AS INT)) = 1 THEN 1 ELSE 0 END,
                   @LvlPendingStatus = ISNULL(MAX(PendingStatus), 'PendingApproval')
            FROM PROJ.TBL_APPROVAL_LEVEL WHERE PolicyId = @PolicyId AND LevelNo = @CurrentLevelNo AND IsActive = 1;
            DECLARE @SubmitterIsApprover BIT = CASE WHEN EXISTS (
                    SELECT 1 FROM PROJ.TBL_APPROVAL_LEVEL al WHERE al.PolicyId = @PolicyId AND al.LevelNo = @CurrentLevelNo AND al.IsActive = 1
                      AND (al.ApproverType = 'ANY'
                         OR (al.ApproverType = 'Role' AND EXISTS (SELECT 1 FROM PROJ.TBL_USER_ROLES ur WHERE ur.UserId = @SubmittedByUserId AND ur.RoleId = al.ApproverId))
                         OR (al.ApproverType = 'User' AND al.ApproverId = @SubmittedByUserId))) THEN 1 ELSE 0 END;
            SELECT TOP 1 @LvlId = LevelId FROM PROJ.TBL_APPROVAL_LEVEL WHERE PolicyId = @PolicyId AND LevelNo = @CurrentLevelNo AND IsActive = 1 ORDER BY LevelId;
            IF @SubmitterIsApprover = 1 AND @LvlAllowSelf = 1
                INSERT INTO PROJ.TBL_APPROVAL_LOG (TransactionId, LevelId, LevelNo, Action, ActionBy, ActionByName, ActionDate, Remarks, IsDelegated, IsTimedOut)
                VALUES (@TransactionId, @LvlId, @CurrentLevelNo, 'Approved', ISNULL(@SubmittedByUserId, 0), @SubmittedBy, @Now, 'Auto-approved (submitter is approver)' + @OvTag, 0, 0);
            ELSE IF @SubmitterMaxLevel IS NOT NULL AND @CurrentLevelNo < @SubmitterMaxLevel
                INSERT INTO PROJ.TBL_APPROVAL_LOG (TransactionId, LevelId, LevelNo, Action, ActionBy, ActionByName, ActionDate, Remarks, IsDelegated, IsTimedOut)
                VALUES (@TransactionId, @LvlId, @CurrentLevelNo, 'Approved', ISNULL(@SubmittedByUserId, 0), @SubmittedBy, @Now, 'Auto-approved by senior approver (submitter)' + @OvTag, 0, 0);
            ELSE
            BEGIN SET @FinalStatus = @LvlPendingStatus; BREAK; END
            IF @CurrentLevelNo >= @TotalLevels
            BEGIN
                SET @IsComplete = 1; SET @FinalStatus = @ApprovedStatus;
                UPDATE PROJ.TBL_APPROVAL_TRANSACTION
                SET CurrentStatus = 'Approved', CurrentLevelNo = @CurrentLevelNo, FinalAction = 'Approved', FinalActionBy = @SubmittedBy,
                    FinalRemarks = 'Auto-approved (submitter cleared all levels)' + @OvTag, CompletedDate = @Now, ModifiedBy = @SubmittedBy, ModifiedDate = @Now
                WHERE TransactionId = @TransactionId;
            END
            ELSE
            BEGIN
                SET @CurrentLevelNo = @CurrentLevelNo + 1;
                SELECT TOP 1 @FinalStatus = ISNULL(PendingStatus, 'PendingApproval') FROM PROJ.TBL_APPROVAL_LEVEL WHERE PolicyId = @PolicyId AND LevelNo = @CurrentLevelNo AND IsActive = 1 ORDER BY LevelId;
                IF @FinalStatus IS NULL SET @FinalStatus = 'PendingApproval';
                UPDATE PROJ.TBL_APPROVAL_TRANSACTION SET CurrentLevelNo = @CurrentLevelNo, ModifiedBy = @SubmittedBy, ModifiedDate = @Now WHERE TransactionId = @TransactionId;
            END
        END
        DECLARE @Sql NVARCHAR(1000) = N'UPDATE PROJ.' + QUOTENAME(@DocumentTable) + N' SET ' + QUOTENAME(@StatusColumn) + N' = @NewSt' + N', ' + QUOTENAME(@ModifiedByCol) + N' = @Who' + N', ' + QUOTENAME(@ModifiedDateCol) + N' = @When' + N' WHERE ' + QUOTENAME(@DocumentIdCol) + N' = @DocId';
        EXEC sp_executesql @Sql, N'@NewSt NVARCHAR(50), @Who NVARCHAR(100), @When DATETIME, @DocId INT', @FinalStatus, @SubmittedBy, @Now, @DocumentId;
        IF @IsComplete = 1 AND @PostApprovalSP IS NOT NULL
        BEGIN
            DECLARE @HookSql NVARCHAR(500);
            IF @OverrideBudget = 1 AND @ModuleCode = 'MH' SET @HookSql = N'EXEC ' + @PostApprovalSP + N' @DocId, @By, @OverrideBudget = 1';
            ELSE SET @HookSql = N'EXEC ' + @PostApprovalSP + N' @DocId, @By';
            EXEC sp_executesql @HookSql, N'@DocId INT, @By NVARCHAR(100)', @DocumentId, @SubmittedBy;
        END
        COMMIT TRANSACTION;
        SELECT @TransactionId AS TransactionId, @PolicyId AS PolicyId, @TotalLevels AS TotalLevels, @FinalStatus AS NewStatus,
               CASE WHEN @IsComplete = 1 THEN 'Auto-approved — submitter cleared all levels.' ELSE 'Submitted successfully.' END AS Message;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        SELECT -1 AS TransactionId, NULL AS PolicyId, 0 AS TotalLevels, NULL AS NewStatus, ERROR_MESSAGE() AS Message;
    END CATCH
END;
GO
