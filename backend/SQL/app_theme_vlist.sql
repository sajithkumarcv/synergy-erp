-- ============================================================================
-- Seed proj.TBL_VLIST with the app themes defined in frontend ThemeContext.js.
-- Idempotent MERGE: inserts missing keys, updates names/sort order, and
-- deletes AppTheme rows that no longer match a real theme key.
-- Keep the VALUES list in sync with the THEMES object in ThemeContext.js.
-- ============================================================================

MERGE proj.TBL_VLIST AS tgt
USING (VALUES
    ('ocean-blue',    'Ocean Blue',    1),
    ('midnight-dark', 'Midnight Dark', 2),
    ('carbon-dark',   'Carbon Dark',   3),
    ('forest-green',  'Forest Green',  4)
) AS src (ItemValue, ItemDescription, SortOrder)
ON  tgt.TypeName = 'General' AND tgt.ListName = 'AppTheme' AND tgt.ItemValue = src.ItemValue
WHEN MATCHED AND (tgt.ItemDescription <> src.ItemDescription
                  OR ISNULL(tgt.SortOrder, 0) <> src.SortOrder
                  OR ISNULL(tgt.IsActive, 0) <> 1) THEN
    UPDATE SET ItemDescription = src.ItemDescription,
               SortOrder       = src.SortOrder,
               IsActive        = 1,
               ModifiedBy      = 'system',
               ModifiedDate    = GETDATE()
WHEN NOT MATCHED BY TARGET THEN
    INSERT (TypeName, ListName, ItemValue, ItemDescription, IsActive, SortOrder, CreatedBy, CreatedDate)
    VALUES ('General', 'AppTheme', src.ItemValue, src.ItemDescription, 1, src.SortOrder, 'system', GETDATE())
WHEN NOT MATCHED BY SOURCE AND tgt.TypeName = 'General' AND tgt.ListName = 'AppTheme' THEN
    DELETE;
GO
