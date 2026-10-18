-- 2026-10-18: identify roles by RoleCode, not RoleName (SQL part)
--
-- Apply to: SYNERP
--
-- Role NAMES differ per company, role CODES are stable. The login must therefore return the code (the app puts it in the
-- token's role claim and uses it for every role-based decision); the name is returned only for display.
--   1. sp_ValidateUser         : result row gains RoleCode (RoleName stays, for display)   - anchored edit of the LIVE text
--   2. sp_GetDashboardRoleConfig : role list gains RoleCode (the dashboard matches layouts by code) - anchored edit
--   3. unique index on TBL_ROLES.RoleCode (a plain unique index; refuses to run if codes are blank/duplicated today)
-- Each edit THROWs and changes nothing if its anchor is not found exactly once, and is skipped when already applied.
-- Restore: D:\Projects\_synergy_backups\_REVERT_2026-10-18_roles_by_code.sql
-- Idempotent.

SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- 0. codes must be usable before anything changes
IF EXISTS (SELECT 1 FROM proj.TBL_ROLES WHERE RoleCode IS NULL OR LTRIM(RTRIM(RoleCode)) = N'')
    THROW 50000, 'A role has an empty RoleCode - fix it first (SELECT RoleId, RoleCode, RoleName FROM proj.TBL_ROLES). Nothing changed.', 1;
IF EXISTS (SELECT RoleCode FROM proj.TBL_ROLES GROUP BY RoleCode HAVING COUNT(*) > 1)
    THROW 50000, 'Two roles share a RoleCode - fix it first. Nothing changed.', 1;
GO

-- 1. sp_ValidateUser
DECLARE @def NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID(N'proj.sp_ValidateUser'));
DECLARE @a NVARCHAR(200) = N'ISNULL(r.RoleName, '''') AS RoleName';
IF @def IS NULL THROW 50000, 'proj.sp_ValidateUser not found. Nothing changed.', 1;
IF CHARINDEX(N'AS RoleCode', @def) > 0
    PRINT 'sp_ValidateUser already returns RoleCode - skipped';
ELSE
BEGIN
    IF (LEN(@def) - LEN(REPLACE(@def, @a, N''))) / LEN(@a) <> 1
        THROW 50000, 'sp_ValidateUser: the RoleName line was not found exactly once. Nothing changed.', 1;
    SET @def = REPLACE(@def, @a, @a + N',' + NCHAR(13) + NCHAR(10) + N'               ISNULL(r.RoleCode, '''') AS RoleCode');
    SET @def = STUFF(@def, CHARINDEX(N'CREATE', @def), 6, N'ALTER');
    EXEC (@def);
    PRINT 'sp_ValidateUser now returns RoleCode';
END
GO

-- 2. sp_GetDashboardRoleConfig
DECLARE @def2 NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID(N'proj.sp_GetDashboardRoleConfig'));
DECLARE @a2 NVARCHAR(200) = N'SELECT RoleId, RoleName FROM proj.TBL_ROLES';
IF @def2 IS NULL THROW 50000, 'proj.sp_GetDashboardRoleConfig not found. Nothing changed.', 1;
IF CHARINDEX(N'RoleId, RoleCode, RoleName', @def2) > 0
    PRINT 'sp_GetDashboardRoleConfig already returns RoleCode - skipped';
ELSE
BEGIN
    IF (LEN(@def2) - LEN(REPLACE(@def2, @a2, N''))) / LEN(@a2) <> 1
        THROW 50000, 'sp_GetDashboardRoleConfig: the role list line was not found exactly once. Nothing changed.', 1;
    SET @def2 = REPLACE(@def2, @a2, N'SELECT RoleId, RoleCode, RoleName FROM proj.TBL_ROLES');
    SET @def2 = STUFF(@def2, CHARINDEX(N'CREATE', @def2), 6, N'ALTER');
    EXEC (@def2);
    PRINT 'sp_GetDashboardRoleConfig now returns RoleCode';
END
GO

-- 3. unique RoleCode
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'proj.TBL_ROLES') AND name = N'UX_ROLES_ROLECODE')
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX UX_ROLES_ROLECODE ON proj.TBL_ROLES (RoleCode);
    PRINT 'Created unique index UX_ROLES_ROLECODE';
END
ELSE PRINT 'UX_ROLES_ROLECODE already exists - skipped';
GO

SELECT o.name, m.uses_quoted_identifier AS qi,
       CASE WHEN o.name = N'sp_ValidateUser' AND m.definition LIKE N'%AS RoleCode%' THEN 'OK'
            WHEN o.name = N'sp_GetDashboardRoleConfig' AND m.definition LIKE N'%RoleId, RoleCode, RoleName%' THEN 'OK'
            ELSE 'CHECK' END AS result
FROM sys.sql_modules m JOIN sys.objects o ON o.object_id = m.object_id
WHERE o.name IN (N'sp_ValidateUser', N'sp_GetDashboardRoleConfig');
GO
