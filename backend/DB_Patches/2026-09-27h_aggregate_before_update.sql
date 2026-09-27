-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-09-27h  Remove the remaining one-to-many UPDATE...FROM quantity updates.
--
-- A sweep of all 580 procedures for the shape that caused the BomReceivedQty bug
-- (2026-09-27f) found five instances. One had already bitten and is fixed; these are the
-- other four procedures, six statements in total:
--     sp_ChangeGRNStatus             pol.ReceivedQty, on receive and on un-receive
--     sp_CancelGRN                   pol.ReceivedQty, on cancel
--     sp_ChangeServiceReceiptStatus  pol.ReceivedQty, on complete and on reverse
--     sp_PostMaterialOut             sc.IssuedQty
-- Each reads a quantity straight from a joined child row, e.g.
--     UPDATE pol SET pol.ReceivedQty = ISNULL(pol.ReceivedQty,0) + (d.ReceivedQty - ...)
--     FROM TBL_PURCHASE_ORDER_LINE pol JOIN TBL_GRN_DETAIL d ON d.PoLineId = pol.PoLineId
-- If two child rows ever match one parent row, SQL Server applies ONE of them and silently
-- discards the rest.
--
-- NO DATA IS WRONG TODAY. Unlike the BOM case - where many PR lines legitimately feed one
-- BOM line - these need the same PO line (or component) twice inside ONE document, which has
-- never happened: 0 GRNs with two rows for one PO line, 0 service receipts, and material-out
-- has no rows at all. PO.ReceivedQty verified clean on all 1178 lines. This is prevention.
--
-- The fix aggregates the child rows first and joins the grouped result, so the number of
-- child rows cannot change the outcome. Semantics are otherwise untouched - same deltas,
-- same zero floors, same WHERE clauses. The LineStatus updates alongside them need no
-- change: they read only the parent row.
--
-- Each statement is located in the LIVE definition by a marker unique within its procedure,
-- then the whole statement (from its UPDATE to its terminating semicolon) is replaced.
-- All-or-nothing; idempotent, because the marker text disappears once applied.
-- ─────────────────────────────────────────────────────────────────────────────
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

