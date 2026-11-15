-- 2026-11-07a: Item Code on the item form.
--   * A typed item code is kept as typed (trimmed). It must be unique: a code already used by another item is refused with the
--     name of that item, instead of the raw unique-index error.
--   * A NEW item saved with a blank code gets one generated from its item id: ITM-000123 (6 digits, more when needed).
--   * An EDIT with a blank code keeps the code the item already has.
-- Only sp_SetItem changes. Existing items and codes are untouched. Idempotent. All or nothing.
-- The procedure is located by ASCII markers that must each occur exactly once. Run per database, one at a time. Run with sqlcmd -I.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

BEGIN TRY
    BEGIN TRAN;

    DECLARE @msg NVARCHAR(400), @def NVARCHAR(MAX), @cpos INT, @n INT, @m1 NVARCHAR(200), @m2 NVARCHAR(200), @b1 NVARCHAR(MAX), @b2 NVARCHAR(MAX);

    SET @m1 = N'IF @ItemId IS NULL OR @ItemId = 0';
    SET @b1 = N'-- 2026-11-07a item code: typed code kept and unique, blank on a new item generated, blank on an edit keeps the old code
    SET @ItemCode = NULLIF(LTRIM(RTRIM(ISNULL(@ItemCode, N''''))), N'''');
    IF @ItemCode IS NOT NULL AND EXISTS (SELECT 1 FROM proj.TBL_ITEM WHERE ItemCode = @ItemCode AND ItemId <> ISNULL(@ItemId, 0))
    BEGIN
        DECLARE @DupName NVARCHAR(200) = (SELECT TOP 1 ItemName FROM proj.TBL_ITEM WHERE ItemCode = @ItemCode AND ItemId <> ISNULL(@ItemId, 0));
        DECLARE @DupMsg NVARCHAR(500) = CONCAT(N''Item Code '', @ItemCode, N'' is already used by item '', @DupName, N''. Use a different code, or leave it blank to generate one.'');
        RAISERROR(@DupMsg, 16, 1); RETURN;
    END
    IF (@ItemId IS NULL OR @ItemId = 0) AND @ItemCode IS NULL SET @ItemCode = N''ITM-TEMP-'' + CONVERT(NVARCHAR(36), NEWID());
    IF @ItemId > 0 AND @ItemCode IS NULL SET @ItemCode = (SELECT ItemCode FROM proj.TBL_ITEM WHERE ItemId = @ItemId);

    ';
    SET @m2 = N'SELECT CAST(SCOPE_IDENTITY() AS NVARCHAR(20));';
    SET @b2 = N'DECLARE @NewItemId INT = SCOPE_IDENTITY();
        IF @ItemCode LIKE N''ITM-TEMP-%''
        BEGIN
            DECLARE @GenCode NVARCHAR(50) = N''ITM-'' + RIGHT(N''000000'' + CAST(@NewItemId AS NVARCHAR(20)), 6);
            IF EXISTS (SELECT 1 FROM proj.TBL_ITEM WHERE ItemCode = @GenCode AND ItemId <> @NewItemId) SET @GenCode = @GenCode + N''-A'';
            UPDATE proj.TBL_ITEM SET ItemCode = @GenCode WHERE ItemId = @NewItemId;
        END
        SELECT CAST(@NewItemId AS NVARCHAR(20));';

    SET @def = OBJECT_DEFINITION(OBJECT_ID(N'proj.sp_SetItem'));
    IF @def IS NULL BEGIN SET @msg = 'proj.sp_SetItem not found.'; THROW 50001, @msg, 1; END

    IF CHARINDEX(N'2026-11-07a', @def) > 0
        PRINT 'sp_SetItem: already applied.';
    ELSE
    BEGIN
        SET @n = (LEN(@def) - LEN(REPLACE(@def, @m1, N''))) / LEN(@m1);
        IF @n <> 1 BEGIN SET @msg = CONCAT('sp_SetItem: first marker found ', @n, ' times, expected once - live definition differs from the one this patch was written from.'); THROW 50002, @msg, 1; END
        SET @n = (LEN(@def) - LEN(REPLACE(@def, @m2, N''))) / LEN(@m2);
        IF @n <> 1 BEGIN SET @msg = CONCAT('sp_SetItem: second marker found ', @n, ' times, expected once - live definition differs from the one this patch was written from.'); THROW 50002, @msg, 1; END
        SET @def = REPLACE(@def, @m2, @b2);
        SET @def = REPLACE(@def, @m1, @b1 + @m1);
        SET @cpos = PATINDEX(N'%CREATE[ ]%PROCEDURE%' COLLATE Latin1_General_CS_AS, @def);
        IF @cpos = 0 BEGIN SET @msg = 'sp_SetItem: CREATE PROCEDURE not found.'; THROW 50003, @msg, 1; END
        SET @def = STUFF(@def, @cpos, 6, N'ALTER');
        EXEC (@def);
        PRINT 'sp_SetItem: altered.';
    END

    COMMIT;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    THROW;
END CATCH
GO
