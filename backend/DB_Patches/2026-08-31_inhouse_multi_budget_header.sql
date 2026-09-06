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
   definition out of sys.sql_modules, replaces ONE LINE, and re-executes it as
   ALTER. If the line is not found (already patched, or the proc has diverged on
   this database) it stops without changing anything.

   Only the IF CONDITION changes. Both branches - SET @CatId = @JobCat, and the
   lookup by @BudgetHeader - are left exactly as they are, which is why a
   single-line anchor is enough.

   >> The anchor is deliberately ONE line. An earlier revision anchored on a
   >> four-line block and aborted on SYNERPUAE with "proc has diverged" even
   >> though the procedure was identical - its stored definition uses different
   >> line endings (CRLF vs LF) from the database this was written against, and
   >> CHARINDEX cannot match a multi-line literal across that difference. A
   >> single-line anchor contains no line ending and cannot fail that way.

   Idempotent. Safe to re-run. Affects sp_ImportJobBudgetItem only.
   ============================================================================ */

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
GO

DECLARE @def NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID('proj.sp_ImportJobBudgetItem'));
DECLARE @old NVARCHAR(MAX);
DECLARE @new NVARCHAR(MAX);
DECLARE @pos INT;
DECLARE @p   INT;

IF @def IS NULL
BEGIN
    RAISERROR('proj.sp_ImportJobBudgetItem not found on this database - nothing done.', 16, 1);
    RETURN;
END

IF CHARINDEX(N'@Costing is deliberately no longer part of this decision', @def) > 0
BEGIN
    PRINT 'sp_ImportJobBudgetItem already patched - nothing done.';
    RETURN;
END

SET @old = N'    IF @Costing = 0 AND @JobCat IS NOT NULL';

SET @new = N'    -- The sheet''s BudgetHeader always wins. A job with its own linked header
    -- (TBL_JOB.BudgetCategoryId) uses it only as the fallback for blank rows -
    -- a default, not a lock - so in-house jobs budget across as many headers as
    -- they need. @Costing is deliberately no longer part of this decision.
    IF NULLIF(LTRIM(RTRIM(ISNULL(@BudgetHeader, N''''))), N'''') IS NULL';

IF CHARINDEX(@old, @def) = 0
BEGIN
    RAISERROR('Expected IF condition not found in sp_ImportJobBudgetItem - proc has diverged. Nothing changed; patch it by hand.', 16, 1);
    RETURN;
END

SET @def = REPLACE(@def, @old, @new);

-- CREATE PROCEDURE -> ALTER PROCEDURE. The keyword is not always at position 1
-- (a comment header from an earlier patch can precede it), so find the CREATE
-- that actually begins the CREATE PROCEDURE statement.
SET @p   = 1;
SET @pos = 0;
WHILE 1 = 1
BEGIN
    SET @p = CHARINDEX(N'CREATE', @def, @p);
    IF @p = 0 BREAK;
    IF SUBSTRING(@def, @p, 40) LIKE N'CREATE%PROC%'
    BEGIN
        SET @pos = @p;
        BREAK;
    END
    SET @p = @p + 6;
END

IF @pos = 0
BEGIN
    RAISERROR('Could not locate the CREATE PROCEDURE keyword - nothing changed.', 16, 1);
    RETURN;
END

SET @def = STUFF(@def, @pos, 6, N'ALTER');

EXEC sp_executesql @def;
PRINT 'sp_ImportJobBudgetItem patched: BudgetHeader column now wins, job header is the fallback.';
GO

/* ---------------------------------------------------------------------------
   Verify - must return 'OK - patched'
   --------------------------------------------------------------------------- */
SELECT CASE WHEN CHARINDEX(N'@Costing is deliberately no longer part of this decision',
                           OBJECT_DEFINITION(OBJECT_ID('proj.sp_ImportJobBudgetItem'))) > 0
            THEN 'OK - patched' ELSE 'NOT PATCHED' END AS Result;
GO
