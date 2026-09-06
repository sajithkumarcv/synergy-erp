/* ============================================================================
   In-house jobs: the job's Budget Header is a DEFAULT, not a lock

   BEFORE: sp_ImportJobBudgetItem forced every imported row onto the job's own
   header whenever the job type does not require costing:

       IF @Costing = 0 AND @JobCat IS NOT NULL
           SET @CatId = @JobCat;          -- sheet's BudgetHeader column ignored

   So an In House job (IsCostingRequired = 0, TBL_JOB.BudgetCategoryId set)
   could only ever accumulate budget under that one header - e.g. IH26-500002
   was locked to BOUGHT_OUT - even when the import sheet named another header.

   AFTER: the sheet's BudgetHeader always wins. The job's linked header is used
   only when the row leaves BudgetHeader blank, so existing single-header sheets
   keep importing exactly as before while multi-header sheets now work.

   Nothing else in the budget chain restricted headers: sp_GetJobBudget already
   returns every active UsedForBudget category, and sp_SetJobBudget /
   sp_SetJobBudgetItem never look at TBL_JOB.BudgetCategoryId. The rest of the
   restriction was frontend-only (JobBudgetTab.js / BudgetImportModal.js).

   HOW THIS SCRIPT WORKS - read before running:
   It does NOT contain a retyped copy of the procedure. It reads the CURRENT
   definition out of sys.sql_modules, replaces one block, and re-executes it as
   ALTER. If the block is not found (already patched, or the proc has diverged
   on this database) it stops without changing anything.

   Idempotent. Safe to re-run. Affects sp_ImportJobBudgetItem only.
   ============================================================================ */

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
GO

DECLARE @def   NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID('proj.sp_ImportJobBudgetItem'));
DECLARE @old   NVARCHAR(MAX);
DECLARE @new   NVARCHAR(MAX);
DECLARE @pos   INT;

IF @def IS NULL
BEGIN
    RAISERROR('proj.sp_ImportJobBudgetItem not found on this database - nothing done.', 16, 1);
    RETURN;
END

SET @old = N'    IF @Costing = 0 AND @JobCat IS NOT NULL
        SET @CatId = @JobCat;
    ELSE
        SET @CatId = (SELECT TOP 1 ExpenseCategoryId FROM proj.TBL_JOB_EXPENSE_CATEGORY';

SET @new = N'    -- The sheet''s BudgetHeader always wins. A job with its own linked header
    -- (TBL_JOB.BudgetCategoryId) uses it only as the fallback for blank rows -
    -- a default, not a lock - so in-house jobs budget across as many headers as
    -- they need. @Costing is deliberately no longer part of this decision.
    IF NULLIF(LTRIM(RTRIM(ISNULL(@BudgetHeader, N))), N) IS NULL
        SET @CatId = @JobCat;
    ELSE
        SET @CatId = (SELECT TOP 1 ExpenseCategoryId FROM proj.TBL_JOB_EXPENSE_CATEGORY';

IF CHARINDEX(@new, @def) > 0
BEGIN
    PRINT 'sp_ImportJobBudgetItem already patched - nothing done.';
    RETURN;
END

IF CHARINDEX(@old, @def) = 0
BEGIN
    RAISERROR('Expected header-resolution block not found in sp_ImportJobBudgetItem - proc has diverged. Nothing changed; patch it by hand.', 16, 1);
    RETURN;
END

SET @def = REPLACE(@def, @old, @new);

-- CREATE PROCEDURE -> ALTER PROCEDURE (first occurrence only)
SET @pos = CHARINDEX(N'CREATE', @def);
IF @pos = 0
BEGIN
    RAISERROR('Could not locate CREATE in the procedure definition - nothing changed.', 16, 1);
    RETURN;
END
SET @def = STUFF(@def, @pos, 6, N'ALTER');

EXEC sp_executesql @def;
PRINT 'sp_ImportJobBudgetItem patched: BudgetHeader column now wins, job header is the fallback.';
GO

/* ---------------------------------------------------------------------------
   Verify
   --------------------------------------------------------------------------- */
SELECT CASE WHEN CHARINDEX(N'@Costing is deliberately no longer part of this decision',
                           OBJECT_DEFINITION(OBJECT_ID('proj.sp_ImportJobBudgetItem'))) > 0
            THEN 'OK - patched' ELSE 'NOT PATCHED' END AS Result;
GO
