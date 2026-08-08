/* =====================================================================
   Update: SYNERP.proj - fix wrong VALUES on rows that already existed
   in target (missed by the earlier NOT-EXISTS backfill scripts, which
   only handled missing rows, not existing-but-wrong-value rows).
   Found via full DB-wide checksum sweep (2026-08).
   ===================================================================== */

USE SYNERP;
GO

-- 1. TBL_APP_SETTINGS: Smtp.FromName still has the default "WebERP" placeholder
UPDATE proj.TBL_APP_SETTINGS
SET SettingValue = s.SettingValue,
    ModifiedBy   = s.ModifiedBy,
    ModifiedDate = s.ModifiedDate
FROM proj.TBL_APP_SETTINGS t
JOIN SYN_PMS_IND.proj.TBL_APP_SETTINGS s ON s.SettingKey = t.SettingKey
WHERE t.SettingKey = 'Smtp.FromName' AND t.SettingValue <> s.SettingValue;

-- 2. TBL_ROLE_MENU_ACTION: 21 rows already existed in target with IsAllowed=0
--    while source has IsAllowed=1 for the same RoleMenuActionId (affects
--    Role 4 PROCUREMENT OFFICER, Role 8 ENGINEER, Role 1010)
UPDATE proj.TBL_ROLE_MENU_ACTION
SET IsAllowed = s.IsAllowed
FROM proj.TBL_ROLE_MENU_ACTION t
JOIN SYN_PMS_IND.proj.TBL_ROLE_MENU_ACTION s ON s.RoleMenuActionId = t.RoleMenuActionId
WHERE t.IsAllowed <> s.IsAllowed;

GO

-- Verify - both should return 0 rows
SELECT 'AppSettings still wrong' chk, COUNT(*) c
FROM proj.TBL_APP_SETTINGS t JOIN SYN_PMS_IND.proj.TBL_APP_SETTINGS s ON s.SettingKey = t.SettingKey
WHERE t.SettingKey = 'Smtp.FromName' AND t.SettingValue <> s.SettingValue
UNION ALL
SELECT 'RoleMenuAction still wrong', COUNT(*)
FROM proj.TBL_ROLE_MENU_ACTION t JOIN SYN_PMS_IND.proj.TBL_ROLE_MENU_ACTION s ON s.RoleMenuActionId = t.RoleMenuActionId
WHERE t.IsAllowed <> s.IsAllowed;
GO
