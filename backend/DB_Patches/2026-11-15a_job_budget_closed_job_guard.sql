-- 2026-11-15a: a closed job's budget cannot be changed (server side).
--   Context: the Budget tab is now shown read-only on Freezed / Completed / Cancelled jobs (it used to be hidden).
--   The budget procedures themselves had no closed-job check, so the hidden tab was the only protection.
--   Change: each budget procedure calls proj.sp_AssertJobOpen first (THROW 50003 "Job X is Cancelled. ...").
--     sp_ApproveJobBudget, sp_ReviseJobBudget, sp_SetJobBudget, sp_SetJobBudgetItem, sp_ImportJobBudgetItem: @JobId
--     sp_DeleteJobBudget: job of the TBL_JOB_BUDGET row; sp_DeleteJobBudgetItem: job of the TBL_JOB_BUDGET_ITEM row.
--   The block goes right after the procedure's single 'SET NOCOUNT ON;'.
-- Idempotent. All or nothing. Run per database, one at a time. Run with sqlcmd -I (or SSMS, SQLCMD Mode on).

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

BEGIN TRY
    BEGIN TRAN;

    DECLARE @msg NVARCHAR(400), @def NVARCHAR(MAX), @cpos INT, @n INT, @block NVARCHAR(MAX), @name NVARCHAR(200), @i INT = 1;
    DECLARE @m NVARCHAR(50) = N'SET NOCOUNT ON;';

    WHILE @i <= 7
    BEGIN
        SELECT @name = CASE @i
                WHEN 1 THEN N'proj.sp_ApproveJobBudget'
                WHEN 2 THEN N'proj.sp_ReviseJobBudget'
                WHEN 3 THEN N'proj.sp_SetJobBudget'
                WHEN 4 THEN N'proj.sp_SetJobBudgetItem'
                WHEN 5 THEN N'proj.sp_ImportJobBudgetItem'
                WHEN 6 THEN N'proj.sp_DeleteJobBudget'
                ELSE        N'proj.sp_DeleteJobBudgetItem' END;

        SET @block = CASE
            WHEN @i <= 5 THEN N'
    -- 2026-11-15a a closed job''s budget cannot be changed
    EXEC proj.sp_AssertJobOpen @JobId;'
            WHEN @i = 6 THEN N'
    -- 2026-11-15a a closed job''s budget cannot be changed
    DECLARE @GuardJobId NVARCHAR(50) = (SELECT JobId FROM proj.TBL_JOB_BUDGET WHERE JobBudgetId = @JobBudgetId);
    IF @GuardJobId IS NOT NULL EXEC proj.sp_AssertJobOpen @GuardJobId;'
            ELSE N'
    -- 2026-11-15a a closed job''s budget cannot be changed
    DECLARE @GuardJobId NVARCHAR(50) = (SELECT JobId FROM proj.TBL_JOB_BUDGET_ITEM WHERE BudgetItemId = @BudgetItemId);
    IF @GuardJobId IS NOT NULL EXEC proj.sp_AssertJobOpen @GuardJobId;' END;

        SET @def = OBJECT_DEFINITION(OBJECT_ID(@name));
        IF @def IS NULL BEGIN SET @msg = @name + N' not found.'; THROW 50001, @msg, 1; END

        IF CHARINDEX(N'2026-11-15a', @def) > 0
            PRINT @name + N': already applied.';
        ELSE
        BEGIN
            SET @n = (LEN(@def) - LEN(REPLACE(@def, @m, N''))) / LEN(@m);
            IF @n <> 1
            BEGIN SET @msg = CONCAT(@name, N': marker found ', @n, N' times, expected once - live definition differs from the one this patch was written from.'); THROW 50002, @msg, 1; END
            SET @def = REPLACE(@def, @m, @m + @block);
            SET @cpos = PATINDEX(N'%CREATE[ ]%PROCEDURE%' COLLATE Latin1_General_CS_AS, @def);
            IF @cpos = 0 BEGIN SET @msg = @name + N': CREATE PROCEDURE not found.'; THROW 50003, @msg, 1; END
            SET @def = STUFF(@def, @cpos, 6, N'ALTER');
            EXEC (@def);
            PRINT @name + N': altered.';
        END
        SET @i += 1;
    END

    COMMIT;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    THROW;
END CATCH
GO
