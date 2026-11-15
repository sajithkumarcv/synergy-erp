-- PROD_2026-11-14c: India item 5. Crane hire PR-26-0277 moved to the PO's job EC26-300002. SYNERPINDIA only.
--   PO-26-0217 (EC26-300002, crane 25 Aug-25 Sep) was received on GRN-26-0573 into EC26-300002, but its PR-26-0277
--   was under IH26-500002 on that job's BOM line 906 (bug: PO line from another job's PR, blocked since 28 Oct).
-- Does: BOM line 1230 (EC26-300002 crane, item 3088) requested 3 -> 4; PR-26-0277 job -> EC26-300002 and its line
--   linked to BOM 1230 instead of 906; PR / PO / received counts of BOM 906 and 1230 recalculated with the
--   system's rules (BomStatus follows via TR_BOM_RecalcStatus). PO, GRN, stock and ledger are not touched.
-- One batch, one transaction; checks first, stops with nothing changed if the data is not as found.
-- @DoCommit = 1 commits; 0 = dry run (everything rolled back).

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;

DECLARE @DoCommit BIT = 1;
DECLARE @By NVARCHAR(100) = N'DATA_FIX_20261114';

IF DB_NAME() <> N'SYNERPINDIA' AND @DoCommit = 1
    THROW 50900, 'Wrong database: this script is for SYNERPINDIA only.', 1;

