-- 2026-10-19: sp_GetApprovalDelegates takes the filters the API already sends.
-- ApprovalController.GetDelegates calls it with LevelId and ModuleCode, but the procedure had no parameters, so the
-- Delegates tab failed with "Procedure sp_GetApprovalDelegates has no parameters and arguments were supplied".
-- Anchored edit of the live text (idempotent): adds @LevelId / @ModuleCode and the matching WHERE clause.
-- The result set and its order are unchanged. NULL / empty = no filter.
SET QUOTED_IDENTIFIER ON;
GO

DECLARE @def NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID(N'proj.sp_GetApprovalDelegates'));
IF @def IS NULL THROW 50000, 'sp_GetApprovalDelegates not found', 1;

IF CHARINDEX(N'@ModuleCode', @def) > 0
    PRINT 'sp_GetApprovalDelegates already takes the filters - skipped';
ELSE
BEGIN
    DECLARE @a1 NVARCHAR(200) = N'PROCEDURE proj.sp_GetApprovalDelegates';
    DECLARE @a2 NVARCHAR(200) = N'ORDER BY d.IsActive DESC, d.FromDate DESC;';
    DECLARE @n1 INT = (LEN(@def) - LEN(REPLACE(@def, @a1, N''))) / LEN(@a1);
    DECLARE @n2 INT = (LEN(@def) - LEN(REPLACE(@def, @a2, N''))) / LEN(@a2);
    IF @n1 <> 1 THROW 50000, 'sp_GetApprovalDelegates: header anchor not found exactly once', 1;
    IF @n2 <> 1 THROW 50000, 'sp_GetApprovalDelegates: ORDER BY anchor not found exactly once', 1;

    DECLARE @crlf NCHAR(2) = NCHAR(13) + NCHAR(10);
    SET @def = REPLACE(@def, @a2,
        N'WHERE (@LevelId IS NULL OR d.LevelId = @LevelId)' + @crlf +
        N'      AND (NULLIF(@ModuleCode, N'''') IS NULL OR m.ModuleCode = @ModuleCode)' + @crlf +
        N'    ' + @a2);
    SET @def = REPLACE(@def, @a1,
        @a1 + @crlf + N'    @LevelId    INT          = NULL,' + @crlf + N'    @ModuleCode NVARCHAR(20) = NULL');
    SET @def = STUFF(@def, CHARINDEX(N'CREATE', @def), 6, N'ALTER ');
    EXEC (@def);
    PRINT 'sp_GetApprovalDelegates updated';
END
GO

SELECT p.name AS param, t.name AS typ, p.has_default_value
FROM sys.parameters p JOIN sys.types t ON t.user_type_id = p.user_type_id
WHERE p.object_id = OBJECT_ID(N'proj.sp_GetApprovalDelegates') ORDER BY p.parameter_id;
SELECT uses_quoted_identifier FROM sys.sql_modules WHERE object_id = OBJECT_ID(N'proj.sp_GetApprovalDelegates');
GO
