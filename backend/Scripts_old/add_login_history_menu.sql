-- ============================================================================
-- Add the "Login History" admin page to the Settings menu (parent 22).
-- ADMIN-only (the Auth/login-history endpoint is [Authorize(Roles="ADMIN")]).
-- Re-runnable: matches by URL so it is idempotent across client databases.
-- MenuId / RoleMenuId are IDENTITY columns — never specified explicitly.
-- ============================================================================

DECLARE @Url NVARCHAR(200) = '/settings/login-history';

IF NOT EXISTS (SELECT 1 FROM proj.TBL_MENU WHERE MenuUrl = @Url)
BEGIN
    INSERT INTO proj.TBL_MENU (ParentMenuId, MenuName, MenuUrl, MenuIcon, MenuOrder, IsActive)
    VALUES (22, 'Login History', @Url, 'settings', 12, 1);
END
ELSE
BEGIN
    -- Ensure it is active / correctly named if a prior run created it.
    UPDATE proj.TBL_MENU
    SET    MenuName = 'Login History', ParentMenuId = 22, IsActive = 1
    WHERE  MenuUrl = @Url;
END

DECLARE @MenuId    INT = (SELECT MenuId FROM proj.TBL_MENU  WHERE MenuUrl  = @Url);
DECLARE @AdminRole INT = (SELECT RoleId FROM proj.TBL_ROLES WHERE RoleName = 'ADMIN');

-- Grant view access to ADMIN (only if not already present)
IF @MenuId IS NOT NULL AND @AdminRole IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM proj.TBL_ROLE_MENU WHERE MenuId = @MenuId AND RoleId = @AdminRole)
BEGIN
    INSERT INTO proj.TBL_ROLE_MENU (RoleId, MenuId, CanView)
    VALUES (@AdminRole, @MenuId, 1);
END
