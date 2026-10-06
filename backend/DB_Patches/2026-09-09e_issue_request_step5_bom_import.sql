-- 2026-09-09: Issue Request — BUILD STEP 5 of 5: BOM -> request, and the netting counter
--
-- Apply to: ERPDB
-- Requires: steps 1-4
-- Design:   backend/Docs/DESIGN-issue-request.md §4 (IsrCreatedQty), §8, §10 step 5
--
-- This is the step that makes gross-to-net work on a BOM line.
--
--   BOM line wants 10        <- the gross requirement
--     5 in the store         -> pull onto an Issue Request   (IsrCreatedQty += 5)
--     5 must be bought       -> raise a PR for the remainder (PrCreatedQty  += 5)
--
-- The BOM line already counted what had been committed to purchasing
-- (PrCreatedQty, PoCreatedQty) but had no issue-side counter, so the same line
-- could be pulled onto two requests at full quantity and nothing would notice.
-- IsrCreatedQty closes that, and makes the open balance well defined:
--
--     open = BomRequestedQty - PrCreatedQty - IsrCreatedQty
--
-- ── Why TR_BOM_RecalcStatus is deliberately NOT changed ─────────────────────
-- That trigger maintains BomStatus on a purely procurement ladder — Pending ->
-- PRRaised -> PORaised -> Received. "Issued from store" is a different axis, not
-- a rung on that ladder, and inventing a status would change a vocabulary the
-- BOM screens and reports already read. IsrCreatedQty is therefore a counter
-- only. Revisit if BomStatus should ever express stock coverage; that is a
-- business decision, not a technical one.
--
-- Adds one column and one procedure, and teaches two existing ISR procs to keep
-- the counter straight:
--   sp_SetIssueRequestLine     +/- the delta when a BOM-sourced line is saved
--   sp_DeleteIssueRequestLine  gives the quantity back
--
-- Idempotent — guarded ALTER, CREATE OR ALTER procs, safe to re-run.

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
GO

/* ═══ 1. The issue-side counter on the BOM line ════════════════════════════ */
IF COL_LENGTH('proj.TBL_BOM_DETAILS', 'IsrCreatedQty') IS NULL
BEGIN
    ALTER TABLE proj.TBL_BOM_DETAILS ADD IsrCreatedQty DECIMAL(18,4) NOT NULL
        CONSTRAINT DF_BOMDET_ISRCREATEDQTY DEFAULT (0);
    PRINT 'Added TBL_BOM_DETAILS.IsrCreatedQty';
END
ELSE PRINT 'TBL_BOM_DETAILS.IsrCreatedQty already exists — skipped';
GO

/* ═══ 2. The picker: BOM lines with something still open ═══════════════════
   Returns the open balance AND what is actually free in the store, so the
   screen can propose "take this much from stock" without the user guessing.
   Mirrors sp_GetRequestLinesForIssue, which does the same job one stage on. */
CREATE OR ALTER PROCEDURE proj.sp_GetBomLinesForIssueRequest
    @JobId       NVARCHAR(50),
    @BomHeaderId INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        d.BomId,
        d.BomHeaderId,
        h.BomVersion,
        d.JobId,
        LineNum            = d.SortOrder,
        d.ItemId,
        i.ItemCode,
        i.ItemName,
        d.BomRequestedQty,
        d.PrCreatedQty,
        d.PoCreatedQty,
        d.IsrCreatedQty,
        -- what is still uncommitted on this requirement
        OpenQty            = CAST(d.BomRequestedQty - d.PrCreatedQty - d.IsrCreatedQty AS DECIMAL(18,4)),
        d.UomId,
        u.UomCode          AS UomName,
        -- what the store could actually give right now, net of other holds
        AvailableQty       = CAST(ISNULL(b.QtyAvailable, 0) AS DECIMAL(18,4)),
        OnHandQty          = CAST(ISNULL(b.QtyOnHand,    0) AS DECIMAL(18,4)),
        d.ItemReqDate,
        d.BomStatus,
        d.Remarks
    FROM proj.TBL_BOM_DETAILS d
    JOIN proj.TBL_BOM_HEADER  h ON h.BomHeaderId = d.BomHeaderId
    JOIN proj.TBL_ITEM        i ON i.ItemId      = d.ItemId
    LEFT JOIN proj.TBL_ITEM_UOM      u ON u.UomId  = d.UomId
    LEFT JOIN proj.TBL_STOCK_BALANCE b ON b.ItemId = d.ItemId
    WHERE d.IsActive = 1
      AND h.IsActive = 1
      AND d.JobId = @JobId
      AND (@BomHeaderId IS NULL OR d.BomHeaderId = @BomHeaderId)
      AND (d.BomRequestedQty - d.PrCreatedQty - d.IsrCreatedQty) > 0
    ORDER BY d.SortOrder, d.BomId;
END;
GO

