-- 2026-11-04a: approvals stuck at a level that no longer exists (e.g. "Pending Level 4 Approval" after a 4 level policy was cut to 3).
--   Cause: a pending document keeps the level count it had when it was submitted (TBL_APPROVAL_TRANSACTION.TotalLevels).
--          After the policy loses its last level, the approver at the new last level is told "next is level 4", and nobody can act there.
--   1) sp_ProcessApproval now uses the policy's CURRENT last active level instead of the saved count (applies to every approval module).
--   2) Pending documents already stuck are repaired: TotalLevels = the policy's last active level; if the document is past it,
--      CurrentLevelNo goes back to that last level. The document status and the approval log are not touched.
--      Those documents are then approved once more by an approver of the last level, which completes them normally.
-- Idempotent. All or nothing. The procedure is located by an ASCII marker that must occur exactly once.
-- Run per database, one at a time. Run with sqlcmd -I.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

BEGIN TRY
    BEGIN TRAN;

    DECLARE @msg NVARCHAR(400), @def NVARCHAR(MAX), @cpos INT, @n INT, @m NVARCHAR(400), @block NVARCHAR(MAX);

    -- 1) sp_ProcessApproval ---------------------------------------------------
    SET @block = N'-- 2026-11-04a use the policy''s CURRENT last level, not the count saved when submitted
        SET @TotalLevels = ISNULL((SELECT MAX(LevelNo) FROM PROJ.TBL_APPROVAL_LEVEL WHERE PolicyId = @PolicyId AND IsActive = 1), @TotalLevels);
        ';
    SET @m = N'IF @ModuleId IS NULL';

    SET @def = OBJECT_DEFINITION(OBJECT_ID(N'proj.sp_ProcessApproval'));
    IF @def IS NULL BEGIN SET @msg = 'proj.sp_ProcessApproval not found.'; THROW 50001, @msg, 1; END

    IF CHARINDEX(N'2026-11-04a', @def) > 0
        PRINT 'sp_ProcessApproval: already applied.';
    ELSE
    BEGIN
        SET @n = (LEN(@def) - LEN(REPLACE(@def, @m, N''))) / LEN(@m);
        IF @n <> 1
        BEGIN SET @msg = CONCAT('sp_ProcessApproval: marker found ', @n, ' times, expected once - live definition differs from the one this patch was written from.'); THROW 50002, @msg, 1; END
        SET @def = REPLACE(@def, @m, @block + @m);
        SET @cpos = PATINDEX(N'%CREATE[ ]%PROCEDURE%' COLLATE Latin1_General_CS_AS, @def);
        IF @cpos = 0 BEGIN SET @msg = 'sp_ProcessApproval: CREATE PROCEDURE not found.'; THROW 50003, @msg, 1; END
        SET @def = STUFF(@def, @cpos, 6, N'ALTER');
        EXEC (@def);
        PRINT 'sp_ProcessApproval: altered.';
    END

    -- 2) repair pending documents already stuck ------------------------------
    SELECT t.TransactionId, t.DocumentNo, t.CurrentLevelNo AS OldLevel, t.TotalLevels AS OldTotal, x.MaxActiveLevel AS NewTotal,
           CASE WHEN t.CurrentLevelNo > x.MaxActiveLevel THEN x.MaxActiveLevel ELSE t.CurrentLevelNo END AS NewLevel
    INTO #fix
    FROM proj.TBL_APPROVAL_TRANSACTION t
    CROSS APPLY (SELECT MAX(l.LevelNo) AS MaxActiveLevel FROM proj.TBL_APPROVAL_LEVEL l WHERE l.PolicyId = t.PolicyId AND l.IsActive = 1) x
    WHERE t.CurrentStatus = 'Pending' AND x.MaxActiveLevel IS NOT NULL
      AND (t.CurrentLevelNo > x.MaxActiveLevel OR t.TotalLevels <> x.MaxActiveLevel);

    UPDATE t
    SET t.CurrentLevelNo = f.NewLevel, t.TotalLevels = f.NewTotal, t.ModifiedBy = N'PATCH 2026-11-04a', t.ModifiedDate = GETDATE()
    FROM proj.TBL_APPROVAL_TRANSACTION t
    JOIN #fix f ON f.TransactionId = t.TransactionId;
    PRINT CONCAT('Pending approvals repaired: ', @@ROWCOUNT);

    SELECT * FROM #fix ORDER BY DocumentNo;
    DROP TABLE #fix;

    COMMIT;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    THROW;
END CATCH
GO
