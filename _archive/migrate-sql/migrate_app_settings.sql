/* =====================================================================
   Migration: SYN_PMS_IND -> SYNERP (proj schema)
   Scope: TBL_APP_SETTINGS - backfill 1 missing row.
   PK is SettingKey (string), not identity - plain insert.
   No computed columns.
   ===================================================================== */

USE SYNERP;
GO

INSERT INTO proj.TBL_APP_SETTINGS
  (SettingKey, SettingValue, Description, ModifiedBy, ModifiedDate)
SELECT
  s.SettingKey, s.SettingValue, s.Description, s.ModifiedBy, s.ModifiedDate
FROM SYN_PMS_IND.proj.TBL_APP_SETTINGS s
WHERE NOT EXISTS (SELECT 1 FROM proj.TBL_APP_SETTINGS x WHERE x.SettingKey = s.SettingKey);
GO

-- Verify
SELECT * FROM proj.TBL_APP_SETTINGS WHERE SettingKey = 'Biz.Print.TAXLABEL';
GO
