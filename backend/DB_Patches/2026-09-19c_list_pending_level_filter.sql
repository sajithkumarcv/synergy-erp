-- =====================================================================
-- 2026-09-19c  Approval-list status filters: "Pending Level N", multi-select,
--              and the level the badge shows
--
-- APPLY TO: SYNERP (dev) first. Production after sign-off.
--
-- SYMPTOM (user, PO list): ticking Pending Level 1 / 2 / 3 / 4 Approval in the
-- Status filter returns nothing. Found on the way: the Invoice and Issue Return
-- lists offer multi-select status boxes, but their queries take ONE exact status,
-- so ticking two boxes finds nothing (and the parameter is only 20-30 characters,
-- so a longer value would be cut off anyway).
--
-- CAUSE (pending level): the list filters on the stored status text. The text a
-- document gets while it waits for approval comes from
-- TBL_APPROVAL_LEVEL.PendingStatus, and on the active PO and PR policies every
-- level has PendingStatus = NULL, so the engine stores plain 'PendingApproval'
-- at every level. On dev the four pending POs are all 'PendingApproval' although
-- two are at level 3 (TBL_APPROVAL_TRANSACTION.CurrentLevelNo = 3). The real level
-- only lives on the approval transaction.
--
-- WHAT THIS SCRIPT DOES (read side only - nothing stored changes)
--  1. proj.fn_PendingApprovalLevel(@ModuleCode, @DocumentId): the one place that
--     says "which level is this document waiting at" (its Pending approval
--     transaction). Returns no row when the document is not pending.
--  2. proj.sp_GetApprovalLevels(@ModuleCode, @Ids): the same for a page of
--     documents, for the list badges (GET approval/levels).
--  3. The status filter of the PO, PR, Invoice, Manhour and Issue Return lists now
--     takes a comma-separated list AND, for a document whose status starts with
--     'Pending', also matches:
--         'PendingL<n>'      when the document is waiting at level n
--         'PendingApproval'  for any pending document
--     It is an extra OR, so exact matches still work and ticked boxes still union.
--  4. @Status widened to NVARCHAR(200) on the Invoice, Manhour, Issue Return lists.
--
-- NOT CHANGED: the stored status text (dashboards count Status='PendingApproval'
-- and the print watermark keys off 'Pending%'). The Job list has no status
-- filter of this kind.
--
-- HOW: surgical, anchor-checked ALTERs (each proc is patched from its LIVE
-- definition; if an anchor is not found the expected number of times the script
-- STOPS instead of guessing). Idempotent - a proc that already calls
-- fn_PendingApprovalLevel is skipped.
-- Pre-flight lengths on dev before this script:
--   sp_SearchPOs 8412, sp_SearchPRs 3843 (each has the status filter twice:
--   row count + page), sp_SearchInvoices 3166, sp_SearchManhours 3263,
--   sp_SearchIssueReturns 2582.
-- =====================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- ── 1. which level is a pending document at ──────────────────────────
CREATE OR ALTER FUNCTION proj.fn_PendingApprovalLevel (@ModuleCode NVARCHAR(20), @DocumentId INT)
RETURNS TABLE
AS RETURN
(
    SELECT TOP 1 atx.CurrentLevelNo AS LevelNo, atx.TotalLevels AS TotalLevels
    FROM   proj.TBL_APPROVAL_TRANSACTION atx
    JOIN   proj.TBL_APPROVAL_MODULE      am ON am.ModuleId = atx.ModuleId
    WHERE  am.ModuleCode    = @ModuleCode
      AND  atx.DocumentId   = @DocumentId
      AND  atx.CurrentStatus = 'Pending'
    ORDER BY atx.TransactionId DESC
);
GO

-- ── 2. levels for a page of documents (list badges) ──────────────────
CREATE OR ALTER PROCEDURE proj.sp_GetApprovalLevels
    @ModuleCode NVARCHAR(20),
    @Ids        NVARCHAR(MAX)          -- comma-separated document ids
