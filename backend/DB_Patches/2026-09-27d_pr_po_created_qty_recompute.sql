-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-09-27d  PR / BOM PoCreatedQty must be recomputed, not nudged by deltas.
--
-- TBL_PURCHASE_REQUEST_LINE.PoCreatedQty (and the matching TBL_BOM_DETAILS.PoCreatedQty)
-- were maintained by adding and subtracting the line quantity:
--     sp_SetPOLine           PoCreatedQty + @OrderedQty            (new line)
--                            PoCreatedQty - @Old + @New            (edited line)
--     sp_DeletePOLine        PoCreatedQty - @OrderedQty            (no floor, no guard)
--     sp_ChangePoLineStatus  PoCreatedQty - @ReleaseQty            (floored at 0)
-- Deltas drift. On India, PR-26-0090 line 295 (RequiredQty 2) had reached
-- PoCreatedQty = -8 against one real PO line of 2, and the line still read 'Open' - so the
-- PR looked unordered and a duplicate PO could have been raised against it.
-- (sp_AmendPOLine and sp_AmendPOLineQty already recompute from SUM and were correct.)
--
-- Fix: one authoritative procedure, PROJ.sp_RecalcPrPoCreatedQty, that derives both numbers
-- from the actual PO lines, and a call to it from each of the three procedures above,
-- placed just before the existing sp_RecalcPrStatus call so the status is derived from the
-- corrected figure. The old delta updates stay where they are and are simply overwritten -
-- that keeps these edits small and reversible.
--
-- The BOM status ladder is re-derived in the same statement: TR_BOM_RecalcStatus does not
-- account for BomRequestedQty, so any path that changes the quantity must set the status
-- itself.
--
-- Definition used for "how much of this PR line is on a PO" is exactly the one
-- sp_AmendPOLineQty already uses: active PO lines, no PO status filter. That is deliberate -
-- this patch fixes the arithmetic, it does not redefine the number.
--
-- Part 2 then repairs any row that has already drifted. Idempotent; expect 1 PR line and
-- 1 BOM line on India, 0 anywhere else.
-- ─────────────────────────────────────────────────────────────────────────────
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