/* ═══ 3. Keep IsrCreatedQty straight on every line write ═══════════════════
   This is 2026-09-07c's proc plus the counter maintenance. A BOM-sourced line
   moves the counter by the DELTA, so editing 5 -> 7 adds 2 rather than 7.    */
CREATE OR ALTER PROCEDURE proj.sp_SetIssueRequestLine
    @RequestLineId INT,
    @RequestId     INT,
    @ItemId        INT,
    @RequestedQty  DECIMAL(18,4),
    @UomId         INT           = NULL,
    @BomId         INT           = NULL,
    @RequiredDate  DATE          = NULL,
    @Notes         NVARCHAR(200) = NULL,
    @CreatedBy     NVARCHAR(100),
    @ModifiedBy    NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (
        SELECT 1 FROM proj.TBL_STOCK_ISSUE_REQUEST
        WHERE RequestId = @RequestId AND Status = 'Draft' AND IsActive = 1)
    BEGIN RAISERROR('Request is not in Draft status.', 16, 1); RETURN; END

    IF NOT EXISTS (SELECT 1 FROM proj.TBL_ITEM WHERE ItemId = @ItemId)
    BEGIN RAISERROR('Item not found.', 16, 1); RETURN; END

    IF @RequestedQty IS NULL OR @RequestedQty <= 0
    BEGIN RAISERROR('Requested quantity must be greater than zero.', 16, 1); RETURN; END

    -- ── BOM link validation (NEW in step 5) ──────────────────────────────
    DECLARE @PrevQty DECIMAL(18,4) = 0, @PrevBomId INT = NULL;

    IF @RequestLineId <> 0
        SELECT @PrevQty = RequestedQty, @PrevBomId = BomId
        FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE WHERE RequestLineId = @RequestLineId;

    IF @BomId IS NOT NULL
    BEGIN
        DECLARE @BomItemId INT, @BomOpen DECIMAL(18,4);
        SELECT @BomItemId = d.ItemId,
               @BomOpen   = d.BomRequestedQty - d.PrCreatedQty - d.IsrCreatedQty
        FROM proj.TBL_BOM_DETAILS d
        WHERE d.BomId = @BomId AND d.IsActive = 1;

        IF @BomItemId IS NULL
        BEGIN RAISERROR('BOM line not found.', 16, 1); RETURN; END

        IF @BomItemId <> @ItemId
        BEGIN RAISERROR('The item does not match the BOM line it is being pulled from.', 16, 1); RETURN; END

        -- Editing the same BOM-sourced line? Its own share is not competition.
        DECLARE @OwnShare DECIMAL(18,4) = CASE WHEN @PrevBomId = @BomId THEN @PrevQty ELSE 0 END;

        IF @RequestedQty > (@BomOpen + @OwnShare)
        BEGIN
            DECLARE @Msg NVARCHAR(400) =
                'Only ' + CAST(@BomOpen + @OwnShare AS NVARCHAR(30)) +
                ' is still uncommitted on that BOM line (the rest is already on a PR or another request).';
            RAISERROR(@Msg, 16, 1); RETURN;
        END
    END

    DECLARE @IssuedQty DECIMAL(18,4) = 0;

    IF @RequestLineId = 0
    BEGIN
        IF EXISTS (SELECT 1 FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE
                   WHERE RequestId = @RequestId AND ItemId = @ItemId AND IsActive = 1)
        BEGIN RAISERROR('This item is already on the request. Edit that line instead.', 16, 1); RETURN; END

        DECLARE @NextLineNum INT;
        SELECT @NextLineNum = ISNULL(MAX(LineNum), 0) + 1
        FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE WHERE RequestId = @RequestId;

        INSERT INTO proj.TBL_STOCK_ISSUE_REQUEST_LINE
            (RequestId, LineNum, ItemId, BomId, RequestedQty, IssuedQty, ReservedQty,
             UomId, RequiredDate, LineStatus, Notes, CreatedBy)
        VALUES
            (@RequestId, @NextLineNum, @ItemId, @BomId, @RequestedQty, 0, 0,
             @UomId, @RequiredDate, 'Pending', @Notes, @CreatedBy);

        IF @BomId IS NOT NULL
            UPDATE proj.TBL_BOM_DETAILS
            SET IsrCreatedQty = IsrCreatedQty + @RequestedQty
            WHERE BomId = @BomId;

        SELECT SCOPE_IDENTITY() AS RequestLineId;
    END
    ELSE
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE
                       WHERE RequestLineId = @RequestLineId AND RequestId = @RequestId AND IsActive = 1)
        BEGIN RAISERROR('Request line not found.', 16, 1); RETURN; END

        IF EXISTS (SELECT 1 FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE
                   WHERE RequestId = @RequestId AND ItemId = @ItemId AND IsActive = 1
                     AND RequestLineId <> @RequestLineId)
        BEGIN RAISERROR('This item is already on another line of the request.', 16, 1); RETURN; END

        SELECT @IssuedQty = IssuedQty
        FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE WHERE RequestLineId = @RequestLineId;

        IF @RequestedQty < @IssuedQty
        BEGIN
            DECLARE @Msg2 NVARCHAR(300) =
                'Requested qty cannot be less than the qty already issued (' +
                CAST(@IssuedQty AS NVARCHAR(30)) + ').';
            RAISERROR(@Msg2, 16, 1); RETURN;
        END

        -- Counter moves by the delta, and follows the line if the BOM link changes.
        IF @PrevBomId IS NOT NULL AND (@BomId IS NULL OR @BomId <> @PrevBomId)
            UPDATE proj.TBL_BOM_DETAILS
            SET IsrCreatedQty = CASE WHEN IsrCreatedQty - @PrevQty < 0 THEN 0 ELSE IsrCreatedQty - @PrevQty END
            WHERE BomId = @PrevBomId;

        IF @BomId IS NOT NULL
            UPDATE proj.TBL_BOM_DETAILS
            SET IsrCreatedQty = IsrCreatedQty
                              + CASE WHEN @PrevBomId = @BomId THEN (@RequestedQty - @PrevQty) ELSE @RequestedQty END
            WHERE BomId = @BomId;

        UPDATE proj.TBL_STOCK_ISSUE_REQUEST_LINE
        SET ItemId       = @ItemId,
            BomId        = @BomId,
            RequestedQty = @RequestedQty,
            UomId        = @UomId,
            RequiredDate = @RequiredDate,
            Notes        = @Notes,
            LineStatus   = CASE
                               WHEN @IssuedQty >= @RequestedQty THEN 'FullyIssued'
                               WHEN @IssuedQty >  0             THEN 'PartiallyIssued'
                               ELSE 'Pending' END,
            ModifiedBy   = @ModifiedBy,
            ModifiedDate = SYSDATETIME()
        WHERE RequestLineId = @RequestLineId;

        SELECT @RequestLineId AS RequestLineId;
    END
