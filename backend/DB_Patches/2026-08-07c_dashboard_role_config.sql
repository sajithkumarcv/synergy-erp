/* ============================================================================
   Patch: "Dashboard Roles" admin setting — which KPI tiles/sections each
   role sees on their dashboard, previously hardcoded in Dashboard.js's
   ROLE_CONFIG object, now configurable via Settings > Dashboard Roles.

   Session: 2026-08-07, WebErp-Synergy / SYNERP.
   Applied to: SYNERP (dev) directly via the synerp MCP connector.
   Seed data migrates the EXACT values that used to live in Dashboard.js's
   hardcoded ROLE_CONFIG, so nothing changes for existing users until an
   admin actually edits something on the new settings page. Verified the
   seeded visible-row count (86) against a manual sum of the original
   hardcoded arrays.

   Requires code deploy alongside this script:
     - backend/Models/General/DashboardRoleConfig.cs (new)
     - backend/Controllers/General/DashboardController.cs
         (2 new endpoints: GET role-config, POST role-config/save)
     - frontend/src/settings/DashboardRoleConfig.js (new)
     - frontend/src/Layout.js (new route /settings/dashboard-roles)
     - frontend/src/Dashboard.js (cfg now prefers DB config, falls back to
       the existing hardcoded ROLE_CONFIG/DEFAULT_CONFIG unchanged)
   Backend needs a rebuild + restart — ASP.NET Core does not hot-reload
   controller/model changes.

   NOT fully idempotent: the menu-insert step below will create a DUPLICATE
   "Dashboard Roles" menu entry if run twice (TBL_MENU.MenuId is an identity
   column, no natural key to guard on). Everything else (table/seed/procs)
   is safe to re-run. Before re-running on a target DB, check first:
     SELECT * FROM PROJ.TBL_MENU WHERE MenuUrl = '/settings/dashboard-roles';
   and skip the menu/role-menu block if a row already exists.
   ============================================================================ */

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

-- ── 1. Table ─────────────────────────────────────────────────────────────
IF OBJECT_ID('PROJ.TBL_DASHBOARD_ROLE_CONFIG') IS NULL
BEGIN
    CREATE TABLE PROJ.TBL_DASHBOARD_ROLE_CONFIG (
        ConfigId     INT IDENTITY(1,1) PRIMARY KEY,
        RoleId       INT NOT NULL,
        ItemType     NVARCHAR(10) NOT NULL,   -- 'KPI' or 'SECTION'
        ItemKey      NVARCHAR(50) NOT NULL,
        IsVisible    BIT NOT NULL DEFAULT 1,
        CreatedBy    NVARCHAR(100) NOT NULL DEFAULT 'System',
        CreatedDate  DATETIME NOT NULL DEFAULT GETDATE(),
        ModifiedBy   NVARCHAR(100) NULL,
        ModifiedDate DATETIME NULL,
        CONSTRAINT FK_DashRoleConfig_Role FOREIGN KEY (RoleId) REFERENCES PROJ.TBL_ROLES(RoleId),
        CONSTRAINT UQ_DashRoleConfig UNIQUE (RoleId, ItemType, ItemKey)
    );
END
GO

-- ── 2. Seed data — mirrors Dashboard.js's old hardcoded ROLE_CONFIG.
--       Re-runnable: skips roles that already have rows.
--       IMPORTANT: RoleId values below are from dev SYNERP's TBL_ROLES.
--       Before running on another DB, re-map RoleName -> RoleId first:
--         SELECT RoleId, RoleName FROM PROJ.TBL_ROLES ORDER BY RoleName;
--       Dev mapping: ADMIN=1, PROCUREMENT OFFICER=4, FINANCE MANAGER=5,
--       ENGINEER=8, SR.ENGINEER=9, PROJ.MANAGER=11, SR.PROJ.MANAGER=12,
--       FINANCE OFFICER=13, ADMIN CORDINATOR=14, DEPARTMENT HEAD=1010.
-- ────────────────────────────────────────────────────────────────────────
DECLARE @Roles TABLE (RoleId INT);
INSERT INTO @Roles
SELECT RoleId FROM (VALUES (1),(14),(1010),(8),(5),(13),(11),(9),(12),(4)) v(RoleId)
WHERE RoleId NOT IN (SELECT DISTINCT RoleId FROM PROJ.TBL_DASHBOARD_ROLE_CONFIG);

