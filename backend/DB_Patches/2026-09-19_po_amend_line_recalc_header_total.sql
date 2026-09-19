-- =====================================================================
-- 2026-09-19  sp_AmendPOLine did not recompute the PO header total
--
-- APPLY TO: SYNERP (dev) first. Production after sign-off.
--
-- SCENARIO: a supplier raises the price after the GRN is registered. The
-- PO is approved and (partly or fully) received, so the only way to
-- change a line is "Amend PO Line" (qty + price, password, reason, logged
-- to TBL_PO_AMENDMENT_LOG).
--
-- BUG: sp_AmendPOLine updated the LINE's UnitPrice but never touched the
-- header. TBL_PURCHASE_ORDER.TotalAmount is a plain stored column, only
-- ever recomputed in sp_SetPOLine, and there is no trigger that does it.
-- So after a price amendment the lines and the header disagreed.
-- Reproduced on dev (rolled back): PO-26-0009 line 1006, price 30 -> 45:
-- lines summed to 75, header TotalAmount stayed 60. That stale header is
-- what PO lists, the PO print, sp_ReportPOs (TotalAmountBase) and the
-- Dashboard "POs created today" value all read.
--
-- FIX: recompute the header TotalAmount from the active lines with EXACTLY
-- the formula sp_SetPOLine uses (line subtotal, less header Discount %,
-- plus each line's TaxPct tax, plus the header's manually typed
-- TaxAmount, which is read but never written). The whole amendment is
-- now one transaction, so a failure part-way cannot leave the line
-- changed and the header not (none of the procs it calls open their own
-- transaction, checked).
--
-- DELIBERATELY NOT CHANGED:
--  * GRN line UnitPrice. The GRN is what was received and it is what the
--    stock balance's AvgUnitCost and the job item ledger were posted at.
--    Rewriting it here would make the GRN disagree with the stock value
--    it created. Price differences on received goods are settled through
--    the supplier invoice, which is a separate step.
--
-- ADDED (same day, after the user chose a percentage tolerance and the
-- "Revise PO" route for re-approval): a value-increase guard. An amendment
-- may not push the PO above its approved value + Biz.PoAmend.ReapprovalTolerancePct
-- (default 0 = every increase must use Revise). See 1c below and
-- 2026-09-19b_po_revise_received_pos.sql for the Revise side.
--
-- Full-body CREATE OR ALTER of one procedure. No table changes.
-- =====================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

