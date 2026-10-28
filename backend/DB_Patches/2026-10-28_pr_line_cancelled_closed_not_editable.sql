-- 2026-10-28: a Cancelled or Closed PR line can no longer be edited through sp_SetPRLine.
-- Found on the SYNERPINDIA restore: BOM 3224 (EC26-300005, item 8891) holds PrCreatedQty 42 against 22 of live PR.
-- PR-26-0661 line 3661 was Cancelled on 17 Oct (its quantity was given back to the BOM). The PR was revised to Draft twice
-- (22 and 26 Oct) and the cancelled line was saved again 10 seconds after the second revise. sp_SetPRLine's UPDATE branch
-- applies "PrCreatedQty - old + new" to the BOM whatever the line's status, so a cancelled line, whose quantity is already
-- released, moved the BOM figure again. The 20 phantom units blocked the BOM line (PR-26-0723 took the remaining 22).
-- Fix: ahead of the PR-status and BOM balance checks, a Cancelled/Closed line is either refused (quantity or BOM link changed) or left
-- untouched (an unchanged re-save, which the PR screen may send), and the BOM is never adjusted for it.
-- Idempotent. All or nothing. Located in the live definition by a marker; fails if the marker is not found exactly once.
-- Existing damage is repaired separately by 2026-10-21_bom_prqty_repair.sql.
-- Run per database, one at a time. Run with sqlcmd -I.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

BEGIN TRY
    BEGIN TRAN;

    DECLARE @def NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID(N'PROJ.sp_SetPRLine'));
    DECLARE @tag NVARCHAR(100) = N'-- 2026-10-28 cancelled/closed line guard';
    DECLARE @marker NVARCHAR(100) = N'DECLARE @PrStatus NVARCHAR(30);';   -- ASCII only; the block lands before the PR-status check, after the PrId/qty checks

    IF @def IS NULL THROW 50001, 'PROJ.sp_SetPRLine not found.', 1;

    IF CHARINDEX(@tag, @def) > 0
        PRINT 'Already applied - nothing to do.';
    ELSE
    BEGIN
        IF (LEN(@def) - LEN(REPLACE(@def, @marker, N''))) / LEN(@marker) <> 1
            THROW 50002, 'Marker not found exactly once in sp_SetPRLine - live definition differs from the one this patch was written from.', 1;

        DECLARE @block NVARCHAR(MAX) = N'
    ' + @tag + N'
    IF @PrLineId IS NOT NULL AND @PrLineId > 0
    BEGIN
        DECLARE @CxStatus NVARCHAR(20), @CxQty DECIMAL(18,4), @CxBom INT;
        SELECT @CxStatus = LineStatus, @CxQty = RequiredQty, @CxBom = BomDetailId
        FROM PROJ.TBL_PURCHASE_REQUEST_LINE WHERE PrLineId = @PrLineId;

        IF ISNULL(@CxStatus, '''') IN (''Cancelled'', ''Closed'')
        BEGIN
            IF @RequiredQty <> ISNULL(@CxQty, 0) OR ISNULL(NULLIF(@BomDetailId, 0), 0) <> ISNULL(@CxBom, 0)
            BEGIN
                RAISERROR(''A Cancelled or Closed PR line cannot be edited: its quantity has already been released to the BOM.'', 16, 1);
                RETURN;
            END
            -- unchanged re-save: leave the line and the BOM exactly as they are
            SELECT CAST(@PrLineId AS NVARCHAR(20));
            RETURN;
        END
    END

    ';

        SET @def = REPLACE(@def, @marker, @block + @marker);
        SET @def = STUFF(@def, CHARINDEX(N'CREATE', @def), 6, N'ALTER');
        EXEC (@def);
        PRINT 'sp_SetPRLine altered.';
    END

    COMMIT;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    THROW;
END CATCH
GO
