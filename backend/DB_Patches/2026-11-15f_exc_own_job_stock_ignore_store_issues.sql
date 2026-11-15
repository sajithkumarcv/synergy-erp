-- 2026-11-15f: a job's OWN job stock is no longer reduced by store-stock issues charged to that job.
--
-- Bug (from 2026-11-02e): the "own job stock" figure used by a "Not Include in Costing" note was
--     job-stock receipts of the job  -  EVERY QtyOut ledger row that carries the job id.
-- An "Include in Costing" issue is taken from STORE stock (IsJobStock = 0) but its ledger row carries the job id, so it was
-- subtracted from the job's own stock too. Example (SYNERP): job EC26-300004 holds 3 of item 5257 as job stock and had 8
-- store pieces issued to it: availability showed -7 while the job stock is 3 (sp_ConfirmStockIssue's own check, 2026-11-14b,
-- counts only IsJobStock = 1 and would have allowed 3). When that figure is <= 0 the note also skipped its own job stock and
-- fell through to the in-house rule. India and UAE restores: no job has this pattern yet, so nothing is wrong there today.
--
-- Fix: only job-stock ledger rows (IsJobStock = 1) of that job count, in and out.
--   proj.sp_GetStockAvailability  (own job stock for the in-house test, and the Excluding-Costing available quantity)
--   proj.sp_ConfirmStockIssue     (own job stock for the in-house test)
-- Marker-based: only that expression changes; nothing else in either procedure. Idempotent (marker 2026-11-15f).
-- Apply to: SYNERP, then each company DB. Run with sqlcmd -I.

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
SET NOCOUNT ON;
GO

DECLARE @old NVARCHAR(200) = N'AND JobId = @JobId THEN QtyOut ELSE 0 END), 0)';
DECLARE @new NVARCHAR(200) = N'AND IsJobStock = 1 /* 2026-11-15f */ AND JobId = @JobId THEN QtyOut ELSE 0 END), 0)';
DECLARE @t TABLE (ProcName NVARCHAR(100), Expected INT);
INSERT INTO @t VALUES (N'proj.sp_GetStockAvailability', 2), (N'proj.sp_ConfirmStockIssue', 1);

DECLARE @p NVARCHAR(100), @exp INT, @def NVARCHAR(MAX), @n INT, @pos INT, @msg NVARCHAR(400);
DECLARE c CURSOR LOCAL FAST_FORWARD FOR SELECT ProcName, Expected FROM @t;
OPEN c; FETCH NEXT FROM c INTO @p, @exp;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @def = OBJECT_DEFINITION(OBJECT_ID(@p));
    IF @def IS NULL BEGIN SET @msg = CONCAT(@p, N' not found.'); THROW 50020, @msg, 1; END
    IF CHARINDEX(N'2026-11-15f', @def) = 0
    BEGIN
        SET @n = (LEN(@def) - LEN(REPLACE(@def, @old, N''))) / LEN(@old);
        IF @n <> @exp BEGIN SET @msg = CONCAT(@p, N': expected ', @exp, N' own-job-stock expression(s), found ', @n, N' - patch not applied.'); THROW 50021, @msg, 1; END
        SET @def = REPLACE(@def, @old, @new);
        SET @pos = PATINDEX(N'%CREATE[ ]%PROCEDURE%' COLLATE Latin1_General_CS_AS, @def);
        IF @pos = 0 BEGIN SET @msg = CONCAT(@p, N': CREATE PROCEDURE not found.'); THROW 50022, @msg, 1; END
        SET @def = STUFF(@def, @pos, 6, N'ALTER');
        EXEC (@def);
    END
    FETCH NEXT FROM c INTO @p, @exp;
END
CLOSE c; DEALLOCATE c;
GO
