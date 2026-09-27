-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-09-27m  PO submit / approve checks the JOB's total budget, not the category's.
--
-- WHY. Printing a PO already checks the whole job: PoDetailPage calls the budget check
-- WITHOUT a category id, and its own comment says so - "a PO can now exceed its own
-- category's budget without blocking the real print, as long as the JOB's total budget
-- across all categories combined still covers it".
-- Submit and approve did NOT: both read one category's budget and counted only that
-- category's POs. So a PO could be printed but not approved, which is what the client hit on
-- 26 Sep (PO-26-0342, Steel Materials over by 4,885.48 while the job had ~20M of headroom).
-- This patch brings submit/approve into line with printing.
--
-- WHAT CHANGES, in both sp_ProcessApproval and sp_SubmitForApproval:
--   budget    - SUM of every current budget line on the job, instead of one category's line
--   committed - every live PO on the job, instead of only the same category's POs
--   message   - says "total budget for this job", so the figures on screen are explicable
--   existence - still refuses when the job has NO approved budget at all; it no longer
--               requires a budget line for the PO's own category
--
-- WHAT DOES NOT CHANGE:
--   * The basis stays PRE-TAX (OrderedQty * UnitPrice). GST never entered this guard and
--     still does not.
--   * Base-currency conversion (fn_ToBase) is untouched - AED POs still convert.
--   * Draft POs stay excluded, @OverrideBudget still bypasses, the tolerance setting
--     (Biz.PoBudget.TolerancePct, default 0) still applies - now against the job total.
--   * Nothing outside these two guards is touched. No data is modified.
--
-- EFFECT ON TODAY'S PROD DATA: of the 8 job/categories currently blocked, 7 clear
-- (EC26-300003, 300010, 300007, 300008, 300002, IH26-500008, IH26-500018) and
-- IH26-500005 stays blocked - 4,440,569 committed against an 800,000 job budget.
--
-- Ten anchors, each verified unique in its procedure, all-or-nothing, idempotent.
-- ─────────────────────────────────────────────────────────────────────────────
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

