-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-09-27  GRN "Total" must show a real number, computed from the lines, excluding GST.
--
-- TBL_GRN_HEADER.TotalAmount is NULL on every GRN (196 of 196 on India). Nothing has ever
-- written it: sp_SetGRN takes @TotalAmount as a parameter defaulting to NULL and stores
-- whatever it is handed, and the frontend always sends null (Grn.js creates with
-- totalAmount: null, GrnOverviewTab passes grn.totalAmount || null straight back).
-- But three read procedures select it and the GRN list renders a "Total" column from it,
-- so every GRN row shows blank.
--
-- Fixed by COMPUTING it in the read path instead of storing it. A stored header total is
-- exactly what caused the PO bug - one write path maintains it, another forgets, and it
-- drifts silently. TBL_GRN_DETAIL already carries persisted LineTotal (excl GST) and
-- LineTotalWithTax, with no nulls, so there is nothing to maintain.
--
-- LineTotal (EXCLUDING GST) is deliberate: GST is recovered from the customer and is not a
-- cost - the same rule applied to the Job Overview PO list.
--
-- The output column keeps the name TotalAmount, so no API or frontend change is needed.
-- sp_SetGRN is left alone; the column simply stops being read.
--
-- NOTE THE FIRST LINE: these three procedures are currently stored with QUOTED_IDENTIFIER
-- ON, and sqlcmd runs with it OFF. Without the SET below they would be recreated with it
-- OFF, which silently breaks FOR XML and DML against filtered indexes.
-- ─────────────────────────────────────────────────────────────────────────────
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

BEGIN TRY
    BEGIN TRAN;

    DECLARE @def NVARCHAR(MAX), @new NVARCHAR(MAX), @old NVARCHAR(400), @rep NVARCHAR(600);
    DECLARE @n INT, @p INT, @r INT, @plen INT, @pos INT, @i INT = 1;
    DECLARE @sum NVARCHAR(400) =
        N'ISNULL((SELECT SUM(gd.LineTotal) FROM proj.TBL_GRN_DETAIL gd WHERE gd.GrnId = g.GrnId AND gd.IsActive = 1), 0) AS TotalAmount,';

    DECLARE @work TABLE (seq INT IDENTITY, proc_name SYSNAME, anchor NVARCHAR(400), replacement NVARCHAR(600));
    INSERT INTO @work (proc_name, anchor, replacement) VALUES
        (N'sp_SearchGRNs', N'g.TotalAmount,',                 @sum),
        (N'sp_GetGRN',     N'g.ExchangeRate, g.TotalAmount,', N'g.ExchangeRate, ' + @sum),
        (N'sp_ReportGRNs', N'g.TotalAmount,',                 @sum);

    DECLARE @nm SYSNAME, @a NVARCHAR(400), @rp NVARCHAR(600);
    WHILE @i <= (SELECT MAX(seq) FROM @work)
    BEGIN
        SELECT @nm = proc_name, @a = anchor, @rp = replacement FROM @work WHERE seq = @i;

        SET @def = OBJECT_DEFINITION(OBJECT_ID('PROJ.' + @nm));
        IF @def IS NULL THROW 50030, 'A GRN procedure was not found. Nothing changed.', 1;

        IF CHARINDEX(N'SUM(gd.LineTotal)', @def) > 0
            PRINT @nm + ' : already patched, left alone.';
        ELSE
        BEGIN
            SET @n = (DATALENGTH(@def) - DATALENGTH(REPLACE(@def, @a, N''))) / DATALENGTH(@a);
            IF @n <> 1 THROW 50031, 'A GRN procedure did not have exactly 1 anchor. Nothing changed.', 1;

            SET @new  = REPLACE(@def, @a, @rp);
            SET @p    = CHARINDEX(N'PROCEDURE', @new);
            SET @plen = @p - 1;
            SET @r    = CHARINDEX(N'ETAERC', REVERSE(LEFT(@new, @plen)));
            IF @r = 0 THROW 50032, 'Could not find the CREATE keyword. Nothing changed.', 1;
            SET @pos  = @plen - @r - 4;
            SET @new  = STUFF(@new, @pos, 6, N'ALTER ');
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

-- ── verification: patched, and QUOTED_IDENTIFIER still ON ───────────────────
SELECT o.name,
       CASE WHEN m.definition LIKE '%SUM(gd.LineTotal)%' THEN 'OK' ELSE 'NOT PATCHED' END AS patched,
       m.uses_quoted_identifier AS qi_on
FROM sys.sql_modules m JOIN sys.objects o ON o.object_id = m.object_id
WHERE o.name IN ('sp_SearchGRNs','sp_GetGRN','sp_ReportGRNs') ORDER BY o.name;
GO
