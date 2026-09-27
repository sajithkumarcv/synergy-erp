-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-09-27j  Cancelling or Closing a PO releases its quantity back to the PR and BOM.
--
-- THE GAP. sp_ChangePOStatus sets the PO header status and does nothing else - it does not
-- touch PR.PoCreatedQty or BOM.PoCreatedQty. So cancelling or closing a PO left the PR
-- still believing that quantity was on order, and nobody would re-order it. Same shape as
-- the sp_ClosePR bug fixed in 2026-09-27g: closing a PO LINE (sp_ChangePoLineStatus) does
-- release the balance, closing the whole PO did not.
--
-- No data is wrong today - no PO and no PO line has ever been Cancelled or Closed
-- (statuses in use: Approved, Draft, Partial, PendingApproval, Received, Rejected, Sent;
-- line statuses: Open, Partial, Received). This is prevention, decided by the user.
--
-- THE RULE, mirroring what 2026-09-27g established for PRs:
--     PoCreatedQty counts, per PO line:
--         - PO Cancelled/Closed, or the LINE Cancelled/Closed -> what was actually RECEIVED
--         - otherwise                                          -> the ordered quantity
-- Verified against prod data before changing anything: this reproduces today's values on all
-- 1,770 PR lines and all 1,561 BOM lines with zero differences, because nothing is cancelled
-- or closed yet. So no repair script is needed and no existing figure moves.
--
-- Part 1 redefines PROJ.sp_RecalcPrPoCreatedQty (created by 2026-09-27d) with that rule.
-- Part 2 makes sp_ChangePOStatus recompute the affected PR lines after ANY status change -
-- not just Cancelled/Closed - so that re-opening a cancelled PO restores the quantity too.
--
-- DELIBERATELY NOT DONE: the PO's own line statuses are left alone. Cancelling a PO does not
-- cascade 'Cancelled' down to its lines today, and changing that is a separate decision; the
-- rule above keys off the PO status as well as the line status, so the quantities are correct
-- either way.
-- ─────────────────────────────────────────────────────────────────────────────
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

-- ── Part 1: the rule ────────────────────────────────────────────────────────
CREATE OR ALTER PROCEDURE PROJ.sp_RecalcPrPoCreatedQty
    @PrLineId   INT,
    @ModifiedBy NVARCHAR(100) = 'SYSTEM'
AS
BEGIN
    SET NOCOUNT ON;
    IF @PrLineId IS NULL OR @PrLineId <= 0 RETURN;

    DECLARE @BomDetailId INT;
    SELECT @BomDetailId = BomDetailId
    FROM PROJ.TBL_PURCHASE_REQUEST_LINE WHERE PrLineId = @PrLineId;

    -- A Cancelled or Closed PO (or PO line) only ever delivered what was received;
    -- the rest is released back to the PR. (2026-09-27)
    UPDATE PROJ.TBL_PURCHASE_REQUEST_LINE
    SET PoCreatedQty = (
            SELECT ISNULL(SUM(CASE WHEN po.Status IN ('Cancelled','Closed')
                                     OR ISNULL(pol.LineStatus,'') IN ('Cancelled','Closed')
                                   THEN ISNULL(pol.ReceivedQty, 0)
                                   ELSE pol.OrderedQty END), 0)
            FROM PROJ.TBL_PURCHASE_ORDER_LINE pol
            JOIN PROJ.TBL_PURCHASE_ORDER po ON po.PoId = pol.PoId
            WHERE pol.PrLineId = @PrLineId AND pol.IsActive = 1)
    WHERE PrLineId = @PrLineId;

    IF @BomDetailId IS NOT NULL AND @BomDetailId > 0
        UPDATE bom
        SET bom.PoCreatedQty = v.NewPo,
            bom.BomStatus = CASE
                WHEN bom.BomReceivedQty >= bom.BomRequestedQty THEN 'FullyReceived'
                WHEN bom.BomReceivedQty  > 0                   THEN 'PartialReceived'
                WHEN v.NewPo >= bom.BomRequestedQty            THEN 'PORaised'
                WHEN v.NewPo  > 0                              THEN 'POPartial'
                WHEN bom.PrCreatedQty >= bom.BomRequestedQty   THEN 'PRRaised'
                WHEN bom.PrCreatedQty  > 0                     THEN 'PRPartial'
                ELSE 'Pending' END,
            bom.ModifiedBy   = @ModifiedBy,
            bom.ModifiedDate = GETDATE()
        FROM PROJ.TBL_BOM_DETAILS bom
        CROSS APPLY (VALUES (ISNULL((
            SELECT SUM(CASE WHEN po.Status IN ('Cancelled','Closed')
                              OR ISNULL(pol.LineStatus,'') IN ('Cancelled','Closed')
                            THEN ISNULL(pol.ReceivedQty, 0)
                            ELSE pol.OrderedQty END)
            FROM PROJ.TBL_PURCHASE_ORDER_LINE pol
            JOIN PROJ.TBL_PURCHASE_ORDER po ON po.PoId = pol.PoId
            JOIN PROJ.TBL_PURCHASE_REQUEST_LINE prl
                 ON prl.PrLineId = pol.PrLineId AND prl.IsActive = 1
            WHERE prl.BomDetailId = @BomDetailId AND pol.IsActive = 1), 0))) v(NewPo)
        WHERE bom.BomId = @BomDetailId;
