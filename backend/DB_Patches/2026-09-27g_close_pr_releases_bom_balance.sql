-- ─────────────────────────────────────────────────────────────────────────────
-- 2026-09-27g  Closing a PR must release the unordered balance on the BOM.
--
-- THE BUG. There are two ways to close, and only one updates the BOM quantity:
--   * Close a single PR line  -> sp_ChangePrLineStatus subtracts the unordered balance from
--     TBL_BOM_DETAILS.PrCreatedQty (floored at 0) and re-derives BomStatus. Correct.
--   * Close the whole PR      -> sp_ClosePR sets every Open/Partial line to 'Closed'
--     DIRECTLY, never calling sp_ChangePrLineStatus, and updates only BomStatus. It never
--     touches PrCreatedQty.
-- So closing a PR leaves the BOM claiming the material is still requisitioned. Those BOM
-- lines never prompt anyone to raise a fresh PR - the material silently looks handled when
-- nothing was ever bought.
--
-- On India, 5 BOM lines are affected, all with nothing ordered against them:
--   BomId 472 (30), 473 (30), 474 (20), 475 (20), 905 (1)
--   from PR-26-0127, PR-26-0128 and PR-26-0276, all Closed.
--
-- THE RULE, taken from what the line-level close already does:
--   PrCreatedQty = SUM over the BOM line's PR lines of
--       - a Closed line  -> the quantity actually ordered from it
--       - any other line -> its RequiredQty
--   excluding Cancelled lines and Cancelled/Rejected PRs.
-- Verified against prod data: this reproduces 1,556 of 1,561 BOM lines exactly, and the 5 it
-- does not are precisely the rows this bug left stale. So it is the intended meaning, not a
-- new definition.
--
-- The UPDATE aggregates FIRST and then writes one row per BOM line - the same one-to-many
-- UPDATE...FROM trap that caused the BomReceivedQty bug (2026-09-27f) is avoided here.
-- BomStatus is left to sp_ClosePR's own ladder, which keys off BomReceivedQty and
-- PoCreatedQty, not PrCreatedQty, so it stays correct.
--
-- Part 2 repairs the 5 rows. Anchor-checked, all-or-nothing, idempotent.
-- ─────────────────────────────────────────────────────────────────────────────
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

