-- 2026-10-21: rejecting (or cancelling) a PR now releases its quantity back to the BOM.
--
-- Found on a SYNERPINDIA restore: BOM 1805 held PR Qty 2 against Rejected PR-26-0508. sp_ProcessApproval only sets the PR
-- header status to Rejected; nothing gives the BOM its quantity back (cancelling the lines first does, via sp_ChangePrLineStatus).
-- A Rejected PR cannot be reopened, so the quantity stayed stuck and no new PR could be raised for it.
--
-- Fix: a trigger on proj.TBL_PURCHASE_REQUEST. When a PR's Status changes to Rejected or Cancelled it recomputes PrCreatedQty
-- (and BomStatus) on every BOM line the PR touches, with the same rule as sp_ClosePR:
--   active PR lines that are not Cancelled, on PRs that are not Cancelled/Rejected;
--   a Closed line counts only what was ordered from it, every other line counts RequiredQty.
-- It works for every path that changes the status (approval screen, scripts), because it sits on the table.
--
-- Existing wrong lines: run 2026-10-21_bom_prqty_repair.sql once after this.
-- Apply to: SYNERP, then each company DB. Idempotent (CREATE OR ALTER). Run with sqlcmd -I.

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
SET NOCOUNT ON;
GO

CREATE OR ALTER TRIGGER proj.TR_PR_ReleaseBomOnReject
ON proj.TBL_PURCHASE_REQUEST
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE(Status) RETURN;

    -- PRs that have just moved into Rejected / Cancelled
    DECLARE @Released TABLE (PrId INT PRIMARY KEY);
    INSERT @Released (PrId)
    SELECT i.PrId
    FROM inserted i
    JOIN deleted d ON d.PrId = i.PrId
    WHERE i.Status IN ('Rejected', 'Cancelled')
      AND ISNULL(d.Status, '') NOT IN ('Rejected', 'Cancelled');

    IF NOT EXISTS (SELECT 1 FROM @Released) RETURN;

    UPDATE bd
    SET bd.PrCreatedQty = x.q,
        bd.BomStatus = CASE
            WHEN bd.BomReceivedQty >= bd.BomRequestedQty         THEN 'FullyReceived'
            WHEN bd.BomReceivedQty  > 0                          THEN 'PartialReceived'
            WHEN ISNULL(bd.PoCreatedQty,0) >= bd.BomRequestedQty THEN 'PORaised'
            WHEN ISNULL(bd.PoCreatedQty,0)  > 0                  THEN 'POPartial'
            WHEN x.q >= bd.BomRequestedQty                       THEN 'PRRaised'
            WHEN x.q  > 0                                        THEN 'PRPartial'
            ELSE 'Pending' END,
        bd.ModifiedDate = GETDATE()
    FROM proj.TBL_BOM_DETAILS bd
    JOIN (SELECT DISTINCT prl.BomDetailId AS BomId
          FROM proj.TBL_PURCHASE_REQUEST_LINE prl
          JOIN @Released r ON r.PrId = prl.PrId
          WHERE prl.IsActive = 1 AND prl.BomDetailId IS NOT NULL) a ON a.BomId = bd.BomId
    CROSS APPLY (SELECT ISNULL(SUM(CASE WHEN ISNULL(p2.LineStatus,'') = 'Closed' THEN ISNULL(po2.q,0) ELSE p2.RequiredQty END), 0) AS q
                 FROM proj.TBL_PURCHASE_REQUEST_LINE p2
                 JOIN proj.TBL_PURCHASE_REQUEST r2 ON r2.PrId = p2.PrId
                 OUTER APPLY (SELECT SUM(pol.OrderedQty) AS q FROM proj.TBL_PURCHASE_ORDER_LINE pol
                              WHERE pol.PrLineId = p2.PrLineId AND pol.IsActive = 1) po2
                 WHERE p2.BomDetailId = bd.BomId AND p2.IsActive = 1
                   AND ISNULL(p2.LineStatus,'') <> 'Cancelled'
                   AND r2.Status NOT IN ('Cancelled','Rejected')) x
    WHERE bd.IsActive = 1;
END
GO