END
GO

-- ── Part 2: make sp_ChangePOStatus recompute after a status change ─────────
BEGIN TRY
    BEGIN TRAN;

    DECLARE @def NVARCHAR(MAX), @new NVARCHAR(MAX), @old NVARCHAR(200), @rep NVARCHAR(2000);
    DECLARE @n INT, @pos INT, @scan INT;

    SET @def = OBJECT_DEFINITION(OBJECT_ID('PROJ.sp_ChangePOStatus'));
    IF @def IS NULL THROW 50130, 'sp_ChangePOStatus not found.', 1;

    IF CHARINDEX(N'sp_RecalcPrPoCreatedQty', @def) > 0
    BEGIN
        PRINT 'sp_ChangePOStatus : already patched, left alone.';
        COMMIT;
        RETURN;
    END

    SET @old = N'SELECT CAST(@PoId AS NVARCHAR(20));';
    SET @rep =
          N'-- 2026-09-27: a status change can put this PO on or off order (Cancelled/Closed' + CHAR(10)
        + N'    -- release the un-received balance; re-opening puts it back), so the PR and BOM' + CHAR(10)
        + N'    -- quantities are re-derived here. Closing a PO LINE already did this via' + CHAR(10)
        + N'    -- sp_ChangePoLineStatus; closing the whole PO did not.' + CHAR(10)
        + N'    DECLARE @RcPrLineId INT;' + CHAR(10)
        + N'    DECLARE rc CURSOR LOCAL FAST_FORWARD FOR' + CHAR(10)
        + N'        SELECT DISTINCT pol.PrLineId' + CHAR(10)
        + N'        FROM   PROJ.TBL_PURCHASE_ORDER_LINE pol' + CHAR(10)
        + N'        WHERE  pol.PoId = @PoId AND pol.IsActive = 1 AND pol.PrLineId IS NOT NULL;' + CHAR(10)
        + N'    OPEN rc;' + CHAR(10)
        + N'    FETCH NEXT FROM rc INTO @RcPrLineId;' + CHAR(10)
        + N'    WHILE @@FETCH_STATUS = 0' + CHAR(10)
        + N'    BEGIN' + CHAR(10)
        + N'        EXEC PROJ.sp_RecalcPrPoCreatedQty @RcPrLineId, @ChangedBy;' + CHAR(10)
        + N'        EXEC PROJ.sp_RecalcPrStatus       @RcPrLineId, @ChangedBy;' + CHAR(10)
        + N'        FETCH NEXT FROM rc INTO @RcPrLineId;' + CHAR(10)
        + N'    END' + CHAR(10)
        + N'    CLOSE rc; DEALLOCATE rc;' + CHAR(10)
        + CHAR(10)
        + N'    SELECT CAST(@PoId AS NVARCHAR(20));';

    SET @n = (DATALENGTH(@def) - DATALENGTH(REPLACE(@def, @old, N''))) / DATALENGTH(@old);
    IF @n <> 1 THROW 50131, 'sp_ChangePOStatus: expected exactly 1 anchor. Nothing changed.', 1;

    SET @new = REPLACE(@def, @old, @rep);

    SET @scan = 1;
    WHILE 1 = 1
    BEGIN
        SET @pos = CHARINDEX(N'CREATE', @new, @scan);
        IF @pos = 0 THROW 50132, 'Could not find the CREATE keyword. Nothing changed.', 1;
        IF SUBSTRING(@new, @pos + 6, 40) LIKE N'%PROC%' BREAK;
        SET @scan = @pos + 6;
    END
    SET @new = STUFF(@new, @pos, 6, N'ALTER ');

    EXEC sp_executesql @new;
    PRINT 'sp_ChangePOStatus : patched.';

    COMMIT;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    PRINT 'FAILED - nothing was changed:';
    THROW;
