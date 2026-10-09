/* ═══ Issue Request gate: which issue types need a request (app setting) ═══════
   Until now the gate was TBL_ISSUE_TYPE.RequiresRequest (one flag per type, no
   screen to change it). It is now one app setting, editable in Settings, holding
   the issue type codes that must have an approved Issue Request:

       Inventory.IssueRequest.RequiredFor
           ''                          no type requires a request (default)
           'INC_COSTING'               Include in Costing needs one
           'INC_COSTING,EXC_COSTING'   both need one

   Why a list: a request exists to reserve STORE stock, which only an Include-in-
   Costing issue draws on; an Excluding-from-Costing issue uses the job's own
   purchased stock, so the request adds approval but protects no stock.

   Changes:
     1. adds the setting (default empty, so installing this patch changes nothing)
     2. sp_GetIssueTypes returns RequiresRequest per type from the setting, so the
        New Issue Note form follows it
     3. sp_ConfirmStockIssue reads the setting instead of the type column (error
        50320). The proc is long, so only that one expression is replaced, and the
        patch aborts if the expected text is not found (never half-applied).
   TBL_ISSUE_TYPE.RequiresRequest stays in the table but is no longer read.
══════════════════════════════════════════════════════════════════════════════ */
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM proj.TBL_APP_SETTINGS WHERE SettingKey = N'Inventory.IssueRequest.RequiredFor')
    INSERT INTO proj.TBL_APP_SETTINGS (SettingKey, SettingValue, Description, ModifiedBy, ModifiedDate)
    VALUES (N'Inventory.IssueRequest.RequiredFor', N'',
            N'Issue Request: comma-separated issue type codes that must have an approved Issue Request before an Issue Note can be confirmed, e.g. INC_COSTING or INC_COSTING,EXC_COSTING. Empty = request optional for every type.',
            N'system', SYSDATETIME());
GO

ALTER PROCEDURE proj.sp_GetIssueTypes
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @List NVARCHAR(500) = N',' + REPLACE(ISNULL((SELECT TOP 1 SettingValue FROM proj.TBL_APP_SETTINGS
                                                          WHERE SettingKey = N'Inventory.IssueRequest.RequiredFor'), N''), N' ', N'') + N',';

    SELECT IssueTypeId, IssueTypeCode, IssueTypeName, Description, SortOrder,
           CAST(CASE WHEN CHARINDEX(N',' + IssueTypeCode + N',', @List) > 0 THEN 1 ELSE 0 END AS BIT) AS RequiresRequest
    FROM   proj.TBL_ISSUE_TYPE
    WHERE  IsActive = 1
    ORDER  BY SortOrder;
END;
GO

DECLARE @def NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID(N'proj.sp_ConfirmStockIssue'));
DECLARE @old NVARCHAR(200) = N'@RequiresRequest = ISNULL(it.RequiresRequest, 0)';
DECLARE @new NVARCHAR(800) = N'@RequiresRequest = CASE WHEN it.IssueTypeCode IS NOT NULL AND CHARINDEX(N'','' + it.IssueTypeCode + N'','', N'','' + REPLACE(ISNULL((SELECT TOP 1 SettingValue FROM proj.TBL_APP_SETTINGS WHERE SettingKey = N''Inventory.IssueRequest.RequiredFor''), N''''), N'' '', N'''') + N'','') > 0 THEN 1 ELSE 0 END';

IF @def IS NULL OR CHARINDEX(@old, @def) = 0
BEGIN
    RAISERROR('sp_ConfirmStockIssue: expected gate expression not found - already patched or different version. Nothing changed.', 16, 1);
    RETURN;
END

SET @def = REPLACE(@def, @old, @new);
SET @def = STUFF(@def, CHARINDEX(N'CREATE', @def), LEN(N'CREATE'), N'ALTER');
EXEC sys.sp_executesql @def;
GO
