-- 2026-10-21: repair BOM lines whose PrCreatedQty still counts a PR that is Rejected/Cancelled (or a Cancelled PR line).
-- Found on the SYNERPINDIA restore: BOM 1805 holds PR Qty 2 against a Rejected PR, so those 2 can never be requested again.
-- Rule (same as sp_ClosePR): active PR lines that are not Cancelled, on a PR that is not Cancelled/Rejected;
-- a Closed line counts only what was ordered from it, every other line counts RequiredQty.
-- Part 1 is read-only. Part 2 changes only the lines Part 1 lists (PrCreatedQty and BomStatus).
-- Run per database, one at a time. Run with sqlcmd -I.

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
SET NOCOUNT ON;
GO

-- ── Part 1: read-only ───────────────────────────────────────────────────────
SELECT bd.BomId, bd.BomRequestedQty, bd.PrCreatedQty AS StoredPrQty, x.q AS CorrectPrQty, bd.PrCreatedQty - x.q AS Diff,
       bd.PoCreatedQty, bd.BomReceivedQty, bd.BomStatus
FROM proj.TBL_BOM_DETAILS bd
CROSS APPLY (SELECT ISNULL(SUM(CASE WHEN ISNULL(p2.LineStatus,'') = 'Closed' THEN ISNULL(po2.q,0) ELSE p2.RequiredQty END), 0) AS q
             FROM proj.TBL_PURCHASE_REQUEST_LINE p2
             JOIN proj.TBL_PURCHASE_REQUEST r2 ON r2.PrId = p2.PrId
             OUTER APPLY (SELECT SUM(pol.OrderedQty) AS q FROM proj.TBL_PURCHASE_ORDER_LINE pol
                          WHERE pol.PrLineId = p2.PrLineId AND pol.IsActive = 1) po2
             WHERE p2.BomDetailId = bd.BomId AND p2.IsActive = 1
               AND ISNULL(p2.LineStatus,'') <> 'Cancelled'
               AND r2.Status NOT IN ('Cancelled','Rejected')) x
WHERE bd.IsActive = 1 AND ISNULL(bd.PrCreatedQty,0) <> x.q
ORDER BY bd.BomId;
GO

-- ── Part 2: repair (changes data) ───────────────────────────────────────────
UPDATE bd
SET bd.PrCreatedQty = x.q,
    bd.BomStatus = CASE
        WHEN bd.BomReceivedQty >= bd.BomRequestedQty THEN 'FullyReceived'
        WHEN bd.BomReceivedQty  > 0                  THEN 'PartialReceived'
        WHEN ISNULL(bd.PoCreatedQty,0) >= bd.BomRequestedQty THEN 'PORaised'
        WHEN ISNULL(bd.PoCreatedQty,0)  > 0          THEN 'POPartial'
        WHEN x.q >= bd.BomRequestedQty               THEN 'PRRaised'
        WHEN x.q  > 0                                THEN 'PRPartial'
        ELSE 'Pending' END,
    bd.ModifiedBy   = 'BOM_PRQTY_REPAIR',
    bd.ModifiedDate = GETDATE()
FROM proj.TBL_BOM_DETAILS bd
CROSS APPLY (SELECT ISNULL(SUM(CASE WHEN ISNULL(p2.LineStatus,'') = 'Closed' THEN ISNULL(po2.q,0) ELSE p2.RequiredQty END), 0) AS q
             FROM proj.TBL_PURCHASE_REQUEST_LINE p2
             JOIN proj.TBL_PURCHASE_REQUEST r2 ON r2.PrId = p2.PrId
             OUTER APPLY (SELECT SUM(pol.OrderedQty) AS q FROM proj.TBL_PURCHASE_ORDER_LINE pol
                          WHERE pol.PrLineId = p2.PrLineId AND pol.IsActive = 1) po2
             WHERE p2.BomDetailId = bd.BomId AND p2.IsActive = 1
               AND ISNULL(p2.LineStatus,'') <> 'Cancelled'
               AND r2.Status NOT IN ('Cancelled','Rejected')) x
WHERE bd.IsActive = 1 AND ISNULL(bd.PrCreatedQty,0) <> x.q;
PRINT CONCAT('BOM lines repaired: ', @@ROWCOUNT);
GO
