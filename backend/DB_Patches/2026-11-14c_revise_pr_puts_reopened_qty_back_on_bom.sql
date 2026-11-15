-- 2026-11-14c: revising a PR puts the quantity of reopened lines back on the BOM.
--   Problem: sp_RevisePR reopens Closed PR lines (Closed -> Ordered/Partial/Open) but left BOM PrCreatedQty
--   at the closed figure (only what was ordered). The BOM then showed less requested than the PR holds,
--   so a second PR for the same quantity was allowed (India 2026-11-13: BOM 1022, 1023, 1734).
--   Change: after the reopen, PrCreatedQty of the BOM lines behind the reopened PR lines is recomputed
--   with the same rule as TR_PR_ReleaseBomOnReject (Closed line = ordered qty, Cancelled line or
--   Cancelled/Rejected PR = nothing, any other line = required qty). BomStatus follows via TR_BOM_RecalcStatus.
-- Idempotent. All or nothing. Located by an ASCII marker that must occur exactly once.
-- Run per database, one at a time. Run with sqlcmd -I.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

BEGIN TRY
    BEGIN TRAN;

    DECLARE @msg NVARCHAR(400), @def NVARCHAR(MAX), @cpos INT, @n INT, @m NVARCHAR(400), @block NVARCHAR(MAX);

    SET @block = N'-- 2026-11-14c reopened lines count their full quantity on the BOM again
    UPDATE bd
    SET    bd.PrCreatedQty = x.q,
           bd.ModifiedBy   = @RevisedBy,
           bd.ModifiedDate = GETDATE()
    FROM   PROJ.TBL_BOM_DETAILS bd
    JOIN  (SELECT DISTINCT prl.BomDetailId AS BomId
           FROM   @Reopened r
           JOIN   PROJ.TBL_PURCHASE_REQUEST_LINE prl ON prl.PrLineId = r.PrLineId
           WHERE  prl.BomDetailId IS NOT NULL) a ON a.BomId = bd.BomId
    CROSS APPLY (SELECT ISNULL(SUM(CASE WHEN ISNULL(p2.LineStatus,'''') = ''Closed'' THEN ISNULL(po2.q,0) ELSE p2.RequiredQty END), 0) AS q
                 FROM   PROJ.TBL_PURCHASE_REQUEST_LINE p2
                 JOIN   PROJ.TBL_PURCHASE_REQUEST r2 ON r2.PrId = p2.PrId
                 OUTER APPLY (SELECT SUM(pol.OrderedQty) AS q FROM PROJ.TBL_PURCHASE_ORDER_LINE pol
                              WHERE pol.PrLineId = p2.PrLineId AND pol.IsActive = 1) po2
                 WHERE  p2.BomDetailId = bd.BomId AND p2.IsActive = 1
                   AND  ISNULL(p2.LineStatus,'''') <> ''Cancelled''
                   AND  r2.Status NOT IN (''Cancelled'',''Rejected'')) x
    WHERE  bd.IsActive = 1;

    ';
    SET @m = N'INSERT INTO PROJ.TBL_PR_LINE_STATUS_LOG';

    SET @def = OBJECT_DEFINITION(OBJECT_ID(N'PROJ.sp_RevisePR'));
    IF @def IS NULL BEGIN SET @msg = 'PROJ.sp_RevisePR not found.'; THROW 50001, @msg, 1; END

    IF CHARINDEX(N'2026-11-14c', @def) > 0
        PRINT 'sp_RevisePR: already applied.';
    ELSE
    BEGIN
        SET @n = (LEN(@def) - LEN(REPLACE(@def, @m, N''))) / LEN(@m);
        IF @n <> 1
        BEGIN SET @msg = CONCAT('sp_RevisePR: marker found ', @n, ' times, expected once - live definition differs from the one this patch was written from.'); THROW 50002, @msg, 1; END
        SET @def = REPLACE(@def, @m, @block + @m);
        SET @cpos = PATINDEX(N'%CREATE[ ]%PROCEDURE%' COLLATE Latin1_General_CS_AS, @def);
        IF @cpos = 0 BEGIN SET @msg = 'sp_RevisePR: CREATE PROCEDURE not found.'; THROW 50003, @msg, 1; END
        SET @def = STUFF(@def, @cpos, 6, N'ALTER');
        EXEC (@def);
        PRINT 'sp_RevisePR: altered.';
    END

    COMMIT;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    THROW;
END CATCH
GO