AS
BEGIN
    SET NOCOUNT ON;
    SELECT CAST(atx.DocumentId AS INT) AS DocumentId,
           atx.CurrentLevelNo          AS LevelNo,
           atx.TotalLevels             AS TotalLevels
    FROM   proj.TBL_APPROVAL_TRANSACTION atx
    JOIN   proj.TBL_APPROVAL_MODULE      am ON am.ModuleId = atx.ModuleId AND am.ModuleCode = @ModuleCode
    WHERE  atx.CurrentStatus = 'Pending'
      AND  atx.DocumentId IN (SELECT TRY_CAST(LTRIM(RTRIM(value)) AS INT)
                              FROM   STRING_SPLIT(@Ids, ',')
                              WHERE  TRY_CAST(LTRIM(RTRIM(value)) AS INT) IS NOT NULL);
END
GO

-- ── 3 + 4. the list procedures ───────────────────────────────────────
DECLARE @tpl NVARCHAR(MAX) = N'
           OR ({STAT} LIKE ''Pending%'' AND EXISTS (SELECT 1 FROM proj.fn_PendingApprovalLevel(''{MOD}'', {DOC}) pl WHERE EXISTS (SELECT 1 FROM STRING_SPLIT(@Status, '','') sv WHERE LTRIM(RTRIM(sv.value)) IN (N''PendingApproval'', N''PendingL'' + CAST(pl.LevelNo AS NVARCHAR(3))))))';
DECLARE @csv NVARCHAR(200) = N'IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@Status, '','')) ';

DECLARE @P TABLE (id INT IDENTITY(1,1), proc_ SYSNAME, anchor NVARCHAR(400), repl NVARCHAR(MAX), expected INT);

-- PO / PR: the predicate already takes a CSV; extend its tail (count query + page query = 2)
INSERT @P (proc_, anchor, repl, expected) VALUES
 (N'proj.sp_SearchPOs', N'FROM STRING_SPLIT(@Status, '','')))',
    N'FROM STRING_SPLIT(@Status, '',''))' + REPLACE(REPLACE(REPLACE(@tpl, N'{STAT}', N'po.Status'), N'{MOD}', N'PO'), N'{DOC}', N'po.PoId') + N')', 2),
 (N'proj.sp_SearchPRs', N'FROM STRING_SPLIT(@Status, '','')))',
    N'FROM STRING_SPLIT(@Status, '',''))' + REPLACE(REPLACE(REPLACE(@tpl, N'{STAT}', N'pr.Status'), N'{MOD}', N'PR'), N'{DOC}', N'pr.PrId') + N')', 2);

-- Invoice / Manhour / Issue Return: exact single status -> CSV + pending level, and a wider parameter
INSERT @P (proc_, anchor, repl, expected) VALUES
 (N'proj.sp_SearchInvoices', N'AND (@Status     IS NULL OR i.Status      = @Status)',
    N'AND (@Status     IS NULL OR i.Status ' + @csv + REPLACE(REPLACE(REPLACE(@tpl, N'{STAT}', N'i.Status'), N'{MOD}', N'INV'), N'{DOC}', N'i.InvoiceId') + N')', 1),
 (N'proj.sp_SearchInvoices', N'@Status        NVARCHAR(20)  = NULL', N'@Status        NVARCHAR(200) = NULL', 1),

 (N'proj.sp_SearchManhours', N'AND (@Status    IS NULL OR Status    = @Status)',
    N'AND (@Status    IS NULL OR Status ' + @csv + REPLACE(REPLACE(REPLACE(@tpl, N'{STAT}', N'Status'), N'{MOD}', N'MH'), N'{DOC}', N'BatchId') + N')', 1),
 (N'proj.sp_SearchManhours', N'@Status        NVARCHAR(20)  = NULL', N'@Status        NVARCHAR(200) = NULL', 1),

 (N'proj.sp_SearchIssueReturns', N'AND (@Status     IS NULL OR r.Status     = @Status)',
    N'AND (@Status     IS NULL OR r.Status ' + @csv + REPLACE(REPLACE(REPLACE(@tpl, N'{STAT}', N'r.Status'), N'{MOD}', N'IRN'), N'{DOC}', N'r.ReturnId') + N')', 1),
 (N'proj.sp_SearchIssueReturns', N'@Status       NVARCHAR(30)  = NULL', N'@Status       NVARCHAR(200) = NULL', 1);

DECLARE @proc SYSNAME, @def NVARCHAR(MAX), @anchor NVARCHAR(400), @repl NVARCHAR(MAX), @expected INT, @found INT, @createPos INT;

