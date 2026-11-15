-- 2026-11-05a: "View Financials" permission on Jobs, and a permission check the API can call.
--   * Menu action VIEW_FINANCIALS on /jobs. Roles without it do not see order value, invoicing, payments,
--     credits, balance, advance or actual cost on the job page, the job list and the job overview.
--   * Granted to every role that already has the Finance tab (TAB_FINANCE) or Edit Financials (EDIT_FINANCE) allowed on /jobs,
--     found through the existing grants - no role name is used. Other roles can be changed in the role permissions.
--   * proj.sp_UserCanDo (user name, menu url, action code) -> CanDo bit. Same rule the menu uses: any of the user's
--     roles with the action allowed.
-- Existing data untouched. Idempotent. All or nothing. Run per database, one at a time. Run with sqlcmd -I.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

BEGIN TRY
    BEGIN TRAN;

    DECLARE @msg NVARCHAR(400), @sql NVARCHAR(MAX);

    DECLARE @jobsMenu INT = (SELECT MenuId FROM proj.TBL_MENU WHERE MenuUrl = '/jobs');
    IF @jobsMenu IS NULL BEGIN SET @msg = 'Jobs menu (/jobs) not found.'; THROW 50001, @msg, 1; END

    IF NOT EXISTS (SELECT 1 FROM proj.TBL_MENU_ACTIONS WHERE MenuId = @jobsMenu AND ActionCode = 'VIEW_FINANCIALS')
    BEGIN
        INSERT INTO proj.TBL_MENU_ACTIONS (MenuId, ActionName, ActionCode, IsActive)
        VALUES (@jobsMenu, 'View Financials', 'VIEW_FINANCIALS', 1);
        PRINT 'Action VIEW_FINANCIALS: added.';
    END
    ELSE PRINT 'Action VIEW_FINANCIALS: already there.';

    DECLARE @viewFin INT = (SELECT ActionId FROM proj.TBL_MENU_ACTIONS WHERE MenuId = @jobsMenu AND ActionCode = 'VIEW_FINANCIALS');
    DECLARE @tabFin  INT = (SELECT ActionId FROM proj.TBL_MENU_ACTIONS WHERE MenuId = @jobsMenu AND ActionCode = 'TAB_FINANCE');
    DECLARE @editFin INT = (SELECT ActionId FROM proj.TBL_MENU_ACTIONS WHERE MenuId = @jobsMenu AND ActionCode = 'EDIT_FINANCE');
    IF @tabFin IS NULL BEGIN SET @msg = 'Action TAB_FINANCE on /jobs not found.'; THROW 50001, @msg, 1; END

    INSERT INTO proj.TBL_ROLE_MENU_ACTION (RoleId, MenuId, ActionId, IsAllowed)
    SELECT DISTINCT t.RoleId, @jobsMenu, @viewFin, 1
    FROM proj.TBL_ROLE_MENU_ACTION t
    WHERE t.MenuId = @jobsMenu AND t.ActionId IN (@tabFin, ISNULL(@editFin, @tabFin)) AND t.IsAllowed = 1
      AND NOT EXISTS (SELECT 1 FROM proj.TBL_ROLE_MENU_ACTION x WHERE x.RoleId = t.RoleId AND x.MenuId = @jobsMenu AND x.ActionId = @viewFin);
    PRINT CONCAT('VIEW_FINANCIALS granted to ', @@ROWCOUNT, ' role(s) that have the Finance tab or Edit Financials.');

    SET @sql = N'
CREATE OR ALTER PROCEDURE proj.sp_UserCanDo
    @UserName   NVARCHAR(100),
    @MenuUrl    NVARCHAR(200),
    @ActionCode NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT CAST(CASE WHEN EXISTS (
        SELECT 1
        FROM proj.TBL_USERS u
        JOIN proj.TBL_USER_ROLES ur         ON ur.UserId = u.UserId
        JOIN proj.TBL_ROLE_MENU_ACTION rma  ON rma.RoleId = ur.RoleId AND rma.IsAllowed = 1
        JOIN proj.TBL_MENU_ACTIONS ma       ON ma.ActionId = rma.ActionId AND ma.MenuId = rma.MenuId AND ma.IsActive = 1
        JOIN proj.TBL_MENU m                ON m.MenuId = rma.MenuId AND m.MenuUrl = @MenuUrl
        WHERE u.UserName = @UserName AND ma.ActionCode = @ActionCode
    ) THEN 1 ELSE 0 END AS BIT) AS CanDo;
END';
    EXEC (@sql);
    PRINT 'sp_UserCanDo: created or altered.';

    COMMIT;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    THROW;
END CATCH
GO
