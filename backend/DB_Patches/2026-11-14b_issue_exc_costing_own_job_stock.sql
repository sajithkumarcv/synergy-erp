-- 2026-11-14b: a "Not Include in Costing" (EXC_COSTING) issue can only take the job's OWN job stock.
--   Problem: sp_ConfirmStockIssue checked QtyJobStock of the item across ALL jobs, so job A could issue
--   units that were bought for job B.
--   Change: before job stock is reduced, the job's own job stock of the item is read from the ledger
--   (IsJobStock = 1, same JobId, in minus out). If it is less than the quantity, the issue is refused.
-- Idempotent. All or nothing. Located by an ASCII marker that must occur exactly once;
-- the block goes in front of the UPDATE proj.TBL_STOCK_BALANCE in the EXC_COSTING branch.
-- Run per database, one at a time. Run with sqlcmd -I.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

BEGIN TRY
    BEGIN TRAN;

    DECLARE @msg NVARCHAR(400), @def NVARCHAR(MAX), @cpos INT, @n INT, @m NVARCHAR(400), @block NVARCHAR(MAX),
            @p INT, @q INT, @u NVARCHAR(100) = N'UPDATE proj.TBL_STOCK_BALANCE';

    SET @block = N'-- 2026-11-14b a job can only issue its own job stock
                DECLARE @OwnJobQty DECIMAL(18,4);
                SET @OwnJobQty = 0;
                SELECT @OwnJobQty = ISNULL(SUM(QtyIn - QtyOut), 0)
                FROM   proj.TBL_STOCK_LEDGER
                WHERE  ItemId = @ItemId AND IsJobStock = 1 AND JobId = @JobId;

                IF @OwnJobQty < @StockQty
                BEGIN
                    SET @ShortMsg = ''Insufficient job stock for item '' +
                        ISNULL((SELECT ItemCode FROM proj.TBL_ITEM WHERE ItemId=@ItemId), CAST(@ItemId AS NVARCHAR(20))) +
                        '' in job '' + ISNULL(@JobId, ''(none)'') + '' (have '' + CAST(@OwnJobQty AS NVARCHAR(30)) +
                        '', need '' + CAST(@StockQty AS NVARCHAR(30)) + '').'';
                    THROW 50305, @ShortMsg, 1;
                END

                ';
    SET @m = N'THROW 50302';

    SET @def = OBJECT_DEFINITION(OBJECT_ID(N'proj.sp_ConfirmStockIssue'));
    IF @def IS NULL BEGIN SET @msg = 'proj.sp_ConfirmStockIssue not found.'; THROW 50001, @msg, 1; END

    IF CHARINDEX(N'2026-11-14b', @def) > 0
        PRINT 'sp_ConfirmStockIssue: already applied.';
    ELSE
    BEGIN
        SET @n = (LEN(@def) - LEN(REPLACE(@def, @m, N''))) / LEN(@m);
        IF @n <> 1
        BEGIN SET @msg = CONCAT('sp_ConfirmStockIssue: marker found ', @n, ' times, expected once - live definition differs from the one this patch was written from.'); THROW 50002, @msg, 1; END

        SET @p = CHARINDEX(@m, @def);
        SET @q = CHARINDEX(REVERSE(@u), REVERSE(LEFT(@def, @p - 1)));
        IF @q = 0 BEGIN SET @msg = 'sp_ConfirmStockIssue: UPDATE before the marker not found.'; THROW 50004, @msg, 1; END
        SET @q = @p - @q - LEN(@u) + 1;
        IF SUBSTRING(@def, @q, LEN(@u)) <> @u
        BEGIN SET @msg = 'sp_ConfirmStockIssue: UPDATE position check failed.'; THROW 50005, @msg, 1; END

        SET @def = STUFF(@def, @q, 0, @block);
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
