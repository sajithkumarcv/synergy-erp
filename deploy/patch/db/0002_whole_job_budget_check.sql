/* ─────────────────────────────────────────────────────────────────────────
   0002_whole_job_budget_check.sql

   proj.sp_GetPOBudgetCheck: @CostCategoryId is now optional. Passing NULL
   sums budget and committed spend across every category on the job instead
   of just one — used by PoDetailPage's whole-job over-budget check (forces
   a draft/watermarked print while the PO's own category is over budget,
   even if approved via the budget-password override, until the job's total
   budget covers it). Backward compatible — existing callers passing a
   category behave identically.

   Run against every SYNERP-based DB (dev + production).
   ───────────────────────────────────────────────────────────────────────── */
IF EXISTS (SELECT 1 FROM proj.TBL_DB_PATCH WHERE PatchNo = 2)
BEGIN
    PRINT 'Patch 2 already applied — skipping.';
    RETURN;
END
GO

ALTER PROCEDURE proj.sp_GetPOBudgetCheck
    @JobId           NVARCHAR(50),
    @CostCategoryId  INT = NULL,   -- NULL = whole job (sum across all categories), was mandatory before
    @ExcludePoLineId INT = 0
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
    -- @CategoryName stays '' when @CostCategoryId IS NULL (whole-job check) —
    -- callers doing a whole-job check don't use this field.

    DECLARE @Committed DECIMAL(18,2) = 0;
    SELECT @Committed = ISNULL(SUM(proj.fn_ToBase(pol.OrderedQty * pol.UnitPrice, po.ExchangeRate)), 0)
    FROM proj.TBL_PURCHASE_ORDER      po
    JOIN proj.TBL_PURCHASE_ORDER_LINE pol
        ON pol.PoId = po.PoId AND pol.IsActive = 1
    WHERE po.JobId             = @JobId
      AND (@CostCategoryId IS NULL OR po.ExpenseCategoryId = @CostCategoryId)
      AND po.Status           != 'Cancelled'
      AND po.IsActive          = 1
      AND pol.PoLineId        != ISNULL(NULLIF(@ExcludePoLineId, 0), -1);

    SELECT
        @CategoryName          AS CategoryName,
        @Budgeted              AS Budgeted,
        @Committed             AS Committed,
        @Budgeted - @Committed AS Remaining;
END
GO

IF NOT EXISTS (SELECT 1 FROM proj.TBL_DB_PATCH WHERE PatchNo = 2)
    INSERT proj.TBL_DB_PATCH (PatchNo, FileName, Description)
    VALUES (2, N'0002_whole_job_budget_check.sql',
            N'sp_GetPOBudgetCheck: @CostCategoryId made optional, NULL sums across the whole job.');
GO
PRINT 'Patch 2 applied.';
