-- 2026-10-21: BOM "PO Qty" was counted twice on every PO line save.
--
-- Since 2026-09-27d, proj.sp_RecalcPrPoCreatedQty derives the PR line's and the BOM line's PoCreatedQty (and
-- BomStatus) from the PO lines that exist. sp_SetPOLine (insert and edit branches) and sp_DeletePOLine call it,
-- but each still ran its old delta UPDATE on proj.TBL_BOM_DETAILS AFTER the recompute:
--   add a line of 1  -> BOM PO Qty +2     edit 1 -> 3 -> BOM off by +2     delete a line of 1 -> BOM 1 too low
-- This patch removes those three delta blocks. The recompute already writes PoCreatedQty and BomStatus.
-- (sp_ChangePoLineStatus runs its delta BEFORE the recompute, so the recompute overwrites it - no change there.)
--
-- Apply to: SYNERP, then each company DB. Existing wrong BOM lines are fixed by 2026-10-21_bom_poqty_repair.sql.
-- Run with sqlcmd -I (QUOTED_IDENTIFIER ON) so the procedures are stored with the option ON.
--
-- Anchored: each marker must be found exactly once, in the right order, or the patch stops and changes nothing.
-- Idempotent: when none of the three blocks is present it prints a message and does nothing.

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

DECLARE @set NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID(N'proj.sp_SetPOLine'));
DECLARE @del NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID(N'proj.sp_DeletePOLine'));
IF @set IS NULL OR @del IS NULL THROW 50001, 'sp_SetPOLine or sp_DeletePOLine not found.', 1;

DECLARE @sI NVARCHAR(200) = N'IF @BomDetailId_I IS NOT NULL', @eI NVARCHAR(200) = N'WHERE BomId = @BomDetailId_I;';
DECLARE @sU NVARCHAR(200) = N'IF @BomDetailId_U IS NOT NULL', @eU NVARCHAR(200) = N'WHERE BomId = @BomDetailId_U;';
DECLARE @sD NVARCHAR(200) = N'IF @BomDetailId IS NOT NULL',   @eD NVARCHAR(200) = N'AND ISNULL(PoCreatedQty,0) >= @OrderedQty;';

DECLARE @present INT =
      IIF(CHARINDEX(@sI, @set) > 0, 1, 0) + IIF(CHARINDEX(@sU, @set) > 0, 1, 0) + IIF(CHARINDEX(@sD, @del) > 0, 1, 0);
IF @present = 0
BEGIN
    PRINT 'Already applied - sp_SetPOLine / sp_DeletePOLine have no BOM delta block. Nothing changed.';
    RETURN;
END

DECLARE @cI NVARCHAR(200) = N'-- BOM PoCreatedQty / BomStatus are derived by sp_RecalcPrPoCreatedQty above (2026-10-21: delta removed, it double-counted).';
DECLARE @sp INT, @ep INT, @en INT, @gap NVARCHAR(MAX);

-- ── sp_SetPOLine: insert-branch block ──
SET @sp = CHARINDEX(@sI, @set); SET @ep = CHARINDEX(@eI, @set);
IF @sp = 0 OR @ep = 0 OR @ep < @sp
   OR LEN(@set) - LEN(REPLACE(@set, @sI, N'')) <> LEN(@sI) OR LEN(@set) - LEN(REPLACE(@set, @eI, N'')) <> LEN(@eI)
    THROW 50002, 'sp_SetPOLine insert-branch markers not found exactly once / wrong order. Nothing changed.', 1;
SET @set = LEFT(@set, @sp - 1) + @cI + SUBSTRING(@set, @ep + LEN(@eI), LEN(@set));

-- ── sp_SetPOLine: edit-branch block ──
SET @sp = CHARINDEX(@sU, @set); SET @ep = CHARINDEX(@eU, @set);
IF @sp = 0 OR @ep = 0 OR @ep < @sp
   OR LEN(@set) - LEN(REPLACE(@set, @sU, N'')) <> LEN(@sU) OR LEN(@set) - LEN(REPLACE(@set, @eU, N'')) <> LEN(@eU)
    THROW 50003, 'sp_SetPOLine edit-branch markers not found exactly once / wrong order. Nothing changed.', 1;
SET @set = LEFT(@set, @sp - 1) + @cI + SUBSTRING(@set, @ep + LEN(@eU), LEN(@set));

-- ── sp_DeletePOLine: IF ... BEGIN UPDATE ... END block (take the END that closes it) ──
SET @sp = CHARINDEX(@sD, @del); SET @ep = CHARINDEX(@eD, @del);
IF @sp = 0 OR @ep = 0 OR @ep < @sp
   OR LEN(@del) - LEN(REPLACE(@del, @sD, N'')) <> LEN(@sD) OR LEN(@del) - LEN(REPLACE(@del, @eD, N'')) <> LEN(@eD)
    THROW 50004, 'sp_DeletePOLine markers not found exactly once / wrong order. Nothing changed.', 1;
SET @en = CHARINDEX(N'END', @del, @ep + LEN(@eD));
SET @gap = SUBSTRING(@del, @ep + LEN(@eD), @en - (@ep + LEN(@eD)));
SET @gap = REPLACE(REPLACE(REPLACE(REPLACE(@gap, NCHAR(13), N''), NCHAR(10), N''), NCHAR(9), N''), N' ', N'');
IF @en = 0 OR @gap <> N''
    THROW 50005, 'sp_DeletePOLine: the END closing the BOM block was not where expected. Nothing changed.', 1;
SET @del = LEFT(@del, @sp - 1) + @cI + SUBSTRING(@del, @en + 3, LEN(@del));

-- ── CREATE -> ALTER (the text must start with CREATE ... PROCEDURE) ──
SET @sp = CHARINDEX(N'CREATE', @set);
IF @sp = 0 THROW 50006, 'sp_SetPOLine header not found. Nothing changed.', 1;
SET @set = STUFF(@set, @sp, 6, N'ALTER');
SET @sp = CHARINDEX(N'CREATE', @del);
IF @sp = 0 THROW 50007, 'sp_DeletePOLine header not found. Nothing changed.', 1;
SET @del = STUFF(@del, @sp, 6, N'ALTER');

IF CHARINDEX(N'BomDetailId_I IS NOT NULL', @set) > 0 OR CHARINDEX(N'BomDetailId_U IS NOT NULL', @set) > 0
   OR CHARINDEX(N'UPDATE PROJ.TBL_BOM_DETAILS', @set + @del) > 0
    THROW 50008, 'A BOM update is still present after the cut. Nothing changed.', 1;

BEGIN TRAN;
EXEC sys.sp_executesql @set;
EXEC sys.sp_executesql @del;
COMMIT;
PRINT 'Applied: BOM delta blocks removed from sp_SetPOLine (2) and sp_DeletePOLine (1).';
GO
