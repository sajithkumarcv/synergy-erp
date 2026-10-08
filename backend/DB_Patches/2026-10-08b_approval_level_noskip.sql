-- 2026-10-08b: approval level flag "cannot be skipped by a senior approver" (NoSkip)
--
-- Apply to: SYNERP   Requires: 2026-10-08_po_policy_by_job_type.sql
--
-- The engine lets a user who is an approver at a HIGHER level approve a lower level in the same click
-- (sp_ProcessApproval), and auto-skips lower levels when the submitter is a senior approver
-- (sp_SubmitForApproval). For the in-house PO policy that would let a Manager bypass Procurement.
-- NoSkip = 1 on a level stops both: nobody jumps over it unless they are an approver of that level too.
-- Default 0 everywhere, so every existing policy behaves exactly as before.
-- Sets NoSkip = 1 on level 1 (Procurement) of the "PO In-House Jobs" policy.
--
-- Restore script: kept with the pre-change backups (_REVERT_2026-10-08_po_policy_by_job_type.sql).
-- Idempotent.

SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF COL_LENGTH('proj.TBL_APPROVAL_LEVEL','NoSkip') IS NULL
    ALTER TABLE proj.TBL_APPROVAL_LEVEL ADD NoSkip BIT NOT NULL CONSTRAINT DF_APPROVAL_LEVEL_NOSKIP DEFAULT 0;
GO

