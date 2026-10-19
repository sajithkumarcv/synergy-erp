/* =====================================================================================================
   A REJECTED PO must not reserve job budget.

   Found 2026-10-12 on SYNERPINDIA job IH26-500005: the approval guard's "Already committed" included a
   Rejected PO (140,000) because every commitment filter only skipped 'Draft' and 'Cancelled'.
   fn_JobItemCommitted already skips Rejected; this brings the rest in line.

   Edits the LIVE text of 8 objects in place (adds 'Rejected' to the excluded statuses). If an expected line is
   not found exactly once the whole script stops and NOTHING is changed. Safe to run twice.
     Budget checks : sp_ProcessApproval, sp_SubmitForApproval, sp_GetPOBudgetCheck
     Job cost views: sp_GetJobOverview, sp_GetJobBudgetBreakdown, VW_JOB_COST_ACTUAL, vw_AlertJobBudget,
                     sp_ReportOpenPoCommitment
   NOT touched on purpose: price history / vendor scorecard / analytics / backlog (not budget commitments).
   ===================================================================================================== */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
GO

DECLARE @T TABLE (Obj NVARCHAR(128), Anchor NVARCHAR(200), Repl NVARCHAR(200));
INSERT INTO @T VALUES
 (N'sp_ProcessApproval',          N'po.Status NOT IN (''Draft'',''Cancelled'')',   N'po.Status NOT IN (''Draft'',''Cancelled'',''Rejected'')'),
 (N'sp_SubmitForApproval',        N'po.Status NOT IN (''Draft'',''Cancelled'')',   N'po.Status NOT IN (''Draft'',''Cancelled'',''Rejected'')'),
 (N'sp_GetPOBudgetCheck',         N'po.Status NOT IN (''Draft'',''Cancelled'')',   N'po.Status NOT IN (''Draft'',''Cancelled'',''Rejected'')'),
 (N'sp_GetJobOverview',           N'po.Status NOT IN (''Draft'',''Cancelled'')',   N'po.Status NOT IN (''Draft'',''Cancelled'',''Rejected'')'),
 (N'sp_GetJobBudgetBreakdown',    N'po.Status NOT IN (''Draft'',''Cancelled'')',   N'po.Status NOT IN (''Draft'',''Cancelled'',''Rejected'')'),
 (N'VW_JOB_COST_ACTUAL',          N'po.Status NOT IN (''Draft'',''Cancelled'')',   N'po.Status NOT IN (''Draft'',''Cancelled'',''Rejected'')'),
 (N'sp_ReportOpenPoCommitment',   N'po.Status NOT IN (''Draft'',''Cancelled'')',   N'po.Status NOT IN (''Draft'',''Cancelled'',''Rejected'')'),
 (N'vw_AlertJobBudget',           N'po.Status NOT IN (''Cancelled'', ''Draft'')',  N'po.Status NOT IN (''Cancelled'', ''Draft'', ''Rejected'')');

DECLARE @Obj NVARCHAR(128), @A NVARCHAR(200), @R NVARCHAR(200), @def NVARCHAR(MAX), @n INT, @pos INT, @sql NVARCHAR(MAX);

BEGIN TRAN;

DECLARE c CURSOR LOCAL FAST_FORWARD FOR SELECT Obj, Anchor, Repl FROM @T;
OPEN c;
FETCH NEXT FROM c INTO @Obj, @A, @R;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @def = OBJECT_DEFINITION(OBJECT_ID(N'PROJ.' + @Obj));
    IF @def IS NULL BEGIN SET @sql = @Obj + N' not found. Nothing changed.'; THROW 50001, @sql, 1; END

    IF CHARINDEX(@R, @def) > 0
        PRINT @Obj + ' - already patched, skipped.';
    ELSE
    BEGIN
        SET @n = (LEN(@def) - LEN(REPLACE(@def, @A, N''))) / LEN(@A);
        IF @n <> 1 BEGIN SET @sql = @Obj + N': expected line found ' + CAST(@n AS NVARCHAR(10)) + N' times (need exactly 1). Nothing changed.'; THROW 50002, @sql, 1; END

        SET @def = REPLACE(@def, @A, @R);
        SET @pos = CHARINDEX(N'CREATE', @def);
        IF @pos = 0 OR SUBSTRING(@def, @pos, 40) NOT LIKE N'%PROC%' AND SUBSTRING(@def, @pos, 40) NOT LIKE N'%VIEW%'
            BEGIN SET @sql = @Obj + N': cannot find its CREATE header. Nothing changed.'; THROW 50003, @sql, 1; END
        IF SUBSTRING(@def, @pos, 15) NOT LIKE N'CREATE OR ALTER%'
            SET @def = STUFF(@def, @pos, 6, N'ALTER');
        EXEC sys.sp_executesql @def;
        PRINT @Obj + ' - patched.';
    END
    FETCH NEXT FROM c INTO @Obj, @A, @R;
END
CLOSE c; DEALLOCATE c;

COMMIT;
GO

SELECT o.name,
       CASE WHEN OBJECT_DEFINITION(o.object_id) LIKE N'%po.Status NOT IN (''Draft'',''Cancelled'',''Rejected'')%'
                 OR OBJECT_DEFINITION(o.object_id) LIKE N'%po.Status NOT IN (''Cancelled'', ''Draft'', ''Rejected'')%' THEN 'PATCHED' ELSE 'NOT PATCHED' END AS state
FROM sys.objects o
WHERE o.object_id IN (OBJECT_ID(N'PROJ.sp_ProcessApproval'), OBJECT_ID(N'PROJ.sp_SubmitForApproval'), OBJECT_ID(N'PROJ.sp_GetPOBudgetCheck'),
      OBJECT_ID(N'PROJ.sp_GetJobOverview'), OBJECT_ID(N'PROJ.sp_GetJobBudgetBreakdown'), OBJECT_ID(N'PROJ.VW_JOB_COST_ACTUAL'),
      OBJECT_ID(N'PROJ.vw_AlertJobBudget'), OBJECT_ID(N'PROJ.sp_ReportOpenPoCommitment'))
ORDER BY o.name;
GO
