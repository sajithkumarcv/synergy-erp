-- 2026-11-14f: a GRN line linked to a PO line always carries the PO line's unit price.
--   Problem: the GRN screen let the store type any unit price (e.g. from the supplier invoice); stock and average cost
--   were then valued at that typed price while the PO kept another (India: GRN-26-0224/0225/0226).
--   Change:
--     1. sp_SetGRNLine: when the line is linked to a PO line, @UnitPrice is replaced by that PO line's UnitPrice
--        (insert and edit). Lines without a PO line keep the price they are given.
--     2. sp_ChangeGRNStatus, Draft -> Received: before stock is posted, every PO-linked line of the GRN is set to the
--        PO line's current price, so a draft made before a PO amendment is received at the amended price.
--   A supplier price that differs from the PO must now go through Amend PO line (reason, password, approval check).
-- Idempotent. All or nothing. Each procedure is located by an ASCII marker that must occur exactly once.
-- Run per database, one at a time. Run with sqlcmd -I (or SSMS, SQLCMD Mode on).

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

BEGIN TRY
    BEGIN TRAN;

    DECLARE @msg NVARCHAR(400), @def NVARCHAR(MAX), @cpos INT, @n INT, @m NVARCHAR(400), @block NVARCHAR(MAX),
            @p INT, @q INT, @u NVARCHAR(100);

    -- 1) sp_SetGRNLine: before the insert/update branch -----------------------------------------
    SET @block = N'-- 2026-11-14f GRN price always equals the PO line price
    DECLARE @PoLineForPrice INT = NULLIF(@PoLineId, 0), @PoLinePrice DECIMAL(18,4) = NULL;
    IF ISNULL(@GrnDetailId, 0) > 0
        SELECT @PoLineForPrice = ISNULL(PoLineId, @PoLineForPrice) FROM proj.TBL_GRN_DETAIL WHERE GrnDetailId = @GrnDetailId;
    IF @PoLineForPrice IS NOT NULL
        SELECT @PoLinePrice = UnitPrice FROM proj.TBL_PURCHASE_ORDER_LINE WHERE PoLineId = @PoLineForPrice AND IsActive = 1;
    IF @PoLinePrice IS NOT NULL SET @UnitPrice = @PoLinePrice;

    ';
    SET @m = N'DECLARE @LineNum INT;';
    SET @u = N'IF @GrnDetailId IS NULL OR @GrnDetailId <= 0';

    SET @def = OBJECT_DEFINITION(OBJECT_ID(N'proj.sp_SetGRNLine'));
    IF @def IS NULL BEGIN SET @msg = 'proj.sp_SetGRNLine not found.'; THROW 50001, @msg, 1; END

    IF CHARINDEX(N'2026-11-14f', @def) > 0
        PRINT 'sp_SetGRNLine: already applied.';
    ELSE
    BEGIN
        SET @n = (LEN(@def) - LEN(REPLACE(@def, @m, N''))) / LEN(@m);
        IF @n <> 1
        BEGIN SET @msg = CONCAT('sp_SetGRNLine: marker found ', @n, ' times, expected once - live definition differs from the one this patch was written from.'); THROW 50002, @msg, 1; END

        -- the IF that opens the insert branch: last occurrence of @u before the marker
        SET @p = CHARINDEX(@m, @def);
        SET @q = CHARINDEX(REVERSE(@u), REVERSE(LEFT(@def, @p - 1)));
        IF @q = 0 BEGIN SET @msg = 'sp_SetGRNLine: insert branch before the marker not found.'; THROW 50004, @msg, 1; END
        SET @q = @p - @q - LEN(@u) + 1;
        IF SUBSTRING(@def, @q, LEN(@u)) <> @u
        BEGIN SET @msg = 'sp_SetGRNLine: insert branch position check failed.'; THROW 50005, @msg, 1; END

        SET @def = STUFF(@def, @q, 0, @block);
        SET @cpos = PATINDEX(N'%CREATE[ ]%PROCEDURE%' COLLATE Latin1_General_CS_AS, @def);
        IF @cpos = 0 BEGIN SET @msg = 'sp_SetGRNLine: CREATE PROCEDURE not found.'; THROW 50003, @msg, 1; END
        SET @def = STUFF(@def, @cpos, 6, N'ALTER');
        EXEC (@def);
        PRINT 'sp_SetGRNLine: altered.';
    END

    -- 2) sp_ChangeGRNStatus: Draft -> Received, before stock is posted ----------------------------
    SET @block = N'-- 2026-11-14f receive at the current PO line price
            UPDATE d
            SET    d.UnitPrice = pol.UnitPrice, d.ModifiedBy = @ChangedBy, d.ModifiedDate = GETDATE()
            FROM   proj.TBL_GRN_DETAIL d
            JOIN   proj.TBL_PURCHASE_ORDER_LINE pol ON pol.PoLineId = d.PoLineId AND pol.IsActive = 1
            WHERE  d.GrnId = @GrnId AND d.IsActive = 1 AND d.UnitPrice <> pol.UnitPrice;

            ';
    SET @m = N'DECLARE @PoRate DECIMAL(18,6) = 1;';

    SET @def = OBJECT_DEFINITION(OBJECT_ID(N'proj.sp_ChangeGRNStatus'));
    IF @def IS NULL BEGIN SET @msg = 'proj.sp_ChangeGRNStatus not found.'; THROW 50001, @msg, 1; END

    IF CHARINDEX(N'2026-11-14f', @def) > 0
        PRINT 'sp_ChangeGRNStatus: already applied.';
    ELSE
    BEGIN
        SET @n = (LEN(@def) - LEN(REPLACE(@def, @m, N''))) / LEN(@m);
        IF @n <> 1
        BEGIN SET @msg = CONCAT('sp_ChangeGRNStatus: marker found ', @n, ' times, expected once - live definition differs from the one this patch was written from.'); THROW 50002, @msg, 1; END
        SET @def = REPLACE(@def, @m, @block + @m);
        SET @cpos = PATINDEX(N'%CREATE[ ]%PROCEDURE%' COLLATE Latin1_General_CS_AS, @def);
        IF @cpos = 0 BEGIN SET @msg = 'sp_ChangeGRNStatus: CREATE PROCEDURE not found.'; THROW 50003, @msg, 1; END
        SET @def = STUFF(@def, @cpos, 6, N'ALTER');
        EXEC (@def);
        PRINT 'sp_ChangeGRNStatus: altered.';
    END

    COMMIT;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    THROW;
END CATCH
GO