BEGIN TRY
    BEGIN TRAN;

    DECLARE @def NVARCHAR(MAX), @new NVARCHAR(MAX), @old NVARCHAR(400), @rep NVARCHAR(2500);
    DECLARE @n INT, @pos INT, @scan INT;

    SET @def = OBJECT_DEFINITION(OBJECT_ID('PROJ.sp_ClosePR'));
    IF @def IS NULL THROW 50090, 'sp_ClosePR not found.', 1;

    IF CHARINDEX(N'releases the unordered balance', @def) > 0
    BEGIN
        PRINT 'sp_ClosePR : already patched, left alone.';
        COMMIT;
        RETURN;
    END

    SET @old = N'-- Update BOM status for all lines that have a BOM link';
    SET @rep =
          N'-- 2026-09-27: closing a PR releases the unordered balance on the BOM, exactly as' + CHAR(13) + CHAR(10)
        + N'    -- closing a single line does via sp_ChangePrLineStatus. This procedure closes the' + CHAR(13) + CHAR(10)
        + N'    -- lines directly, so it has to do the same here. A Closed line counts only what was' + CHAR(13) + CHAR(10)
        + N'    -- actually ordered from it. Aggregated first, then one row per BOM line.' + CHAR(13) + CHAR(10)
        + N'    UPDATE bd' + CHAR(13) + CHAR(10)
        + N'    SET    bd.PrCreatedQty = v.NewQty,' + CHAR(13) + CHAR(10)
        + N'           bd.ModifiedBy   = @ClosedBy,' + CHAR(13) + CHAR(10)
        + N'           bd.ModifiedDate = GETDATE()' + CHAR(13) + CHAR(10)
        + N'    FROM   PROJ.TBL_BOM_DETAILS bd' + CHAR(13) + CHAR(10)
        + N'    JOIN   (SELECT DISTINCT prl.BomDetailId AS BomId' + CHAR(13) + CHAR(10)
        + N'            FROM PROJ.TBL_PURCHASE_REQUEST_LINE prl' + CHAR(13) + CHAR(10)
        + N'            WHERE prl.PrId = @PrId AND prl.IsActive = 1 AND prl.BomDetailId IS NOT NULL) a' + CHAR(13) + CHAR(10)
        + N'           ON a.BomId = bd.BomId' + CHAR(13) + CHAR(10)
        + N'    CROSS APPLY (VALUES (ISNULL((' + CHAR(13) + CHAR(10)
        + N'        SELECT SUM(CASE WHEN ISNULL(p2.LineStatus,'''') = ''Closed''' + CHAR(13) + CHAR(10)
        + N'                        THEN ISNULL(po2.q, 0) ELSE p2.RequiredQty END)' + CHAR(13) + CHAR(10)
        + N'        FROM PROJ.TBL_PURCHASE_REQUEST_LINE p2' + CHAR(13) + CHAR(10)
        + N'        JOIN PROJ.TBL_PURCHASE_REQUEST r2 ON r2.PrId = p2.PrId' + CHAR(13) + CHAR(10)
        + N'        OUTER APPLY (SELECT SUM(pol.OrderedQty) AS q FROM PROJ.TBL_PURCHASE_ORDER_LINE pol' + CHAR(13) + CHAR(10)
        + N'                     WHERE pol.PrLineId = p2.PrLineId AND pol.IsActive = 1) po2' + CHAR(13) + CHAR(10)
        + N'        WHERE p2.BomDetailId = bd.BomId AND p2.IsActive = 1' + CHAR(13) + CHAR(10)
        + N'          AND ISNULL(p2.LineStatus,'''') <> ''Cancelled''' + CHAR(13) + CHAR(10)
        + N'          AND r2.Status NOT IN (''Cancelled'',''Rejected'')), 0))) v(NewQty);' + CHAR(13) + CHAR(10)
        + CHAR(13) + CHAR(10)
        + N'    -- Update BOM status for all lines that have a BOM link';

    SET @n = (DATALENGTH(@def) - DATALENGTH(REPLACE(@def, @old, N''))) / DATALENGTH(@old);
    IF @n = 0
    BEGIN
        SET @rep = REPLACE(@rep, CHAR(13) + CHAR(10), CHAR(10));
        SET @n   = (DATALENGTH(@def) - DATALENGTH(REPLACE(@def, @old, N''))) / DATALENGTH(@old);
    END
    IF @n <> 1 THROW 50091, 'sp_ClosePR: expected exactly 1 anchor. Nothing changed.', 1;

    SET @new = REPLACE(@def, @old, @rep);

    SET @scan = 1;
    WHILE 1 = 1
    BEGIN
        SET @pos = CHARINDEX(N'CREATE', @new, @scan);
        IF @pos = 0 THROW 50092, 'Could not find the CREATE keyword. Nothing changed.', 1;
        IF SUBSTRING(@new, @pos + 6, 40) LIKE N'%PROC%' BREAK;
        SET @scan = @pos + 6;
    END
    SET @new = STUFF(@new, @pos, 6, N'ALTER ');

    EXEC sp_executesql @new;
    PRINT 'sp_ClosePR : patched.';

    COMMIT;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    PRINT 'FAILED - nothing was changed:';
    THROW;
END CATCH
GO

