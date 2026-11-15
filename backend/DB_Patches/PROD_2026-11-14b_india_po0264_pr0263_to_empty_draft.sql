-- PROD_2026-11-14b: India item 4. PO-26-0264 and PR-26-0263 become empty Drafts (lines removed). SYNERPINDIA only.
--   History: PR-26-0263 (7 Sep) was linked to EC26-300002's BOM; on 16 Sep it was revised ("job number mismatch")
--   and its job changed to IH26-500005 while its lines stayed on EC26-300002's BOM (bug, blocked since 28 Oct).
--   PO-26-0264 was raised from it. IH26-500005 already had the same items on PR-26-0273 -> PO-26-0213.
-- Does, through the system's own procedures:
--   1. PO-26-0264 -> Draft (sp_ChangePOStatus); its pending approval withdrawn.
--   2. Its lines deleted (sp_DeletePOLine): PR-26-0263 lines back to 0 on order, BOM PO counts recalculated.
--   3. PR-26-0263 -> Draft (sp_RevisePR, reason logged).
--   4. Its lines deleted (sp_DeletePRLine): EC26-300002's BOM lines freed.
--   PO-26-0213 / PR-26-0273 untouched.
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
    DECLARE @PoId INT, @PrId INT, @PoStatus NVARCHAR(30), @PrStatus NVARCHAR(30), @id INT;

    SELECT @PoId = PoId, @PoStatus = Status FROM PROJ.TBL_PURCHASE_ORDER WHERE PoNumber = N'PO-26-0264' AND JobId = N'IH26-500005' AND IsActive = 1;
    SELECT @PrId = PrId, @PrStatus = Status FROM PROJ.TBL_PURCHASE_REQUEST WHERE PrNumber = N'PR-26-0263' AND JobId = N'IH26-500005' AND IsActive = 1;

    IF @PoId IS NULL OR @PrId IS NULL
        THROW 50931, 'PO-26-0264 or PR-26-0263 (IH26-500005) not found. Nothing changed.', 1;
    IF @PoStatus <> N'PendingApproval'
        THROW 50932, 'PO-26-0264 is no longer Pending Approval. Nothing changed.', 1;
    IF @PrStatus NOT IN (N'Approved', N'Partial')
        THROW 50933, 'PR-26-0263 is not Approved/Partial any more. Nothing changed.', 1;
    IF EXISTS (SELECT 1 FROM PROJ.TBL_GRN_DETAIL d JOIN PROJ.TBL_PURCHASE_ORDER_LINE pol ON pol.PoLineId = d.PoLineId
               WHERE pol.PoId = @PoId AND d.IsActive = 1)
        THROW 50934, 'PO-26-0264 has GRN lines. Nothing changed.', 1;
    IF EXISTS (SELECT 1 FROM PROJ.TBL_PURCHASE_ORDER_LINE pol JOIN PROJ.TBL_PURCHASE_REQUEST_LINE prl ON prl.PrLineId = pol.PrLineId
               WHERE prl.PrId = @PrId AND pol.IsActive = 1 AND pol.PoId <> @PoId)
        THROW 50935, 'PR-26-0263 is also on another PO. Nothing changed.', 1;

    IF OBJECT_ID('tempdb..#b') IS NOT NULL DROP TABLE #b;
    SELECT DISTINCT prl.BomDetailId AS BomId INTO #b
    FROM PROJ.TBL_PURCHASE_REQUEST_LINE prl WHERE prl.PrId = @PrId AND prl.IsActive = 1 AND prl.BomDetailId IS NOT NULL;

    SELECT 'BOM before' AS step, b.BomId, b.JobId, b.ItemId, b.BomRequestedQty, b.PrCreatedQty, b.PoCreatedQty, b.BomReceivedQty, b.BomStatus
    FROM PROJ.TBL_BOM_DETAILS b JOIN #b x ON x.BomId = b.BomId ORDER BY b.BomId;

    -- 1. PO back to Draft, approval withdrawn
    EXEC PROJ.sp_ChangePOStatus @PoId, N'Draft', @By;
    UPDATE PROJ.TBL_APPROVAL_TRANSACTION
    SET CurrentStatus = N'Cancelled', FinalAction = N'Cancelled', FinalActionBy = @By,
        FinalRemarks = N'Withdrawn - PO emptied, duplicate of PO-26-0213 (data fix 2026-11-14).',
        CompletedDate = GETDATE(), ModifiedBy = @By, ModifiedDate = GETDATE()
    WHERE ModuleId = 2 AND DocumentId = @PoId AND CurrentStatus NOT IN (N'Cancelled', N'Rejected', N'Approved');

    -- 2. delete the PO lines
    WHILE EXISTS (SELECT 1 FROM PROJ.TBL_PURCHASE_ORDER_LINE WHERE PoId = @PoId)
    BEGIN
        SELECT TOP 1 @id = PoLineId FROM PROJ.TBL_PURCHASE_ORDER_LINE WHERE PoId = @PoId ORDER BY PoLineId;
        EXEC PROJ.sp_DeletePOLine @id;
        IF EXISTS (SELECT 1 FROM PROJ.TBL_PURCHASE_ORDER_LINE WHERE PoLineId = @id)
            THROW 50938, 'A PO-26-0264 line could not be deleted. Nothing changed.', 1;
    END

    -- 3. PR back to Draft
    EXEC PROJ.sp_RevisePR @PrId, @By, N'Data fix 2026-11-14: duplicate of PR-26-0273 on the wrong job BOM; lines removed.';

    -- 4. delete the PR lines
    WHILE EXISTS (SELECT 1 FROM PROJ.TBL_PURCHASE_REQUEST_LINE WHERE PrId = @PrId)
    BEGIN
        SELECT TOP 1 @id = PrLineId FROM PROJ.TBL_PURCHASE_REQUEST_LINE WHERE PrId = @PrId ORDER BY PrLineId;
        EXEC PROJ.sp_DeletePRLine @id, @By;
        IF EXISTS (SELECT 1 FROM PROJ.TBL_PURCHASE_REQUEST_LINE WHERE PrLineId = @id)
            THROW 50939, 'A PR-26-0263 line could not be deleted. Nothing changed.', 1;
    END

    -- after
    SELECT 'PO after' AS step, PoNumber, JobId, Status, TotalAmount,
           (SELECT COUNT(*) FROM PROJ.TBL_PURCHASE_ORDER_LINE WHERE PoId = @PoId) AS lines FROM PROJ.TBL_PURCHASE_ORDER WHERE PoId = @PoId;
    SELECT 'Approval after' AS step, DocumentNo, CurrentStatus FROM PROJ.TBL_APPROVAL_TRANSACTION WHERE DocumentId IN (@PoId, @PrId) AND DocumentNo IN (N'PO-26-0264', N'PR-26-0263');
    SELECT 'PR after' AS step, PrNumber, JobId, Status, Revision,
           (SELECT COUNT(*) FROM PROJ.TBL_PURCHASE_REQUEST_LINE WHERE PrId = @PrId) AS lines FROM PROJ.TBL_PURCHASE_REQUEST WHERE PrId = @PrId;
    SELECT 'BOM after' AS step, b.BomId, b.JobId, b.ItemId, b.BomRequestedQty, b.PrCreatedQty, b.PoCreatedQty, b.BomReceivedQty, b.BomStatus
    FROM PROJ.TBL_BOM_DETAILS b JOIN #b x ON x.BomId = b.BomId ORDER BY b.BomId;
    SELECT 'Kept' AS step, po.PoNumber, po.JobId, po.Status FROM PROJ.TBL_PURCHASE_ORDER po WHERE po.PoNumber = N'PO-26-0213';

    IF (SELECT Status FROM PROJ.TBL_PURCHASE_ORDER WHERE PoId = @PoId) <> N'Draft'
       OR (SELECT Status FROM PROJ.TBL_PURCHASE_REQUEST WHERE PrId = @PrId) <> N'Draft'
        THROW 50936, 'PO-26-0264 or PR-26-0263 did not end as Draft. Nothing changed.', 1;

    IF @DoCommit = 1
    BEGIN
        COMMIT;
        SELECT 'COMMITTED - PO-26-0264 and PR-26-0263 are empty Drafts' AS result;
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
