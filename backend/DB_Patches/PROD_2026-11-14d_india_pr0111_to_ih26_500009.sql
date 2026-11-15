-- PROD_2026-11-14d: India item 6. Rolling machine PR-26-0111 moved to the PO's job IH26-500009. SYNERPINDIA only.
--   PO-26-0105 (IH26-500009, pending approval level 3/3) line 1 (rolling machine) came from PR-26-0111 under
--   IH26-500002, BOM line 422 (bug: PO line from another job's PR, blocked since 28 Oct). Line 2 (freight) is
--   already IH26-500009. On 15 Oct the PO was revised and kept under IH26-500009.
-- Does: adds a rolling machine line to IH26-500009's BOM (header 29; copy of BOM 422: section, unit, price, dates;
--   inserted directly because sp_SetBomDetail refuses lines on an Approved BOM); PR-26-0111 job -> IH26-500009,
--   its line linked to the new BOM line; PR / PO / received counts of BOM 422 and the new line recalculated.
--   PO, its approval and its lines are not touched.
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
    DECLARE @PrId INT, @PrLineId INT, @n INT, @NewBom INT, @Hdr INT;

    SELECT @PrId = PrId FROM PROJ.TBL_PURCHASE_REQUEST WHERE PrNumber = N'PR-26-0111' AND JobId = N'IH26-500002' AND IsActive = 1;
    SELECT @n = COUNT(*), @PrLineId = MAX(PrLineId) FROM PROJ.TBL_PURCHASE_REQUEST_LINE WHERE PrId = @PrId AND IsActive = 1;
    SELECT @Hdr = BomHeaderId FROM PROJ.TBL_BOM_HEADER WHERE JobId = N'IH26-500009' AND IsActive = 1;

    IF @PrId IS NULL
        THROW 50951, 'PR-26-0111 under IH26-500002 not found (already moved?). Nothing changed.', 1;
    IF @n <> 1 OR NOT EXISTS (SELECT 1 FROM PROJ.TBL_PURCHASE_REQUEST_LINE WHERE PrLineId = @PrLineId AND BomDetailId = 422)
        THROW 50952, 'PR-26-0111 is not a single line on BOM 422. Nothing changed.', 1;
    IF @Hdr IS NULL OR @Hdr <> 29
        THROW 50953, 'IH26-500009 BOM header is not 29 as found. Nothing changed.', 1;
    IF NOT EXISTS (SELECT 1 FROM PROJ.TBL_PURCHASE_ORDER_LINE pol JOIN PROJ.TBL_PURCHASE_ORDER po ON po.PoId = pol.PoId
                   WHERE pol.PrLineId = @PrLineId AND pol.IsActive = 1 AND po.PoNumber = N'PO-26-0105' AND po.JobId = N'IH26-500009')
        THROW 50954, 'PR-26-0111 is not ordered on PO-26-0105 (IH26-500009). Nothing changed.', 1;
    IF EXISTS (SELECT 1 FROM PROJ.TBL_BOM_DETAILS b JOIN PROJ.TBL_BOM_DETAILS o ON o.ItemId = b.ItemId
               WHERE o.BomId = 422 AND b.JobId = N'IH26-500009' AND b.IsActive = 1)
        THROW 50955, 'IH26-500009 already has a BOM line for this item. Nothing changed.', 1;

    SELECT 'BOM before' AS step, BomId, BomHeaderId, JobId, ItemId, BomRequestedQty, PrCreatedQty, PoCreatedQty, BomReceivedQty, BomStatus
    FROM PROJ.TBL_BOM_DETAILS WHERE BomId = 422;
    SELECT 'PR before' AS step, pr.PrNumber, pr.JobId, prl.ItemCode, prl.RequiredQty, prl.BomDetailId
    FROM PROJ.TBL_PURCHASE_REQUEST pr JOIN PROJ.TBL_PURCHASE_REQUEST_LINE prl ON prl.PrId = pr.PrId WHERE prl.PrLineId = @PrLineId;

    -- 1. new BOM line in IH26-500009 (copy of 422)
    INSERT INTO PROJ.TBL_BOM_DETAILS
        (BomHeaderId, JobId, BomSectionId, ItemId, ItemDetailId, SortOrder, BomRequestedQty, BomReceivedQty, PrCreatedQty, PoCreatedQty,
         UomId, BomPrice, CurrencyId, ExchangeRate, ItemReqDate, ExpectedDelivery, BomStatus, IsCritical, IsSubstituteAllowed,
         Remarks, IsActive, CreatedBy, CreatedDate, IsrCreatedQty)
    SELECT 29, N'IH26-500009', o.BomSectionId, o.ItemId, o.ItemDetailId,
           ISNULL((SELECT MAX(SortOrder) FROM PROJ.TBL_BOM_DETAILS WHERE BomHeaderId = 29), 0) + 10,
           o.BomRequestedQty, 0, 0, 0,
           o.UomId, o.BomPrice, o.CurrencyId, o.ExchangeRate, o.ItemReqDate, o.ExpectedDelivery, N'Pending', o.IsCritical, o.IsSubstituteAllowed,
           N'Moved from IH26-500002 BOM line 422 with PR-26-0111 (data fix 2026-11-14)', 1, @By, GETDATE(), 0
    FROM PROJ.TBL_BOM_DETAILS o WHERE o.BomId = 422;
    SET @NewBom = SCOPE_IDENTITY();

    -- 2. PR to IH26-500009, line to the new BOM line
    UPDATE PROJ.TBL_PURCHASE_REQUEST SET JobId = N'IH26-500009', ModifiedBy = @By, ModifiedDate = GETDATE() WHERE PrId = @PrId;
    UPDATE PROJ.TBL_PURCHASE_REQUEST_LINE SET BomDetailId = @NewBom, ModifiedBy = @By, ModifiedDate = GETDATE() WHERE PrLineId = @PrLineId;

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
    WHERE bd.BomId IN (422, @NewBom);

    SELECT 'BOM after' AS step, BomId, BomHeaderId, JobId, ItemId, BomRequestedQty, PrCreatedQty, PoCreatedQty, BomReceivedQty, BomStatus
    FROM PROJ.TBL_BOM_DETAILS WHERE BomId IN (422, @NewBom);
    SELECT 'Chain after' AS step, pol.LineNum AS po_line, pol.ItemCode, b.JobId AS bom_job, pr.PrNumber, pr.JobId AS pr_job, po.PoNumber, po.JobId AS po_job, po.Status AS po_status
    FROM PROJ.TBL_PURCHASE_ORDER po
    JOIN PROJ.TBL_PURCHASE_ORDER_LINE pol ON pol.PoId = po.PoId AND pol.IsActive = 1
    JOIN PROJ.TBL_PURCHASE_REQUEST_LINE prl ON prl.PrLineId = pol.PrLineId
    JOIN PROJ.TBL_PURCHASE_REQUEST pr ON pr.PrId = prl.PrId
    JOIN PROJ.TBL_BOM_DETAILS b ON b.BomId = prl.BomDetailId
    WHERE po.PoNumber = N'PO-26-0105' ORDER BY pol.LineNum;

    IF EXISTS (SELECT 1 FROM PROJ.TBL_BOM_DETAILS WHERE BomId = 422 AND (PrCreatedQty <> 0 OR PoCreatedQty <> 0 OR BomReceivedQty <> 0))
        THROW 50956, 'BOM 422 is not back to zero. Nothing changed.', 1;
    IF NOT EXISTS (SELECT 1 FROM PROJ.TBL_BOM_DETAILS WHERE BomId = @NewBom AND PrCreatedQty = 1 AND PoCreatedQty = 1)
        THROW 50957, 'New BOM line does not show 1 PR and 1 PO. Nothing changed.', 1;

    IF @DoCommit = 1
    BEGIN
        COMMIT;
        SELECT 'COMMITTED - PR-26-0111 moved to IH26-500009 with its own BOM line' AS result;
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