CREATE OR ALTER PROCEDURE proj.sp_AmendPOLine
    @PoLineId     INT,
    @NewQty       DECIMAL(18,4),
    @NewPrice     DECIMAL(18,4),
    @Reason       NVARCHAR(500),
    @PasswordHash NVARCHAR(500),
    @ModifiedBy   NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- All guards use THROW so a failed check ABORTS. They previously used bare
    -- RAISERROR with no RETURN, so a wrong password (or any failed guard) raised
    -- a message but execution fell through to the amendment UPDATE anyway.
    IF NOT EXISTS (SELECT 1 FROM proj.TBL_USERS WHERE UserName=@ModifiedBy AND PasswordHash=@PasswordHash AND IsActive=1)
        THROW 50730, 'Incorrect password.', 1;

    IF LTRIM(RTRIM(ISNULL(@Reason,''))) = ''
        THROW 50731, 'A reason is required for amendment.', 1;

    DECLARE @CurrentOrdered  DECIMAL(18,4);
    DECLARE @CurrentReceived DECIMAL(18,4);
    DECLARE @CurrentPrice    DECIMAL(18,4);
    DECLARE @PoStatus        NVARCHAR(50);
    DECLARE @PrLineId        INT;
    DECLARE @BomDetailId     INT;
    DECLARE @PoIdVal         INT;
    DECLARE @LineNumVal      INT;
    DECLARE @ItemCode        NVARCHAR(100);
    DECLARE @ItemDesc        NVARCHAR(500);

    SELECT @CurrentOrdered  = pol.OrderedQty,
           @CurrentReceived = ISNULL(pol.ReceivedQty, 0),
           @CurrentPrice    = pol.UnitPrice,
           @PoStatus        = po.Status,
           @PrLineId        = pol.PrLineId,
           @PoIdVal         = pol.PoId,
           @LineNumVal      = pol.LineNum,
           @ItemCode        = pol.ItemCode,
           @ItemDesc        = pol.ItemDesc
    FROM   proj.TBL_PURCHASE_ORDER_LINE pol
    JOIN   proj.TBL_PURCHASE_ORDER      po ON po.PoId = pol.PoId
    WHERE  pol.PoLineId = @PoLineId AND pol.IsActive = 1;

    IF @CurrentOrdered IS NULL THROW 50732, 'PO line not found.', 1;

    IF @PoStatus NOT IN ('Approved','Partial','Received')
        THROW 50733, 'Amendment is only allowed on Approved, Partial or Received POs.', 1;
    IF @NewQty <= 0
        THROW 50734, 'New quantity must be greater than zero.', 1;
    IF @NewQty > @CurrentOrdered
        THROW 50735, 'Amendment can only reduce the ordered quantity, not increase it.', 1;

    DECLARE @TotalGrnQty DECIMAL(18,4);
    SELECT @TotalGrnQty = ISNULL(SUM(d.ReceivedQty), 0)
    FROM   proj.TBL_GRN_DETAIL d
    JOIN   proj.TBL_GRN_HEADER h ON h.GrnId = d.GrnId AND h.IsActive = 1
    WHERE  d.PoLineId = @PoLineId
      AND  d.IsActive = 1
      AND  h.Status  <> 'Cancelled';

    IF @NewQty < @TotalGrnQty
    BEGIN
        DECLARE @GrnMsg NVARCHAR(300) =
            'New quantity (' + CAST(@NewQty AS NVARCHAR(50)) +
            ') cannot be less than the total quantity already recorded in GRNs (' +
            CAST(@TotalGrnQty AS NVARCHAR(50)) + '), including drafts.';
        THROW 50736, @GrnMsg, 1;
    END

    IF @NewPrice < 0
        THROW 50737, 'Unit price cannot be negative.', 1;

    BEGIN TRANSACTION;

    -- PO total before this change - needed by the re-approval tolerance check (1c).
    DECLARE @OldPoTotal DECIMAL(18,4) = (SELECT ISNULL(TotalAmount, 0) FROM proj.TBL_PURCHASE_ORDER WHERE PoId = @PoIdVal);

    -- 1. Update PO line
    UPDATE proj.TBL_PURCHASE_ORDER_LINE
    SET    OrderedQty=@NewQty, UnitPrice=@NewPrice,
           ModifiedBy=@ModifiedBy, ModifiedDate=GETDATE()
    WHERE  PoLineId=@PoLineId;

    -- 1b. Recompute the PO header total from the lines. Same formula as
    -- sp_SetPOLine: subtotal, less header Discount %, plus each line's
    -- TaxPct-based tax, plus the header's manually entered TaxAmount
    -- (read only - it is typed by the user and must never be overwritten).
    DECLARE @LinesSubtotal     DECIMAL(18,4) = (
        SELECT ISNULL(SUM(OrderedQty * UnitPrice), 0)
        FROM   proj.TBL_PURCHASE_ORDER_LINE WHERE PoId = @PoIdVal AND IsActive = 1);
    DECLARE @LinesTax          DECIMAL(18,4) = (
        SELECT ISNULL(SUM(OrderedQty * UnitPrice * TaxPct / 100.0), 0)
        FROM   proj.TBL_PURCHASE_ORDER_LINE WHERE PoId = @PoIdVal AND IsActive = 1);
    DECLARE @HeaderDiscountPct DECIMAL(18,4) = (
        SELECT ISNULL(Discount, 0)  FROM proj.TBL_PURCHASE_ORDER WHERE PoId = @PoIdVal);
    DECLARE @HeaderTaxAmount   DECIMAL(18,4) = (
        SELECT ISNULL(TaxAmount, 0) FROM proj.TBL_PURCHASE_ORDER WHERE PoId = @PoIdVal);

    UPDATE proj.TBL_PURCHASE_ORDER
    SET    TotalAmount  = @LinesSubtotal - (@LinesSubtotal * @HeaderDiscountPct / 100.0) + @LinesTax + @HeaderTaxAmount,
           ModifiedBy   = @ModifiedBy,
           ModifiedDate = GETDATE()
    WHERE  PoId = @PoIdVal;

    -- 1c. Re-approval tolerance. A quick amendment may not push the PO above its
    -- APPROVED value plus the tolerance %. Anything larger has to go back through
    -- approval with "Revise PO" (PO -> Draft -> edit -> resubmit), so an approver
    -- signs off the higher value.
    --   * Only an INCREASE can be blocked; reductions always go through.
    --   * Measured against what was approved (the latest approved PO approval
    --     transaction's amount, document currency), NOT against the current total,
    --     so a series of small amendments cannot creep past the limit.
    --   * Setting Biz.PoAmend.ReapprovalTolerancePct, in percent. 0 (the default)
    --     means every increase needs Revise.
    DECLARE @NewPoTotal DECIMAL(18,4) = (SELECT ISNULL(TotalAmount, 0) FROM proj.TBL_PURCHASE_ORDER WHERE PoId = @PoIdVal);
    IF @NewPoTotal > @OldPoTotal
    BEGIN
        DECLARE @TolPct DECIMAL(18,4) = ISNULL(TRY_CAST((SELECT SettingValue FROM proj.TBL_APP_SETTINGS
                                                          WHERE SettingKey = N'Biz.PoAmend.ReapprovalTolerancePct') AS DECIMAL(18,4)), 0);
        IF @TolPct < 0 SET @TolPct = 0;

        DECLARE @ApprovedAmt DECIMAL(18,4) = (
            SELECT TOP 1 t.DocumentAmount
            FROM   proj.TBL_APPROVAL_TRANSACTION t
            JOIN   proj.TBL_APPROVAL_MODULE m ON m.ModuleId = t.ModuleId AND m.ModuleCode = 'PO'
            WHERE  t.DocumentId = @PoIdVal AND t.CurrentStatus = 'Approved'
            ORDER BY t.TransactionId DESC);
        IF @ApprovedAmt IS NULL SET @ApprovedAmt = @OldPoTotal;   -- legacy PO with no approval record

        DECLARE @MaxPoTotal DECIMAL(18,4) = @ApprovedAmt * (1 + @TolPct / 100.0);
        IF @NewPoTotal > @MaxPoTotal + 0.005
        BEGIN
            -- NB: no literal percent sign in a THROW message. THROW (like RAISERROR)
            -- treats it as a format character and silently swallows it, which left
            -- the whole message blank on the first version of this guard.
            DECLARE @TolMsg NVARCHAR(500) =
                'This change raises the PO to ' + FORMAT(@NewPoTotal, 'N2') +
                ', above the limit of ' + FORMAT(@MaxPoTotal, 'N2') +
                ' (approved ' + FORMAT(@ApprovedAmt, 'N2') + ' plus ' + FORMAT(@TolPct, '0.##') +
                ' percent). Use "Revise PO" to send the higher value for re-approval.';
            THROW 50738, @TolMsg, 1;
        END
    END

    -- 2. Sync GRN detail OrderedQty (qty only - the GRN's own UnitPrice is left
    -- as received, see header note)
    UPDATE proj.TBL_GRN_DETAIL
    SET    OrderedQty=@NewQty, ModifiedBy=@ModifiedBy, ModifiedDate=GETDATE()
    WHERE  PoLineId=@PoLineId AND IsActive=1;

    -- 2b. Recompute this PO line's status + PO header status
    EXEC proj.sp_RecalcPoLineStatus @PoLineId, @ModifiedBy;

    -- 3. Recalculate PR line PoCreatedQty + BOM PoCreatedQty
    IF @PrLineId IS NOT NULL
    BEGIN
        SELECT @BomDetailId = BomDetailId
        FROM   proj.TBL_PURCHASE_REQUEST_LINE
        WHERE  PrLineId=@PrLineId AND IsActive=1;

        UPDATE proj.TBL_PURCHASE_REQUEST_LINE
        SET    PoCreatedQty = (
                   SELECT ISNULL(SUM(pol2.OrderedQty),0)
                   FROM proj.TBL_PURCHASE_ORDER_LINE pol2
                   WHERE pol2.PrLineId=@PrLineId AND pol2.IsActive=1
               ),
               ModifiedBy=@ModifiedBy, ModifiedDate=GETDATE()
        WHERE  PrLineId=@PrLineId;

        EXEC proj.sp_RecalcPrStatus @PrLineId, @ModifiedBy;

        IF @BomDetailId IS NOT NULL
        BEGIN
            UPDATE proj.TBL_BOM_DETAILS
            SET    PoCreatedQty = (
                       SELECT ISNULL(SUM(pol3.OrderedQty),0)
                       FROM proj.TBL_PURCHASE_ORDER_LINE pol3
                       JOIN proj.TBL_PURCHASE_REQUEST_LINE prl3
                           ON prl3.PrLineId=pol3.PrLineId AND prl3.IsActive=1
                       WHERE prl3.BomDetailId=@BomDetailId AND pol3.IsActive=1
                   )
            WHERE  BomId=@BomDetailId;

            UPDATE proj.TBL_BOM_DETAILS
            SET    BomStatus = CASE
                       WHEN BomReceivedQty >= BomRequestedQty THEN 'FullyReceived'
                       WHEN BomReceivedQty  > 0               THEN 'PartialReceived'
                       WHEN PoCreatedQty   >= BomRequestedQty THEN 'PORaised'
                       WHEN PoCreatedQty    > 0               THEN 'POPartial'
                       WHEN PrCreatedQty   >= BomRequestedQty THEN 'PRRaised'
                       WHEN PrCreatedQty    > 0               THEN 'PRPartial'
                       ELSE 'Pending'
                   END,
                   ModifiedBy=@ModifiedBy, ModifiedDate=GETDATE()
            WHERE  BomId=@BomDetailId;
        END
    END

    -- 4. Write amendment log
    INSERT INTO proj.TBL_PO_AMENDMENT_LOG
        (PoLineId,PoId,LineNum,ItemCode,ItemDesc,OldQty,NewQty,OldPrice,NewPrice,Reason,AmendedBy,AmendedDate)
    VALUES
        (@PoLineId,@PoIdVal,@LineNumVal,@ItemCode,@ItemDesc,@CurrentOrdered,@NewQty,@CurrentPrice,@NewPrice,@Reason,@ModifiedBy,GETDATE());

    COMMIT TRANSACTION;

    SELECT @PoLineId AS PoLineId;
END
GO

-- ── verification ─────────────────────────────────────────────────────
SELECT Item = 'sp_AmendPOLine', Status = CASE
    WHEN OBJECT_DEFINITION(OBJECT_ID('proj.sp_AmendPOLine')) LIKE '%1b. Recompute the PO header total%'
     AND OBJECT_DEFINITION(OBJECT_ID('proj.sp_AmendPOLine')) LIKE '%COMMIT TRANSACTION%'
    THEN 'OK' ELSE 'MISSING' END;
GO
