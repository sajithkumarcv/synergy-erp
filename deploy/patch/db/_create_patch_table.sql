/* ─────────────────────────────────────────────────────────────────────────
   _create_patch_table.sql  —  run ONCE per SYNERP-based DB (dev + production),
   right after the base. Creates proj.TBL_DB_PATCH, the ledger that records
   which numbered patches have been applied to THIS database. Idempotent:
   safe to re-run.
   ───────────────────────────────────────────────────────────────────────── */
IF NOT EXISTS (
    SELECT 1 FROM sys.tables t
    JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = 'proj' AND t.name = 'TBL_DB_PATCH')
BEGIN
    CREATE TABLE proj.TBL_DB_PATCH (
        PatchNo     INT           NOT NULL,
        FileName    NVARCHAR(260) NOT NULL,
        Description NVARCHAR(500) NULL,
        AppliedOn   DATETIME      NOT NULL CONSTRAINT DF_TBL_DB_PATCH_AppliedOn DEFAULT (GETDATE()),
        AppliedBy   NVARCHAR(128) NOT NULL CONSTRAINT DF_TBL_DB_PATCH_AppliedBy DEFAULT (SUSER_SNAME()),
        CONSTRAINT PK_TBL_DB_PATCH PRIMARY KEY (PatchNo)
    );
    PRINT 'proj.TBL_DB_PATCH created.';
END
ELSE
    PRINT 'proj.TBL_DB_PATCH already exists — nothing to do.';
GO

SELECT ISNULL(MAX(PatchNo), 0) AS CurrentPatchLevel FROM proj.TBL_DB_PATCH;
GO