DECLARE pc CURSOR LOCAL FAST_FORWARD FOR SELECT DISTINCT proc_ FROM @P;
OPEN pc; FETCH NEXT FROM pc INTO @proc;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @def = OBJECT_DEFINITION(OBJECT_ID(@proc));
    IF @def IS NULL
    BEGIN
        DECLARE @m1 NVARCHAR(200) = @proc + N' not found.';
        THROW 51000, @m1, 1;
    END

    IF CHARINDEX(N'fn_PendingApprovalLevel', @def) > 0
        PRINT @proc + ' already patched - nothing to do.';
    ELSE
    BEGIN
        DECLARE ac CURSOR LOCAL FAST_FORWARD FOR SELECT anchor, repl, expected FROM @P WHERE proc_ = @proc ORDER BY id;
        OPEN ac; FETCH NEXT FROM ac INTO @anchor, @repl, @expected;
        WHILE @@FETCH_STATUS = 0
        BEGIN
            SET @found = (LEN(@def) - LEN(REPLACE(@def, @anchor, N''))) / LEN(@anchor);
            IF @found <> @expected
            BEGIN
                DECLARE @m2 NVARCHAR(400) = @proc + N': expected ' + CAST(@expected AS NVARCHAR(5)) + N' x [' + @anchor
                                          + N'] but found ' + CAST(@found AS NVARCHAR(5)) + N'. Inspect the procedure and patch by hand.';
                THROW 51001, @m2, 1;
            END
            SET @def = REPLACE(@def, @anchor, @repl);
            FETCH NEXT FROM ac INTO @anchor, @repl, @expected;
        END
        CLOSE ac; DEALLOCATE ac;

        SET @createPos = PATINDEX(N'%CREATE[ ]%PROCEDURE%', @def);
        IF @createPos = 0
        BEGIN
            DECLARE @m3 NVARCHAR(200) = N'CREATE PROCEDURE header not found in ' + @proc;
            THROW 51002, @m3, 1;
        END
        SET @def = STUFF(@def, @createPos, LEN(N'CREATE'), N'ALTER');
        EXEC sp_executesql @def;
        PRINT @proc + ' patched.';
    END
    FETCH NEXT FROM pc INTO @proc;
END
CLOSE pc; DEALLOCATE pc;
GO

-- ── verification ─────────────────────────────────────────────────────
SELECT Item = 'fn_PendingApprovalLevel', Status = CASE WHEN OBJECT_ID('proj.fn_PendingApprovalLevel') IS NOT NULL THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'sp_GetApprovalLevels', CASE WHEN OBJECT_ID('proj.sp_GetApprovalLevels', 'P') IS NOT NULL THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'sp_SearchPOs',           CASE WHEN CHARINDEX('fn_PendingApprovalLevel', ISNULL(OBJECT_DEFINITION(OBJECT_ID('proj.sp_SearchPOs')), '')) > 0 THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'sp_SearchPRs',           CASE WHEN CHARINDEX('fn_PendingApprovalLevel', ISNULL(OBJECT_DEFINITION(OBJECT_ID('proj.sp_SearchPRs')), '')) > 0 THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'sp_SearchInvoices',      CASE WHEN CHARINDEX('fn_PendingApprovalLevel', ISNULL(OBJECT_DEFINITION(OBJECT_ID('proj.sp_SearchInvoices')), '')) > 0 THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'sp_SearchManhours',      CASE WHEN CHARINDEX('fn_PendingApprovalLevel', ISNULL(OBJECT_DEFINITION(OBJECT_ID('proj.sp_SearchManhours')), '')) > 0 THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'sp_SearchIssueReturns',  CASE WHEN CHARINDEX('fn_PendingApprovalLevel', ISNULL(OBJECT_DEFINITION(OBJECT_ID('proj.sp_SearchIssueReturns')), '')) > 0 THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT '@Status widened (INV/MH/IRN)',
       CASE WHEN (SELECT COUNT(*) FROM sys.parameters p WHERE p.name = '@Status' AND p.max_length = 400
                    AND OBJECT_NAME(p.object_id) IN ('sp_SearchInvoices', 'sp_SearchManhours', 'sp_SearchIssueReturns')) = 3
            THEN 'OK' ELSE 'CHECK' END;
GO