-- ── Part 1a: the authoritative recompute ────────────────────────────────────
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

    UPDATE PROJ.TBL_PURCHASE_REQUEST_LINE
    SET PoCreatedQty = (SELECT ISNULL(SUM(pol.OrderedQty), 0)
                        FROM PROJ.TBL_PURCHASE_ORDER_LINE pol
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
        CROSS APPLY (VALUES ((SELECT ISNULL(SUM(pol.OrderedQty), 0)
                              FROM PROJ.TBL_PURCHASE_ORDER_LINE pol
                              JOIN PROJ.TBL_PURCHASE_REQUEST_LINE prl
                                   ON prl.PrLineId = pol.PrLineId AND prl.IsActive = 1
                              WHERE prl.BomDetailId = @BomDetailId AND pol.IsActive = 1))) v(NewPo)
        WHERE bom.BomId = @BomDetailId;
END
GO

-- ── Part 1b: call it from the three delta procedures ────────────────────────
BEGIN TRY
    BEGIN TRAN;

    DECLARE @def NVARCHAR(MAX), @new NVARCHAR(MAX), @old NVARCHAR(400), @rep NVARCHAR(800);
    DECLARE @n INT, @pos INT, @scan INT, @i INT = 1;

    DECLARE @work TABLE (seq INT IDENTITY, proc_name SYSNAME, anchor NVARCHAR(400), replacement NVARCHAR(800));
    INSERT INTO @work (proc_name, anchor, replacement) VALUES
        (N'sp_SetPOLine',
         N'EXEC PROJ.sp_RecalcPrStatus @PrLineId, @CreatedBy;',
         N'EXEC PROJ.sp_RecalcPrPoCreatedQty @PrLineId, @CreatedBy;' + CHAR(13) + CHAR(10)
         + N'            EXEC PROJ.sp_RecalcPrStatus @PrLineId, @CreatedBy;'),
        (N'sp_SetPOLine',
         N'EXEC PROJ.sp_RecalcPrStatus @OldPrLineId, @ModifiedBy;',
         N'EXEC PROJ.sp_RecalcPrPoCreatedQty @OldPrLineId, @ModifiedBy;' + CHAR(13) + CHAR(10)
         + N'            EXEC PROJ.sp_RecalcPrStatus @OldPrLineId, @ModifiedBy;'),
        (N'sp_DeletePOLine',
         N'EXEC PROJ.sp_RecalcPrStatus @PrLineId, ''SYSTEM'';',
         N'EXEC PROJ.sp_RecalcPrPoCreatedQty @PrLineId, ''SYSTEM'';' + CHAR(13) + CHAR(10)
         + N'        EXEC PROJ.sp_RecalcPrStatus @PrLineId, ''SYSTEM'';'),
        (N'sp_ChangePoLineStatus',
         N'EXEC proj.sp_RecalcPrStatus @PrLineId = @PrLineId, @ChangedBy = @ChangedBy;',
         N'EXEC PROJ.sp_RecalcPrPoCreatedQty @PrLineId = @PrLineId, @ModifiedBy = @ChangedBy;' + CHAR(13) + CHAR(10)
         + N'        EXEC proj.sp_RecalcPrStatus @PrLineId = @PrLineId, @ChangedBy = @ChangedBy;');

    DECLARE @nm SYSNAME, @a NVARCHAR(400), @rp NVARCHAR(800);
    WHILE @i <= (SELECT MAX(seq) FROM @work)
    BEGIN
        SELECT @nm = proc_name, @a = anchor, @rp = replacement FROM @work WHERE seq = @i;

        SET @def = OBJECT_DEFINITION(OBJECT_ID('PROJ.' + @nm));
        IF @def IS NULL THROW 50070, 'A procedure was not found. Nothing changed.', 1;

        IF CHARINDEX(@rp, @def) > 0
            PRINT @nm + ' : edit ' + CONVERT(varchar(2), @i) + ' already applied.';
        ELSE
        BEGIN
            SET @n = (DATALENGTH(@def) - DATALENGTH(REPLACE(@def, @a, N''))) / DATALENGTH(@a);
            IF @n <> 1 THROW 50071, 'Expected exactly 1 anchor. Nothing changed.', 1;

            SET @new = REPLACE(@def, @a, @rp);

            SET @scan = 1;
            WHILE 1 = 1
            BEGIN
                SET @pos = CHARINDEX(N'CREATE', @new, @scan);
                IF @pos = 0 THROW 50072, 'Could not find the CREATE keyword. Nothing changed.', 1;
                IF SUBSTRING(@new, @pos + 6, 40) LIKE N'%PROC%' BREAK;
                SET @scan = @pos + 6;
            END
            SET @new = STUFF(@new, @pos, 6, N'ALTER ');

            EXEC sp_executesql @new;
            PRINT @nm + ' : edit ' + CONVERT(varchar(2), @i) + ' applied.';
        END

        SET @i += 1;
    END

    COMMIT;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    PRINT 'FAILED - nothing was changed:';
    THROW;
END CATCH
GO

-- ── Part 2: repair rows that have already drifted ───────────────────────────
-- Look first: every PR line whose stored figure disagrees with its PO lines.
SELECT prl.PrLineId, pr.PrNumber, prl.ItemCode,
       CONVERT(DECIMAL(18,3), ISNULL(prl.PoCreatedQty,0)) AS stored,
       CONVERT(DECIMAL(18,3), ISNULL(x.q,0))              AS should_be,
       CONVERT(DECIMAL(18,3), prl.RequiredQty)            AS required,
       prl.LineStatus
FROM PROJ.TBL_PURCHASE_REQUEST_LINE prl
JOIN PROJ.TBL_PURCHASE_REQUEST pr ON pr.PrId = prl.PrId
OUTER APPLY (SELECT SUM(pol.OrderedQty) AS q FROM PROJ.TBL_PURCHASE_ORDER_LINE pol
             WHERE pol.PrLineId = prl.PrLineId AND pol.IsActive = 1) x
WHERE prl.IsActive = 1
  AND ABS(ISNULL(prl.PoCreatedQty,0) - ISNULL(x.q,0)) >= 0.0005
ORDER BY prl.PrLineId;
GO

-- Repair each one through the same procedure the live code now uses.
DECLARE @FixLineId INT;
DECLARE fix CURSOR LOCAL FAST_FORWARD FOR
    SELECT prl.PrLineId
    FROM PROJ.TBL_PURCHASE_REQUEST_LINE prl
    OUTER APPLY (SELECT SUM(pol.OrderedQty) AS q FROM PROJ.TBL_PURCHASE_ORDER_LINE pol
                 WHERE pol.PrLineId = prl.PrLineId AND pol.IsActive = 1) x
    WHERE prl.IsActive = 1 AND ABS(ISNULL(prl.PoCreatedQty,0) - ISNULL(x.q,0)) >= 0.0005;
OPEN fix;
FETCH NEXT FROM fix INTO @FixLineId;
WHILE @@FETCH_STATUS = 0
BEGIN
    EXEC PROJ.sp_RecalcPrPoCreatedQty @PrLineId = @FixLineId, @ModifiedBy = 'FIX-2026-09-27';
    EXEC PROJ.sp_RecalcPrStatus @FixLineId, 'FIX-2026-09-27';
    PRINT 'repaired PR line ' + CONVERT(varchar(20), @FixLineId);
    FETCH NEXT FROM fix INTO @FixLineId;
END
CLOSE fix; DEALLOCATE fix;
GO

-- ── verification: both must be 0 ────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM PROJ.TBL_PURCHASE_REQUEST_LINE prl
   OUTER APPLY (SELECT SUM(pol.OrderedQty) AS q FROM PROJ.TBL_PURCHASE_ORDER_LINE pol
                WHERE pol.PrLineId = prl.PrLineId AND pol.IsActive = 1) x
   WHERE prl.IsActive = 1 AND ABS(ISNULL(prl.PoCreatedQty,0) - ISNULL(x.q,0)) >= 0.0005) AS pr_lines_still_wrong,
  (SELECT COUNT(*) FROM PROJ.TBL_PURCHASE_REQUEST_LINE WHERE PoCreatedQty < 0) AS negative_pr_qty,
  (SELECT COUNT(*) FROM PROJ.TBL_BOM_DETAILS WHERE PoCreatedQty < 0) AS negative_bom_qty;
GO
