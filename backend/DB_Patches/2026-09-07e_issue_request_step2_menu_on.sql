-- 2026-09-07: Issue Request — BUILD STEP 2c of 5: turn the menu on
--
-- Apply to: ERPDB
-- Requires: 2026-09-07b (menu row, inserted inactive), 2026-09-07c (procs),
--           2026-09-07d (statuses), AND the frontend deploy that adds the routes
--           /inventory-issue-request and /inventory-issue-request/:id in Layout.js.
--
-- Step 1 deliberately inserted the menu row with IsActive = 0 so nobody could
-- click through to a screen that did not exist yet. The screens now exist:
--   frontend/src/inventory/issuerequest/IssueRequest.js
--   frontend/src/inventory/issuerequest/IssueRequestDetailPage.js
--   frontend/src/inventory/issuerequest/tabs/{IssueRequestOverviewTab,IssueRequestLinesTab}.js
--
-- Apply this ONLY together with (or after) that frontend build. Applying it
-- against an older frontend puts a dead link in every user's Inventory menu.
--
-- Roles still need the ISR menu permissions granted in Role Management before
-- anyone but an admin sees it.
--
-- Idempotent.

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
GO

UPDATE proj.TBL_MENU
SET IsActive = 1
WHERE MenuUrl = '/inventory-issue-request' AND IsActive = 0;
GO

/* Verify */
SELECT m.MenuId, m.MenuName, m.MenuUrl, m.MenuOrder,
       CASE WHEN m.IsActive = 1 THEN 'ACTIVE' ELSE 'inactive' END AS State,
       (SELECT COUNT(*) FROM proj.TBL_MENU_ACTIONS a WHERE a.MenuId = m.MenuId) AS Actions
FROM proj.TBL_MENU m
WHERE m.MenuUrl = '/inventory-issue-request';
GO
