-- ============================================================
-- Soft-delete fixes for Menu, UserGroup, EmailAlertConfig
-- ============================================================

-- 1. Dedicated clean soft-delete for Menu (no name corruption)
CREATE OR ALTER PROCEDURE proj.sp_SoftDeleteMenu
    @MenuId INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE proj.TBL_MENU
       SET IsActive = 0
     WHERE MenuId = @MenuId;
    SELECT @MenuId AS MenuId;
END;
GO

-- 2. sp_GetUserGroups — only return active groups in list view
--    (when @GroupId is provided we still return that specific group
--     regardless of status, so admin can inspect it)
CREATE OR ALTER PROCEDURE proj.sp_GetUserGroups
    @GroupId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        g.GroupId,
        g.GroupName,
        g.Description,
        g.IsActive,
        g.CreatedBy,
        g.CreatedDate,
        g.ModifiedBy,
        g.ModifiedDate,
        COUNT(CASE WHEN d.IsActive = 1 THEN 1 END) AS MemberCount
    FROM proj.TBL_USER_GROUP g
    LEFT JOIN proj.TBL_USER_GROUP_DETAIL d ON d.GroupId = g.GroupId
    WHERE
        (@GroupId IS NOT NULL AND g.GroupId = @GroupId)
        OR
        (@GroupId IS NULL AND g.IsActive = 1)
    GROUP BY
        g.GroupId, g.GroupName, g.Description, g.IsActive,
        g.CreatedBy, g.CreatedDate, g.ModifiedBy, g.ModifiedDate
    ORDER BY g.GroupName;
END;
GO

-- 3. sp_GetEmailAlertConfigs — only return active alerts in list view
CREATE OR ALTER PROCEDURE proj.sp_GetEmailAlertConfigs
    @AlertId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        a.AlertId,
        a.AlertName,
        a.AlertType,
        a.GroupId,
        g.GroupName,
        a.TemplateId,
        t.TemplateName,
        a.SqlViewName,
        a.Frequency,
        a.TimeOfDay,
        a.DayOfWeek,
        a.DayOfMonth,
        a.IsActive,
        a.SkipIfNoData,
        a.LastRunDate,
        a.LastSuccessDate,
        a.LastError,
        a.CreatedBy,
        a.CreatedDate,
        a.ModifiedBy,
        a.ModifiedDate
    FROM proj.TBL_EMAIL_ALERT_CONFIG a
    JOIN  proj.TBL_USER_GROUP    g ON g.GroupId    = a.GroupId
    JOIN  proj.TBL_EMAIL_TEMPLATE t ON t.TemplateId = a.TemplateId
    WHERE
        (@AlertId IS NOT NULL AND a.AlertId = @AlertId)
        OR
        (@AlertId IS NULL AND a.IsActive = 1)
    ORDER BY a.AlertName;
END;
GO

PRINT 'Soft-delete fixes applied.';
GO
