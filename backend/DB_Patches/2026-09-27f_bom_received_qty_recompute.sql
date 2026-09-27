-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-09-27f  BOM BomReceivedQty must be recomputed from the GRN lines.
--
-- ROOT CAUSE - not simple delta drift. sp_ChangeGRNStatus and sp_CancelGRN adjust the BOM
-- with a one-to-many UPDATE ... FROM:
--     UPDATE bom
--     SET    bom.BomReceivedQty = ISNULL(bom.BomReceivedQty,0) + (d.ReceivedQty - ISNULL(d.RejectedQty,0))
--     FROM   TBL_BOM_DETAILS bom
--     JOIN   TBL_PURCHASE_REQUEST_LINE prl ON prl.BomDetailId = bom.BomId
--     JOIN   TBL_GRN_DETAIL d ON d.PrLineId = prl.PrLineId
--     WHERE  d.GrnId = @GrnId ...
-- When one GRN has several detail rows feeding the SAME BOM line, SQL Server applies only
-- ONE of the matching rows and silently discards the rest. The BOM is then credited once
-- for a receipt of several lines.
--
-- Evidence on India: 13 of 1561 BOM lines understated, EVERY ONE of them fed by 2-4 GRN
-- lines, and every one understated (never over). Worst is BomId 359: stored 1 against 78
-- actually received. PO.ReceivedQty, derived from the very same GRN rows, is correct on all
-- 1178 PO lines, so the GRN data itself is sound - only this leg drops rows.
--
-- FIX: PROJ.sp_RecalcBomReceivedQtyForGrn aggregates FIRST and then updates one row per BOM
-- line, so the number of GRN lines cannot change the result. It is called once at the end of
-- each procedure, AFTER the GRN header status has been written - the figure it derives
-- depends on that status, so it must not run before it.
-- The existing delta blocks are left in place and simply overwritten, keeping the edits small.
--
-- Definition is exactly the one the existing code intends: SUM(ReceivedQty - RejectedQty)
-- over active GRN detail rows whose PrLineId maps to the BOM line, for GRNs that are neither
-- Draft nor Cancelled. This fixes the arithmetic, not the meaning.
--
-- Part 2 repairs the rows that already drifted, and re-derives their BomStatus.
-- ─────────────────────────────────────────────────────────────────────────────
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

-- ── Part 1a: aggregate-then-update, immune to the row count ─────────────────
CREATE OR ALTER PROCEDURE PROJ.sp_RecalcBomReceivedQtyForGrn
    @GrnId     INT,
    @ChangedBy NVARCHAR(100) = 'SYSTEM'
AS
BEGIN
    SET NOCOUNT ON;
    IF @GrnId IS NULL OR @GrnId <= 0 RETURN;

    UPDATE bom
    SET bom.BomReceivedQty = v.NewQty,
        bom.BomStatus = CASE
            WHEN v.NewQty >= bom.BomRequestedQty                 THEN 'FullyReceived'
            WHEN v.NewQty  > 0                                   THEN 'PartialReceived'
            WHEN ISNULL(bom.PoCreatedQty,0) >= bom.BomRequestedQty THEN 'PORaised'
            WHEN ISNULL(bom.PoCreatedQty,0)  > 0                   THEN 'POPartial'
            WHEN ISNULL(bom.PrCreatedQty,0) >= bom.BomRequestedQty THEN 'PRRaised'
            WHEN ISNULL(bom.PrCreatedQty,0)  > 0                   THEN 'PRPartial'
            ELSE 'Pending' END,
        bom.ModifiedBy   = @ChangedBy,
        bom.ModifiedDate = GETDATE()
    FROM PROJ.TBL_BOM_DETAILS bom
    JOIN (SELECT DISTINCT prl.BomDetailId AS BomId
          FROM PROJ.TBL_GRN_DETAIL d
          JOIN PROJ.TBL_PURCHASE_REQUEST_LINE prl ON prl.PrLineId = d.PrLineId
          WHERE d.GrnId = @GrnId AND d.PrLineId IS NOT NULL AND prl.BomDetailId IS NOT NULL) a
      ON a.BomId = bom.BomId
    CROSS APPLY (VALUES (ISNULL((
        SELECT SUM(d2.ReceivedQty - ISNULL(d2.RejectedQty,0))
        FROM PROJ.TBL_GRN_DETAIL d2
        JOIN PROJ.TBL_PURCHASE_REQUEST_LINE p2 ON p2.PrLineId = d2.PrLineId
        JOIN PROJ.TBL_GRN_HEADER h2 ON h2.GrnId = d2.GrnId AND h2.IsActive = 1
        WHERE p2.BomDetailId = bom.BomId AND d2.IsActive = 1 AND d2.PrLineId IS NOT NULL
          AND h2.Status NOT IN ('Draft','Cancelled')), 0))) v(NewQty);
