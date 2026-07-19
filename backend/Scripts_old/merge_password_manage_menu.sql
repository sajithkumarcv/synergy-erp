-- ============================================================================
-- Merge "Budget Password" + "Invoice Revise Password" menu into one
-- "Password Manage" page (/settings/password-manage).
--
-- - Rename the Budget Password menu row (MenuId 44 by URL) to "Password Manage"
--   and repoint its URL.
-- - Copy any role access from the invoice-password menu row onto it, so roles
--   that only had invoice access (e.g. FINANCE MANAGER) keep access.
-- - Deactivate the invoice-password menu row.
--
-- Re-runnable: matches by URL so it is idempotent across client databases.
-- ============================================================================

DECLARE @BudgetMenuId  INT = (SELECT MenuId FROM proj.TBL_MENU WHERE MenuUrl = '/settings/budget-password');
DECLARE @InvoiceMenuId INT = (SELECT MenuId FROM proj.TBL_MENU WHERE MenuUrl = '/settings/invoice-revise-password');

-- If a previous run already renamed the budget row, pick it up by the new URL.
IF @BudgetMenuId IS NULL
    SET @BudgetMenuId = (SELECT MenuId FROM proj.TBL_MENU WHERE MenuUrl = '/settings/password-manage');

IF @BudgetMenuId IS NOT NULL
BEGIN
    -- 1. Rename + repoint the budget menu row → Password Manage
    UPDATE proj.TBL_MENU
    SET    MenuName = 'Password Manage',
           MenuUrl  = '/settings/password-manage',
           IsActive = 1
    WHERE  MenuId = @BudgetMenuId;

    -- 2. Copy invoice-menu role access onto the merged menu (only roles that
    --    don't already have a row for it).
    IF @InvoiceMenuId IS NOT NULL
    BEGIN
        INSERT INTO proj.TBL_ROLE_MENU (RoleId, MenuId, CanView)
        SELECT rm.RoleId, @BudgetMenuId, 1
        FROM   proj.TBL_ROLE_MENU rm
        WHERE  rm.MenuId = @InvoiceMenuId
          AND  ISNULL(rm.CanView, 1) = 1
          AND  NOT EXISTS (
                   SELECT 1 FROM proj.TBL_ROLE_MENU x
                   WHERE  x.RoleId = rm.RoleId AND x.MenuId = @BudgetMenuId);

        -- 3. Deactivate the invoice-password menu row
        UPDATE proj.TBL_MENU
        SET    IsActive = 0
        WHERE  MenuId = @InvoiceMenuId;
    END
END
