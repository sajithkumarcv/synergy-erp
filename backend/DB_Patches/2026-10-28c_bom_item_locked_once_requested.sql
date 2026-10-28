-- 2026-10-28c: the item of a BOM line can no longer be changed once a PR, PO or receipt exists on it.
-- Found on the SYNERPINDIA restore: BOM lines 265 (BT26-600001) and 336 (EC26-300002) had their item changed by
-- dadasaheb.nalakol on 15 and 21 Oct, two months after PR-26-0052/53/54/78 were raised on them. sp_SetBomDetail's UPDATE sets
-- ItemId with no check, so the PRs kept the old item and the BOM showed another.
-- Fix: in sp_SetBomDetail's UPDATE branch, a changed ItemId is refused while PrCreatedQty, PoCreatedQty or BomReceivedQty is
-- above zero. To correct an item, cancel the PR lines first (that gives the quantity back), then edit the BOM.
-- Quantity, price, dates and the other fields stay editable as before. Existing data untouched.
-- Idempotent. All or nothing. Located by an ASCII marker that must occur exactly once.
-- Run per database, one at a time. Run with sqlcmd -I.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

BEGIN TRY
    BEGIN TRAN;

    DECLARE @def NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID(N'PROJ.sp_SetBomDetail'));
    DECLARE @tag NVARCHAR(100) = N'-- 2026-10-28 item locked once requested';
    DECLARE @marker NVARCHAR(200) = N'IF @BomRequestedQty < @CurrentPrQty';
    DECLARE @cpos INT;

    IF @def IS NULL THROW 50001, 'PROJ.sp_SetBomDetail not found.', 1;

    IF CHARINDEX(@tag, @def) > 0
        PRINT 'Already applied - nothing to do.';
    ELSE
    BEGIN
        IF (LEN(@def) - LEN(REPLACE(@def, @marker, N''))) / LEN(@marker) <> 1
            THROW 50002, 'Marker not found exactly once in sp_SetBomDetail - live definition differs from the one this patch was written from.', 1;

        DECLARE @block NVARCHAR(MAX) = N'
        -- 2026-10-28 item locked once requested
        IF EXISTS (SELECT 1 FROM proj.TBL_BOM_DETAILS
                   WHERE BomId = @BomId AND IsActive = 1 AND ItemId <> @ItemId
                     AND (ISNULL(PrCreatedQty, 0) > 0 OR ISNULL(PoCreatedQty, 0) > 0 OR ISNULL(BomReceivedQty, 0) > 0))
        BEGIN
            RAISERROR(''The item cannot be changed: PRs, POs or receipts already exist on this BOM line. Cancel the PR lines first, then edit the item.'', 16, 1);
            RETURN;
        END

        ';

        SET @def = REPLACE(@def, @marker, @block + @marker);
        SET @cpos = PATINDEX(N'%CREATE[ ]%PROCEDURE%' COLLATE Latin1_General_CS_AS, @def);
        IF @cpos = 0 THROW 50003, 'CREATE PROCEDURE not found.', 1;
        SET @def = STUFF(@def, @cpos, 6, N'ALTER');
        EXEC (@def);
        PRINT 'sp_SetBomDetail altered.';
    END

    COMMIT;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    THROW;
END CATCH
GO
