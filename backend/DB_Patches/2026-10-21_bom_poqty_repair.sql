-- 2026-10-21: repair BOM lines whose PoCreatedQty was double-counted (or drifted) before 2026-10-21_bom_poqty_double_count.sql.
-- Apply that patch first. Run per database, one at a time: SYNERP, SYNERPINDIA, SYNERPUAE.
--
-- Part 1 is read-only: lists the BOM lines whose stored PoCreatedQty differs from the PO lines.
-- Part 2 calls proj.sp_RecalcPrPoCreatedQty once per affected BOM line (it rewrites PoCreatedQty and BomStatus).
-- Rule (same as sp_RecalcPrPoCreatedQty): lines of a Cancelled/Closed PO, or lines that are Cancelled/Closed, count only
-- their ReceivedQty; every other active line counts OrderedQty.
-- Run with sqlcmd -I.

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
SET NOCOUNT ON;
GO

-- ── Part 1: read-only ───────────────────────────────────────────────────────
SELECT b.BomId, b.BomRequestedQty, b.PrCreatedQty, b.PoCreatedQty AS StoredPoQty, c.CorrectPoQty,
       b.PoCreatedQty - c.CorrectPoQty AS Diff, b.BomStatus,
       (SELECT MIN(prl.PrLineId) FROM proj.TBL_PURCHASE_REQUEST_LINE prl
         WHERE prl.BomDetailId = b.BomId AND prl.IsActive = 1) AS RecalcViaPrLineId
FROM proj.TBL_BOM_DETAILS b
CROSS APPLY (SELECT ISNULL(SUM(CASE WHEN po.Status IN ('Cancelled','Closed')
                                      OR ISNULL(pol.LineStatus,'') IN ('Cancelled','Closed')
                                    THEN ISNULL(pol.ReceivedQty, 0)
                                    ELSE pol.OrderedQty END), 0) AS CorrectPoQty
             FROM proj.TBL_PURCHASE_ORDER_LINE pol
             JOIN proj.TBL_PURCHASE_ORDER po ON po.PoId = pol.PoId
             JOIN proj.TBL_PURCHASE_REQUEST_LINE prl ON prl.PrLineId = pol.PrLineId AND prl.IsActive = 1
             WHERE prl.BomDetailId = b.BomId AND pol.IsActive = 1) c
WHERE ISNULL(b.PoCreatedQty, 0) <> c.CorrectPoQty
ORDER BY b.BomId;
GO

-- ── Part 2: repair (changes data) ───────────────────────────────────────────
DECLARE @fix TABLE (BomId INT, PrLineId INT);
INSERT @fix
SELECT b.BomId, MIN(prl.PrLineId)
FROM proj.TBL_BOM_DETAILS b
JOIN proj.TBL_PURCHASE_REQUEST_LINE prl ON prl.BomDetailId = b.BomId AND prl.IsActive = 1
CROSS APPLY (SELECT ISNULL(SUM(CASE WHEN po.Status IN ('Cancelled','Closed')
                                      OR ISNULL(pol.LineStatus,'') IN ('Cancelled','Closed')
                                    THEN ISNULL(pol.ReceivedQty, 0)
                                    ELSE pol.OrderedQty END), 0) AS CorrectPoQty
             FROM proj.TBL_PURCHASE_ORDER_LINE pol
             JOIN proj.TBL_PURCHASE_ORDER po ON po.PoId = pol.PoId
             JOIN proj.TBL_PURCHASE_REQUEST_LINE p2 ON p2.PrLineId = pol.PrLineId AND p2.IsActive = 1
             WHERE p2.BomDetailId = b.BomId AND pol.IsActive = 1) c
WHERE ISNULL(b.PoCreatedQty, 0) <> c.CorrectPoQty
GROUP BY b.BomId;

DECLARE @pr INT, @n INT = 0;
DECLARE cur CURSOR LOCAL FAST_FORWARD FOR SELECT PrLineId FROM @fix ORDER BY BomId;
OPEN cur; FETCH NEXT FROM cur INTO @pr;
WHILE @@FETCH_STATUS = 0
BEGIN
    EXEC proj.sp_RecalcPrPoCreatedQty @PrLineId = @pr, @ModifiedBy = 'BOM_POQTY_REPAIR';
    SET @n += 1;
    FETCH NEXT FROM cur INTO @pr;
END
CLOSE cur; DEALLOCATE cur;
PRINT CONCAT('BOM lines repaired: ', @n);
GO
