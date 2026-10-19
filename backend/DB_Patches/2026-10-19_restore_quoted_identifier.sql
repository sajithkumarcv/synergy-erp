-- 2026-10-19: restore QUOTED_IDENTIFIER ON on procedures stored with it OFF (found on a restore of India prod:
--   sp_GetUserGroups, sp_SetCompanyAddress, sp_DeleteCompanyAddress, sp_DeleteCompanyBank, sp_SoftDeleteMenu; dev has none).
-- Same repair as PROD_2026-09-27_restore_quoted_identifier.sql: every affected procedure is recreated from its own text, only the option changes.
-- Idempotent: when nothing is OFF it restores 0 procedures. All-or-nothing.
-- ─────────────────────────────────────────────────────────────────────────────
-- PROD 2026-09-27   Restore QUOTED_IDENTIFIER ON where a sqlcmd-applied patch turned it OFF.
--
-- WHY: sqlcmd runs with QUOTED_IDENTIFIER OFF, and a procedure keeps whatever the setting
-- was when it was created. Any procedure patched through sqlcmd without an explicit
-- SET QUOTED_IDENTIFIER ON is therefore stored with it OFF, unlike the rest of the database.
-- With it OFF, a procedure cannot use FOR XML and cannot run DML against a table that has a
-- filtered index or an indexed computed column - it fails at runtime with
--   "DML statement failed because it requires SET option QUOTED_IDENTIFIER to be ON".
--
-- WHAT IT CHANGES: nothing about the CODE. Each affected procedure is recreated from its own
-- current definition, byte for byte, with the option ON. Procedures already ON are skipped.
--
-- SAFE: read the report first (STEP 1), it changes nothing. STEP 2 is all-or-nothing.
-- RUN PER COMPANY DB: SYNERPINDIA, then SYNERPUAE.
-- ─────────────────────────────────────────────────────────────────────────────
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

-- ── STEP 1: report. Read-only. Anything with qi_on = 0 needs the repair. ────
SELECT o.name, m.uses_quoted_identifier AS qi_on,
       CASE WHEN m.definition LIKE '%FOR XML%' THEN 'Y' ELSE 'n' END AS uses_for_xml
FROM sys.sql_modules m JOIN sys.objects o ON o.object_id = m.object_id
WHERE o.type = 'P' AND m.uses_quoted_identifier = 0
ORDER BY o.name;
GO

-- ── STEP 2: the repair. Recreates each one verbatim with the option ON. ─────
BEGIN TRY
    BEGIN TRAN;

    DECLARE @name SYSNAME, @def NVARCHAR(MAX), @pos INT, @scan INT, @done INT = 0;

    DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
        SELECT o.name FROM sys.sql_modules m JOIN sys.objects o ON o.object_id = m.object_id
        WHERE o.type = 'P' AND m.uses_quoted_identifier = 0 ORDER BY o.name;

    OPEN cur;
    FETCH NEXT FROM cur INTO @name;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        SET @def = OBJECT_DEFINITION(OBJECT_ID('PROJ.' + @name));
        IF @def IS NOT NULL
        BEGIN
            -- Find the real CREATE keyword: the first 'CREATE' that is actually followed by
            -- 'PROC'. Searching for 'PROCEDURE' first is unsafe - a leading comment such as
            -- "CRUD stored procedures" contains that word with no CREATE before it.
            SET @pos = 0; SET @scan = 1;
            WHILE 1 = 1
            BEGIN
                SET @pos = CHARINDEX(N'CREATE', @def, @scan);
                IF @pos = 0 THROW 50040, 'Could not find the CREATE keyword on a procedure. Nothing changed.', 1;
                IF SUBSTRING(@def, @pos + 6, 40) LIKE N'%PROC%' BREAK;
                SET @scan = @pos + 6;
            END
            SET @def  = STUFF(@def, @pos, 6, N'ALTER ');
            EXEC sp_executesql @def;      -- same text, this batch has QUOTED_IDENTIFIER ON
            SET @done += 1;
            PRINT 'restored: ' + @name;
        END
        FETCH NEXT FROM cur INTO @name;
    END
    CLOSE cur; DEALLOCATE cur;

    PRINT CONVERT(varchar(10), @done) + ' procedure(s) restored to QUOTED_IDENTIFIER ON.';
    COMMIT;
END TRY
BEGIN CATCH
    IF CURSOR_STATUS('local','cur') >= 0 BEGIN CLOSE cur; DEALLOCATE cur; END
    IF @@TRANCOUNT > 0 ROLLBACK;
    PRINT 'FAILED - nothing was changed:';
    THROW;
END CATCH
GO

-- ── STEP 3: check. Must come back 0. ───────────────────────────────────────
SELECT COUNT(*) AS procs_still_off
FROM sys.sql_modules m JOIN sys.objects o ON o.object_id = m.object_id
WHERE o.type = 'P' AND m.uses_quoted_identifier = 0;
GO

SET XACT_ABORT OFF;   -- the repair above turns it ON for the session; do not leak that into the next patch
GO
