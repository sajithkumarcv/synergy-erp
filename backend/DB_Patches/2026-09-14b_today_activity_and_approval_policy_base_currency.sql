-- =====================================================================
-- 2026-09-14b  Two currency bugs found while auditing the "AED on India"
-- fix earlier today (2026-09-14_price_variance_type_category_filter.sql
-- was unrelated; these two are separate, found during the same sweep).
--
-- APPLY TO: SYNERP (dev) first. Production after sign-off.
--
-- BUG 1 — sp_GetTodayActivity.poValue mixes currencies.
-- It summed TBL_PURCHASE_ORDER.TotalAmount with no ExchangeRate, so a
-- user who created one INR PO and one AED PO today gets a total that
-- adds units of two different currencies together. Confirmed on real
-- dev data: InvoiceId 1 is 4,680 AED at rate 23.42 (base ~109,586 INR);
-- the same shape of PO would have silently added its raw 4,680 to any
-- INR POs created the same day. Fixed to SUM(TotalAmount * ExchangeRate),
-- matching the base-currency convention the dashboard tile now labels it
-- with (see [[synergy-variance-filter-fix-0914]] — Dashboard.js today's-
-- activity tile now shows "<baseCurrencyCode> <value>").
--
-- BUG 2 — sp_SubmitForApproval matches amount-based policy thresholds
-- against the DOCUMENT's own currency amount, not base currency.
-- Only 3 modules are IsAmountBased: INV, JOB, PO. Policy names spell out
-- the intent ("PO Above 0-Base", i.e. base currency) and thresholds are
-- round base-currency numbers (Invoice Below/Above 25,000). JOB has no
-- ExchangeRate/CurrencyId on its document table at all (single-currency
-- by design) so it is unaffected either way. INV and PO both carry their
-- own locked-in ExchangeRate on the document row.
--
-- Confirmed on real dev data: InvoiceId 1 is 4,680 AED @ 23.42 = 109,586
-- base. Unconverted, 4,680 falls under "Invoice Below 25,000" (Policy 5);
-- converted, 109,586 falls under "Invoice Above 25,000" (Policy 6) — a
-- foreign-currency invoice was one step away from silently skipping the
-- higher-value approval tier. (It was never actually submitted, so no
-- transaction was mis-routed — the query below is a dry-run replay of
-- the SAME selection logic the proc uses, not a live document.)
--
-- FIX: compute a base-currency amount using the document table's own
-- ExchangeRate column (via dynamic SQL — the table is already resolved
-- generically from TBL_APPROVAL_MODULE, same pattern the proc already
-- uses for the status/amount lookups) and match the POLICY against that.
-- The amount actually STORED on the transaction (and shown on every
-- approval screen: My Approvals, Approvals Admin, Dashboard, the
-- notification bell) is left UNCHANGED — still the document's own
-- currency, exactly as those screens already assume (they show it with
-- no currency label). Only the policy lookup changes.
--
-- PO's separate BASE-currency budget guard (earlier in the same proc,
-- @PoTotalBase / @SubBudgeted) is untouched — it already worked correctly.
--
-- Full-body CREATE OR ALTER of two procedures. No table changes.
-- =====================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- ── BUG 1 ────────────────────────────────────────────────────────────
CREATE OR ALTER PROCEDURE proj.sp_GetTodayActivity
    @UserId INT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @UserName NVARCHAR(100) = (SELECT UserName FROM proj.TBL_USERS WHERE UserId = @UserId);
    DECLARE @Today DATE = CAST(GETDATE() AS DATE);

    SELECT
        -- Purchase Orders created today by this user
        (SELECT COUNT(*) FROM proj.TBL_PURCHASE_ORDER
         WHERE IsActive=1 AND CreatedBy=@UserName AND CAST(CreatedDate AS DATE)=@Today) AS poCount,
        -- Base currency (TotalAmount * ExchangeRate) — was raw TotalAmount, which mixes
        -- currencies when the user created POs in more than one currency today.
        (SELECT ISNULL(SUM(proj.fn_ToBase(TotalAmount, ExchangeRate)),0) FROM proj.TBL_PURCHASE_ORDER
         WHERE IsActive=1 AND CreatedBy=@UserName AND CAST(CreatedDate AS DATE)=@Today) AS poValue,
        -- GRNs created today
        (SELECT COUNT(*) FROM proj.TBL_GRN_HEADER
         WHERE IsActive=1 AND CreatedBy=@UserName AND CAST(CreatedDate AS DATE)=@Today) AS grnCount,
        -- Issue Notes created today
        (SELECT COUNT(*) FROM proj.TBL_STOCK_ISSUE
         WHERE IsActive=1 AND CreatedBy=@UserName AND CAST(CreatedDate AS DATE)=@Today) AS issueCount,
        -- Purchase Requests created today
        (SELECT COUNT(*) FROM proj.TBL_PURCHASE_REQUEST
         WHERE IsActive=1 AND CreatedBy=@UserName AND CAST(CreatedDate AS DATE)=@Today) AS prCount;
