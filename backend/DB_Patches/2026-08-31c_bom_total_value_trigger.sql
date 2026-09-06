/* ============================================================================
   TBL_BOM_HEADER.TotalBomValue must be recalculated on ANY line change

   TODAY the total is maintained by hand in three procedures only -
   sp_SetBomDetail (insert + update), sp_DeleteBomDetail and sp_CopyBom - each
   repeating the same SUM. Every other path that touches a line leaves the
   header total stale, and sp_GenerateBomFromBudget (which also maintained it)
   is no longer used at all: in SYNERP the BOM is NOT linked to budget items,
   so lines are entered directly on the BOM and their prices belong to the line.

   THIS PATCH replaces "whoever remembers to" with a trigger, so the total is
   correct no matter which procedure - or which future procedure, or which hand
   -written UPDATE - moves a line:

       TR_BOM_RecalcTotalValue  ON proj.TBL_BOM_DETAILS  AFTER INSERT, UPDATE, DELETE

   Value = SUM(BomRequestedQty * BomPrice * ISNULL(ExchangeRate,1)) over the
   header's IsActive = 1 lines - identical to the expression the procedures
   already used, so no header changes value on the backfill below unless it was
   genuinely stale.

   It deliberately does NOTHING on a status-only update. The PR/PO/GRN chain
   writes PrCreatedQty / PoCreatedQty / BomReceivedQty / BomStatus constantly,
   and the existing TR_BOM_RecalcStatus writes BomStatus back on top of that;
   none of those change qty, price or rate, so the column guard returns early
   and the busiest write path on this table pays almost nothing.

   The three procedures keep their own UPDATE - it is now redundant but exactly
   agrees with the trigger, and leaving it means dropping the trigger does not
   silently break them.

   Idempotent: drops and recreates the trigger, then backfills every header.
   ============================================================================ */

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('proj.TR_BOM_RecalcTotalValue', 'TR') IS NOT NULL
    DROP TRIGGER proj.TR_BOM_RecalcTotalValue;
GO

CREATE TRIGGER proj.TR_BOM_RecalcTotalValue
ON proj.TBL_BOM_DETAILS
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- Our own UPDATE hits TBL_BOM_HEADER, not this table, so this guard is
    -- belt-and-braces against a future chain that loops back here.
    IF TRIGGER_NESTLEVEL(OBJECT_ID('proj.TR_BOM_RecalcTotalValue')) > 1 RETURN;

    -- UPDATE (both tables populated): skip unless something that feeds the sum
    -- actually moved. UPDATE() is only meaningful here - on INSERT it reports
    -- every column as set, and on DELETE there are no updated columns at all.
    IF EXISTS (SELECT 1 FROM inserted) AND EXISTS (SELECT 1 FROM deleted)
       AND NOT (UPDATE(BomRequestedQty) OR UPDATE(BomPrice) OR UPDATE(ExchangeRate)
                OR UPDATE(IsActive) OR UPDATE(BomHeaderId))
        RETURN;

    -- Both sides: an UPDATE that moves a line between headers has to fix the
    -- old header as well as the new one.
    DECLARE @hdr TABLE (BomHeaderId INT PRIMARY KEY);
    INSERT INTO @hdr (BomHeaderId)
        SELECT BomHeaderId FROM inserted WHERE BomHeaderId IS NOT NULL
        UNION
        SELECT BomHeaderId FROM deleted  WHERE BomHeaderId IS NOT NULL;

    UPDATE h
    SET    h.TotalBomValue = ISNULL((
               SELECT SUM(d.BomRequestedQty * d.BomPrice * ISNULL(d.ExchangeRate, 1))
               FROM   proj.TBL_BOM_DETAILS d
               WHERE  d.BomHeaderId = h.BomHeaderId
                 AND  d.IsActive    = 1), 0)
    FROM   proj.TBL_BOM_HEADER h
    JOIN   @hdr t ON t.BomHeaderId = h.BomHeaderId
    WHERE  h.TotalBomValue <> ISNULL((
               SELECT SUM(d.BomRequestedQty * d.BomPrice * ISNULL(d.ExchangeRate, 1))
               FROM   proj.TBL_BOM_DETAILS d
               WHERE  d.BomHeaderId = h.BomHeaderId
                 AND  d.IsActive    = 1), 0);
END
GO

/* ---------------------------------------------------------------------------
   Backfill: bring every existing header in line with its own lines.
   Reports what it corrected before and after.
   --------------------------------------------------------------------------- */

SELECT h.BomHeaderId, h.JobId, h.TotalBomValue AS StoredBefore,
       ISNULL(SUM(d.BomRequestedQty * d.BomPrice * ISNULL(d.ExchangeRate,1)), 0) AS Correct
FROM   proj.TBL_BOM_HEADER h
LEFT JOIN proj.TBL_BOM_DETAILS d ON d.BomHeaderId = h.BomHeaderId AND d.IsActive = 1
GROUP BY h.BomHeaderId, h.JobId, h.TotalBomValue
HAVING h.TotalBomValue <> ISNULL(SUM(d.BomRequestedQty * d.BomPrice * ISNULL(d.ExchangeRate,1)), 0)
ORDER BY h.BomHeaderId;

UPDATE h
SET    h.TotalBomValue = ISNULL((
           SELECT SUM(d.BomRequestedQty * d.BomPrice * ISNULL(d.ExchangeRate, 1))
           FROM   proj.TBL_BOM_DETAILS d
           WHERE  d.BomHeaderId = h.BomHeaderId AND d.IsActive = 1), 0)
FROM   proj.TBL_BOM_HEADER h;
GO

/* Verify */
SELECT CASE WHEN OBJECT_ID('proj.TR_BOM_RecalcTotalValue', 'TR') IS NOT NULL
            THEN 'OK - trigger installed' ELSE 'NOT INSTALLED' END AS Result;
GO