CREATE OR ALTER PROCEDURE PROJ.sp_GetApprovalPolicies
    @ModuleCode NVARCHAR(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        p.PolicyId, p.ModuleId, m.ModuleCode, m.ModuleName,
        p.PolicyName, p.Description, p.AmountFrom, p.AmountTo,
        p.TotalLevels, p.IsSequential, p.IsActive, p.SortOrder,
        p.CreatedBy, p.CreatedDate, p.JobTypeId
    FROM   PROJ.TBL_APPROVAL_POLICY p
    JOIN   PROJ.TBL_APPROVAL_MODULE m ON m.ModuleId = p.ModuleId
    WHERE  (@ModuleCode IS NULL OR m.ModuleCode = @ModuleCode)
    ORDER BY m.ModuleCode, p.SortOrder, p.PolicyId;

    SELECT
        lv.LevelId, lv.PolicyId, lv.LevelNo, lv.LevelName,
        lv.ApproverType, lv.ApproverId,
        CASE UPPER(lv.ApproverType)
            WHEN 'ANY'  THEN 'Anyone'
            WHEN 'ROLE' THEN r.RoleName
            WHEN 'USER' THEN u.FullName
            ELSE NULL
        END AS ApproverName,
        lv.IsMandatory, lv.AllowSelfApproval, lv.TimeoutHours, lv.OnTimeoutAction, lv.IsActive, lv.NoSkip
    FROM   PROJ.TBL_APPROVAL_POLICY p
    JOIN   PROJ.TBL_APPROVAL_MODULE m  ON m.ModuleId = p.ModuleId
    JOIN   PROJ.TBL_APPROVAL_LEVEL  lv ON lv.PolicyId = p.PolicyId
    LEFT JOIN PROJ.TBL_ROLES        r  ON r.RoleId = lv.ApproverId AND UPPER(lv.ApproverType) = 'ROLE'
    LEFT JOIN PROJ.TBL_USERS        u  ON u.UserId = lv.ApproverId AND UPPER(lv.ApproverType) = 'USER'
    WHERE  (@ModuleCode IS NULL OR m.ModuleCode = @ModuleCode)
      AND  lv.IsActive = 1
    ORDER BY lv.PolicyId, lv.LevelNo;
END;
GO

CREATE OR ALTER PROCEDURE PROJ.sp_SaveApprovalPolicy
    @PolicyId     INT,
    @ModuleCode   NVARCHAR(20),
    @PolicyName   NVARCHAR(100),
    @Description  NVARCHAR(300) = NULL,
    @AmountFrom   DECIMAL(18,4) = NULL,
    @AmountTo     DECIMAL(18,4) = NULL,
    @IsSequential BIT           = 1,
    @IsActive     BIT           = 1,
    @SortOrder    INT           = 0,
    @SavedBy      NVARCHAR(50),
    @LevelsJson   NVARCHAR(MAX) = NULL,
    @JobTypeId    NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @ModuleId INT;
        SELECT @ModuleId = ModuleId FROM PROJ.TBL_APPROVAL_MODULE WHERE ModuleCode = @ModuleCode;
        IF @ModuleId IS NULL
        BEGIN
            SELECT -1 AS PolicyId, 'Module not found.' AS Message;
            ROLLBACK; RETURN;
        END

        DECLARE @Now         DATETIME = GETDATE();
        DECLARE @OutPolicyId INT;

        IF @PolicyId = 0
        BEGIN
            DECLARE @LevelCount INT = 0;
            IF @LevelsJson IS NOT NULL
                SELECT @LevelCount = COUNT(DISTINCT JSON_VALUE(value, '$.levelNo'))
                FROM OPENJSON(@LevelsJson);

            INSERT INTO PROJ.TBL_APPROVAL_POLICY
                (ModuleId, PolicyName, Description, AmountFrom, AmountTo,
                 TotalLevels, IsSequential, IsActive, SortOrder, CreatedBy, CreatedDate, JobTypeId)
            VALUES
                (@ModuleId, @PolicyName, @Description, @AmountFrom, @AmountTo,
                 @LevelCount, @IsSequential, @IsActive, @SortOrder, @SavedBy, @Now, @JobTypeId);
            SET @OutPolicyId = SCOPE_IDENTITY();
        END
        ELSE
        BEGIN
            SET @OutPolicyId = @PolicyId;
            UPDATE PROJ.TBL_APPROVAL_POLICY
            SET PolicyName   = @PolicyName,  Description  = @Description,
                AmountFrom   = @AmountFrom,  AmountTo     = @AmountTo,
                IsSequential = @IsSequential, IsActive    = @IsActive,
                SortOrder    = @SortOrder,
                JobTypeId    = @JobTypeId,
                ModifiedBy   = @SavedBy,     ModifiedDate = @Now
            WHERE PolicyId = @PolicyId;
        END

        IF @LevelsJson IS NOT NULL
        BEGIN
            -- LevelId is now part of the payload — null/0 means "new row".
            SELECT
                CAST(NULLIF(j.LevelId, 0) AS INT)                                   AS LevelId,
                CAST(j.LevelNo AS INT)                                              AS LevelNo,
                j.LevelName,
                UPPER(LTRIM(RTRIM(j.ApproverType)))                                 AS ApproverType,
                CASE WHEN UPPER(LTRIM(RTRIM(j.ApproverType))) = 'ANY'
                     THEN NULL ELSE CAST(j.ApproverId AS INT) END                   AS ApproverId,
                CAST(ISNULL(j.IsMandatory,       1) AS BIT)                          AS IsMandatory,
                CAST(ISNULL(j.AllowSelfApproval, 0) AS BIT)                          AS AllowSelfApproval,
                CAST(ISNULL(j.TimeoutHours,      0) AS INT)                          AS TimeoutHours,
                j.OnTimeoutAction,
                CAST(ISNULL(j.NoSkip, 0) AS BIT)                                    AS NoSkip
            INTO #NewLevels
            FROM OPENJSON(@LevelsJson)
            WITH (
                LevelId           INT           '$.levelId',
                LevelNo           INT           '$.levelNo',
                LevelName         NVARCHAR(100) '$.levelName',
                ApproverType      NVARCHAR(20)  '$.approverType',
                ApproverId        INT           '$.approverId',
                IsMandatory       BIT           '$.isMandatory',
                AllowSelfApproval BIT           '$.allowSelfApproval',
                TimeoutHours      INT           '$.timeoutHours',
                OnTimeoutAction   NVARCHAR(20)  '$.onTimeoutAction',
                NoSkip            BIT           '$.noSkip'
            ) j;

            -- Guards (unchanged)
            IF EXISTS (SELECT 1 FROM #NewLevels WHERE ApproverType NOT IN ('ANY','ROLE','USER'))
            BEGIN
                SELECT -1 AS PolicyId, 'Each level must use approver type ANY, ROLE or USER.' AS Message;
                ROLLBACK; DROP TABLE #NewLevels; RETURN;
            END
            IF EXISTS (SELECT 1 FROM #NewLevels WHERE ApproverType IN ('ROLE','USER') AND ApproverId IS NULL)
            BEGIN
                SELECT -1 AS PolicyId, 'Role/User levels must have an approver selected.' AS Message;
                ROLLBACK; DROP TABLE #NewLevels; RETURN;
            END

            -- 1) Soft-delete rows whose LevelId no longer appears in the payload
            UPDATE PROJ.TBL_APPROVAL_LEVEL
            SET    IsActive = 0, ModifiedBy = @SavedBy, ModifiedDate = @Now
            WHERE  PolicyId = @OutPolicyId AND IsActive = 1
              AND  LevelId NOT IN (SELECT LevelId FROM #NewLevels WHERE LevelId IS NOT NULL);

            -- 2) Update existing rows by LevelId (allows multiple rows per LevelNo)
            UPDATE al
            SET    al.LevelNo           = nl.LevelNo,
                   al.LevelName         = nl.LevelName,
                   al.ApproverType      = nl.ApproverType,
                   al.ApproverId        = nl.ApproverId,
                   al.IsMandatory       = nl.IsMandatory,
                   al.AllowSelfApproval = nl.AllowSelfApproval,
                   al.TimeoutHours      = nl.TimeoutHours,
                   al.OnTimeoutAction   = nl.OnTimeoutAction,
                   al.NoSkip            = nl.NoSkip,
                   al.IsActive          = 1,
                   al.ModifiedBy        = @SavedBy,
                   al.ModifiedDate      = @Now
            FROM   PROJ.TBL_APPROVAL_LEVEL al
            JOIN   #NewLevels nl ON nl.LevelId = al.LevelId
            WHERE  al.PolicyId = @OutPolicyId;

            -- 3) Insert NEW rows (LevelId is NULL or doesn't belong to this policy)
            INSERT INTO PROJ.TBL_APPROVAL_LEVEL
                (PolicyId, LevelNo, LevelName, ApproverType, ApproverId,
                 IsMandatory, AllowSelfApproval, TimeoutHours, OnTimeoutAction, NoSkip,
                 IsActive, CreatedBy, CreatedDate)
            SELECT
                @OutPolicyId,
                nl.LevelNo, nl.LevelName, nl.ApproverType, nl.ApproverId,
                nl.IsMandatory, nl.AllowSelfApproval, nl.TimeoutHours, nl.OnTimeoutAction, nl.NoSkip,
                1, @SavedBy, @Now
            FROM #NewLevels nl
            WHERE nl.LevelId IS NULL
               OR NOT EXISTS (
                    SELECT 1 FROM PROJ.TBL_APPROVAL_LEVEL al
                    WHERE al.LevelId = nl.LevelId AND al.PolicyId = @OutPolicyId
               );

            DROP TABLE #NewLevels;

            -- TotalLevels = distinct LevelNo across active rows (matches engine semantics)
            UPDATE PROJ.TBL_APPROVAL_POLICY
            SET TotalLevels = (
                SELECT COUNT(DISTINCT LevelNo) FROM PROJ.TBL_APPROVAL_LEVEL
                WHERE PolicyId = @OutPolicyId AND IsActive = 1
            )
            WHERE PolicyId = @OutPolicyId;
        END

        COMMIT TRANSACTION;
        SELECT @OutPolicyId AS PolicyId, 'Saved successfully.' AS Message;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        IF OBJECT_ID('tempdb..#NewLevels') IS NOT NULL DROP TABLE #NewLevels;
        SELECT -1 AS PolicyId, ERROR_MESSAGE() AS Message;
    END CATCH
END;
GO

-- â”€â”€ BUG 2 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        -- PO Budget guard â€” BASE currency (mirrors sp_GetPOBudgetCheck)
        IF @ModuleCode = 'PO'
        BEGIN
            DECLARE @PoJobId NVARCHAR(50), @PoCategoryId INT, @PoExchangeRate DECIMAL(18,6), @PoTotalBase DECIMAL(18,2);
            SELECT @PoJobId = JobId, @PoCategoryId = ExpenseCategoryId, @PoExchangeRate = ISNULL(ExchangeRate, 1)
            FROM PROJ.TBL_PURCHASE_ORDER WHERE PoId = @DocumentId AND IsActive = 1;
            -- Pre-tax base value of THIS PO's own lines (excludes GST/tax) â€” mirrors sp_GetPOBudgetCheck / @SubCommitted below.
            -- (Previously used TotalAmount, which is tax-inclusive, causing GST to be wrongly counted against budget.)
            SELECT @PoTotalBase = ISNULL(SUM(PROJ.fn_ToBase(pol.OrderedQty * pol.UnitPrice, @PoExchangeRate)), 0)
            FROM PROJ.TBL_PURCHASE_ORDER_LINE pol WHERE pol.PoId = @DocumentId AND pol.IsActive = 1;
            IF @PoJobId IS NOT NULL AND @PoCategoryId IS NOT NULL
            BEGIN
                DECLARE @JobRate DECIMAL(18,6) = ISNULL((SELECT JobExcRate FROM PROJ.TBL_JOB WHERE JobId = @PoJobId), 1);
                DECLARE @SubBudgeted DECIMAL(18,2) = 0, @SubBudgetExists BIT = 0;
                -- 2026-09-27: the budget is the JOB total, not one category (matches the print check).
                SELECT @SubBudgetExists = CASE WHEN EXISTS (SELECT 1 FROM PROJ.TBL_JOB_BUDGET
                        WHERE JobId = @PoJobId AND IsCurrent = 1) THEN 1 ELSE 0 END;
                SELECT
                       @SubBudgeted = ISNULL(SUM(ISNULL(AmountInBaseCurrency, PROJ.fn_ToBase(ISNULL(BudgetedAmount, 0), ISNULL(ExchangeRate, @JobRate)))), 0)
                FROM PROJ.TBL_JOB_BUDGET WHERE JobId = @PoJobId AND IsCurrent = 1;
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
                WHERE po.JobId = @PoJobId
                  AND po.Status NOT IN ('Draft','Cancelled') AND po.IsActive = 1 AND po.PoId != @DocumentId;
                DECLARE @SubTolPct DECIMAL(18,4) = ISNULL(TRY_CAST((SELECT SettingValue FROM PROJ.TBL_APP_SETTINGS
                    WHERE SettingKey = N'Biz.PoBudget.TolerancePct') AS DECIMAL(18,4)), 0);
                DECLARE @SubAllowed DECIMAL(18,2) = @SubBudgeted * (1 + @SubTolPct / 100.0);
                IF (@SubCommitted + @PoTotalBase) > @SubAllowed AND @OverrideBudget = 0
                BEGIN
                    DECLARE @SubBudMsg NVARCHAR(600) = 'Cannot submit: PO would exceed the TOTAL budget for this job (base currency, excluding GST). '
                        + 'Budgeted: ' + FORMAT(@SubBudgeted,'N2') + ' | Already committed: ' + FORMAT(@SubCommitted,'N2')
                        + ' | This PO: ' + FORMAT(@PoTotalBase,'N2') + ' | Over by: ' + FORMAT(@SubCommitted+@PoTotalBase-@SubAllowed,'N2') + CASE WHEN @SubTolPct > 0 THEN ' | Tolerance: ' + FORMAT(@SubTolPct,'N2') + '%' ELSE '' END;
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
        -- @EffectiveAmt is the DOCUMENT's own currency amount â€” unchanged, this is what
        -- gets stored on the transaction and shown on every approval screen (My
        -- Approvals, Approvals Admin, Dashboard, the notification bell), none of which
        -- label a currency, so none of those must change.
        DECLARE @PolicyId INT, @TotalLevels INT, @EffectiveAmt DECIMAL(18,4) = ISNULL(@DocumentAmount, 0);

        -- Policy AmountFrom/AmountTo are configured in BASE currency (policy names say
        -- so directly: "PO Above 0-Base"; "Invoice Below/Above 25,000" are round INR
        -- figures). Match against a base-currency amount instead, using the document's
        -- OWN locked-in ExchangeRate when its table has one (INV, PO do; JOB â€” the third
        -- amount-based module â€” has no ExchangeRate/CurrencyId column at all and is
        -- single-currency by design, so it is correctly untouched by this).
        DECLARE @PolicyMatchAmt DECIMAL(18,4) = @EffectiveAmt;
        IF @IsAmountBased = 1 AND COL_LENGTH('PROJ.' + @DocumentTable, 'ExchangeRate') IS NOT NULL
        BEGIN
            DECLARE @DocExRate DECIMAL(18,6) = 1;
            DECLARE @ExRateSql NVARCHAR(500) = N'SELECT @Rate = ISNULL(ExchangeRate,1) FROM PROJ.' + QUOTENAME(@DocumentTable) + N' WHERE ' + QUOTENAME(@DocumentIdCol) + N' = @DocId';
            EXEC sp_executesql @ExRateSql, N'@Rate DECIMAL(18,6) OUTPUT, @DocId INT', @DocExRate OUTPUT, @DocumentId;
            SET @PolicyMatchAmt = PROJ.fn_ToBase(@EffectiveAmt, @DocExRate);
        END

        -- 2026-10-08: a policy may be scoped to one job type (TBL_APPROVAL_POLICY.JobTypeId). For a PO the
        -- job's type is looked up; a scoped policy that matches wins over the generic (JobTypeId NULL) one.
        DECLARE @PolicyJobType NVARCHAR(100) = NULL;
        IF @ModuleCode = 'PO'
            SELECT @PolicyJobType = j.JobTypeId
            FROM PROJ.TBL_PURCHASE_ORDER po JOIN PROJ.TBL_JOB j ON j.JobId = po.JobId
            WHERE po.PoId = @DocumentId;

        IF @IsAmountBased = 1
            SELECT TOP 1 @PolicyId = PolicyId,
                   @TotalLevels = (SELECT COUNT(DISTINCT al.LevelNo) FROM PROJ.TBL_APPROVAL_LEVEL al WHERE al.PolicyId = PROJ.TBL_APPROVAL_POLICY.PolicyId AND al.IsActive = 1)
            FROM PROJ.TBL_APPROVAL_POLICY WHERE ModuleId = @ModuleId AND IsActive = 1
              AND (AmountFrom IS NULL OR @PolicyMatchAmt >= AmountFrom) AND (AmountTo IS NULL OR @PolicyMatchAmt <= AmountTo)
              AND (JobTypeId IS NULL OR JobTypeId = @PolicyJobType)
            ORDER BY CASE WHEN JobTypeId IS NULL THEN 1 ELSE 0 END, SortOrder, AmountFrom;
        ELSE
            SELECT TOP 1 @PolicyId = PolicyId,
                   @TotalLevels = (SELECT COUNT(DISTINCT al.LevelNo) FROM PROJ.TBL_APPROVAL_LEVEL al WHERE al.PolicyId = PROJ.TBL_APPROVAL_POLICY.PolicyId AND al.IsActive = 1)
            FROM PROJ.TBL_APPROVAL_POLICY WHERE ModuleId = @ModuleId AND IsActive = 1
              AND (JobTypeId IS NULL OR JobTypeId = @PolicyJobType)
            ORDER BY CASE WHEN JobTypeId IS NULL THEN 1 ELSE 0 END, SortOrder;
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
                 AND NOT EXISTS (SELECT 1 FROM PROJ.TBL_APPROVAL_LEVEL nb WHERE nb.PolicyId = @PolicyId AND nb.LevelNo = @CurrentLevelNo AND nb.IsActive = 1 AND nb.NoSkip = 1)   -- 2026-10-08: NoSkip level is never auto-skipped
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
               CASE WHEN @IsComplete = 1 THEN 'Auto-approved â€” submitter cleared all levels.' ELSE 'Submitted successfully.' END AS Message;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        SELECT -1 AS TransactionId, NULL AS PolicyId, 0 AS TotalLevels, NULL AS NewStatus, ERROR_MESSAGE() AS Message;
    END CATCH
END;
GO

CREATE OR ALTER PROCEDURE PROJ.sp_ProcessApproval
    @TransactionId INT,
    @Action        NVARCHAR(20),
    @ActionBy      INT,
    @ActionByName  NVARCHAR(100),
    @Remarks       NVARCHAR(500) = NULL,
    @OverrideBudget BIT          = 0
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        BEGIN TRANSACTION;
        IF @Action NOT IN ('Approve','Reject','SendBack','Cancel')
        BEGIN
            SELECT @TransactionId AS TransactionId, NULL AS NewStatus, 0 AS IsComplete, 'Invalid action.' AS Message, NULL AS ModuleCode, NULL AS DocumentId;
            ROLLBACK; RETURN;
        END
        DECLARE @LogAction NVARCHAR(20) = CASE @Action WHEN 'Approve' THEN 'Approved' WHEN 'Reject' THEN 'Rejected' WHEN 'SendBack' THEN 'Returned' WHEN 'Cancel' THEN 'Cancelled' END;
        DECLARE @ModuleId INT, @ModuleCode NVARCHAR(20), @DocumentId INT, @PostApprovalSP NVARCHAR(200), @PolicyId INT,
                @CurrentStatus NVARCHAR(20), @CurrentLevelNo INT, @TotalLevels INT, @SubmittedBy NVARCHAR(100), @DocumentTable NVARCHAR(100),
                @DocumentIdCol NVARCHAR(50), @StatusColumn NVARCHAR(50), @ModifiedByCol NVARCHAR(50), @ModifiedDateCol NVARCHAR(50),
                @ApprovedStatus NVARCHAR(30), @RejectedStatus NVARCHAR(30), @CancelledStatus NVARCHAR(30);
        SELECT @ModuleId = t.ModuleId, @ModuleCode = m.ModuleCode, @DocumentId = t.DocumentId, @PostApprovalSP = m.PostApprovalSP,
               @PolicyId = t.PolicyId, @CurrentStatus = t.CurrentStatus, @CurrentLevelNo = t.CurrentLevelNo, @TotalLevels = t.TotalLevels,
               @SubmittedBy = t.SubmittedBy, @DocumentTable = m.DocumentTable, @DocumentIdCol = m.DocumentIdColumn,
               @StatusColumn = ISNULL(m.StatusColumn,'Status'), @ModifiedByCol = ISNULL(m.ModifiedByColumn,'ModifiedBy'),
               @ModifiedDateCol = ISNULL(m.ModifiedDateColumn,'ModifiedDate'), @ApprovedStatus = ISNULL(m.ApprovedStatus,'Approved'),
               @RejectedStatus = ISNULL(m.RejectedStatus,'Rejected'), @CancelledStatus = ISNULL(m.CancelledStatus,'Draft')
        FROM PROJ.TBL_APPROVAL_TRANSACTION t JOIN PROJ.TBL_APPROVAL_MODULE m ON m.ModuleId = t.ModuleId WHERE t.TransactionId = @TransactionId;
        IF @ModuleId IS NULL
        BEGIN
            SELECT @TransactionId AS TransactionId, NULL AS NewStatus, 0 AS IsComplete, 'Transaction not found.' AS Message, NULL AS ModuleCode, NULL AS DocumentId;
            ROLLBACK; RETURN;
        END
        IF @CurrentStatus IN ('Approved','Rejected','Cancelled','SentBack')
        BEGIN
            SELECT @TransactionId AS TransactionId, @CurrentStatus AS NewStatus, 1 AS IsComplete, 'Transaction is already complete.' AS Message, @ModuleCode AS ModuleCode, @DocumentId AS DocumentId;
            ROLLBACK; RETURN;
        END
        DECLARE @CurrentLevelId INT = NULL, @AllowSelfApproval BIT = 0;
        SELECT TOP 1 @CurrentLevelId = al.LevelId, @AllowSelfApproval = al.AllowSelfApproval
        FROM PROJ.TBL_APPROVAL_LEVEL al WHERE al.PolicyId = @PolicyId AND al.LevelNo = @CurrentLevelNo AND al.IsActive = 1
          AND (al.ApproverType = 'ANY' OR (al.ApproverType = 'Role' AND EXISTS (SELECT 1 FROM PROJ.TBL_USER_ROLES ur WHERE ur.UserId = @ActionBy AND ur.RoleId = al.ApproverId)) OR (al.ApproverType = 'User' AND al.ApproverId = @ActionBy))
        ORDER BY al.LevelId;
        IF @CurrentLevelId IS NULL
            SELECT TOP 1 @CurrentLevelId = al.LevelId, @AllowSelfApproval = al.AllowSelfApproval
            FROM PROJ.TBL_APPROVAL_LEVEL al WHERE al.PolicyId = @PolicyId AND al.LevelNo = @CurrentLevelNo AND al.IsActive = 1 ORDER BY al.LevelId;
        DECLARE @UserCanAct BIT = 0;
        IF @Action = 'Cancel' AND @ActionByName = @SubmittedBy SET @UserCanAct = 1;
        IF @UserCanAct = 0 AND EXISTS (SELECT 1 FROM PROJ.TBL_APPROVAL_LEVEL al WHERE al.PolicyId = @PolicyId AND al.LevelNo = @CurrentLevelNo AND al.IsActive = 1
              AND (al.ApproverType = 'ANY' OR (al.ApproverType = 'Role' AND EXISTS (SELECT 1 FROM PROJ.TBL_USER_ROLES ur WHERE ur.UserId = @ActionBy AND ur.RoleId = al.ApproverId)) OR (al.ApproverType = 'User' AND al.ApproverId = @ActionBy)))
            SET @UserCanAct = 1;
        IF @UserCanAct = 0 AND @Action <> 'Cancel'
            IF EXISTS (SELECT 1 FROM PROJ.TBL_APPROVAL_DELEGATE ad JOIN PROJ.TBL_APPROVAL_LEVEL al ON al.LevelId = ad.LevelId
                WHERE al.PolicyId = @PolicyId AND al.LevelNo = @CurrentLevelNo AND al.IsActive = 1 AND ad.DelegateUserId = @ActionBy AND ad.IsActive = 1 AND CAST(GETDATE() AS date) BETWEEN ad.FromDate AND ad.ToDate)
                SET @UserCanAct = 1;
        DECLARE @UserMaxLevel INT = NULL;
        IF @Action = 'Approve'
        BEGIN
            SELECT @UserMaxLevel = MAX(al.LevelNo) FROM PROJ.TBL_APPROVAL_LEVEL al WHERE al.PolicyId = @PolicyId AND al.IsActive = 1 AND al.LevelNo >= @CurrentLevelNo
               AND ((al.ApproverType = 'Role' AND EXISTS (SELECT 1 FROM PROJ.TBL_USER_ROLES ur WHERE ur.UserId = @ActionBy AND ur.RoleId = al.ApproverId)) OR (al.ApproverType = 'User' AND al.ApproverId = @ActionBy) OR al.ApproverType = 'ANY');
            -- 2026-10-08: a NoSkip level between here and the user's own level cannot be jumped over by a senior
            -- approver unless the user is an approver of that level too. No jump -> the user can only act where
            -- they hold the role for the CURRENT level (otherwise they are refused below).
            IF @UserMaxLevel IS NOT NULL AND @UserMaxLevel > @CurrentLevelNo
               AND EXISTS (SELECT 1 FROM PROJ.TBL_APPROVAL_LEVEL nb
                           WHERE nb.PolicyId = @PolicyId AND nb.IsActive = 1 AND nb.NoSkip = 1
                             AND nb.LevelNo >= @CurrentLevelNo AND nb.LevelNo < @UserMaxLevel
                             AND NOT EXISTS (SELECT 1 FROM PROJ.TBL_APPROVAL_LEVEL nm
                                             WHERE nm.PolicyId = @PolicyId AND nm.LevelNo = nb.LevelNo AND nm.IsActive = 1
                                               AND (nm.ApproverType = 'ANY'
                                                 OR (nm.ApproverType = 'Role' AND EXISTS (SELECT 1 FROM PROJ.TBL_USER_ROLES ur WHERE ur.UserId = @ActionBy AND ur.RoleId = nm.ApproverId))
                                                 OR (nm.ApproverType = 'User' AND nm.ApproverId = @ActionBy))))
                SET @UserMaxLevel = NULL;
            IF @UserMaxLevel IS NOT NULL AND @UserMaxLevel > @CurrentLevelNo SET @UserCanAct = 1;
        END
        IF @UserCanAct = 1 AND @AllowSelfApproval = 0 AND @ActionByName = @SubmittedBy AND @Action IN ('Approve','Reject')
        BEGIN
            SELECT @TransactionId AS TransactionId, NULL AS NewStatus, 0 AS IsComplete, 'Self-approval is not permitted for this level.' AS Message, NULL AS ModuleCode, NULL AS DocumentId;
            ROLLBACK; RETURN;
        END
        IF @UserCanAct = 0
        BEGIN
            SELECT @TransactionId AS TransactionId, NULL AS NewStatus, 0 AS IsComplete, 'You do not have the required role to perform this action at level ' + CAST(@CurrentLevelNo AS NVARCHAR) + '.' AS Message, NULL AS ModuleCode, NULL AS DocumentId;
            ROLLBACK; RETURN;
        END
        -- PO budget guard — BASE currency (mirrors sp_GetPOBudgetCheck); bypassable via @OverrideBudget
        IF @Action = 'Approve' AND @ModuleCode = 'PO'
        BEGIN
            DECLARE @ApJobId NVARCHAR(50), @ApCategoryId INT, @ApPoTotalBase DECIMAL(18,2), @ApExchangeRate DECIMAL(18,6);
            SELECT @ApJobId = JobId, @ApCategoryId = ExpenseCategoryId, @ApExchangeRate = ISNULL(ExchangeRate, 1)
            FROM PROJ.TBL_PURCHASE_ORDER WHERE PoId = @DocumentId AND IsActive = 1;
            -- Pre-tax base value of THIS PO's own lines (excludes GST/tax) — mirrors
            -- sp_GetPOBudgetCheck / @ApCommitted below. Previously used TotalAmount,
            -- which is tax-inclusive, wrongly counting GST against the budget.
            SELECT @ApPoTotalBase = ISNULL(SUM(PROJ.fn_ToBase(pol.OrderedQty * pol.UnitPrice, @ApExchangeRate)), 0)
            FROM PROJ.TBL_PURCHASE_ORDER_LINE pol WHERE pol.PoId = @DocumentId AND pol.IsActive = 1;
            IF @ApJobId IS NOT NULL AND @ApCategoryId IS NOT NULL
            BEGIN
                DECLARE @ApJobRate DECIMAL(18,6) = ISNULL((SELECT JobExcRate FROM PROJ.TBL_JOB WHERE JobId = @ApJobId), 1);
                DECLARE @ApBudgeted DECIMAL(18,2) = 0, @ApBudgetExists BIT = 0;
                -- 2026-09-27: the budget is the JOB total, not one category (matches the print check).
                SELECT @ApBudgetExists = CASE WHEN EXISTS (SELECT 1 FROM PROJ.TBL_JOB_BUDGET
                        WHERE JobId = @ApJobId AND IsCurrent = 1) THEN 1 ELSE 0 END;
                SELECT @ApBudgeted = ISNULL(SUM(ISNULL(AmountInBaseCurrency, PROJ.fn_ToBase(ISNULL(BudgetedAmount, 0), ISNULL(ExchangeRate, @ApJobRate)))), 0)
                FROM PROJ.TBL_JOB_BUDGET WHERE JobId = @ApJobId AND IsCurrent = 1;
                IF @ApBudgetExists = 0
                BEGIN
                    SELECT @TransactionId AS TransactionId, NULL AS NewStatus, 0 AS IsComplete,
                           'Cannot approve: this job has no approved budget. Add a budget line first.' AS Message, @ModuleCode AS ModuleCode, @DocumentId AS DocumentId;
                    ROLLBACK; RETURN;
                END
                DECLARE @ApCommitted DECIMAL(18,2) = 0;
                SELECT @ApCommitted = ISNULL(SUM(PROJ.fn_ToBase(pol.OrderedQty * pol.UnitPrice, po.ExchangeRate)), 0)
                FROM PROJ.TBL_PURCHASE_ORDER po JOIN PROJ.TBL_PURCHASE_ORDER_LINE pol ON pol.PoId = po.PoId AND pol.IsActive = 1
                WHERE po.JobId = @ApJobId AND po.Status NOT IN ('Draft','Cancelled') AND po.IsActive = 1 AND po.PoId != @DocumentId;
                DECLARE @ApTolPct DECIMAL(18,4) = ISNULL(TRY_CAST((SELECT SettingValue FROM PROJ.TBL_APP_SETTINGS
                    WHERE SettingKey = N'Biz.PoBudget.TolerancePct') AS DECIMAL(18,4)), 0);
                DECLARE @ApAllowed DECIMAL(18,2) = @ApBudgeted * (1 + @ApTolPct / 100.0);
                IF (@ApCommitted + @ApPoTotalBase) > @ApAllowed AND @OverrideBudget = 0
                BEGIN
                    DECLARE @ApBudMsg NVARCHAR(600) = 'Cannot approve: PO would exceed the TOTAL budget for this job (base currency, excluding GST). '
                        + 'Budgeted: ' + FORMAT(@ApBudgeted,'N2') + ' | Already committed: ' + FORMAT(@ApCommitted,'N2')
                        + ' | This PO: ' + FORMAT(@ApPoTotalBase,'N2') + ' | Over by: ' + FORMAT(@ApCommitted+@ApPoTotalBase-@ApAllowed,'N2') + CASE WHEN @ApTolPct > 0 THEN ' | Tolerance: ' + FORMAT(@ApTolPct,'N2') + '%' ELSE '' END;
                    SELECT @TransactionId AS TransactionId, NULL AS NewStatus, 0 AS IsComplete, @ApBudMsg AS Message, @ModuleCode AS ModuleCode, @DocumentId AS DocumentId;
                    ROLLBACK; RETURN;
                END
            END
        END
        DECLARE @Now DATETIME = GETDATE();
        DECLARE @NewStatus NVARCHAR(50);
        DECLARE @NewLevelNo INT = @CurrentLevelNo;
        DECLARE @IsComplete BIT = 0;
        DECLARE @FinalAction NVARCHAR(20) = NULL;
        DECLARE @CompletedDate DATETIME = NULL;
        IF @Action = 'Approve' AND @UserMaxLevel IS NOT NULL AND @UserMaxLevel > @CurrentLevelNo
        BEGIN
            DECLARE @LoopLvl INT = @CurrentLevelNo;
            WHILE @LoopLvl < @UserMaxLevel
            BEGIN
                DECLARE @LoopLvlId INT;
                SELECT TOP 1 @LoopLvlId = LevelId FROM PROJ.TBL_APPROVAL_LEVEL WHERE PolicyId = @PolicyId AND LevelNo = @LoopLvl AND IsActive = 1 ORDER BY LevelId;
                INSERT INTO PROJ.TBL_APPROVAL_LOG (TransactionId, LevelId, LevelNo, Action, ActionBy, ActionByName, ActionDate, Remarks, IsDelegated, DelegatedFromUserId, DelegatedFromName, IsTimedOut)
                VALUES (@TransactionId, @LoopLvlId, @LoopLvl, 'Approved', @ActionBy, @ActionByName, @Now, ISNULL(NULLIF(LTRIM(RTRIM(@Remarks)), ''), '(no remarks)') + ' [auto-approved by senior approver]', 0, NULL, NULL, 0);
                SET @LoopLvl += 1;
            END
            SET @CurrentLevelNo = @UserMaxLevel;
            SELECT TOP 1 @CurrentLevelId = al.LevelId FROM PROJ.TBL_APPROVAL_LEVEL al WHERE al.PolicyId = @PolicyId AND al.LevelNo = @UserMaxLevel AND al.IsActive = 1
              AND ((al.ApproverType = 'Role' AND EXISTS (SELECT 1 FROM PROJ.TBL_USER_ROLES ur WHERE ur.UserId = @ActionBy AND ur.RoleId = al.ApproverId)) OR (al.ApproverType = 'User' AND al.ApproverId = @ActionBy) OR al.ApproverType = 'ANY') ORDER BY al.LevelId;
            SET @NewLevelNo = @UserMaxLevel;
        END
        IF @Action = 'Approve'
        BEGIN
            IF @CurrentLevelNo >= @TotalLevels
            BEGIN SET @NewStatus = @ApprovedStatus; SET @IsComplete = 1; SET @FinalAction = 'Approved'; SET @CompletedDate = @Now; END
            ELSE
            BEGIN
                SET @NewLevelNo = @CurrentLevelNo + 1;
                SELECT TOP 1 @NewStatus = ISNULL(PendingStatus, 'PendingApproval') FROM PROJ.TBL_APPROVAL_LEVEL WHERE PolicyId = @PolicyId AND LevelNo = @NewLevelNo AND IsActive = 1 ORDER BY LevelId;
                IF @NewStatus IS NULL SET @NewStatus = 'PendingApproval';
            END
        END
        ELSE IF @Action = 'Reject'
        BEGIN SET @NewStatus = @RejectedStatus; SET @IsComplete = 1; SET @FinalAction = 'Rejected'; SET @CompletedDate = @Now; END
        ELSE IF @Action = 'SendBack'
        BEGIN
            IF @CurrentLevelNo <= 1
            BEGIN SET @NewStatus = @CancelledStatus; SET @IsComplete = 1; SET @FinalAction = 'SentBack'; SET @CompletedDate = @Now; SET @NewLevelNo = 1; END
            ELSE
            BEGIN
                SET @NewLevelNo = @CurrentLevelNo - 1;
                SELECT TOP 1 @NewStatus = ISNULL(PendingStatus, 'PendingApproval') FROM PROJ.TBL_APPROVAL_LEVEL WHERE PolicyId = @PolicyId AND LevelNo = @NewLevelNo AND IsActive = 1 ORDER BY LevelId;
                IF @NewStatus IS NULL SET @NewStatus = 'PendingApproval';
            END
        END
        ELSE IF @Action = 'Cancel'
        BEGIN SET @NewStatus = @CancelledStatus; SET @IsComplete = 1; SET @FinalAction = 'Cancelled'; SET @CompletedDate = @Now; END
        DECLARE @IsDelegated BIT = 0, @DelegatedFromUserId INT = NULL, @DelegatedFromName NVARCHAR(100) = NULL;
        SELECT TOP 1 @IsDelegated = 1, @DelegatedFromUserId = ad.OriginalUserId, @DelegatedFromName = ou.FullName
        FROM PROJ.TBL_APPROVAL_DELEGATE ad JOIN PROJ.TBL_USERS ou ON ou.UserId = ad.OriginalUserId
        WHERE ad.LevelId = @CurrentLevelId AND ad.DelegateUserId = @ActionBy AND ad.IsActive = 1 AND CAST(GETDATE() AS date) BETWEEN ad.FromDate AND ad.ToDate;
        INSERT INTO PROJ.TBL_APPROVAL_LOG (TransactionId, LevelId, LevelNo, Action, ActionBy, ActionByName, ActionDate, Remarks, IsDelegated, DelegatedFromUserId, DelegatedFromName, IsTimedOut)
        VALUES (@TransactionId, @CurrentLevelId, @CurrentLevelNo, @LogAction, @ActionBy, @ActionByName, @Now,
             CASE WHEN @OverrideBudget = 1 AND @Action = 'Approve' THEN ISNULL(NULLIF(LTRIM(RTRIM(@Remarks)),''),'(no remarks)') + ' [BUDGET OVERRIDE]' ELSE @Remarks END,
             @IsDelegated, @DelegatedFromUserId, @DelegatedFromName, 0);
        UPDATE PROJ.TBL_APPROVAL_TRANSACTION
        SET CurrentStatus = CASE WHEN @IsComplete = 1 THEN @FinalAction ELSE 'Pending' END, CurrentLevelNo = @NewLevelNo, FinalAction = @FinalAction,
            FinalActionBy = CASE WHEN @IsComplete = 1 THEN @ActionByName ELSE NULL END, FinalRemarks = CASE WHEN @IsComplete = 1 THEN @Remarks ELSE NULL END,
            CompletedDate = @CompletedDate, ModifiedBy = @ActionByName, ModifiedDate = @Now WHERE TransactionId = @TransactionId;
        DECLARE @Sql NVARCHAR(1000) = N'UPDATE PROJ.' + QUOTENAME(@DocumentTable) + N' SET ' + QUOTENAME(@StatusColumn) + N' = @NewSt' + N', ' + QUOTENAME(@ModifiedByCol) + N' = @Who' + N', ' + QUOTENAME(@ModifiedDateCol) + N' = @When' + N' WHERE ' + QUOTENAME(@DocumentIdCol) + N' = @DocId';
        EXEC sp_executesql @Sql, N'@NewSt NVARCHAR(50), @Who NVARCHAR(100), @When DATETIME, @DocId INT', @NewStatus, @ActionByName, @Now, @DocumentId;
        
        -- Stamp ApprovedBy / ApprovedDate on the document when fully approved (if columns exist)
        IF @IsComplete = 1 AND @FinalAction = 'Approved'
           AND COL_LENGTH('PROJ.' + @DocumentTable, 'ApprovedBy') IS NOT NULL
        BEGIN
            DECLARE @ApStampSql NVARCHAR(600) = N'UPDATE PROJ.' + QUOTENAME(@DocumentTable)
                + N' SET ApprovedBy = @Who'
                + CASE WHEN COL_LENGTH('PROJ.' + @DocumentTable, 'ApprovedDate') IS NOT NULL
                       THEN N', ApprovedDate = @When' ELSE N'' END
                + N' WHERE ' + QUOTENAME(@DocumentIdCol) + N' = @DocId';
            EXEC sp_executesql @ApStampSql, N'@Who NVARCHAR(100), @When DATETIME, @DocId INT', @ActionByName, @Now, @DocumentId;
        END
        IF @IsComplete = 1 AND @FinalAction = 'Approved' AND @PostApprovalSP IS NOT NULL
        BEGIN
            DECLARE @HookSql NVARCHAR(500);
            IF @OverrideBudget = 1 AND @ModuleCode = 'MH' SET @HookSql = N'EXEC ' + @PostApprovalSP + N' @DocId, @By, @OverrideBudget = 1';
            ELSE SET @HookSql = N'EXEC ' + @PostApprovalSP + N' @DocId, @By';
            EXEC sp_executesql @HookSql, N'@DocId INT, @By NVARCHAR(100)', @DocumentId, @ActionByName;
        END
        COMMIT TRANSACTION;
        SELECT @TransactionId AS TransactionId, @NewStatus AS NewStatus, @IsComplete AS IsComplete, 'Action processed successfully.' AS Message, @ModuleCode AS ModuleCode, @DocumentId AS DocumentId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        SELECT @TransactionId AS TransactionId, NULL AS NewStatus, 0 AS IsComplete, ERROR_MESSAGE() AS Message, NULL AS ModuleCode, NULL AS DocumentId;
    END CATCH
END;
GO

UPDATE l SET NoSkip = 1
FROM proj.TBL_APPROVAL_LEVEL l JOIN proj.TBL_APPROVAL_POLICY p ON p.PolicyId = l.PolicyId
WHERE p.JobTypeId = 'IH' AND p.PolicyName = 'PO In-House Jobs' AND l.LevelNo = 1;
GO
