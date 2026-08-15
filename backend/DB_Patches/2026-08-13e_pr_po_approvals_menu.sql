-- =====================================================================
-- 2026-08-13e : Menu entry for the new "PR & PO Approvals" page
--
-- This was originally created directly against dev SYNERP without a
-- script; captured here so prod gets the same rows. Idempotent — safe
-- to re-run.
--
-- Page: frontend/src/procurement/PrPoApprovalsPage.js
-- Route registered in frontend/src/Layout.js as
--   /procurement/pr-po-approvals
--
-- Parent menu 10 = PROCUREMENT.
-- Roles granted view: 1 (ADMIN), 1010 (DEPARTMENT HEAD).
--
-- NOTE ON MenuId 1120: this is an explicit identifier, matching dev.
-- If prod's TBL_MENU already uses 1120 for something else, change the
-- id here AND in the TBL_ROLE_MENU rows below before running.
-- =====================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- ── Sanity check: parent menu must exist ─────────────────────────────
IF NOT EXISTS (SELECT 1 FROM PROJ.TBL_MENU WHERE MenuId = 10)
    THROW 50000, 'Parent menu 10 (PROCUREMENT) not found. Aborting.', 1;
GO

-- ── Guard against colliding with a different existing menu ───────────
IF EXISTS (SELECT 1 FROM PROJ.TBL_MENU
           WHERE MenuId = 1120 AND MenuUrl <> '/procurement/pr-po-approvals')
    THROW 50000, 'MenuId 1120 already exists in this database with a DIFFERENT MenuUrl. Choose another MenuId. Aborting.', 1;
GO

-- ── Menu row ─────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM PROJ.TBL_MENU WHERE MenuId = 1120)
BEGIN
    SET IDENTITY_INSERT PROJ.TBL_MENU ON;

    INSERT INTO PROJ.TBL_MENU (MenuId, ParentMenuId, MenuName, MenuUrl, MenuIcon, MenuOrder, IsActive)
    VALUES (1120, 10, 'PR & PO Approvals', '/procurement/pr-po-approvals', 'check-square', 10, 1);

    SET IDENTITY_INSERT PROJ.TBL_MENU OFF;

    PRINT 'Inserted TBL_MENU 1120 (PR & PO Approvals).';
END
ELSE
    PRINT 'TBL_MENU 1120 already present - skipped.';
GO

-- ── Role grants (view-only; this is a read-only reporting page) ───────
INSERT INTO PROJ.TBL_ROLE_MENU (RoleId, MenuId, CanView)
SELECT r.RoleId, 1120, 1
FROM (VALUES (1), (1010)) AS r(RoleId)
WHERE EXISTS (SELECT 1 FROM PROJ.TBL_ROLES        ro WHERE ro.RoleId = r.RoleId)
  AND NOT EXISTS (SELECT 1 FROM PROJ.TBL_ROLE_MENU rm WHERE rm.RoleId = r.RoleId AND rm.MenuId = 1120);
PRINT 'Role grants for menu 1120 ensured (roles 1 ADMIN, 1010 DEPARTMENT HEAD).';
GO

-- ── Verify ───────────────────────────────────────────────────────────
SELECT MenuId, ParentMenuId, MenuName, MenuUrl, MenuIcon, MenuOrder, IsActive
FROM PROJ.TBL_MENU WHERE MenuId = 1120;

SELECT RoleId, MenuId, CanView FROM PROJ.TBL_ROLE_MENU WHERE MenuId = 1120;
GO
