-- 2026-10-18: only users holding an "in-house" role may create (or move a PR onto) an In House job (JobTypeId IH).
--   1. two new roles IH_PROC_OFF / IH_PROC_MGR (no menu permissions - they only gate this rule)
--   2. app setting Purchasing.PR.InHouseRoles = comma-separated ROLE CODES allowed (empty = no restriction)
--   3. sp_SetPR: new @ActingUserId param + the check (anchored edit of the live text, idempotent)
-- Roles are matched by CODE, across ALL roles the user holds.
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM proj.TBL_ROLES WHERE RoleCode = N'IH_PROC_OFF')
    INSERT INTO proj.TBL_ROLES (RoleName, RoleCode, IsActive, CreatedDate, Description, CreatedBy, IsEngineerRole)
    VALUES (N'In-House Procurement Officer', N'IH_PROC_OFF', 1, GETDATE(),
            N'Can create purchase requests for In House jobs (used together with the normal Procurement Officer role)', N'system', 0);
IF NOT EXISTS (SELECT 1 FROM proj.TBL_ROLES WHERE RoleCode = N'IH_PROC_MGR')
    INSERT INTO proj.TBL_ROLES (RoleName, RoleCode, IsActive, CreatedDate, Description, CreatedBy, IsEngineerRole)
    VALUES (N'In-House Procurement Manager', N'IH_PROC_MGR', 1, GETDATE(),
            N'Can create purchase requests for In House jobs (used together with the normal Procurement Manager role)', N'system', 0);
GO

IF NOT EXISTS (SELECT 1 FROM proj.TBL_APP_SETTINGS WHERE SettingKey = N'Purchasing.PR.InHouseRoles')
    INSERT INTO proj.TBL_APP_SETTINGS (SettingKey, SettingValue, Description, ModifiedBy, ModifiedDate)
    VALUES (N'Purchasing.PR.InHouseRoles', N'IH_PROC_OFF,IH_PROC_MGR',
            N'Purchase Request: comma-separated ROLE CODES allowed to create a PR for an In House job (job type IH). Empty = any role may.',
            N'system', SYSDATETIME());
GO

DECLARE @def NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID(N'proj.sp_SetPR'));
IF @def IS NULL THROW 50000, 'sp_SetPR not found', 1;

IF CHARINDEX(N'Purchasing.PR.InHouseRoles', @def) > 0
    PRINT 'sp_SetPR already has the in-house check - skipped';
ELSE
BEGIN
    DECLARE @a1 NVARCHAR(200) = N'@ModifiedBy  NVARCHAR(100) = NULL';
    DECLARE @a2 NVARCHAR(200) = N'IF @JobId IS NOT NULL EXEC proj.sp_AssertJobOpen @JobId;';
    DECLARE @n1 INT = (LEN(@def) - LEN(REPLACE(@def, @a1, N''))) / LEN(@a1);
    DECLARE @n2 INT = (LEN(@def) - LEN(REPLACE(@def, @a2, N''))) / LEN(@a2);
    IF @n1 <> 1 THROW 50000, 'sp_SetPR: parameter anchor not found exactly once', 1;
    IF @n2 <> 1 THROW 50000, 'sp_SetPR: AssertJobOpen anchor not found exactly once', 1;

    DECLARE @crlf NCHAR(2) = NCHAR(13) + NCHAR(10);
    DECLARE @chk NVARCHAR(MAX) = @a2 + @crlf + N'
    -- In-house jobs: only users holding an allowed role CODE (setting Purchasing.PR.InHouseRoles) may create a PR
    -- or move a PR onto the job. Checks ALL roles the user holds.
    IF @JobId IS NOT NULL
       AND EXISTS (SELECT 1 FROM proj.TBL_JOB WHERE JobId = @JobId AND JobTypeId = N''IH'')
       AND (@PrId = 0 OR NOT EXISTS (SELECT 1 FROM proj.TBL_PURCHASE_REQUEST WHERE PrId = @PrId AND JobId = @JobId))
    BEGIN
        DECLARE @ihAllowed NVARCHAR(MAX) =
            (SELECT SettingValue FROM proj.TBL_APP_SETTINGS WHERE SettingKey = N''Purchasing.PR.InHouseRoles'');
        IF NULLIF(LTRIM(RTRIM(@ihAllowed)), N'''') IS NOT NULL
        BEGIN
            DECLARE @ihUser INT = @ActingUserId;
            IF @ihUser IS NULL
                SELECT @ihUser = UserId FROM proj.TBL_USERS
                WHERE UserName = ISNULL(NULLIF(@ModifiedBy, N''''), @CreatedBy);
            IF NOT EXISTS (
                SELECT 1
                FROM proj.TBL_USER_ROLES ur
                JOIN proj.TBL_ROLES r ON r.RoleId = ur.RoleId
                JOIN STRING_SPLIT(@ihAllowed, N'','') s ON UPPER(LTRIM(RTRIM(s.value))) = UPPER(r.RoleCode)
                WHERE ur.UserId = @ihUser)
            BEGIN
                DECLARE @ihMsg NVARCHAR(300) = N''Only users with the In-House Procurement Officer or Manager role can create purchase requests for In House jobs.'';
                RAISERROR(''%s'', 16, 1, @ihMsg);
                RETURN;
            END
        END
    END';

    SET @def = REPLACE(@def, @a2, @chk);
    SET @def = REPLACE(@def, @a1, @a1 + N',' + @crlf + N'    @ActingUserId INT          = NULL');
    SET @def = STUFF(@def, CHARINDEX(N'CREATE PROCEDURE', @def), LEN(N'CREATE PROCEDURE'), N'ALTER PROCEDURE');
    EXEC (@def);
    PRINT 'sp_SetPR updated';
END
GO

SELECT RoleId, RoleCode, RoleName FROM proj.TBL_ROLES WHERE RoleCode IN (N'IH_PROC_OFF', N'IH_PROC_MGR');
SELECT SettingKey, SettingValue FROM proj.TBL_APP_SETTINGS WHERE SettingKey = N'Purchasing.PR.InHouseRoles';
SELECT CASE WHEN OBJECT_DEFINITION(OBJECT_ID(N'proj.sp_SetPR')) LIKE N'%@ActingUserId%' THEN 'sp_SetPR has check' ELSE 'MISSING' END AS state;
GO

-- 4. lets the PR screens know whether to offer In House jobs to the signed-in user
CREATE OR ALTER PROCEDURE proj.sp_GetPrInHouseAccess
    @UserId INT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @allowed NVARCHAR(MAX) =
        (SELECT SettingValue FROM proj.TBL_APP_SETTINGS WHERE SettingKey = N'Purchasing.PR.InHouseRoles');
    DECLARE @restricted BIT = CASE WHEN NULLIF(LTRIM(RTRIM(@allowed)), N'') IS NULL THEN 0 ELSE 1 END;
    SELECT @restricted AS Restricted,
           CASE WHEN @restricted = 0 THEN 1
                WHEN EXISTS (SELECT 1 FROM proj.TBL_USER_ROLES ur
                             JOIN proj.TBL_ROLES r ON r.RoleId = ur.RoleId
                             JOIN STRING_SPLIT(@allowed, N',') s ON UPPER(LTRIM(RTRIM(s.value))) = UPPER(r.RoleCode)
                             WHERE ur.UserId = @UserId) THEN 1 ELSE 0 END AS Allowed;
END
GO