END;
GO

/* ═══ 4. Deleting a line gives the BOM quantity back ═══════════════════════ */
CREATE OR ALTER PROCEDURE proj.sp_DeleteIssueRequestLine
    @RequestLineId INT,
    @ModifiedBy    NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (
        SELECT 1 FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE l
        JOIN proj.TBL_STOCK_ISSUE_REQUEST r ON r.RequestId = l.RequestId
        WHERE l.RequestLineId = @RequestLineId AND r.Status = 'Draft' AND r.IsActive = 1)
    BEGIN RAISERROR('Line not found or request is not in Draft status.', 16, 1); RETURN; END

    IF EXISTS (SELECT 1 FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE
               WHERE RequestLineId = @RequestLineId AND IssuedQty > 0)
    BEGIN RAISERROR('This line has already been issued against and cannot be deleted.', 16, 1); RETURN; END

    -- Release the BOM commitment before the row goes (NEW in step 5).
    UPDATE d
    SET d.IsrCreatedQty = CASE WHEN d.IsrCreatedQty - l.RequestedQty < 0 THEN 0
                               ELSE d.IsrCreatedQty - l.RequestedQty END
    FROM proj.TBL_BOM_DETAILS d
    JOIN proj.TBL_STOCK_ISSUE_REQUEST_LINE l ON l.BomId = d.BomId
    WHERE l.RequestLineId = @RequestLineId AND l.BomId IS NOT NULL;

    DELETE FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE WHERE RequestLineId = @RequestLineId;
    SELECT @@ROWCOUNT AS RowsDeleted;
END;
GO

/* ─── Verify ────────────────────────────────────────────────────────────── */
SELECT 'TBL_BOM_DETAILS.IsrCreatedQty' AS Item,
       CASE WHEN COL_LENGTH('proj.TBL_BOM_DETAILS','IsrCreatedQty') IS NULL THEN 'MISSING' ELSE 'OK' END AS Result
UNION ALL SELECT 'sp_GetBomLinesForIssueRequest',
       CASE WHEN OBJECT_ID('proj.sp_GetBomLinesForIssueRequest') IS NULL THEN 'MISSING' ELSE 'OK' END
UNION ALL SELECT 'sp_SetIssueRequestLine maintains counter',
       CASE WHEN OBJECT_DEFINITION(OBJECT_ID('proj.sp_SetIssueRequestLine')) LIKE '%IsrCreatedQty%' THEN 'OK' ELSE 'MISSING' END
UNION ALL SELECT 'sp_DeleteIssueRequestLine releases counter',
       CASE WHEN OBJECT_DEFINITION(OBJECT_ID('proj.sp_DeleteIssueRequestLine')) LIKE '%IsrCreatedQty%' THEN 'OK' ELSE 'MISSING' END;
GO
