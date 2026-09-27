-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-09-27i  Delete the redundant BOM delta blocks left behind by 2026-09-27f.
--
-- 2026-09-27f fixed the BomReceivedQty bug by appending an authoritative recompute
-- (PROJ.sp_RecalcBomReceivedQtyForGrn) at the end of sp_ChangeGRNStatus and sp_CancelGRN,
-- and deliberately LEFT the old delta blocks in place so the edit stayed small. The data is
-- correct - the recompute overwrites whatever they produce - but three defective statements
-- are still sitting in the code:
--     sp_ChangeGRNStatus  UPDATE bom ... + (d.ReceivedQty - ISNULL(d.RejectedQty,0))   (receive)
--     sp_ChangeGRNStatus  UPDATE bom ... CROSS APPLY (... - (d.ReceivedQty - ...))     (un-receive)
--     sp_CancelGRN        UPDATE bom ... CROSS APPLY (... - (d.ReceivedQty - ...))     (cancel)
-- All three are the one-to-many UPDATE...FROM shape: they join TBL_BOM_DETAILS through
-- TBL_PURCHASE_REQUEST_LINE to TBL_GRN_DETAIL, and when several rows match one BOM line SQL
-- Server applies only one of them.
--
-- Leaving them is a trap: the next person to audit this code finds the bug shape again and
-- has to re-derive why it is harmless, and any future edit that removes or reorders the
-- recompute silently reintroduces the bug. They are redundant, so they are removed.
--
-- NO BEHAVIOUR CHANGE AND NO DATA CHANGE. The recompute already determines the final value;
-- these statements only wrote an intermediate one. Verified after applying: BomReceivedQty
-- still reconciles on every BOM line.
--
-- Each block is located in the LIVE definition by a marker unique within its procedure, then
-- the whole statement (from its UPDATE to its terminating semicolon) is replaced by a
-- comment. All-or-nothing; idempotent, because the marker disappears once applied.
-- ─────────────────────────────────────────────────────────────────────────────
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

BEGIN TRY
    BEGIN TRAN;

    DECLARE @work TABLE (seq INT IDENTITY, proc_name SYSNAME, marker NVARCHAR(400));
    INSERT INTO @work (proc_name, marker) VALUES
        (N'sp_ChangeGRNStatus', N'bom.BomReceivedQty = ISNULL(bom.BomReceivedQty,0) + (d.ReceivedQty'),
        (N'sp_ChangeGRNStatus', N'ISNULL(bom.BomReceivedQty,0)-(d.ReceivedQty-ISNULL(d.RejectedQty,0))<0'),
        (N'sp_CancelGRN',       N'ISNULL(bom.BomReceivedQty,0) - (d.ReceivedQty - ISNULL(d.RejectedQty,0)) < 0');

    DECLARE @repl NVARCHAR(300) =
        N'-- BOM received qty is derived by PROJ.sp_RecalcBomReceivedQtyForGrn at the end of this'
        + CHAR(13) + CHAR(10)
        + N'            -- procedure (2026-09-27). The old one-to-many delta block here was redundant.';

    DECLARE @nm SYSNAME, @marker NVARCHAR(400);
    DECLARE @def NVARCHAR(MAX), @new NVARCHAR(MAX);
    DECLARE @i INT = 1, @n INT, @mpos INT, @start INT, @endp INT, @p INT, @scan INT;

    WHILE @i <= (SELECT MAX(seq) FROM @work)
    BEGIN
        SELECT @nm = proc_name, @marker = marker FROM @work WHERE seq = @i;

        SET @def = OBJECT_DEFINITION(OBJECT_ID('PROJ.' + @nm));
        IF @def IS NULL THROW 50120, 'A procedure was not found. Nothing changed.', 1;

        -- the recompute must already be wired in, or removing the block would lose the update
        IF CHARINDEX(N'sp_RecalcBomReceivedQtyForGrn', @def) = 0
            THROW 50121, 'Apply 2026-09-27f first - the recompute is not wired in. Nothing changed.', 1;

        SET @n = (DATALENGTH(@def) - DATALENGTH(REPLACE(@def, @marker, N''))) / DATALENGTH(@marker);

        IF @n = 0
            PRINT @nm + ' : block ' + CONVERT(varchar(2), @i) + ' already removed.';
        ELSE
        BEGIN
            IF @n <> 1 THROW 50122, 'Marker is not unique. Nothing changed.', 1;

            SET @mpos = CHARINDEX(@marker, @def);

            SET @start = 0; SET @scan = 1;
            WHILE 1 = 1
            BEGIN
                SET @p = CHARINDEX(N'UPDATE', @def, @scan);
                IF @p = 0 OR @p > @mpos BREAK;
                SET @start = @p; SET @scan = @p + 6;
            END
            IF @start = 0 THROW 50123, 'Could not find the UPDATE before the marker. Nothing changed.', 1;

            SET @endp = CHARINDEX(N';', @def, @mpos);
            IF @endp = 0 THROW 50124, 'Could not find the end of the statement. Nothing changed.', 1;

            SET @new = STUFF(@def, @start, @endp - @start + 1, @repl);

            SET @scan = 1;
            WHILE 1 = 1
            BEGIN
                SET @p = CHARINDEX(N'CREATE', @new, @scan);
                IF @p = 0 THROW 50125, 'Could not find the CREATE keyword. Nothing changed.', 1;
                IF SUBSTRING(@new, @p + 6, 40) LIKE N'%PROC%' BREAK;
                SET @scan = @p + 6;
            END
            SET @new = STUFF(@new, @p, 6, N'ALTER ');

            EXEC sp_executesql @new;
            PRINT @nm + ' : block ' + CONVERT(varchar(2), @i) + ' removed.';
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
       CASE WHEN m.definition LIKE '%UPDATE bom%' THEN 'STILL HAS A BOM DELTA BLOCK' ELSE 'OK - none left' END AS bom_block,
       CASE WHEN m.definition LIKE '%sp_RecalcBomReceivedQtyForGrn%' THEN 'recompute wired' ELSE 'MISSING RECOMPUTE' END AS recompute,
       m.uses_quoted_identifier AS qi_on
FROM sys.sql_modules m JOIN sys.objects o ON o.object_id = m.object_id
WHERE o.name IN ('sp_ChangeGRNStatus','sp_CancelGRN')
ORDER BY o.name;
GO