BEGIN TRY
    BEGIN TRAN;
    DECLARE @PrId INT, @PrLineId INT, @n INT;

    SELECT @PrId = PrId FROM PROJ.TBL_PURCHASE_REQUEST WHERE PrNumber = N'PR-26-0277' AND JobId = N'IH26-500002' AND IsActive = 1;
    SELECT @n = COUNT(*), @PrLineId = MAX(PrLineId) FROM PROJ.TBL_PURCHASE_REQUEST_LINE WHERE PrId = @PrId AND IsActive = 1;

    IF @PrId IS NULL
        THROW 50941, 'PR-26-0277 under IH26-500002 not found (already moved?). Nothing changed.', 1;
    IF @n <> 1 OR NOT EXISTS (SELECT 1 FROM PROJ.TBL_PURCHASE_REQUEST_LINE WHERE PrLineId = @PrLineId AND BomDetailId = 906)
        THROW 50942, 'PR-26-0277 is not a single line on BOM 906. Nothing changed.', 1;
    IF NOT EXISTS (SELECT 1 FROM PROJ.TBL_BOM_DETAILS b JOIN PROJ.TBL_PURCHASE_REQUEST_LINE prl ON prl.ItemId = b.ItemId
                   WHERE b.BomId = 1230 AND b.JobId = N'EC26-300002' AND b.IsActive = 1 AND b.BomRequestedQty = 3 AND prl.PrLineId = @PrLineId)
        THROW 50943, 'BOM 1230 is not the EC26-300002 line of the same item with quantity 3. Nothing changed.', 1;
    IF NOT EXISTS (SELECT 1 FROM PROJ.TBL_PURCHASE_ORDER_LINE pol JOIN PROJ.TBL_PURCHASE_ORDER po ON po.PoId = pol.PoId
                   WHERE pol.PrLineId = @PrLineId AND pol.IsActive = 1 AND po.PoNumber = N'PO-26-0217' AND po.JobId = N'EC26-300002')
        THROW 50944, 'PR-26-0277 is not ordered on PO-26-0217 (EC26-300002). Nothing changed.', 1;

    SELECT 'BOM before' AS step, BomId, JobId, ItemId, BomRequestedQty, PrCreatedQty, PoCreatedQty, BomReceivedQty, BomStatus
    FROM PROJ.TBL_BOM_DETAILS WHERE BomId IN (906, 1230);
    SELECT 'PR before' AS step, pr.PrNumber, pr.JobId, prl.ItemCode, prl.RequiredQty, prl.BomDetailId
    FROM PROJ.TBL_PURCHASE_REQUEST pr JOIN PROJ.TBL_PURCHASE_REQUEST_LINE prl ON prl.PrId = pr.PrId WHERE prl.PrLineId = @PrLineId;

    -- 1. BOM 1230 quantity 3 -> 4
    UPDATE PROJ.TBL_BOM_DETAILS SET BomRequestedQty = 4, ModifiedBy = @By, ModifiedDate = GETDATE() WHERE BomId = 1230;

    -- 2. PR to EC26-300002, line to BOM 1230
    UPDATE PROJ.TBL_PURCHASE_REQUEST SET JobId = N'EC26-300002', ModifiedBy = @By, ModifiedDate = GETDATE() WHERE PrId = @PrId;
    UPDATE PROJ.TBL_PURCHASE_REQUEST_LINE SET BomDetailId = 1230, ModifiedBy = @By, ModifiedDate = GETDATE() WHERE PrLineId = @PrLineId;

    -- 3. recalculate PR / PO / received on both BOM lines (same rules as the system)
    UPDATE bd
    SET bd.PrCreatedQty = pr.q, bd.PoCreatedQty = po.q, bd.BomReceivedQty = rc.q, bd.ModifiedBy = @By, bd.ModifiedDate = GETDATE()
    FROM PROJ.TBL_BOM_DETAILS bd
    CROSS APPLY (SELECT ISNULL(SUM(CASE WHEN ISNULL(p2.LineStatus,'') = 'Closed' THEN ISNULL(po2.q,0) ELSE p2.RequiredQty END), 0) AS q
                 FROM PROJ.TBL_PURCHASE_REQUEST_LINE p2 JOIN PROJ.TBL_PURCHASE_REQUEST r2 ON r2.PrId = p2.PrId
                 OUTER APPLY (SELECT SUM(pol.OrderedQty) AS q FROM PROJ.TBL_PURCHASE_ORDER_LINE pol WHERE pol.PrLineId = p2.PrLineId AND pol.IsActive = 1) po2
                 WHERE p2.BomDetailId = bd.BomId AND p2.IsActive = 1 AND ISNULL(p2.LineStatus,'') <> 'Cancelled'
                   AND r2.Status NOT IN ('Cancelled','Rejected')) pr
    CROSS APPLY (SELECT ISNULL(SUM(CASE WHEN o.Status IN ('Cancelled','Closed','Rejected') OR ISNULL(pol.LineStatus,'') IN ('Cancelled','Closed')
                                        THEN ISNULL(pol.ReceivedQty,0) ELSE pol.OrderedQty END), 0) AS q
                 FROM PROJ.TBL_PURCHASE_ORDER_LINE pol JOIN PROJ.TBL_PURCHASE_ORDER o ON o.PoId = pol.PoId
                 JOIN PROJ.TBL_PURCHASE_REQUEST_LINE prl ON prl.PrLineId = pol.PrLineId AND prl.IsActive = 1
                 WHERE prl.BomDetailId = bd.BomId AND pol.IsActive = 1) po
    CROSS APPLY (SELECT ISNULL(SUM(d.ReceivedQty - ISNULL(d.RejectedQty,0)), 0) AS q
                 FROM PROJ.TBL_GRN_DETAIL d JOIN PROJ.TBL_GRN_HEADER h ON h.GrnId = d.GrnId AND h.IsActive = 1
                 JOIN PROJ.TBL_PURCHASE_REQUEST_LINE p3 ON p3.PrLineId = d.PrLineId
                 WHERE p3.BomDetailId = bd.BomId AND d.IsActive = 1 AND h.Status NOT IN ('Draft','Cancelled')) rc
    WHERE bd.BomId IN (906, 1230);

    SELECT 'BOM after' AS step, BomId, JobId, ItemId, BomRequestedQty, PrCreatedQty, PoCreatedQty, BomReceivedQty, BomStatus
    FROM PROJ.TBL_BOM_DETAILS WHERE BomId IN (906, 1230);
    SELECT 'Chain after' AS step, b.JobId AS bom_job, pr.PrNumber, pr.JobId AS pr_job, po.PoNumber, po.JobId AS po_job, h.GrnNumber, h.JobId AS grn_job
    FROM PROJ.TBL_PURCHASE_REQUEST_LINE prl
    JOIN PROJ.TBL_PURCHASE_REQUEST pr ON pr.PrId = prl.PrId
    JOIN PROJ.TBL_BOM_DETAILS b ON b.BomId = prl.BomDetailId
    JOIN PROJ.TBL_PURCHASE_ORDER_LINE pol ON pol.PrLineId = prl.PrLineId AND pol.IsActive = 1
    JOIN PROJ.TBL_PURCHASE_ORDER po ON po.PoId = pol.PoId
    LEFT JOIN PROJ.TBL_GRN_DETAIL d ON d.PoLineId = pol.PoLineId AND d.IsActive = 1
    LEFT JOIN PROJ.TBL_GRN_HEADER h ON h.GrnId = d.GrnId
    WHERE prl.PrLineId = @PrLineId;

    IF EXISTS (SELECT 1 FROM PROJ.TBL_BOM_DETAILS WHERE BomId = 906 AND (PrCreatedQty <> 0 OR PoCreatedQty <> 0 OR BomReceivedQty <> 0))
        THROW 50945, 'BOM 906 is not back to zero. Nothing changed.', 1;
    IF EXISTS (SELECT 1 FROM PROJ.TBL_BOM_DETAILS WHERE BomId = 1230 AND PrCreatedQty > BomRequestedQty)
        THROW 50946, 'BOM 1230 would show more PR than requested. Nothing changed.', 1;

    IF @DoCommit = 1
    BEGIN
        COMMIT;
        SELECT 'COMMITTED - PR-26-0277 moved to EC26-300002, BOM 1230 = 4' AS result;
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