END CATCH
GO

-- ── verification ────────────────────────────────────────────────────────────
SELECT o.name,
       CASE WHEN m.definition LIKE '%Cancelled%,%Closed%' OR m.definition LIKE '%sp_RecalcPrPoCreatedQty%'
            THEN 'OK' ELSE 'NOT PATCHED' END AS result,
       m.uses_quoted_identifier AS qi_on
FROM sys.sql_modules m JOIN sys.objects o ON o.object_id = m.object_id
WHERE o.name IN ('sp_RecalcPrPoCreatedQty','sp_ChangePOStatus')
ORDER BY o.name;

-- ── Part 3: bring any existing row onto the new rule ───────────────────────
-- On prod this changes nothing (no PO or PO line has ever been Cancelled or Closed).
-- Where a closed line exists that never received anything, its quantity is released.
DECLARE @FixId INT;
DECLARE fixpr CURSOR LOCAL FAST_FORWARD FOR
    SELECT prl.PrLineId
    FROM PROJ.TBL_PURCHASE_REQUEST_LINE prl
    OUTER APPLY (SELECT SUM(CASE WHEN po.Status IN ('Cancelled','Closed')
                                   OR ISNULL(pol.LineStatus,'') IN ('Cancelled','Closed')
                                 THEN ISNULL(pol.ReceivedQty,0) ELSE pol.OrderedQty END) AS q
                 FROM PROJ.TBL_PURCHASE_ORDER_LINE pol
                 JOIN PROJ.TBL_PURCHASE_ORDER po ON po.PoId = pol.PoId
                 WHERE pol.PrLineId = prl.PrLineId AND pol.IsActive = 1) x
    WHERE prl.IsActive = 1 AND ABS(ISNULL(prl.PoCreatedQty,0) - ISNULL(x.q,0)) >= 0.0005;
OPEN fixpr;
FETCH NEXT FROM fixpr INTO @FixId;
WHILE @@FETCH_STATUS = 0
BEGIN
    EXEC PROJ.sp_RecalcPrPoCreatedQty @PrLineId = @FixId, @ModifiedBy = 'FIX-2026-09-27';
    EXEC PROJ.sp_RecalcPrStatus @FixId, 'FIX-2026-09-27';
    PRINT 'released PR line ' + CONVERT(varchar(20), @FixId);
    FETCH NEXT FROM fixpr INTO @FixId;
END
CLOSE fixpr; DEALLOCATE fixpr;
GO

-- must be 0
SELECT COUNT(*) AS pr_lines_still_off_rule
FROM PROJ.TBL_PURCHASE_REQUEST_LINE prl
OUTER APPLY (SELECT SUM(CASE WHEN po.Status IN ('Cancelled','Closed')
                               OR ISNULL(pol.LineStatus,'') IN ('Cancelled','Closed')
                             THEN ISNULL(pol.ReceivedQty,0) ELSE pol.OrderedQty END) AS q
             FROM PROJ.TBL_PURCHASE_ORDER_LINE pol
             JOIN PROJ.TBL_PURCHASE_ORDER po ON po.PoId = pol.PoId
             WHERE pol.PrLineId = prl.PrLineId AND pol.IsActive = 1) x
WHERE prl.IsActive = 1 AND ABS(ISNULL(prl.PoCreatedQty,0) - ISNULL(x.q,0)) >= 0.0005;
GO
