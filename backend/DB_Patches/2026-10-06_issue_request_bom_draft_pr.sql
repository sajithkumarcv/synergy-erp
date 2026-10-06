-- 2026-10-06: Issue Request - Draft PRs no longer reserve BOM balance
--
-- Apply to: SYNERP
-- Requires: the Issue Request build patches (2026-09-07b .. 2026-09-09e)
--
-- Brings sp_GetBomLinesForIssueRequest and sp_SetIssueRequestLine level with the
-- base WebERP definitions. Only PR lines whose parent PR has left Draft count
-- against the BOM line - a Draft PR is a proposal and must not stop the store
-- issuing the item from stock against that BOM line. The one-to-many
-- UPDATE...FROM join is avoided by aggregating PR quantity first.
--
-- Idempotent - CREATE OR ALTER.

SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

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
        PrCreatedQty       = ISNULL(pr.CommittedQty, 0),
        d.PoCreatedQty,
        d.IsrCreatedQty,
        -- What is still uncommitted on this requirement, for the purpose of
        -- issuing from stock. Only PR lines whose parent PR has left Draft
        -- actually reserve BOM balance here — a Draft PR is just a proposal
        -- and must not block issuing this item from store against the BOM.
        OpenQty            = CAST(d.BomRequestedQty - ISNULL(pr.CommittedQty, 0) - d.IsrCreatedQty AS DECIMAL(18,4)),
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
    OUTER APPLY (
        SELECT SUM(l.RequiredQty) AS CommittedQty
        FROM proj.TBL_PURCHASE_REQUEST_LINE l
        JOIN proj.TBL_PURCHASE_REQUEST p ON p.PrId = l.PrId
        WHERE l.BomDetailId = d.BomId AND l.IsActive = 1 AND p.Status <> 'Draft'
    ) pr
    WHERE d.IsActive = 1
      AND h.IsActive = 1
      AND d.JobId = @JobId
      AND (@BomHeaderId IS NULL OR d.BomHeaderId = @BomHeaderId)
      AND (d.BomRequestedQty - ISNULL(pr.CommittedQty, 0) - d.IsrCreatedQty) > 0
    ORDER BY d.SortOrder, d.BomId;
END;
GO

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

    -- ── BOM link validation ──────────────────────────────────────────────
    DECLARE @PrevQty DECIMAL(18,4) = 0, @PrevBomId INT = NULL;

    IF @RequestLineId <> 0
        SELECT @PrevQty = RequestedQty, @PrevBomId = BomId
        FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE WHERE RequestLineId = @RequestLineId;

    IF @BomId IS NOT NULL
    BEGIN
        DECLARE @BomItemId INT, @BomOpen DECIMAL(18,4), @NonDraftPr DECIMAL(18,4);

        -- Draft PRs are just proposals — only non-Draft PR lines actually
        -- reserve BOM balance for the purpose of issuing from stock.
        SELECT @NonDraftPr = ISNULL(SUM(l.RequiredQty), 0)
        FROM proj.TBL_PURCHASE_REQUEST_LINE l
        JOIN proj.TBL_PURCHASE_REQUEST p ON p.PrId = l.PrId
        WHERE l.BomDetailId = @BomId AND l.IsActive = 1 AND p.Status <> 'Draft';

        SELECT @BomItemId = d.ItemId,
               @BomOpen   = d.BomRequestedQty - @NonDraftPr - d.IsrCreatedQty
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