-- ── Part 2: repair the BOM lines the bug left stale ─────────────────────────
-- Look first.
;WITH contrib AS (
    SELECT prl.BomDetailId AS BomId,
           CASE WHEN ISNULL(prl.LineStatus,'') = 'Closed' THEN ISNULL(po.q, 0) ELSE prl.RequiredQty END AS c
    FROM PROJ.TBL_PURCHASE_REQUEST_LINE prl
    JOIN PROJ.TBL_PURCHASE_REQUEST pr ON pr.PrId = prl.PrId
    OUTER APPLY (SELECT SUM(pol.OrderedQty) AS q FROM PROJ.TBL_PURCHASE_ORDER_LINE pol
                 WHERE pol.PrLineId = prl.PrLineId AND pol.IsActive = 1) po
    WHERE prl.IsActive = 1 AND prl.BomDetailId IS NOT NULL
      AND ISNULL(prl.LineStatus,'') <> 'Cancelled'
      AND pr.Status NOT IN ('Cancelled','Rejected')
), derived AS (SELECT BomId, SUM(c) AS q FROM contrib GROUP BY BomId)
SELECT b.BomId,
       CONVERT(DECIMAL(18,3), ISNULL(b.PrCreatedQty,0)) AS stored,
       CONVERT(DECIMAL(18,3), ISNULL(d.q,0))            AS should_be,
       CONVERT(DECIMAL(18,3), b.BomRequestedQty)        AS requested,
       CONVERT(DECIMAL(18,3), ISNULL(b.PoCreatedQty,0)) AS ordered,
       b.BomStatus
FROM PROJ.TBL_BOM_DETAILS b
LEFT JOIN derived d ON d.BomId = b.BomId
WHERE ABS(ISNULL(b.PrCreatedQty,0) - ISNULL(d.q,0)) >= 0.0005
ORDER BY b.BomId;
GO

;WITH contrib AS (
    SELECT prl.BomDetailId AS BomId,
           CASE WHEN ISNULL(prl.LineStatus,'') = 'Closed' THEN ISNULL(po.q, 0) ELSE prl.RequiredQty END AS c
    FROM PROJ.TBL_PURCHASE_REQUEST_LINE prl
    JOIN PROJ.TBL_PURCHASE_REQUEST pr ON pr.PrId = prl.PrId
    OUTER APPLY (SELECT SUM(pol.OrderedQty) AS q FROM PROJ.TBL_PURCHASE_ORDER_LINE pol
                 WHERE pol.PrLineId = prl.PrLineId AND pol.IsActive = 1) po
    WHERE prl.IsActive = 1 AND prl.BomDetailId IS NOT NULL
      AND ISNULL(prl.LineStatus,'') <> 'Cancelled'
      AND pr.Status NOT IN ('Cancelled','Rejected')
), derived AS (SELECT BomId, SUM(c) AS q FROM contrib GROUP BY BomId)
UPDATE b
SET    b.PrCreatedQty = ISNULL(d.q, 0),
       b.ModifiedBy   = 'FIX-2026-09-27',
       b.ModifiedDate = GETDATE()
FROM   PROJ.TBL_BOM_DETAILS b
LEFT JOIN derived d ON d.BomId = b.BomId
WHERE  ABS(ISNULL(b.PrCreatedQty,0) - ISNULL(d.q,0)) >= 0.0005;
GO

-- ── verification: must be 0 ─────────────────────────────────────────────────
;WITH contrib AS (
    SELECT prl.BomDetailId AS BomId,
           CASE WHEN ISNULL(prl.LineStatus,'') = 'Closed' THEN ISNULL(po.q, 0) ELSE prl.RequiredQty END AS c
    FROM PROJ.TBL_PURCHASE_REQUEST_LINE prl
    JOIN PROJ.TBL_PURCHASE_REQUEST pr ON pr.PrId = prl.PrId
    OUTER APPLY (SELECT SUM(pol.OrderedQty) AS q FROM PROJ.TBL_PURCHASE_ORDER_LINE pol
                 WHERE pol.PrLineId = prl.PrLineId AND pol.IsActive = 1) po
    WHERE prl.IsActive = 1 AND prl.BomDetailId IS NOT NULL
      AND ISNULL(prl.LineStatus,'') <> 'Cancelled'
      AND pr.Status NOT IN ('Cancelled','Rejected')
), derived AS (SELECT BomId, SUM(c) AS q FROM contrib GROUP BY BomId)
SELECT COUNT(*) AS bom_lines_still_wrong
FROM PROJ.TBL_BOM_DETAILS b
LEFT JOIN derived d ON d.BomId = b.BomId
WHERE ABS(ISNULL(b.PrCreatedQty,0) - ISNULL(d.q,0)) >= 0.0005;
GO