DECLARE @Items TABLE (ItemType NVARCHAR(10), ItemKey NVARCHAR(50));
INSERT INTO @Items VALUES
 ('KPI','activeJobs'),('KPI','openPRs'),('KPI','openPOs'),('KPI','pendingApprovals'),('KPI','openInvoices'),
 ('SECTION','todayActivity'),('SECTION','myDrafts'),('SECTION','approvedPrs'),('SECTION','jobSummary'),
 ('SECTION','myApprovals'),('SECTION','procurement'),('SECTION','inventory'),('SECTION','financials'),('SECTION','jobCosting');

INSERT INTO PROJ.TBL_DASHBOARD_ROLE_CONFIG (RoleId, ItemType, ItemKey, IsVisible, CreatedBy)
SELECT r.RoleId, i.ItemType, i.ItemKey, 0, 'System-Seed'
FROM @Roles r CROSS JOIN @Items i;

UPDATE PROJ.TBL_DASHBOARD_ROLE_CONFIG SET IsVisible=1 WHERE RoleId=1 AND ItemKey IN ('activeJobs','openPRs','openPOs','pendingApprovals','openInvoices','todayActivity','myDrafts','approvedPrs','jobSummary','myApprovals','procurement','inventory','financials','jobCosting');
UPDATE PROJ.TBL_DASHBOARD_ROLE_CONFIG SET IsVisible=1 WHERE RoleId=14 AND ItemKey IN ('activeJobs','openPRs','openPOs','pendingApprovals','myDrafts','jobSummary','myApprovals','procurement');
UPDATE PROJ.TBL_DASHBOARD_ROLE_CONFIG SET IsVisible=1 WHERE RoleId=1010 AND ItemKey IN ('activeJobs','openPRs','openPOs','pendingApprovals','openInvoices','myDrafts','approvedPrs','jobSummary','myApprovals','procurement','financials','jobCosting');
UPDATE PROJ.TBL_DASHBOARD_ROLE_CONFIG SET IsVisible=1 WHERE RoleId=8 AND ItemKey IN ('activeJobs','pendingApprovals','myDrafts','jobSummary','myApprovals','jobCosting');
UPDATE PROJ.TBL_DASHBOARD_ROLE_CONFIG SET IsVisible=1 WHERE RoleId=5 AND ItemKey IN ('openInvoices','pendingApprovals','myApprovals','financials','jobCosting');
UPDATE PROJ.TBL_DASHBOARD_ROLE_CONFIG SET IsVisible=1 WHERE RoleId=13 AND ItemKey IN ('openInvoices','pendingApprovals','myApprovals','financials');
UPDATE PROJ.TBL_DASHBOARD_ROLE_CONFIG SET IsVisible=1 WHERE RoleId=11 AND ItemKey IN ('activeJobs','openPRs','openPOs','pendingApprovals','myDrafts','jobSummary','myApprovals','procurement','jobCosting');
UPDATE PROJ.TBL_DASHBOARD_ROLE_CONFIG SET IsVisible=1 WHERE RoleId=9 AND ItemKey IN ('activeJobs','openPRs','pendingApprovals','myDrafts','jobSummary','myApprovals','procurement','jobCosting');
UPDATE PROJ.TBL_DASHBOARD_ROLE_CONFIG SET IsVisible=1 WHERE RoleId=12 AND ItemKey IN ('activeJobs','openPRs','openPOs','pendingApprovals','openInvoices','myDrafts','jobSummary','myApprovals','procurement','financials','jobCosting');
UPDATE PROJ.TBL_DASHBOARD_ROLE_CONFIG SET IsVisible=1 WHERE RoleId=4 AND ItemKey IN ('openPRs','openPOs','pendingApprovals','todayActivity','approvedPrs','myDrafts','myApprovals','procurement','inventory');
GO

