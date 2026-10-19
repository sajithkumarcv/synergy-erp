/* =====================================================================================================
   Document numbers: allow the year to sit INSIDE the prefix with a {YYYY} (4-digit) or {YY} (2-digit) token.

   Why: the builder is  Prefix + [Separator + Year] + Suffix + Separator + Number  with ONE separator, so
   "SIPS-UAE/PO/2026-1000" (slash before the year, dash before the number) cannot be produced.
   With Prefix = 'SIPS-UAE/PO/{YYYY}', Separator = '-', IncludeYear = 0 it comes out as SIPS-UAE/PO/2026-1000.

   Edits the LIVE text of two procedures in place (no full-body copy), and stops with nothing changed if an
   expected line is not found exactly once:
     PROJ.sp_GetNextDocNumber   - number builder + the duplicate-guard LIKE pattern
     PROJ.sp_PreviewDocNumber   - the preview shown on screens
   A series whose prefix has no token behaves exactly as before. Safe to run twice (skips if already patched).
   ===================================================================================================== */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
GO

DECLARE @Tok1 NVARCHAR(200) = N'REPLACE(REPLACE(ISNULL(@Prefix, ''''), N''{YYYY}'', CAST(@FullYear AS NVARCHAR(4))), N''{YY}'', RIGHT(CAST(@FullYear AS NVARCHAR(4)), 2))';
DECLARE @def NVARCHAR(MAX), @new NVARCHAR(MAX), @n INT;

BEGIN TRAN;

-- ── sp_GetNextDocNumber ─────────────────────────────────────────────────────────────────────────────
SET @def = OBJECT_DEFINITION(OBJECT_ID(N'PROJ.sp_GetNextDocNumber'));
IF @def IS NULL THROW 50001, 'PROJ.sp_GetNextDocNumber not found. Nothing changed.', 1;
IF @def LIKE N'%{YYYY}%' PRINT 'sp_GetNextDocNumber already patched - skipped.';
ELSE
BEGIN
    SET @new = @def;
    -- 1) duplicate-guard pattern
    SET @n = (LEN(@new) - LEN(REPLACE(@new, N'DECLARE @pat NVARCHAR(60) = ''%'' + @sep + @YearStr + @sep + ''%'';', N''))) / LEN(N'DECLARE @pat NVARCHAR(60) = ''%'' + @sep + @YearStr + @sep + ''%'';');
    IF @n <> 1 THROW 50002, 'sp_GetNextDocNumber: @pat line not found exactly once. Nothing changed.', 1;
    SET @new = REPLACE(@new, N'DECLARE @pat NVARCHAR(60) = ''%'' + @sep + @YearStr + @sep + ''%'';',
        N'DECLARE @pat NVARCHAR(60) = CASE WHEN ISNULL(@Prefix, '''') LIKE N''%{YY%'' THEN ' + @Tok1 + N' + @sep + ''%'' ELSE ''%'' + @sep + @YearStr + @sep + ''%'' END;');
    -- 2) the number itself: prefix with tokens replaced
    SET @n = (LEN(@new) - LEN(REPLACE(@new, N'ISNULL(@Prefix, '''') +', N''))) / LEN(N'ISNULL(@Prefix, '''') +');
    IF @n <> 1 THROW 50003, 'sp_GetNextDocNumber: ISNULL(@Prefix) line not found exactly once. Nothing changed.', 1;
    SET @new = REPLACE(@new, N'ISNULL(@Prefix, '''') +', @Tok1 + N' +');
    -- 3) no second year when the prefix already carries it
    SET @n = (LEN(@new) - LEN(REPLACE(@new, N'CASE WHEN @IncYear = 1 THEN', N''))) / LEN(N'CASE WHEN @IncYear = 1 THEN');
    IF @n <> 1 THROW 50004, 'sp_GetNextDocNumber: IncYear CASE not found exactly once. Nothing changed.', 1;
    SET @new = REPLACE(@new, N'CASE WHEN @IncYear = 1 THEN', N'CASE WHEN @IncYear = 1 AND ISNULL(@Prefix, '''') NOT LIKE N''%{YY%'' THEN');
    -- CREATE -> ALTER
    SET @new = STUFF(@new, CHARINDEX(N'CREATE', @new), 6, N'ALTER');
    EXEC sys.sp_executesql @new;
    PRINT 'sp_GetNextDocNumber patched.';
END

-- ── sp_PreviewDocNumber ─────────────────────────────────────────────────────────────────────────────
SET @def = OBJECT_DEFINITION(OBJECT_ID(N'PROJ.sp_PreviewDocNumber'));
IF @def IS NULL THROW 50011, 'PROJ.sp_PreviewDocNumber not found. Nothing changed.', 1;
IF @def LIKE N'%{YYYY}%' PRINT 'sp_PreviewDocNumber already patched - skipped.';
ELSE
BEGIN
    SET @new = @def;
    SET @n = (LEN(@new) - LEN(REPLACE(@new, N'ISNULL(@Prefix, '''') +', N''))) / LEN(N'ISNULL(@Prefix, '''') +');
    IF @n <> 1 THROW 50012, 'sp_PreviewDocNumber: ISNULL(@Prefix) line not found exactly once. Nothing changed.', 1;
    SET @new = REPLACE(@new, N'ISNULL(@Prefix, '''') +', @Tok1 + N' +');
    SET @n = (LEN(@new) - LEN(REPLACE(@new, N'CASE WHEN @IncYear = 1 THEN', N''))) / LEN(N'CASE WHEN @IncYear = 1 THEN');
    IF @n <> 1 THROW 50013, 'sp_PreviewDocNumber: IncYear CASE not found exactly once. Nothing changed.', 1;
    SET @new = REPLACE(@new, N'CASE WHEN @IncYear = 1 THEN', N'CASE WHEN @IncYear = 1 AND ISNULL(@Prefix, '''') NOT LIKE N''%{YY%'' THEN');
    SET @new = STUFF(@new, CHARINDEX(N'CREATE', @new), 6, N'ALTER');
    EXEC sys.sp_executesql @new;
    PRINT 'sp_PreviewDocNumber patched.';
END

COMMIT;
GO

SELECT o.name,
       CASE WHEN OBJECT_DEFINITION(o.object_id) LIKE N'%{YYYY}%' THEN 'PATCHED' ELSE 'NOT PATCHED' END AS state
FROM sys.objects o WHERE o.object_id IN (OBJECT_ID(N'PROJ.sp_GetNextDocNumber'), OBJECT_ID(N'PROJ.sp_PreviewDocNumber'));
GO