END
GO

-- ── BUG 2 ────────────────────────────────────────────────────────────
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
        -- @EffectiveAmt is the DOCUMENT's own currency amount — unchanged, this is what
        -- gets stored on the transaction and shown on every approval screen (My
        -- Approvals, Approvals Admin, Dashboard, the notification bell), none of which
        -- label a currency, so none of those must change.
        DECLARE @PolicyId INT, @TotalLevels INT, @EffectiveAmt DECIMAL(18,4) = ISNULL(@DocumentAmount, 0);

        -- Policy AmountFrom/AmountTo are configured in BASE currency (policy names say
        -- so directly: "PO Above 0-Base"; "Invoice Below/Above 25,000" are round INR
        -- figures). Match against a base-currency amount instead, using the document's
        -- OWN locked-in ExchangeRate when its table has one (INV, PO do; JOB — the third
        -- amount-based module — has no ExchangeRate/CurrencyId column at all and is
        -- single-currency by design, so it is correctly untouched by this).
        DECLARE @PolicyMatchAmt DECIMAL(18,4) = @EffectiveAmt;
        IF @IsAmountBased = 1 AND COL_LENGTH('PROJ.' + @DocumentTable, 'ExchangeRate') IS NOT NULL
        BEGIN
            DECLARE @DocExRate DECIMAL(18,6) = 1;
            DECLARE @ExRateSql NVARCHAR(500) = N'SELECT @Rate = ISNULL(ExchangeRate,1) FROM PROJ.' + QUOTENAME(@DocumentTable) + N' WHERE ' + QUOTENAME(@DocumentIdCol) + N' = @DocId';
            EXEC sp_executesql @ExRateSql, N'@Rate DECIMAL(18,6) OUTPUT, @DocId INT', @DocExRate OUTPUT, @DocumentId;
            SET @PolicyMatchAmt = PROJ.fn_ToBase(@EffectiveAmt, @DocExRate);
        END

        IF @IsAmountBased = 1
            SELECT TOP 1 @PolicyId = PolicyId,
                   @TotalLevels = (SELECT COUNT(DISTINCT al.LevelNo) FROM PROJ.TBL_APPROVAL_LEVEL al WHERE al.PolicyId = PROJ.TBL_APPROVAL_POLICY.PolicyId AND al.IsActive = 1)
            FROM PROJ.TBL_APPROVAL_POLICY WHERE ModuleId = @ModuleId AND IsActive = 1
              AND (AmountFrom IS NULL OR @PolicyMatchAmt >= AmountFrom) AND (AmountTo IS NULL OR @PolicyMatchAmt <= AmountTo)
            ORDER BY SortOrder, AmountFrom;
        ELSE
            SELECT TOP 1 @PolicyId = PolicyId,
                   @TotalLevels = (SELECT COUNT(DISTINCT al.LevelNo) FROM PROJ.TBL_APPROVAL_LEVEL al WHERE al.PolicyId = PROJ.TBL_APPROVAL_POLICY.PolicyId AND al.IsActive = 1)
            FROM PROJ.TBL_APPROVAL_POLICY WHERE ModuleId = @ModuleId AND IsActive = 1 ORDER BY SortOrder;
        IF @PolicyId IS NULL
        BEGIN
            SELECT -1 AS TransactionId, NULL AS PolicyId, 0 AS TotalLevels, NULL AS NewStatus,
                   CASE WHEN @IsAmountBased = 1 THEN 'No approval policy covers amount ' + CAST(ISNULL(@PolicyMatchAmt,0) AS NVARCHAR) + ' (base currency). Please configure a matching policy.'
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
            SELECT @LvlAllowSelf = CASE WHEN (SELECT MAX(CAST(al2.AllowSelfApproval AS INT))
                            FROM PROJ.TBL_APPROVAL_LEVEL al2
                            WHERE al2.PolicyId = @PolicyId
                              AND al2.LevelNo  = @CurrentLevelNo
                              AND al2.IsActive = 1
                              AND (al2.ApproverType = 'ANY'
                                OR (al2.ApproverType = 'Role' AND EXISTS (
                                        SELECT 1 FROM PROJ.TBL_USER_ROLES ur2
                                        WHERE ur2.UserId = @SubmittedByUserId
                                          AND ur2.RoleId = al2.ApproverId))
                                OR (al2.ApproverType = 'User'
                                        AND al2.ApproverId = @SubmittedByUserId))) = 1 THEN 1 ELSE 0 END,
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

-- ── verification ─────────────────────────────────────────────────────
SELECT Item = 'sp_GetTodayActivity', Status = CASE WHEN OBJECT_DEFINITION(OBJECT_ID('proj.sp_GetTodayActivity')) LIKE '%fn_ToBase(TotalAmount, ExchangeRate)%' THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'sp_SubmitForApproval', CASE WHEN OBJECT_DEFINITION(OBJECT_ID('proj.sp_SubmitForApproval')) LIKE '%PolicyMatchAmt%' THEN 'OK' ELSE 'MISSING' END;
GO