END
GO

-- ── Part 1b: call it after the GRN header status is written ─────────────────
BEGIN TRY
    BEGIN TRAN;

    DECLARE @def NVARCHAR(MAX), @new NVARCHAR(MAX), @old NVARCHAR(400), @rep NVARCHAR(800);
    DECLARE @n INT, @pos INT, @scan INT, @i INT = 1;

    DECLARE @work TABLE (seq INT IDENTITY, proc_name SYSNAME, anchor NVARCHAR(400), replacement NVARCHAR(800));
    INSERT INTO @work (proc_name, anchor, replacement) VALUES
        (N'sp_ChangeGRNStatus',
         N'SET Status=@NewStatus, ModifiedBy=@ChangedBy, ModifiedDate=GETDATE()' + CHAR(13) + CHAR(10)
         + N'        WHERE GrnId=@GrnId AND IsActive=1;',
         N'SET Status=@NewStatus, ModifiedBy=@ChangedBy, ModifiedDate=GETDATE()' + CHAR(13) + CHAR(10)
         + N'        WHERE GrnId=@GrnId AND IsActive=1;' + CHAR(13) + CHAR(10) + CHAR(13) + CHAR(10)
         + N'        -- 2026-09-27: derive BomReceivedQty from ALL the GRN lines. The delta blocks' + CHAR(13) + CHAR(10)
         + N'        -- above use a one-to-many UPDATE...FROM and credit only one matching row.' + CHAR(13) + CHAR(10)
         + N'        EXEC PROJ.sp_RecalcBomReceivedQtyForGrn @GrnId, @ChangedBy;'),
        (N'sp_CancelGRN',
         N'WHERE  GrnId = @GrnId AND IsActive = 1;' + CHAR(13) + CHAR(10) + CHAR(13) + CHAR(10) + N'        COMMIT;',
         N'WHERE  GrnId = @GrnId AND IsActive = 1;' + CHAR(13) + CHAR(10) + CHAR(13) + CHAR(10)
         + N'        -- 2026-09-27: see sp_ChangeGRNStatus - recompute instead of trusting the delta.' + CHAR(13) + CHAR(10)
         + N'        EXEC PROJ.sp_RecalcBomReceivedQtyForGrn @GrnId, @CancelledBy;' + CHAR(13) + CHAR(10) + CHAR(13) + CHAR(10)
         + N'        COMMIT;');

    DECLARE @nm SYSNAME, @a NVARCHAR(400), @rp NVARCHAR(800);
    WHILE @i <= (SELECT MAX(seq) FROM @work)
    BEGIN
        SELECT @nm = proc_name, @a = anchor, @rp = replacement FROM @work WHERE seq = @i;

        SET @def = OBJECT_DEFINITION(OBJECT_ID('PROJ.' + @nm));
        IF @def IS NULL THROW 50080, 'A GRN procedure was not found. Nothing changed.', 1;

        IF CHARINDEX(N'sp_RecalcBomReceivedQtyForGrn', @def) > 0
            PRINT @nm + ' : already patched, left alone.';
        ELSE
        BEGIN
            -- line endings may be LF or CRLF; try CRLF first, then LF
            SET @n = (DATALENGTH(@def) - DATALENGTH(REPLACE(@def, @a, N''))) / DATALENGTH(@a);
            IF @n = 0
            BEGIN
                SET @a  = REPLACE(@a,  CHAR(13) + CHAR(10), CHAR(10));
                SET @rp = REPLACE(@rp, CHAR(13) + CHAR(10), CHAR(10));
                SET @n  = (DATALENGTH(@def) - DATALENGTH(REPLACE(@def, @a, N''))) / DATALENGTH(@a);
            END
            IF @n <> 1 THROW 50081, 'Expected exactly 1 anchor. Nothing changed.', 1;

            SET @new = REPLACE(@def, @a, @rp);

            SET @scan = 1;
            WHILE 1 = 1
            BEGIN
                SET @pos = CHARINDEX(N'CREATE', @new, @scan);
                IF @pos = 0 THROW 50082, 'Could not find the CREATE keyword. Nothing changed.', 1;
                IF SUBSTRING(@new, @pos + 6, 40) LIKE N'%PROC%' BREAK;
                SET @scan = @pos + 6;
            END
            SET @new = STUFF(@new, @pos, 6, N'ALTER ');

            EXEC sp_executesql @new;
            PRINT @nm + ' : patched.';
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

