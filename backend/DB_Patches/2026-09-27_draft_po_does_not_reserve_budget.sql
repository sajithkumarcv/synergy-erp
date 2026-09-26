-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-09-27  Draft POs must not reserve budget.
--
-- The approval guards summed committed spend as  po.Status <> 'Cancelled'  which
-- INCLUDED Draft POs, while Job Overview (sp_GetJobBudgetBreakdown / VW_JOB_COST_ACTUAL)
-- excludes them. An unsubmitted draft therefore ate another PO's budget and nothing on
-- screen showed why: the grid said the category was under budget while submit/approve
-- refused with "would exceed the budget".
--
-- After this patch all three places agree: a Draft PO is NOT a commitment.
--   1. PROJ.sp_ProcessApproval    (approve guard)  - other POs: exclude Draft
--   2. PROJ.sp_SubmitForApproval  (submit guard)   - other POs: exclude Draft
--   3. PROJ.sp_GetPOBudgetCheck   (screen preview) - exclude Draft, EXCEPT the PO being
--      looked at (new optional @PoId), so the PO line editor still shows its own draft
--      lines eating into "Remaining" while you type. Both guards already add the
--      document's own value separately, so they need no such exception.
--
-- 1 and 2 are edited surgically from each procedure's LIVE definition (anchor-checked)
-- because those procedures are long and prod's copy may differ from dev. All-or-nothing:
-- a wrong anchor count THROWs and nothing is changed. Idempotent - running it twice
-- reports "already patched" and does nothing.
-- ─────────────────────────────────────────────────────────────────────────────
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

BEGIN TRY
    BEGIN TRAN;

    DECLARE @def NVARCHAR(MAX), @new NVARCHAR(MAX), @old NVARCHAR(400), @rep NVARCHAR(400);
    DECLARE @n INT, @p INT, @r INT, @plen INT, @pos INT;

    -- ── 1. PROJ.sp_ProcessApproval ───────────────────────────────────────────
    SET @def = OBJECT_DEFINITION(OBJECT_ID('PROJ.sp_ProcessApproval'));
    IF @def IS NULL THROW 50001, 'sp_ProcessApproval not found.', 1;

    SET @old = N'@ApCategoryId AND po.Status != ''Cancelled''';
    SET @rep = N'@ApCategoryId AND po.Status NOT IN (''Draft'',''Cancelled'')';

    IF CHARINDEX(@rep, @def) > 0
        PRINT 'sp_ProcessApproval   : already patched, left alone.';
    ELSE
    BEGIN
        SET @n = (DATALENGTH(@def) - DATALENGTH(REPLACE(@def, @old, N''))) / DATALENGTH(@old);
        IF @n <> 1 THROW 50002, 'sp_ProcessApproval: expected exactly 1 anchor, found a different number. Nothing changed.', 1;

        SET @new  = REPLACE(@def, @old, @rep);
        SET @p    = CHARINDEX(N'PROCEDURE', @new);
        SET @plen = @p - 1;
        SET @r    = CHARINDEX(N'ETAERC', REVERSE(LEFT(@new, @plen)));
        IF @r = 0 THROW 50003, 'sp_ProcessApproval: could not find the CREATE keyword. Nothing changed.', 1;
        SET @pos  = @plen - @r - 4;
        SET @new  = STUFF(@new, @pos, 6, N'ALTER ');
        EXEC sp_executesql @new;
        PRINT 'sp_ProcessApproval   : patched.';
    END

    -- ── 2. PROJ.sp_SubmitForApproval ─────────────────────────────────────────
    SET @def = OBJECT_DEFINITION(OBJECT_ID('PROJ.sp_SubmitForApproval'));
    IF @def IS NULL THROW 50004, 'sp_SubmitForApproval not found.', 1;

    SET @old = N'AND po.Status != ''Cancelled'' AND po.IsActive = 1 AND po.PoId != @DocumentId;';
    SET @rep = N'AND po.Status NOT IN (''Draft'',''Cancelled'') AND po.IsActive = 1 AND po.PoId != @DocumentId;';

    IF CHARINDEX(@rep, @def) > 0
        PRINT 'sp_SubmitForApproval : already patched, left alone.';
    ELSE
    BEGIN
        SET @n = (DATALENGTH(@def) - DATALENGTH(REPLACE(@def, @old, N''))) / DATALENGTH(@old);
        IF @n <> 1 THROW 50005, 'sp_SubmitForApproval: expected exactly 1 anchor, found a different number. Nothing changed.', 1;

        SET @new  = REPLACE(@def, @old, @rep);
        SET @p    = CHARINDEX(N'PROCEDURE', @new);
        SET @plen = @p - 1;
        SET @r    = CHARINDEX(N'ETAERC', REVERSE(LEFT(@new, @plen)));
        IF @r = 0 THROW 50006, 'sp_SubmitForApproval: could not find the CREATE keyword. Nothing changed.', 1;
        SET @pos  = @plen - @r - 4;
        SET @new  = STUFF(@new, @pos, 6, N'ALTER ');
        EXEC sp_executesql @new;
        PRINT 'sp_SubmitForApproval : patched.';
    END

    COMMIT;
    PRINT 'Guards committed.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    PRINT 'FAILED - nothing was changed:';
    THROW;
