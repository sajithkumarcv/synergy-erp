-- 2026-10-08: PO approval policy can be scoped to a job type (in-house POs: Procurement approves level 1)
--
-- Apply to: SYNERP
--
-- Policy selection used module + amount only. This adds TBL_APPROVAL_POLICY.JobTypeId (NULL = applies to every
-- job type, i.e. every existing policy is unchanged). sp_SubmitForApproval now looks up the PO's job type and
-- prefers a policy scoped to it; if none matches it falls back to the generic policy exactly as before.
-- sp_SaveApprovalPolicy / sp_GetApprovalPolicies carry the new field for the policy screen.
--
-- Then creates the "PO In-House Jobs" policy for job type IH:
--   L1 Procurement Officer / Procurement Manager (parallel, no self-approval - a real procurement check)
--   L2 Manager, L3 HOD, L4 Admin + Finance Manager (same as the generic PO policy, shifted down one)
--
-- Restore script: kept with the pre-change backups (_REVERT_2026-10-08_po_policy_by_job_type.sql).
-- Idempotent.

SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF COL_LENGTH('proj.TBL_APPROVAL_POLICY','JobTypeId') IS NULL
    ALTER TABLE proj.TBL_APPROVAL_POLICY ADD JobTypeId NVARCHAR(100) NULL;
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
        lv.IsMandatory, lv.AllowSelfApproval, lv.TimeoutHours, lv.OnTimeoutAction, lv.IsActive
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
                j.OnTimeoutAction
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
                OnTimeoutAction   NVARCHAR(20)  '$.onTimeoutAction'
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
                   al.IsActive          = 1,
                   al.ModifiedBy        = @SavedBy,
                   al.ModifiedDate      = @Now
            FROM   PROJ.TBL_APPROVAL_LEVEL al
            JOIN   #NewLevels nl ON nl.LevelId = al.LevelId
            WHERE  al.PolicyId = @OutPolicyId;

            -- 3) Insert NEW rows (LevelId is NULL or doesn't belong to this policy)
            INSERT INTO PROJ.TBL_APPROVAL_LEVEL
                (PolicyId, LevelNo, LevelName, ApproverType, ApproverId,
                 IsMandatory, AllowSelfApproval, TimeoutHours, OnTimeoutAction,
                 IsActive, CreatedBy, CreatedDate)
            SELECT
                @OutPolicyId,
                nl.LevelNo, nl.LevelName, nl.ApproverType, nl.ApproverId,
                nl.IsMandatory, nl.AllowSelfApproval, nl.TimeoutHours, nl.OnTimeoutAction,
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

-- the in-house PO policy
IF NOT EXISTS (SELECT 1 FROM proj.TBL_APPROVAL_POLICY WHERE JobTypeId = 'IH'
               AND ModuleId = (SELECT ModuleId FROM proj.TBL_APPROVAL_MODULE WHERE ModuleCode = 'PO'))
BEGIN
    BEGIN TRAN;
    DECLARE @Mod INT = (SELECT ModuleId FROM proj.TBL_APPROVAL_MODULE WHERE ModuleCode = 'PO');
    INSERT INTO proj.TBL_APPROVAL_POLICY
        (ModuleId, PolicyName, Description, AmountFrom, AmountTo, TotalLevels, IsSequential, IsActive, SortOrder, CreatedBy, JobTypeId)
    VALUES (@Mod, 'PO In-House Jobs', 'In-house job POs: Procurement approves first, then the normal levels', 0, NULL, 4, 1, 1, 3, 'system', 'IH');
    DECLARE @Pol INT = SCOPE_IDENTITY();
    INSERT INTO proj.TBL_APPROVAL_LEVEL (PolicyId, LevelNo, LevelName, ApproverType, ApproverId, IsMandatory, AllowSelfApproval, IsActive, CreatedBy)
    VALUES (@Pol, 1, 'Procurement',     'ROLE', 4,    1, 0, 1, 'system'),
           (@Pol, 1, 'Procurement Mgr', 'ROLE', 1011, 1, 0, 1, 'system'),
           (@Pol, 2, 'Manager-L1',      'ROLE', 11,   1, 1, 1, 'system'),
           (@Pol, 3, 'HOD',             'ROLE', 1010, 1, 1, 1, 'system'),
           (@Pol, 4, 'ADMIN',           'ROLE', 1,    1, 1, 1, 'system'),
           (@Pol, 4, 'FINANCE',         'ROLE', 5,    1, 1, 1, 'system');
    COMMIT;
    PRINT CONCAT('Created PO In-House Jobs policy ', @Pol);
END
ELSE PRINT 'PO In-House policy already exists - skipped';
GO
