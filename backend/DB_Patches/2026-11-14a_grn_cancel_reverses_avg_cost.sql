-- 2026-11-14a: cancelling a GRN or a stock receipt takes that receipt out of the average cost.
--   Problem: the cancel reduced QtyOnHand but left AvgUnitCost as it was, so the cancelled price stayed
--   blended in (India 2026-11-13: item 116004 showed 41,350.16 instead of 38,332.82).
--   Change: before the quantity goes down, AvgUnitCost = (qty x avg - cancelled qty x its cost) / (qty - cancelled qty).
--   When nothing would be left, or the value would go to zero or below, the average is left as it was.
--   Applies to sp_ChangeGRNStatus (Received -> Cancelled, also used by sp_UnregisterGRN), sp_CancelGRN, sp_CancelStockReceipt.
-- Idempotent. All or nothing. Each procedure is located by an ASCII marker that must occur exactly once;
-- the block goes in front of the UPDATE proj.TBL_STOCK_BALANCE that holds the marker.
-- Run per database, one at a time. Run with sqlcmd -I.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

BEGIN TRY
    BEGIN TRAN;

    DECLARE @msg NVARCHAR(400), @def NVARCHAR(MAX), @cpos INT, @n INT, @m NVARCHAR(400), @block NVARCHAR(MAX),
            @p INT, @q INT, @u NVARCHAR(100) = N'UPDATE proj.TBL_STOCK_BALANCE', @proc NVARCHAR(200), @i INT = 1;

    SET @block = N'-- 2026-11-14a take the cancelled receipt out of the average cost
                UPDATE proj.TBL_STOCK_BALANCE
                SET    AvgUnitCost = CASE
                           WHEN ISNULL(QtyOnHand,0) - @RQtyIn > 0
                            AND ISNULL(QtyOnHand,0) * ISNULL(AvgUnitCost,0) - @RQtyIn * ISNULL(@RUnitCost,0) > 0
                           THEN ROUND((ISNULL(QtyOnHand,0) * ISNULL(AvgUnitCost,0) - @RQtyIn * ISNULL(@RUnitCost,0))
                                      / (ISNULL(QtyOnHand,0) - @RQtyIn), 4)
                           ELSE AvgUnitCost END
                WHERE  ItemId = @RItemId;

                ';

    WHILE @i <= 3
    BEGIN
        SELECT @proc = CASE @i WHEN 1 THEN N'proj.sp_ChangeGRNStatus' WHEN 2 THEN N'proj.sp_CancelGRN' ELSE N'proj.sp_CancelStockReceipt' END,
               @m    = CASE @i WHEN 1 THEN N'QtyOnHand=CASE WHEN ISNULL(QtyOnHand,0)-@RQtyIn<0'
                                       ELSE N'ISNULL(QtyOnHand,0) - @RQtyIn < 0' END;

        SET @def = OBJECT_DEFINITION(OBJECT_ID(@proc));
        IF @def IS NULL BEGIN SET @msg = @proc + N' not found.'; THROW 50001, @msg, 1; END

        IF CHARINDEX(N'2026-11-14a', @def) > 0
            PRINT @proc + N': already applied.';
        ELSE
        BEGIN
            SET @n = (LEN(@def) - LEN(REPLACE(@def, @m, N''))) / LEN(@m);
            IF @n <> 1
            BEGIN SET @msg = CONCAT(@proc, N': marker found ', @n, N' times, expected once - live definition differs from the one this patch was written from.'); THROW 50002, @msg, 1; END

            -- the UPDATE that holds the marker: last UPDATE proj.TBL_STOCK_BALANCE before it
            SET @p = CHARINDEX(@m, @def);
            SET @q = CHARINDEX(REVERSE(@u), REVERSE(LEFT(@def, @p - 1)));
            IF @q = 0 BEGIN SET @msg = @proc + N': UPDATE before the marker not found.'; THROW 50004, @msg, 1; END
            SET @q = @p - @q - LEN(@u) + 1;
            IF SUBSTRING(@def, @q, LEN(@u)) <> @u
            BEGIN SET @msg = @proc + N': UPDATE position check failed.'; THROW 50005, @msg, 1; END

            SET @def = STUFF(@def, @q, 0, @block);
            SET @cpos = PATINDEX(N'%CREATE[ ]%PROCEDURE%' COLLATE Latin1_General_CS_AS, @def);
            IF @cpos = 0 BEGIN SET @msg = @proc + N': CREATE PROCEDURE not found.'; THROW 50003, @msg, 1; END
            SET @def = STUFF(@def, @cpos, 6, N'ALTER');
            EXEC (@def);
            PRINT @proc + N': altered.';
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