BEGIN TRY
    BEGIN TRAN;

    DECLARE @work TABLE (seq INT IDENTITY, proc_name SYSNAME, marker NVARCHAR(400), replacement NVARCHAR(MAX));

    INSERT INTO @work (proc_name, marker, replacement) VALUES (N'sp_ChangeGRNStatus',
              N'pol.ReceivedQty  = ISNULL(pol.ReceivedQty,0) + (d.ReceivedQty',
              N'UPDATE pol' + CHAR(13)+CHAR(10) + N'            SET    pol.ReceivedQty  = ISNULL(pol.ReceivedQty,0) + agg.Qty,'
            + CHAR(13)+CHAR(10) + N'                   pol.ModifiedBy   = @ChangedBy, pol.ModifiedDate = GETDATE()' + CHAR(13)+CHAR(10)
            + N'            FROM   proj.TBL_PURCHASE_ORDER_LINE pol' + CHAR(13)+CHAR(10)
            + N'            JOIN   (SELECT d.PoLineId, SUM(d.ReceivedQty - ISNULL(d.RejectedQty,0)) AS Qty' + CHAR(13)+CHAR(10)
            + N'                    FROM proj.TBL_GRN_DETAIL d' + CHAR(13)+CHAR(10)
            + N'                    WHERE d.GrnId=@GrnId AND d.IsActive=1 AND d.PoLineId IS NOT NULL' + CHAR(13)+CHAR(10)
            + N'                    GROUP BY d.PoLineId) agg ON agg.PoLineId = pol.PoLineId;');

    INSERT INTO @work (proc_name, marker, replacement) VALUES (N'sp_ChangeGRNStatus',
              N'ISNULL(pol.ReceivedQty,0)-(d.ReceivedQty-ISNULL(d.RejectedQty,0))<0',
              N'UPDATE pol' + CHAR(13)+CHAR(10) + N'            SET    pol.ReceivedQty = CASE WHEN ISNULL(pol.ReceivedQty,0)-agg.Qty<0 THEN 0'
            + CHAR(13)+CHAR(10) + N'                       ELSE ISNULL(pol.ReceivedQty,0)-agg.Qty END,' + CHAR(13)+CHAR(10)
            + N'                   pol.ModifiedBy=@ChangedBy, pol.ModifiedDate=GETDATE()' + CHAR(13)+CHAR(10)
            + N'            FROM proj.TBL_PURCHASE_ORDER_LINE pol' + CHAR(13)+CHAR(10)
            + N'            JOIN (SELECT d.PoLineId, SUM(d.ReceivedQty-ISNULL(d.RejectedQty,0)) AS Qty' + CHAR(13)+CHAR(10)
            + N'                  FROM proj.TBL_GRN_DETAIL d' + CHAR(13)+CHAR(10)
            + N'                  WHERE d.GrnId=@GrnId AND d.IsActive=1 AND d.PoLineId IS NOT NULL' + CHAR(13)+CHAR(10)
            + N'                  GROUP BY d.PoLineId) agg ON agg.PoLineId=pol.PoLineId;');

    INSERT INTO @work (proc_name, marker, replacement) VALUES (N'sp_CancelGRN',
              N'ISNULL(pol.ReceivedQty,0) - (d.ReceivedQty - ISNULL(d.RejectedQty,0)) < 0',
              N'UPDATE pol' + CHAR(13)+CHAR(10)
            + N'            SET    pol.ReceivedQty  = CASE WHEN ISNULL(pol.ReceivedQty,0) - agg.Qty < 0 THEN 0' + CHAR(13)+CHAR(10)
            + N'                       ELSE ISNULL(pol.ReceivedQty,0) - agg.Qty END,' + CHAR(13)+CHAR(10)
            + N'                   pol.ModifiedBy   = @CancelledBy,' + CHAR(13)+CHAR(10) + N'                   pol.ModifiedDate = GETDATE()'
            + CHAR(13)+CHAR(10) + N'            FROM   proj.TBL_PURCHASE_ORDER_LINE pol' + CHAR(13)+CHAR(10)
            + N'            JOIN   (SELECT d.PoLineId, SUM(d.ReceivedQty - ISNULL(d.RejectedQty,0)) AS Qty' + CHAR(13)+CHAR(10)
            + N'                    FROM proj.TBL_GRN_DETAIL d' + CHAR(13)+CHAR(10)
            + N'                    WHERE d.GrnId = @GrnId AND d.IsActive = 1 AND d.PoLineId IS NOT NULL' + CHAR(13)+CHAR(10)
            + N'                    GROUP BY d.PoLineId) agg ON agg.PoLineId = pol.PoLineId;');

    INSERT INTO @work (proc_name, marker, replacement) VALUES (N'sp_ChangeServiceReceiptStatus',
              N'ISNULL(pol.ReceivedQty, 0) + sl.CompletedQty',
              N'UPDATE pol' + CHAR(13)+CHAR(10) + N'            SET    pol.ReceivedQty  = ISNULL(pol.ReceivedQty, 0) + agg.Qty,'
            + CHAR(13)+CHAR(10) + N'                   pol.ModifiedBy   = @ChangedBy,' + CHAR(13)+CHAR(10)
            + N'                   pol.ModifiedDate = GETDATE()' + CHAR(13)+CHAR(10) + N'            FROM   proj.TBL_PURCHASE_ORDER_LINE pol'
            + CHAR(13)+CHAR(10) + N'            JOIN   (SELECT sl.PoLineId, SUM(sl.CompletedQty) AS Qty' + CHAR(13)+CHAR(10)
            + N'                    FROM proj.TBL_SRV_LINE sl' + CHAR(13)+CHAR(10)
            + N'                    WHERE sl.SrvId = @SrvId AND sl.IsActive = 1 AND sl.PoLineId IS NOT NULL' + CHAR(13)+CHAR(10)
            + N'                    GROUP BY sl.PoLineId) agg ON agg.PoLineId = pol.PoLineId;');

    INSERT INTO @work (proc_name, marker, replacement) VALUES (N'sp_ChangeServiceReceiptStatus',
              N'ISNULL(pol.ReceivedQty,0) - sl.CompletedQty < 0',
              N'UPDATE pol' + CHAR(13)+CHAR(10) + N'            SET    pol.ReceivedQty  = CASE WHEN ISNULL(pol.ReceivedQty,0) - agg.Qty < 0'
            + CHAR(13)+CHAR(10) + N'                                           THEN 0 ELSE ISNULL(pol.ReceivedQty,0) - agg.Qty END,'
            + CHAR(13)+CHAR(10) + N'                   pol.ModifiedBy   = @ChangedBy,' + CHAR(13)+CHAR(10)
            + N'                   pol.ModifiedDate = GETDATE()' + CHAR(13)+CHAR(10) + N'            FROM   proj.TBL_PURCHASE_ORDER_LINE pol'
            + CHAR(13)+CHAR(10) + N'            JOIN   (SELECT sl.PoLineId, SUM(sl.CompletedQty) AS Qty' + CHAR(13)+CHAR(10)
            + N'                    FROM proj.TBL_SRV_LINE sl' + CHAR(13)+CHAR(10)
            + N'                    WHERE sl.SrvId = @SrvId AND sl.IsActive = 1 AND sl.PoLineId IS NOT NULL' + CHAR(13)+CHAR(10)
            + N'                    GROUP BY sl.PoLineId) agg ON agg.PoLineId = pol.PoLineId;');

    INSERT INTO @work (proc_name, marker, replacement) VALUES (N'sp_PostMaterialOut',
              N'sc.IssuedQty = sc.IssuedQty + mol.Qty',
              N'UPDATE sc SET' + CHAR(13)+CHAR(10) + N'                sc.IssuedQty = sc.IssuedQty + agg.Qty' + CHAR(13)+CHAR(10)
            + N'            FROM proj.TBL_SUBCONTRACT_COMPONENT sc' + CHAR(13)+CHAR(10)
            + N'            JOIN (SELECT mol.ComponentId, SUM(mol.Qty) AS Qty' + CHAR(13)+CHAR(10)
            + N'                  FROM proj.TBL_MATERIAL_OUT_LINE mol' + CHAR(13)+CHAR(10)
            + N'                  WHERE mol.MaterialOutId = @MaterialOutId AND mol.IsActive = 1' + CHAR(13)+CHAR(10)
            + N'                  GROUP BY mol.ComponentId) agg ON agg.ComponentId = sc.ComponentId;');

    DECLARE @nm SYSNAME, @marker NVARCHAR(400), @repl NVARCHAR(MAX);
    DECLARE @def NVARCHAR(MAX), @new NVARCHAR(MAX);
    DECLARE @i INT = 1, @n INT, @mpos INT, @start INT, @endp INT, @p INT, @scan INT;

    WHILE @i <= (SELECT MAX(seq) FROM @work)
    BEGIN
        SELECT @nm = proc_name, @marker = marker, @repl = replacement FROM @work WHERE seq = @i;

        SET @def = OBJECT_DEFINITION(OBJECT_ID('PROJ.' + @nm));
        IF @def IS NULL THROW 50110, 'A procedure was not found. Nothing changed.', 1;

        SET @n = (DATALENGTH(@def) - DATALENGTH(REPLACE(@def, @marker, N''))) / DATALENGTH(@marker);

        IF @n = 0
            PRINT @nm + ' : edit ' + CONVERT(varchar(2), @i) + ' already applied.';
        ELSE
        BEGIN
            IF @n <> 1 THROW 50111, 'Marker is not unique. Nothing changed.', 1;

            SET @mpos = CHARINDEX(@marker, @def);

            SET @start = 0; SET @scan = 1;
            WHILE 1 = 1
            BEGIN
                SET @p = CHARINDEX(N'UPDATE', @def, @scan);
                IF @p = 0 OR @p > @mpos BREAK;
                SET @start = @p; SET @scan = @p + 6;
            END
            IF @start = 0 THROW 50112, 'Could not find the UPDATE before the marker. Nothing changed.', 1;

            SET @endp = CHARINDEX(N';', @def, @mpos);
            IF @endp = 0 THROW 50113, 'Could not find the end of the statement. Nothing changed.', 1;

            SET @new = STUFF(@def, @start, @endp - @start + 1, @repl);

            SET @scan = 1;
            WHILE 1 = 1
            BEGIN
                SET @p = CHARINDEX(N'CREATE', @new, @scan);
                IF @p = 0 THROW 50114, 'Could not find the CREATE keyword. Nothing changed.', 1;
                IF SUBSTRING(@new, @p + 6, 40) LIKE N'%PROC%' BREAK;
                SET @scan = @p + 6;
            END
            SET @new = STUFF(@new, @p, 6, N'ALTER ');

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

-- ── verification ────────────────────────────────────────────────────────────
SELECT o.name,
       CASE WHEN m.definition LIKE '%) agg ON agg.%' THEN 'OK - aggregates first' ELSE 'NOT PATCHED' END AS result,
       m.uses_quoted_identifier AS qi_on
FROM sys.sql_modules m JOIN sys.objects o ON o.object_id = m.object_id
WHERE o.name IN ('sp_ChangeGRNStatus','sp_CancelGRN','sp_ChangeServiceReceiptStatus','sp_PostMaterialOut')
ORDER BY o.name;
GO
