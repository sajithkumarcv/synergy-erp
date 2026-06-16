-- ============================================================
-- Add Payables menu entries
-- Run once on ERPDB.
-- Finds the Finance parent group (same parent as Receivables)
-- and inserts Payables immediately after it.
-- ============================================================

-- 1. Payables main menu (same parent as Receivables, ordered after it)
INSERT INTO proj.TBL_MENU (ParentMenuId, MenuName, MenuUrl, MenuIcon, MenuOrder, IsActive)
SELECT
    recv.ParentMenuId,
    N'Payables',
    N'/payables',
    recv.MenuIcon,
    recv.MenuOrder + 1,
    1
FROM proj.TBL_MENU recv
WHERE recv.MenuUrl = N'/receivables'
  AND NOT EXISTS (
      SELECT 1 FROM proj.TBL_MENU WHERE MenuUrl = N'/payables'
  );

-- 2. Shift any menus that were already sitting at MenuOrder >= Receivables+1
--    under the same parent, so Payables slots in cleanly.
--    (Run only when the Payables row was just inserted above.)
UPDATE proj.TBL_MENU
SET    MenuOrder = MenuOrder + 1
WHERE  ParentMenuId = (SELECT ParentMenuId FROM proj.TBL_MENU WHERE MenuUrl = N'/receivables')
  AND  MenuUrl     != N'/payables'
  AND  MenuUrl     != N'/receivables'
  AND  MenuOrder   >= (SELECT MenuOrder FROM proj.TBL_MENU WHERE MenuUrl = N'/receivables') + 1;

-- 3. Verify
SELECT MenuId, ParentMenuId, MenuName, MenuUrl, MenuIcon, MenuOrder, IsActive
FROM   proj.TBL_MENU
WHERE  ParentMenuId = (SELECT ParentMenuId FROM proj.TBL_MENU WHERE MenuUrl = N'/receivables')
ORDER  BY MenuOrder;
