-- PROD_2026-11-14e: India item 7. Old "BT" PRs and draft PO on belly tank BOM line 265 made empty Drafts. SYNERPINDIA only.
--   13 Aug: BOM 265 (BT26-600001) was item BT (pieces); PR-26-0052 (1), PR-26-0053 (1), PR-26-0054 (2) raised;
--   PO-26-0045 (Vision Industries, 1 BT) started from PR-26-0054 and left in Draft.
--   28 Aug: the BOM line was changed to item 15590 (kg, 60,100) while those PRs existed (bug, blocked since 28 Oct);
--   four 15,000 kg PRs (0197, 0198, 0199, 0201) went on to POs and receipts.
-- Does, through the system's own procedures: PO-26-0045 line deleted (sp_DeletePOLine; PO stays an empty Draft);
--   PR-26-0052/0053/0054 back to Draft (sp_RevisePR, reason logged, old approvals withdrawn) and their lines deleted
--   (sp_DeletePRLine); BOM 265 PR / PO / received counts recalculated. The 15590 PRs, POs and receipts are not touched.
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
    DECLARE @PoId INT, @id INT, @PrId INT, @n INT;

    IF OBJECT_ID('tempdb..#pr') IS NOT NULL DROP TABLE #pr;
    SELECT pr.PrId, pr.PrNumber, pr.Status, prl.PrLineId, prl.ItemId, prl.RequiredQty
    INTO #pr
    FROM PROJ.TBL_PURCHASE_REQUEST pr
    JOIN PROJ.TBL_PURCHASE_REQUEST_LINE prl ON prl.PrId = pr.PrId AND prl.IsActive = 1
    WHERE pr.PrNumber IN (N'PR-26-0052', N'PR-26-0053', N'PR-26-0054') AND pr.JobId = N'BT26-600001' AND pr.IsActive = 1;

    SELECT @PoId = PoId FROM PROJ.TBL_PURCHASE_ORDER WHERE PoNumber = N'PO-26-0045' AND JobId = N'BT26-600001' AND Status = N'Draft' AND IsActive = 1;

    IF (SELECT COUNT(*) FROM #pr) <> 3 OR (SELECT COUNT(DISTINCT PrId) FROM #pr) <> 3
        THROW 50961, 'PR-26-0052/0053/0054 are not three single-line PRs under BT26-600001. Nothing changed.', 1;
    IF EXISTS (SELECT 1 FROM #pr p JOIN PROJ.TBL_PURCHASE_REQUEST_LINE l ON l.PrLineId = p.PrLineId WHERE l.BomDetailId <> 265 OR l.ItemId <> 35072)
        THROW 50962, 'A PR line is not item BT on BOM 265. Nothing changed.', 1;
    IF EXISTS (SELECT 1 FROM #pr WHERE Status NOT IN (N'Approved', N'Partial'))
        THROW 50963, 'A PR is not Approved/Partial any more. Nothing changed.', 1;
    IF @PoId IS NULL OR (SELECT COUNT(*) FROM PROJ.TBL_PURCHASE_ORDER_LINE WHERE PoId = @PoId AND IsActive = 1) <> 1
        THROW 50964, 'PO-26-0045 is not a one-line Draft under BT26-600001. Nothing changed.', 1;
    IF EXISTS (SELECT 1 FROM PROJ.TBL_PURCHASE_ORDER_LINE pol JOIN #pr p ON p.PrLineId = pol.PrLineId WHERE pol.IsActive = 1 AND pol.PoId <> @PoId)
        THROW 50965, 'An old BT PR line is on a PO other than PO-26-0045. Nothing changed.', 1;
    IF EXISTS (SELECT 1 FROM PROJ.TBL_GRN_DETAIL d JOIN PROJ.TBL_PURCHASE_ORDER_LINE pol ON pol.PoLineId = d.PoLineId WHERE pol.PoId = @PoId AND d.IsActive = 1)
        THROW 50966, 'PO-26-0045 has GRN lines. Nothing changed.', 1;

    SELECT 'BOM before' AS step, BomId, JobId, ItemId, BomRequestedQty, PrCreatedQty, PoCreatedQty, BomReceivedQty, BomStatus
    FROM PROJ.TBL_BOM_DETAILS WHERE BomId = 265;

    -- 1. PO-26-0045: delete its line (PO is Draft)
    SELECT @id = PoLineId FROM PROJ.TBL_PURCHASE_ORDER_LINE WHERE PoId = @PoId AND IsActive = 1;
    EXEC PROJ.sp_DeletePOLine @id;
    IF EXISTS (SELECT 1 FROM PROJ.TBL_PURCHASE_ORDER_LINE WHERE PoLineId = @id)
        THROW 50967, 'PO-26-0045 line could not be deleted. Nothing changed.', 1;

    -- 2. each PR back to Draft, then delete its line
    WHILE EXISTS (SELECT 1 FROM #pr)
    BEGIN
        SELECT TOP 1 @PrId = PrId, @id = PrLineId FROM #pr ORDER BY PrId;
        EXEC PROJ.sp_RevisePR @PrId, @By, N'Data fix 2026-11-14: old BT line left on BOM 265 after the BOM item was changed to 15590; lines removed.';
        EXEC PROJ.sp_DeletePRLine @id, @By;
        IF EXISTS (SELECT 1 FROM PROJ.TBL_PURCHASE_REQUEST_LINE WHERE PrLineId = @id)
            THROW 50968, 'An old BT PR line could not be deleted. Nothing changed.', 1;
        DELETE FROM #pr WHERE PrId = @PrId;
    END

    -- 3. recalculate BOM 265 with the system's rules
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
    WHERE bd.BomId = 265;

    -- after
    SELECT 'BOM after' AS step, BomId, JobId, ItemId, BomRequestedQty, PrCreatedQty, PoCreatedQty, BomReceivedQty, BomStatus
    FROM PROJ.TBL_BOM_DETAILS WHERE BomId = 265;
    SELECT 'PO after' AS step, PoNumber, Status, TotalAmount, (SELECT COUNT(*) FROM PROJ.TBL_PURCHASE_ORDER_LINE WHERE PoId = @PoId) AS lines
    FROM PROJ.TBL_PURCHASE_ORDER WHERE PoId = @PoId;
    SELECT 'PRs after' AS step, pr.PrNumber, pr.Status, (SELECT COUNT(*) FROM PROJ.TBL_PURCHASE_REQUEST_LINE l WHERE l.PrId = pr.PrId) AS lines
    FROM PROJ.TBL_PURCHASE_REQUEST pr WHERE pr.PrNumber IN (N'PR-26-0052', N'PR-26-0053', N'PR-26-0054');
    SELECT 'Kept' AS step, pr.PrNumber, pr.Status, prl.ItemCode, prl.RequiredQty FROM PROJ.TBL_PURCHASE_REQUEST pr
    JOIN PROJ.TBL_PURCHASE_REQUEST_LINE prl ON prl.PrId = pr.PrId AND prl.IsActive = 1 WHERE prl.BomDetailId = 265 ORDER BY pr.PrNumber;

    IF EXISTS (SELECT 1 FROM PROJ.TBL_PURCHASE_REQUEST_LINE WHERE BomDetailId = 265 AND IsActive = 1 AND ItemId <> 35686)
        THROW 50969, 'BOM 265 still has a line of another item. Nothing changed.', 1;

    IF @DoCommit = 1
    BEGIN
        COMMIT;
        SELECT 'COMMITTED - old BT PRs and PO-26-0045 are empty Drafts, BOM 265 recalculated' AS result;
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
