-- =====================================================================
-- 2026-09-09  Purchase price-variance warning - configuration
--
-- APPLY TO: SYNERP (dev) first. Production after sign-off.
--
-- Four rows in proj.TBL_APP_SETTINGS driving the PO price-variance warning.
--
-- THE 'Biz.' PREFIX IS MANDATORY: AppSettingsController calls
-- proj.sp_GetAppSettings with Prefix = 'Biz.', so only that namespace is
-- exposed to the frontend. A key outside it is invisible to the browser.
--
-- Defaults chosen to warn, never block. Setting WarnPercent to 0 disables
-- the whole feature without a code change.
--
-- Data only - no schema change, no procedure change. Idempotent.
-- =====================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

MERGE proj.TBL_APP_SETTINGS AS tgt
USING (VALUES
    ('Biz.PriceVariance.WarnPercent',     '10',
     'PO unit price this % above the weighted-average of past purchases raises an amber warning. 0 disables price-variance warnings entirely.'),
    ('Biz.PriceVariance.CriticalPercent', '25',
     'PO unit price at or above this % over the baseline raises a red warning. 0 keeps every warning amber.'),
    ('Biz.PriceVariance.MinUnitPrice',    '1',
     'Items whose baseline price (base currency) is below this are never warned on - a large % swing on a trivial item is noise.'),
    ('Biz.PriceVariance.MinHistoryCount', '1',
     'Comparable prior purchases required before any warning. 1 mirrors SAP''s info record, which carries the last PO price.')
) AS src (SettingKey, SettingValue, Description)
    ON tgt.SettingKey = src.SettingKey
WHEN NOT MATCHED BY TARGET THEN
    INSERT (SettingKey, SettingValue, Description, ModifiedBy, ModifiedDate)
    VALUES (src.SettingKey, src.SettingValue, src.Description, 'system', GETDATE());
GO

-- ── verification ─────────────────────────────────────────────────────
SELECT SettingKey, SettingValue, Description
FROM   proj.TBL_APP_SETTINGS
WHERE  SettingKey LIKE 'Biz.PriceVariance.%'
ORDER BY SettingKey;
GO