-- ── 2b. Follow-up fix (same day): 2 real roles existed in TBL_ROLES but were
--       never part of the original hardcoded ROLE_CONFIG this table migrated
--       from — "Procurement Manager" (distinct from "PROCUREMENT OFFICER")
--       and "Store". With zero config rows they fell back to Dashboard.js's
--       DEFAULT_CONFIG (shows almost everything), which read as "dashboard
--       shows a full view, section-based permission isn't working" even
--       though the feature itself was fine. Re-map RoleIds for the target
--       DB the same way as step 2 above before running elsewhere.
--       Dev mapping: Procurement Manager=1011, Store=1012.
-- ────────────────────────────────────────────────────────────────────────
DECLARE @Items2 TABLE (ItemType NVARCHAR(10), ItemKey NVARCHAR(50));
INSERT INTO @Items2 VALUES
 ('KPI','activeJobs'),('KPI','openPRs'),('KPI','openPOs'),('KPI','pendingApprovals'),('KPI','openInvoices'),
 ('SECTION','todayActivity'),('SECTION','myDrafts'),('SECTION','approvedPrs'),('SECTION','jobSummary'),
 ('SECTION','myApprovals'),('SECTION','procurement'),('SECTION','inventory'),('SECTION','financials'),('SECTION','jobCosting');

IF NOT EXISTS (SELECT 1 FROM PROJ.TBL_DASHBOARD_ROLE_CONFIG WHERE RoleId = 1011)
BEGIN
    -- Procurement Manager: same profile as PROCUREMENT OFFICER — purchase-team dashboard.
    INSERT INTO PROJ.TBL_DASHBOARD_ROLE_CONFIG (RoleId, ItemType, ItemKey, IsVisible, CreatedBy)
    SELECT 1011, ItemType, ItemKey, 0, 'System-Seed' FROM @Items2;
    UPDATE PROJ.TBL_DASHBOARD_ROLE_CONFIG SET IsVisible=1
    WHERE RoleId=1011 AND ItemKey IN ('openPRs','openPOs','pendingApprovals','todayActivity','approvedPrs','myDrafts','myApprovals','procurement','inventory');
END

IF NOT EXISTS (SELECT 1 FROM PROJ.TBL_DASHBOARD_ROLE_CONFIG WHERE RoleId = 1012)
BEGIN
    -- Store: inventory-operations-focused, minimal dashboard.
    INSERT INTO PROJ.TBL_DASHBOARD_ROLE_CONFIG (RoleId, ItemType, ItemKey, IsVisible, CreatedBy)
    SELECT 1012, ItemType, ItemKey, 0, 'System-Seed' FROM @Items2;
    UPDATE PROJ.TBL_DASHBOARD_ROLE_CONFIG SET IsVisible=1
    WHERE RoleId=1012 AND ItemKey IN ('pendingApprovals','myDrafts','myApprovals','inventory');
END
GO

-- Sanity check: every active role should have config rows now — if this
-- returns any rows, seed data is missing for that role (re-check its RoleId
-- against TBL_ROLES on the target DB and add an UPDATE block above).
SELECT r.RoleId, r.RoleName
FROM PROJ.TBL_ROLES r
LEFT JOIN PROJ.TBL_DASHBOARD_ROLE_CONFIG c ON c.RoleId = r.RoleId
WHERE r.IsActive = 1
GROUP BY r.RoleId, r.RoleName
HAVING COUNT(c.ConfigId) = 0;
GO

-- ── 3. sp_GetDashboardRoleConfig — 2 result sets: active roles, then all config rows ──
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
IF OBJECT_ID('PROJ.sp_GetDashboardRoleConfig') IS NULL
    EXEC('CREATE PROCEDURE PROJ.sp_GetDashboardRoleConfig AS BEGIN SET NOCOUNT ON; END');
