-- 2026-10-19: sp_CancelGRN and sp_CancelStockReceipt now STOP when a guard fails.
-- Their guards (reason required, user, password, status) used a bare RAISERROR outside any TRY block with no RETURN.
-- RAISERROR does not stop a procedure, so a wrong password was reported to the caller but the cancellation still ran.
-- Anchored edit of the live text (idempotent): each guard RAISERROR becomes BEGIN RAISERROR(...); RETURN; END.
-- Every anchor must be found exactly once or nothing is changed.
SET QUOTED_IDENTIFIER ON;
GO

DECLARE @proc NVARCHAR(128), @def NVARCHAR(MAX), @msgs NVARCHAR(MAX), @m NVARCHAR(400), @a NVARCHAR(600), @n INT, @i INT;
DECLARE @work TABLE (ProcName NVARCHAR(128), Msg NVARCHAR(400));
INSERT INTO @work VALUES
 (N'proj.sp_CancelGRN', N'A cancellation reason is required.'),
 (N'proj.sp_CancelGRN', N'Incorrect password. Cancellation not authorised.'),
 (N'proj.sp_CancelGRN', N'GRN not found.'),
 (N'proj.sp_CancelGRN', N'This GRN is already cancelled.'),
 (N'proj.sp_CancelGRN', N'Only Draft or Received GRNs can be cancelled.'),
 (N'proj.sp_CancelStockReceipt', N'A cancellation reason is required.'),
 (N'proj.sp_CancelStockReceipt', N'User is required to cancel.'),
 (N'proj.sp_CancelStockReceipt', N'Incorrect password. Cancellation not authorised.'),
 (N'proj.sp_CancelStockReceipt', N'Stock receipt not found or already cancelled.'),
 (N'proj.sp_CancelStockReceipt', N'This stock receipt is already cancelled.'),
 (N'proj.sp_CancelStockReceipt', N'This receipt belongs to a GRN. Cancel or unregister the GRN instead.');

DECLARE p CURSOR LOCAL FAST_FORWARD FOR SELECT DISTINCT ProcName FROM @work;
OPEN p; FETCH NEXT FROM p INTO @proc;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @def = OBJECT_DEFINITION(OBJECT_ID(@proc));
    IF @def IS NULL THROW 50000, 'procedure not found', 1;

    IF CHARINDEX(N'RAISERROR(''Incorrect password. Cancellation not authorised.'', 16, 1); RETURN;', @def) > 0
        PRINT @proc + N' already stops on a failed guard - skipped';
    ELSE
    BEGIN
        -- check every anchor first, change nothing if one is missing or duplicated
        DECLARE m CURSOR LOCAL FAST_FORWARD FOR SELECT Msg FROM @work WHERE ProcName = @proc;
        OPEN m; FETCH NEXT FROM m INTO @m;
        WHILE @@FETCH_STATUS = 0
        BEGIN
            SET @a = N'RAISERROR(''' + @m + N''', 16, 1);';
            SET @n = (LEN(@def) - LEN(REPLACE(@def, @a, N''))) / LEN(@a);
            IF @n <> 1
            BEGIN
                DECLARE @err NVARCHAR(500) = @proc + N': anchor found ' + CAST(@n AS NVARCHAR(10)) + N' times: ' + @m;
                THROW 50000, @err, 1;
            END
            FETCH NEXT FROM m INTO @m;
        END
        CLOSE m; DEALLOCATE m;

        DECLARE m2 CURSOR LOCAL FAST_FORWARD FOR SELECT Msg FROM @work WHERE ProcName = @proc;
        OPEN m2; FETCH NEXT FROM m2 INTO @m;
        WHILE @@FETCH_STATUS = 0
        BEGIN
            SET @a = N'RAISERROR(''' + @m + N''', 16, 1);';
            SET @def = REPLACE(@def, @a, N'BEGIN ' + REPLACE(@a, N'1);', N'1); RETURN;') + N' END');
            FETCH NEXT FROM m2 INTO @m;
        END
        CLOSE m2; DEALLOCATE m2;

        SET @def = STUFF(@def, CHARINDEX(N'CREATE', @def), 6, N'ALTER ');
        EXEC (@def);
        PRINT @proc + N' updated';
    END
    FETCH NEXT FROM p INTO @proc;
END
CLOSE p; DEALLOCATE p;
GO

SELECT o.name,
       (LEN(m.definition) - LEN(REPLACE(m.definition, N'RETURN; END', N''))) / LEN(N'RETURN; END') AS guards_with_return,
       m.uses_quoted_identifier
FROM sys.sql_modules m JOIN sys.objects o ON o.object_id = m.object_id
WHERE o.name IN (N'sp_CancelGRN', N'sp_CancelStockReceipt') ORDER BY o.name;
GO
