/* ─────────────────────────────────────────────────────────────────────────
   0000_template.sql  —  copy this for every DB patch. Rename to NNNN_name.sql
   (0001_, 0002_, …). Apply to EACH company DB. Idempotent + self-recording:
   re-running does nothing once applied.

   Rules:
   • Bump @PatchNo + @FileName to match the file name.
   • Make every change idempotent (guard with IF NOT EXISTS / COL_LENGTH / etc.)
     so a half-applied patch can be re-run safely.
   • For STORED PROCEDURE / VIEW / FUNCTION changes: CREATE OR ALTER must be the
     only statement in its batch, so run it via EXEC(N'CREATE OR ALTER PROC …')
     inside the block (see the commented example), or ship it as its own guarded
     script and still INSERT the ledger row here.
   ───────────────────────────────────────────────────────────────────────── */
SET XACT_ABORT ON;

DECLARE @PatchNo     INT           = 0;                       -- ← set (e.g. 1)
DECLARE @FileName    NVARCHAR(260) = N'0000_template.sql';    -- ← set
DECLARE @Description NVARCHAR(500) = N'Template — no-op.';    -- ← set

IF EXISTS (SELECT 1 FROM proj.TBL_DB_PATCH WHERE PatchNo = @PatchNo)
BEGIN
    PRINT 'Patch ' + CAST(@PatchNo AS VARCHAR(10)) + ' already applied — skipping.';
    RETURN;
END

BEGIN TRAN;

    /* ─── your idempotent changes go here ───────────────────────────────
       Example — add a column only if missing:
         IF COL_LENGTH('proj.TBL_SOMETHING', 'NewCol') IS NULL
             ALTER TABLE proj.TBL_SOMETHING ADD NewCol INT NULL;

       Example — create/alter a stored proc (dynamic SQL keeps it in-batch):
         EXEC(N'CREATE OR ALTER PROCEDURE proj.sp_Something
                AS BEGIN SET NOCOUNT ON; SELECT 1 END');
       ──────────────────────────────────────────────────────────────────── */

    INSERT proj.TBL_DB_PATCH (PatchNo, FileName, Description)
    VALUES (@PatchNo, @FileName, @Description);

COMMIT;
PRINT 'Patch ' + CAST(@PatchNo AS VARCHAR(10)) + ' applied.';
GO
