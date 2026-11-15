-- 2026-11-02e: a "Not Include in Costing" issue draws on the job's OWN job stock before the in-house source rule.
--   Problem: an item whose budget category matches an open in-house job was always treated as in-house stock,
--   so units bought for the job (GRN job stock) showed "Available (job stock): 0" and could not be issued.
--   Change: for an EXC_COSTING note, if the job has its own job stock of the item (ledger IsJobStock = 1, same JobId,
--   net of what was issued), the in-house rule is skipped for that item. Otherwise nothing changes.
--   Applies to sp_GetStockAvailability (screen figure) and sp_ConfirmStockIssue (the actual issue), same rule in both.
-- Idempotent. All or nothing. Each procedure is located by an ASCII marker that must occur exactly once.
-- Run per database, one at a time. Run with sqlcmd -I.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

BEGIN TRY
    BEGIN TRAN;

    DECLARE @msg NVARCHAR(400), @def NVARCHAR(MAX), @cpos INT, @n INT, @m NVARCHAR(400), @block NVARCHAR(MAX);

    -- 1) sp_GetStockAvailability -------------------------------------------
    SET @block = N'-- 2026-11-02e own job stock before the in-house rule
    DECLARE @OwnJobStock DECIMAL(18,4) = 0;
    IF @SourceJobId IS NOT NULL AND @CostingType = ''EXC_COSTING'' AND @JobId IS NOT NULL
    BEGIN
        SELECT @OwnJobStock =
            ISNULL(SUM(CASE WHEN QtyIn  > 0 AND IsJobStock = 1 AND JobId = @JobId THEN QtyIn  ELSE 0 END), 0)
          - ISNULL(SUM(CASE WHEN QtyOut > 0                    AND JobId = @JobId THEN QtyOut ELSE 0 END), 0)
        FROM proj.TBL_STOCK_LEDGER WHERE ItemId = @ItemId;
        IF @OwnJobStock > 0 SET @SourceJobId = NULL;
    END

    ';
    SET @m = N'IF @SourceJobId IS NOT NULL';

    SET @def = OBJECT_DEFINITION(OBJECT_ID(N'proj.sp_GetStockAvailability'));
    IF @def IS NULL BEGIN SET @msg = 'proj.sp_GetStockAvailability not found.'; THROW 50001, @msg, 1; END

    IF CHARINDEX(N'2026-11-02e', @def) > 0
        PRINT 'sp_GetStockAvailability: already applied.';
    ELSE
    BEGIN
        SET @n = (LEN(@def) - LEN(REPLACE(@def, @m, N''))) / LEN(@m);
        IF @n <> 1
        BEGIN SET @msg = CONCAT('sp_GetStockAvailability: marker found ', @n, ' times, expected once - live definition differs from the one this patch was written from.'); THROW 50002, @msg, 1; END
        SET @def = REPLACE(@def, @m, @block + @m);
        SET @cpos = PATINDEX(N'%CREATE[ ]%PROCEDURE%' COLLATE Latin1_General_CS_AS, @def);
        IF @cpos = 0 BEGIN SET @msg = 'sp_GetStockAvailability: CREATE PROCEDURE not found.'; THROW 50003, @msg, 1; END
        SET @def = STUFF(@def, @cpos, 6, N'ALTER');
        EXEC (@def);
        PRINT 'sp_GetStockAvailability: altered.';
    END

    -- 2) sp_ConfirmStockIssue ----------------------------------------------
    SET @block = N'-- 2026-11-02e own job stock before the in-house rule
            DECLARE @OwnJobStk DECIMAL(18,4);
            SET @OwnJobStk = 0;
            IF @SourceJobId IS NOT NULL AND @CostingType = ''EXC_COSTING'' AND @JobId IS NOT NULL
            BEGIN
                SELECT @OwnJobStk =
                    ISNULL(SUM(CASE WHEN QtyIn  > 0 AND IsJobStock = 1 AND JobId = @JobId THEN QtyIn  ELSE 0 END), 0)
                  - ISNULL(SUM(CASE WHEN QtyOut > 0                    AND JobId = @JobId THEN QtyOut ELSE 0 END), 0)
                FROM proj.TBL_STOCK_LEDGER WHERE ItemId = @ItemId;
                IF @OwnJobStk > 0 SET @SourceJobId = NULL;
            END

            ';
    SET @m = N'IF @SourceJobId IS NOT NULL';

    SET @def = OBJECT_DEFINITION(OBJECT_ID(N'proj.sp_ConfirmStockIssue'));
    IF @def IS NULL BEGIN SET @msg = 'proj.sp_ConfirmStockIssue not found.'; THROW 50001, @msg, 1; END

    IF CHARINDEX(N'2026-11-02e', @def) > 0
        PRINT 'sp_ConfirmStockIssue: already applied.';
    ELSE
    BEGIN
        SET @n = (LEN(@def) - LEN(REPLACE(@def, @m, N''))) / LEN(@m);
        IF @n <> 1
        BEGIN SET @msg = CONCAT('sp_ConfirmStockIssue: marker found ', @n, ' times, expected once - live definition differs from the one this patch was written from.'); THROW 50002, @msg, 1; END
        SET @def = REPLACE(@def, @m, @block + @m);
        SET @cpos = PATINDEX(N'%CREATE[ ]%PROCEDURE%' COLLATE Latin1_General_CS_AS, @def);
        IF @cpos = 0 BEGIN SET @msg = 'sp_ConfirmStockIssue: CREATE PROCEDURE not found.'; THROW 50003, @msg, 1; END
        SET @def = STUFF(@def, @cpos, 6, N'ALTER');
        EXEC (@def);
        PRINT 'sp_ConfirmStockIssue: altered.';
    END

    COMMIT;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    THROW;
END CATCH
GO