-- ── Part 2: repair the BOM lines that already drifted ───────────────────────
-- Look first.
SELECT b.BomId,
       CONVERT(DECIMAL(18,3), ISNULL(b.BomReceivedQty,0)) AS stored,
       CONVERT(DECIMAL(18,3), ISNULL(x.q,0))              AS should_be,
       CONVERT(DECIMAL(18,3), b.BomRequestedQty)          AS requested,
       b.BomStatus                                        AS status_now
FROM PROJ.TBL_BOM_DETAILS b
OUTER APPLY (SELECT SUM(d.ReceivedQty - ISNULL(d.RejectedQty,0)) AS q
             FROM PROJ.TBL_GRN_DETAIL d
             JOIN PROJ.TBL_PURCHASE_REQUEST_LINE prl ON prl.PrLineId = d.PrLineId
             JOIN PROJ.TBL_GRN_HEADER h ON h.GrnId = d.GrnId AND h.IsActive = 1
             WHERE prl.BomDetailId = b.BomId AND d.IsActive = 1 AND d.PrLineId IS NOT NULL
               AND h.Status NOT IN ('Draft','Cancelled')) x
WHERE ABS(ISNULL(b.BomReceivedQty,0) - ISNULL(x.q,0)) >= 0.0005
ORDER BY b.BomId;
GO

UPDATE bom
SET bom.BomReceivedQty = v.NewQty,
    bom.BomStatus = CASE
        WHEN v.NewQty >= bom.BomRequestedQty                 THEN 'FullyReceived'
        WHEN v.NewQty  > 0                                   THEN 'PartialReceived'
        WHEN ISNULL(bom.PoCreatedQty,0) >= bom.BomRequestedQty THEN 'PORaised'
        WHEN ISNULL(bom.PoCreatedQty,0)  > 0                   THEN 'POPartial'
        WHEN ISNULL(bom.PrCreatedQty,0) >= bom.BomRequestedQty THEN 'PRRaised'
        WHEN ISNULL(bom.PrCreatedQty,0)  > 0                   THEN 'PRPartial'
        ELSE 'Pending' END,
    bom.ModifiedBy   = 'FIX-2026-09-27',
    bom.ModifiedDate = GETDATE()
FROM PROJ.TBL_BOM_DETAILS bom
CROSS APPLY (VALUES (ISNULL((
    SELECT SUM(d.ReceivedQty - ISNULL(d.RejectedQty,0))
    FROM PROJ.TBL_GRN_DETAIL d
    JOIN PROJ.TBL_PURCHASE_REQUEST_LINE prl ON prl.PrLineId = d.PrLineId
    JOIN PROJ.TBL_GRN_HEADER h ON h.GrnId = d.GrnId AND h.IsActive = 1
    WHERE prl.BomDetailId = bom.BomId AND d.IsActive = 1 AND d.PrLineId IS NOT NULL
      AND h.Status NOT IN ('Draft','Cancelled')), 0))) v(NewQty)
WHERE ABS(ISNULL(bom.BomReceivedQty,0) - v.NewQty) >= 0.0005;
GO

-- ── verification: must be 0 ─────────────────────────────────────────────────
SELECT COUNT(*) AS bom_lines_still_wrong
FROM PROJ.TBL_BOM_DETAILS b
OUTER APPLY (SELECT SUM(d.ReceivedQty - ISNULL(d.RejectedQty,0)) AS q
             FROM PROJ.TBL_GRN_DETAIL d
             JOIN PROJ.TBL_PURCHASE_REQUEST_LINE prl ON prl.PrLineId = d.PrLineId
             JOIN PROJ.TBL_GRN_HEADER h ON h.GrnId = d.GrnId AND h.IsActive = 1
             WHERE prl.BomDetailId = b.BomId AND d.IsActive = 1 AND d.PrLineId IS NOT NULL
               AND h.Status NOT IN ('Draft','Cancelled')) x
WHERE ABS(ISNULL(b.BomReceivedQty,0) - ISNULL(x.q,0)) >= 0.0005;
GO
