/* =====================================================================
   Update: SYNERP.proj.TBL_DOCUMENT_SERIES.CurrentSeries realignment
   Same reasoning as update_jobtype_current_series.sql: this is a
   migration - SYN_PMS_IND retires, SYNERP continues the same document
   numbering sequence. Target must pick up EXACTLY where source left
   off, so CurrentSeries is set unconditionally to source's value for
   every doc type (not just where target is behind), to avoid gaps or
   collisions in PO/PR/GRN/Invoice/etc. numbering going forward.

   Known diff before this runs (found via full DB checksum sweep):
     PO: source=4, target=1  (target never advanced after the 4 migrated POs)
     PR: source=8, target=1  (target never advanced after the 8 migrated PRs)
   All other DocTypeId rows already matched.
   ===================================================================== */

USE SYNERP;
GO

UPDATE t
SET t.CurrentSeries = s.CurrentSeries,
    t.ModifiedDate   = SYSUTCDATETIME()
FROM proj.TBL_DOCUMENT_SERIES t
JOIN SYN_PMS_IND.proj.TBL_DOCUMENT_SERIES s ON s.DocTypeId = t.DocTypeId;
GO

-- Verify - source and target CurrentSeries should match for every row now
SELECT s.DocTypeId, s.DocTypeName, s.CurrentSeries AS source_series, t.CurrentSeries AS target_series
FROM SYN_PMS_IND.proj.TBL_DOCUMENT_SERIES s
JOIN proj.TBL_DOCUMENT_SERIES t ON t.DocTypeId = s.DocTypeId
ORDER BY s.DocTypeId;
GO