BEGIN TRY
    BEGIN TRAN;

    DECLARE @work TABLE (seq INT IDENTITY, proc_name SYSNAME, anchor NVARCHAR(400), replacement NVARCHAR(MAX));

    ---------------------------------------------------------------- approve side
    INSERT INTO @work (proc_name, anchor, replacement) VALUES
        (N'sp_ProcessApproval',
         N'SELECT @ApBudgetExists = 1, @ApBudgeted = ISNULL(AmountInBaseCurrency, PROJ.fn_ToBase(ISNULL(BudgetedAmount, 0), ISNULL(ExchangeRate, @ApJobRate)))',
         N'-- 2026-09-27: the budget is the JOB total, not one category (matches the print check).' + CHAR(10)
         + N'                SELECT @ApBudgetExists = CASE WHEN EXISTS (SELECT 1 FROM PROJ.TBL_JOB_BUDGET' + CHAR(10)
         + N'                        WHERE JobId = @ApJobId AND IsCurrent = 1) THEN 1 ELSE 0 END;' + CHAR(10)
         + N'                SELECT @ApBudgeted = ISNULL(SUM(ISNULL(AmountInBaseCurrency, PROJ.fn_ToBase(ISNULL(BudgetedAmount, 0), ISNULL(ExchangeRate, @ApJobRate)))), 0)'),

        (N'sp_ProcessApproval',
         N'FROM PROJ.TBL_JOB_BUDGET WHERE JobId = @ApJobId AND CostCategoryId = @ApCategoryId AND IsCurrent = 1;',
         N'FROM PROJ.TBL_JOB_BUDGET WHERE JobId = @ApJobId AND IsCurrent = 1;'),

        (N'sp_ProcessApproval',
         N'WHERE po.JobId = @ApJobId AND po.ExpenseCategoryId = @ApCategoryId AND po.Status NOT IN (''Draft'',''Cancelled'') AND po.IsActive = 1 AND po.PoId != @DocumentId;',
         N'WHERE po.JobId = @ApJobId AND po.Status NOT IN (''Draft'',''Cancelled'') AND po.IsActive = 1 AND po.PoId != @DocumentId;'),

        (N'sp_ProcessApproval',
         N'''Cannot approve: PO would exceed the budget for this expense category (base currency). ''',
         N'''Cannot approve: PO would exceed the TOTAL budget for this job (base currency, excluding GST). '''),

        (N'sp_ProcessApproval',
         N'''Cannot approve: no approved budget line exists for the expense category on this job. Add a budget line first.''',
         N'''Cannot approve: this job has no approved budget. Add a budget line first.'''),

    ---------------------------------------------------------------- submit side
        (N'sp_SubmitForApproval',
         N'SELECT @SubBudgetExists = 1,',
         N'-- 2026-09-27: the budget is the JOB total, not one category (matches the print check).' + CHAR(10)
         + N'                SELECT @SubBudgetExists = CASE WHEN EXISTS (SELECT 1 FROM PROJ.TBL_JOB_BUDGET' + CHAR(10)
         + N'                        WHERE JobId = @PoJobId AND IsCurrent = 1) THEN 1 ELSE 0 END;' + CHAR(10)
         + N'                SELECT'),

        (N'sp_SubmitForApproval',
         N'@SubBudgeted = ISNULL(AmountInBaseCurrency, PROJ.fn_ToBase(ISNULL(BudgetedAmount, 0), ISNULL(ExchangeRate, @JobRate)))',
         N'@SubBudgeted = ISNULL(SUM(ISNULL(AmountInBaseCurrency, PROJ.fn_ToBase(ISNULL(BudgetedAmount, 0), ISNULL(ExchangeRate, @JobRate)))), 0)'),

        (N'sp_SubmitForApproval',
         N'FROM PROJ.TBL_JOB_BUDGET WHERE JobId = @PoJobId AND CostCategoryId = @PoCategoryId AND IsCurrent = 1;',
         N'FROM PROJ.TBL_JOB_BUDGET WHERE JobId = @PoJobId AND IsCurrent = 1;'),

        (N'sp_SubmitForApproval',
         N'WHERE po.JobId = @PoJobId AND po.ExpenseCategoryId = @PoCategoryId',
         N'WHERE po.JobId = @PoJobId'),

        (N'sp_SubmitForApproval',
         N'''Cannot submit: PO would exceed the budget for this expense category (base currency). ''',
         N'''Cannot submit: PO would exceed the TOTAL budget for this job (base currency, excluding GST). ''');

    DECLARE @nm SYSNAME, @old NVARCHAR(400), @rep NVARCHAR(MAX);
    DECLARE @def NVARCHAR(MAX), @new NVARCHAR(MAX);
    DECLARE @i INT = 1, @n INT, @pos INT, @scan INT;

    WHILE @i <= (SELECT MAX(seq) FROM @work)
    BEGIN
        SELECT @nm = proc_name, @old = anchor, @rep = replacement FROM @work WHERE seq = @i;

        SET @def = OBJECT_DEFINITION(OBJECT_ID('PROJ.' + @nm));
        IF @def IS NULL THROW 50160, 'A guard procedure was not found. Nothing changed.', 1;

        SET @n = (DATALENGTH(@def) - DATALENGTH(REPLACE(@def, @old, N''))) / DATALENGTH(@old);

        IF @n = 0
            PRINT @nm + ' : edit ' + CONVERT(varchar(2), @i) + ' already applied.';
        ELSE
        BEGIN
            IF @n <> 1 THROW 50161, 'Expected exactly 1 anchor. Nothing changed.', 1;

            SET @new = REPLACE(@def, @old, @rep);

            SET @scan = 1;
            WHILE 1 = 1
            BEGIN
                SET @pos = CHARINDEX(N'CREATE', @new, @scan);
                IF @pos = 0 THROW 50162, 'Could not find the CREATE keyword. Nothing changed.', 1;
                IF SUBSTRING(@new, @pos + 6, 40) LIKE N'%PROC%' BREAK;
                SET @scan = @pos + 6;
            END
            SET @new = STUFF(@new, @pos, 6, N'ALTER ');

            EXEC sp_executesql @new;
            PRINT @nm + ' : edit ' + CONVERT(varchar(2), @i) + ' applied.';
        END
        SET @i += 1;
    END

    COMMIT;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    PRINT 'FAILED - nothing was changed:';
    THROW;
END CATCH
GO

-- ── verification ────────────────────────────────────────────────────────────
SELECT o.name,
       CASE WHEN m.definition LIKE '%TOTAL budget for this job%' THEN 'OK - job level' ELSE 'NOT PATCHED' END AS level,
       CASE WHEN m.definition LIKE '%ExpenseCategoryId = @ApCategoryId%'
              OR m.definition LIKE '%ExpenseCategoryId = @PoCategoryId%'
            THEN 'STILL FILTERS BY CATEGORY' ELSE 'category filter removed' END AS committed_basis,
       CASE WHEN m.definition LIKE '%OrderedQty * pol.UnitPrice%' THEN 'pre-tax (no GST)' ELSE 'CHECK' END AS basis,
       CASE WHEN m.definition LIKE '%fn_ToBase%' THEN 'converts currency' ELSE 'CHECK' END AS fx,
       m.uses_quoted_identifier AS qi_on
FROM sys.sql_modules m JOIN sys.objects o ON o.object_id = m.object_id
WHERE o.name IN ('sp_ProcessApproval','sp_SubmitForApproval')
ORDER BY o.name;
GO