END CATCH
GO

-- ── 3. PROJ.sp_GetPOBudgetCheck ──────────────────────────────────────────────
-- Small enough to replace whole. New optional @PoId: the PO currently open on screen
-- still counts its own draft lines, every OTHER draft does not.
CREATE OR ALTER PROCEDURE proj.sp_GetPOBudgetCheck
    @JobId           NVARCHAR(50),
    @CostCategoryId  INT = NULL,   -- NULL = whole job (sum across all categories), was mandatory before
    @ExcludePoLineId INT = 0,
    @PoId            INT = 0       -- the PO being viewed/edited; its own Draft lines still count
AS
BEGIN
    SET NOCOUNT ON;

    -- All figures in BASE currency. Budget line carries its own currency/rate.
    DECLARE @JobRate      DECIMAL(18,6) = ISNULL((SELECT JobExcRate FROM proj.TBL_JOB WHERE JobId = @JobId), 1);
    DECLARE @Budgeted     DECIMAL(18,2) = 0;
    DECLARE @CategoryName NVARCHAR(200) = '';

    -- SUM (not a plain scalar assignment) since @CostCategoryId = NULL now
    -- matches every category's budget line for this job, not just one row.
    SELECT @Budgeted = ISNULL(SUM(ISNULL(AmountInBaseCurrency, proj.fn_ToBase(ISNULL(BudgetedAmount,0), ISNULL(ExchangeRate, @JobRate)))), 0)
    FROM proj.TBL_JOB_BUDGET
    WHERE JobId = @JobId
      AND (@CostCategoryId IS NULL OR CostCategoryId = @CostCategoryId)
      AND IsCurrent = 1;

    SELECT @CategoryName = ISNULL(CategoryName, '')
    FROM proj.TBL_JOB_EXPENSE_CATEGORY
    WHERE ExpenseCategoryId = @CostCategoryId;
    -- @CategoryName stays '' when @CostCategoryId IS NULL (whole-job check) -
    -- callers doing a whole-job check don't use this field.

    DECLARE @Committed DECIMAL(18,2) = 0;
    SELECT @Committed = ISNULL(SUM(proj.fn_ToBase(pol.OrderedQty * pol.UnitPrice, po.ExchangeRate)), 0)
    FROM proj.TBL_PURCHASE_ORDER      po
    JOIN proj.TBL_PURCHASE_ORDER_LINE pol
        ON pol.PoId = po.PoId AND pol.IsActive = 1
    WHERE po.JobId             = @JobId
      AND (@CostCategoryId IS NULL OR po.ExpenseCategoryId = @CostCategoryId)
      -- A Draft PO is not a commitment and must not reserve budget (2026-09-27).
      -- The one exception is the PO on screen, so its own lines still show up in
      -- "Remaining" while it is being built.
      AND (po.Status NOT IN ('Draft','Cancelled') OR po.PoId = @PoId)
      AND po.IsActive          = 1
      AND pol.PoLineId        != ISNULL(NULLIF(@ExcludePoLineId, 0), -1);

    SELECT
        @CategoryName          AS CategoryName,
        @Budgeted              AS Budgeted,
        @Committed             AS Committed,
        @Budgeted - @Committed AS Remaining;
END
GO

-- ── verification ─────────────────────────────────────────────────────────────
SELECT name,
       CASE WHEN OBJECT_DEFINITION(object_id) LIKE '%po.Status NOT IN (''Draft'',''Cancelled'')%'
            THEN 'OK - drafts excluded' ELSE 'NOT PATCHED' END AS result
FROM sys.procedures
WHERE name IN ('sp_ProcessApproval','sp_SubmitForApproval','sp_GetPOBudgetCheck')
ORDER BY name;
GO
