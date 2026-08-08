/* =====================================================================
   Update: SYNERP.proj.TBL_JOBTYPE.CurrentSeries realignment
   This is a migration - SYN_PMS_IND retires, SYNERP continues the same
   job numbering sequence. Target must pick up EXACTLY where source left
   off, so CurrentSeries is set unconditionally to source's value for
   every job type - including rows where target is currently AHEAD
   (those extra increments came from test jobs created in SYNERP during
   setup, not real continuous-sequence jobs, and must not leave gaps).
   ===================================================================== */

USE SYNERP;
GO

UPDATE t
SET t.CurrentSeries = s.CurrentSeries,
    t.ModifiedDate  = SYSUTCDATETIME()
FROM proj.TBL_JOBTYPE t
JOIN SYN_PMS_IND.proj.TBL_JOBTYPE s ON s.JobTypeId = t.JobTypeId;
GO

-- Verify - should show target >= source for every row now
SELECT s.JobTypeId, s.CurrentSeries AS source_series, t.CurrentSeries AS target_series
FROM SYN_PMS_IND.proj.TBL_JOBTYPE s
JOIN proj.TBL_JOBTYPE t ON t.JobTypeId = s.JobTypeId
ORDER BY s.JobTypeId;
GO