GO
ALTER PROCEDURE proj.sp_GetDashboardRoleConfig
AS
BEGIN
    SET NOCOUNT ON;
    SELECT RoleId, RoleName FROM proj.TBL_ROLES WHERE IsActive = 1 ORDER BY RoleName;

    SELECT c.ConfigId, c.RoleId, c.ItemType, c.ItemKey, c.IsVisible
    FROM proj.TBL_DASHBOARD_ROLE_CONFIG c
    ORDER BY c.RoleId, c.ItemType, c.ItemKey;
END
GO

-- ── 4. sp_SetDashboardRoleConfig — single-cell upsert ───────────────────
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
IF OBJECT_ID('PROJ.sp_SetDashboardRoleConfig') IS NULL
    EXEC('CREATE PROCEDURE PROJ.sp_SetDashboardRoleConfig AS BEGIN SET NOCOUNT ON; END');
GO
ALTER PROCEDURE proj.sp_SetDashboardRoleConfig
    @RoleId      INT,
    @ItemType    NVARCHAR(10),
    @ItemKey     NVARCHAR(50),
    @IsVisible   BIT,
    @ModifiedBy  NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM proj.TBL_DASHBOARD_ROLE_CONFIG WHERE RoleId = @RoleId AND ItemType = @ItemType AND ItemKey = @ItemKey)
    BEGIN
        UPDATE proj.TBL_DASHBOARD_ROLE_CONFIG
        SET IsVisible = @IsVisible, ModifiedBy = @ModifiedBy, ModifiedDate = GETDATE()
        WHERE RoleId = @RoleId AND ItemType = @ItemType AND ItemKey = @ItemKey;
    END
    ELSE
    BEGIN
        INSERT INTO proj.TBL_DASHBOARD_ROLE_CONFIG (RoleId, ItemType, ItemKey, IsVisible, CreatedBy, CreatedDate)
        VALUES (@RoleId, @ItemType, @ItemKey, @IsVisible, @ModifiedBy, GETDATE());
    END
END
GO

-- ── 5. Menu entry — "Dashboard Roles" under Settings, ADMIN-only.
--       NOT idempotent (see header note) — check before re-running:
--         SELECT * FROM PROJ.TBL_MENU WHERE MenuUrl = '/settings/dashboard-roles';
--       ParentMenuId 22 = "Settings" on dev SYNERP; verify on target DB:
--         SELECT MenuId FROM PROJ.TBL_MENU WHERE MenuName='Settings' AND ParentMenuId IS NULL;
-- ────────────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM PROJ.TBL_MENU WHERE MenuUrl = '/settings/dashboard-roles')
BEGIN
    DECLARE @NewMenuId TABLE (MenuId INT);

    INSERT INTO PROJ.TBL_MENU (ParentMenuId, MenuName, MenuUrl, MenuIcon, MenuOrder, IsActive)
    OUTPUT inserted.MenuId INTO @NewMenuId
    VALUES (22, 'Dashboard Roles', '/settings/dashboard-roles', 'settings', 13, 1);

    INSERT INTO PROJ.TBL_ROLE_MENU (RoleId, MenuId, CanView)
    SELECT 1, MenuId, 1 FROM @NewMenuId;   -- RoleId 1 = ADMIN on dev SYNERP
END
GO

-- ── Post-check ───────────────────────────────────────────────────────────
SELECT o.name, m.uses_quoted_identifier, m.uses_ansi_nulls
FROM sys.sql_modules m JOIN sys.objects o ON o.object_id = m.object_id
WHERE o.name IN ('sp_GetDashboardRoleConfig','sp_SetDashboardRoleConfig');
GO
SELECT COUNT(*) AS TotalConfigRows, SUM(CAST(IsVisible AS INT)) AS VisibleRows FROM PROJ.TBL_DASHBOARD_ROLE_CONFIG;
GO
SELECT MenuId, MenuName, MenuUrl FROM PROJ.TBL_MENU WHERE MenuUrl = '/settings/dashboard-roles';
GO
