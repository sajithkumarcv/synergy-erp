-- PROD_2026-11-14: India data repair, fixes 1-3 from the 2026-11-13 full-cycle audit. SYNERPINDIA only.
--   1. BOM 1022, 1023, 1734: PrCreatedQty recomputed from their PR lines (same rule as TR_PR_ReleaseBomOnReject).
--      Cause: sp_RevisePR reopened Closed PR lines without putting the quantity back (fixed by patch 2026-11-14c).
--   2. Items 116004 and 1180051: AvgUnitCost set to the stock ledger average (net value / net qty).
--      Cause: GRN cancels did not take the cancelled price out of the average (fixed by patch 2026-11-14a).
--   3. ISS-26-0004, item 112555, 7 units: the stock is taken from EC26-300003 job stock (the issue's own job)
--      instead of IH26-500009 in-house stock. Ledger row moved to EC26-300003 / job stock, QtyJobStock -7.
--      QtyOnHand does not change (7 left the store either way); IH26-500009 gets its 7 units back.
-- One batch, one transaction. Each fix checks the current data first and stops the whole script
-- (nothing changed) if it is not what the audit found. Run in SSMS on SYNERPINDIA. Re-running after
-- success stops at the first check with "already repaired" style messages and changes nothing.
-- @DoCommit = 1 commits; 0 runs everything and rolls back (dry run).

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;

DECLARE @DoCommit BIT = 1;

IF DB_NAME() <> N'SYNERPINDIA' AND @DoCommit = 1
    THROW 50900, 'Wrong database: this script is for SYNERPINDIA only.', 1;

BEGIN TRY
    BEGIN TRAN;
    DECLARE @msg NVARCHAR(400), @n INT;

    /* ---------- 1. BOM PrCreatedQty ---------------------------------------------------- */
    IF OBJECT_ID('tempdb..#bom') IS NOT NULL DROP TABLE #bom;
    SELECT bd.BomId, bd.JobId, bd.PrCreatedQty AS OldQty, x.q AS NewQty
    INTO #bom
    FROM PROJ.TBL_BOM_DETAILS bd
    CROSS APPLY (SELECT ISNULL(SUM(CASE WHEN ISNULL(p2.LineStatus,'') = 'Closed' THEN ISNULL(po2.q,0) ELSE p2.RequiredQty END), 0) AS q
                 FROM PROJ.TBL_PURCHASE_REQUEST_LINE p2
                 JOIN PROJ.TBL_PURCHASE_REQUEST r2 ON r2.PrId = p2.PrId
                 OUTER APPLY (SELECT SUM(pol.OrderedQty) AS q FROM PROJ.TBL_PURCHASE_ORDER_LINE pol
                              WHERE pol.PrLineId = p2.PrLineId AND pol.IsActive = 1) po2
                 WHERE p2.BomDetailId = bd.BomId AND p2.IsActive = 1
                   AND ISNULL(p2.LineStatus,'') <> 'Cancelled'
                   AND r2.Status NOT IN ('Cancelled','Rejected')) x
    WHERE bd.BomId IN (1022, 1023, 1734) AND bd.IsActive = 1;

    SELECT '1 BOM before' AS step, * FROM #bom;

    IF (SELECT COUNT(*) FROM #bom) <> 3
        THROW 50901, 'Fix 1: BOM 1022, 1023, 1734 not all found or not active. Nothing changed.', 1;
    IF EXISTS (SELECT 1 FROM #bom WHERE OldQty = NewQty)
        THROW 50902, 'Fix 1: a BOM line already shows the right PR quantity (already repaired or data moved). Nothing changed.', 1;

    UPDATE bd SET bd.PrCreatedQty = b.NewQty, bd.ModifiedBy = N'DATA_FIX_20261114', bd.ModifiedDate = GETDATE()
    FROM PROJ.TBL_BOM_DETAILS bd JOIN #bom b ON b.BomId = bd.BomId;
    SET @n = @@ROWCOUNT;
    IF @n <> 3 THROW 50903, 'Fix 1: expected 3 BOM rows updated. Nothing changed.', 1;

    SELECT '1 BOM after' AS step, BomId, JobId, BomRequestedQty, PrCreatedQty, PoCreatedQty, BomReceivedQty, BomStatus
    FROM PROJ.TBL_BOM_DETAILS WHERE BomId IN (1022, 1023, 1734);

    /* ---------- 2. Average cost ------------------------------------------------------- */
    IF OBJECT_ID('tempdb..#avg') IS NOT NULL DROP TABLE #avg;
    SELECT i.ItemId, i.ItemCode, b.QtyOnHand, b.AvgUnitCost AS OldAvg, l.q AS LedgerQty,
           CAST(ROUND(l.v / NULLIF(l.q,0), 4) AS DECIMAL(18,4)) AS NewAvg
    INTO #avg
    FROM PROJ.TBL_ITEM i
    JOIN PROJ.TBL_STOCK_BALANCE b ON b.ItemId = i.ItemId
    CROSS APPLY (SELECT SUM(QtyIn - QtyOut) q, SUM((QtyIn - QtyOut) * UnitCost) v
                 FROM PROJ.TBL_STOCK_LEDGER WHERE ItemId = i.ItemId) l
    WHERE i.ItemCode IN (N'116004', N'1180051');

    SELECT '2 average before' AS step, * FROM #avg;

    IF (SELECT COUNT(*) FROM #avg) <> 2
        THROW 50911, 'Fix 2: items 116004 and 1180051 not both found in stock balance. Nothing changed.', 1;
    IF EXISTS (SELECT 1 FROM #avg WHERE ABS(QtyOnHand - LedgerQty) > 0.0001 OR LedgerQty <= 0)
        THROW 50912, 'Fix 2: stock quantity does not match the ledger for one of the items. Nothing changed.', 1;
    IF EXISTS (SELECT 1 FROM #avg WHERE ABS(OldAvg - NewAvg) <= 0.0001)
        THROW 50913, 'Fix 2: an item already has the ledger average (already repaired). Nothing changed.', 1;

    UPDATE b SET b.AvgUnitCost = a.NewAvg, b.UpdatedDate = GETDATE()
    FROM PROJ.TBL_STOCK_BALANCE b JOIN #avg a ON a.ItemId = b.ItemId;
    IF @@ROWCOUNT <> 2 THROW 50914, 'Fix 2: expected 2 stock balance rows updated. Nothing changed.', 1;

    SELECT '2 average after' AS step, a.ItemCode, b.QtyOnHand, b.AvgUnitCost
    FROM PROJ.TBL_STOCK_BALANCE b JOIN #avg a ON a.ItemId = b.ItemId;

    /* ---------- 3. ISS-26-0004 ---------------------------------------------------------- */
    DECLARE @IssueId INT, @ItemId INT, @LedgerId INT, @Qty DECIMAL(18,4), @OwnJob DECIMAL(18,4), @JobStk DECIMAL(18,4);

    SELECT @IssueId = IssueId FROM PROJ.TBL_STOCK_ISSUE
    WHERE IssueNo = N'ISS-26-0004' AND JobId = N'EC26-300003' AND CostingType = N'EXC_COSTING' AND Status = N'Confirmed';
    SELECT @ItemId = ItemId FROM PROJ.TBL_ITEM WHERE ItemCode = N'112555';

    SELECT @n = COUNT(*), @LedgerId = MAX(LedgerId), @Qty = MAX(QtyOut)
    FROM PROJ.TBL_STOCK_LEDGER
    WHERE TransType = N'ISSUE' AND RefId = @IssueId AND ItemId = @ItemId
      AND JobId = N'IH26-500009' AND IsJobStock = 0;

    SELECT '3 ledger before' AS step, LedgerId, TransDate, RefNo, ItemId, QtyOut, UnitCost, IsJobStock, JobId
    FROM PROJ.TBL_STOCK_LEDGER WHERE TransType = N'ISSUE' AND RefId = @IssueId;

    IF @IssueId IS NULL OR @ItemId IS NULL
        THROW 50921, 'Fix 3: ISS-26-0004 (EC26-300003, EXC_COSTING, Confirmed) or item 112555 not found. Nothing changed.', 1;
    IF @n <> 1 OR @Qty <> 7
        THROW 50922, 'Fix 3: ledger row for ISS-26-0004 is not the single 7-unit IH26-500009 row (already repaired or data moved). Nothing changed.', 1;

    SELECT @OwnJob = ISNULL(SUM(QtyIn - QtyOut), 0) FROM PROJ.TBL_STOCK_LEDGER
    WHERE ItemId = @ItemId AND IsJobStock = 1 AND JobId = N'EC26-300003';
    SELECT @JobStk = QtyJobStock FROM PROJ.TBL_STOCK_BALANCE WHERE ItemId = @ItemId;

    SELECT '3 job stock before' AS step, @OwnJob AS EC26_300003_job_stock, @JobStk AS item_QtyJobStock;

    IF @OwnJob < @Qty OR ISNULL(@JobStk,0) < @Qty
    BEGIN
        SET @msg = CONCAT('Fix 3: EC26-300003 has only ', @OwnJob, ' job stock of 112555 (needs 7). Nothing changed.');
        THROW 50923, @msg, 1;
    END

    UPDATE PROJ.TBL_STOCK_LEDGER SET JobId = N'EC26-300003', IsJobStock = 1 WHERE LedgerId = @LedgerId;
    IF @@ROWCOUNT <> 1 THROW 50924, 'Fix 3: ledger row not updated. Nothing changed.', 1;

    UPDATE PROJ.TBL_STOCK_BALANCE SET QtyJobStock = QtyJobStock - @Qty, UpdatedDate = GETDATE() WHERE ItemId = @ItemId;
    IF @@ROWCOUNT <> 1 THROW 50925, 'Fix 3: stock balance not updated. Nothing changed.', 1;

    SELECT '3 after' AS step, l.LedgerId, l.QtyOut, l.IsJobStock, l.JobId, b.QtyOnHand, b.QtyJobStock,
           (SELECT ISNULL(SUM(QtyIn - QtyOut),0) FROM PROJ.TBL_STOCK_LEDGER WHERE ItemId=@ItemId AND IsJobStock=1) AS ledger_job_stock
    FROM PROJ.TBL_STOCK_LEDGER l JOIN PROJ.TBL_STOCK_BALANCE b ON b.ItemId = l.ItemId WHERE l.LedgerId = @LedgerId;

    IF (SELECT QtyJobStock FROM PROJ.TBL_STOCK_BALANCE WHERE ItemId=@ItemId)
       <> (SELECT ISNULL(SUM(QtyIn - QtyOut),0) FROM PROJ.TBL_STOCK_LEDGER WHERE ItemId=@ItemId AND IsJobStock=1)
        THROW 50926, 'Fix 3: QtyJobStock does not match the ledger after the change. Nothing changed.', 1;

    IF @DoCommit = 1
    BEGIN
        COMMIT;
        SELECT 'COMMITTED - fixes 1, 2, 3 applied' AS result;
    END
    ELSE
    BEGIN
        ROLLBACK;
        SELECT 'DRY RUN - all checks passed, everything rolled back' AS result;
    END
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    SELECT 'STOPPED - nothing changed' AS result, ERROR_NUMBER() AS num, ERROR_MESSAGE() AS msg;
END CATCH
