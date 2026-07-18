-- ============================================================================
-- SECURITY FIX — sp_RevisePO and sp_AmendPOLine ignored a wrong password
-- Re-runnable: safe to execute on every client database.
--
-- THE BUG
-- -------
-- The guards used RAISERROR('...', 16, 1) with no RETURN, no THROW, and no
-- TRY/CATCH. RAISERROR of severity < 20 does NOT abort a procedure unless a
-- TRY/CATCH is active up the call stack. The controllers call these procs with a
-- plain ExecuteScalar (no T-SQL TRY/CATCH), so every guard — including the
-- password check — raised its message and then execution simply fell through to
-- the action UPDATE. Result: a wrong password (or wrong status, missing reason,
-- etc.) still revised the PO / amended the PO line.
--
-- Audited every proc that validates a password (2026-07-17): these two were the
-- only vulnerable ones. All others abort correctly — via RETURN after RAISERROR
-- (budget/BOM revise, allocations), THROW (invoice/note/voucher cancel+revise),
-- TRY/CATCH re-raise (RTV post, GRN confirm/cancel, issue-return), or
-- SELECT Success=0 + RETURN checked by the controller (job status/stage/revise).
--
-- THE FIX
-- -------
-- Every guard now uses THROW, which aborts immediately. Messages are unchanged,
-- so the controllers' `catch (SqlException) => BadRequest(sqlEx.Message)` still
-- surface the same text — but the action no longer happens. XACT_ABORT ON is
-- added so any mid-statement failure rolls back cleanly.
-- ============================================================================

CREATE OR ALTER PROCEDURE proj.sp_RevisePO
    @PoId         INT,
    @RevisedBy    NVARCHAR(100),
    @Reason       NVARCHAR(500),
    @PasswordHash NVARCHAR(500)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Validate password  (THROW aborts — RAISERROR did not)
    IF NOT EXISTS (
        SELECT 1 FROM proj.TBL_USERS
        WHERE UserName = @RevisedBy AND PasswordHash = @PasswordHash AND IsActive = 1
    )
        THROW 50720, 'Incorrect password.', 1;

    -- Validate reason
    IF LTRIM(RTRIM(ISNULL(@Reason, ''))) = ''
        THROW 50721, 'A reason is required to revise the PO.', 1;

    -- Block if PO is fully received (all lines done) — partial is allowed
    DECLARE @PoStatus NVARCHAR(30);
    SELECT @PoStatus = Status
    FROM proj.TBL_PURCHASE_ORDER
    WHERE PoId = @PoId AND IsActive = 1;

    IF @PoStatus = 'Received'
        THROW 50722, 'Cannot revise: this PO is fully received. Use a new PO or Return to Vendor for corrections.', 1;

    IF @PoStatus NOT IN ('Approved', 'Sent', 'Partial')
    BEGIN
        DECLARE @StatusMsg NVARCHAR(200) = 'Cannot revise: PO must be in Approved, Sent, or Partial status. Current status: ' + ISNULL(@PoStatus, 'Unknown') + '.';
        THROW 50723, @StatusMsg, 1;
    END

    DECLARE @NewRevision INT;

    UPDATE proj.TBL_PURCHASE_ORDER
    SET    Status       = 'Draft',
           Revision     = Revision + 1,
           ModifiedBy   = @RevisedBy,
           ModifiedDate = GETDATE()
    WHERE  PoId     = @PoId
      AND  IsActive = 1;

    IF @@ROWCOUNT = 0
        THROW 50724, 'Purchase order not found or is inactive.', 1;

    SELECT @NewRevision = Revision FROM proj.TBL_PURCHASE_ORDER WHERE PoId = @PoId;

    -- Cancel existing approval transaction so it can be re-submitted
    UPDATE proj.TBL_APPROVAL_TRANSACTION
    SET    CurrentStatus  = 'Cancelled',
           FinalAction    = 'Cancelled',
           FinalActionBy  = @RevisedBy,
           FinalRemarks   = 'Cancelled — PO revised back to Draft. Reason: ' + @Reason,
           CompletedDate  = GETDATE(),
           ModifiedBy     = @RevisedBy,
           ModifiedDate   = GETDATE()
    WHERE  ModuleId      = 2
      AND  DocumentId    = @PoId
      AND  CurrentStatus NOT IN ('Cancelled', 'Rejected');

    -- Write revision log
    INSERT INTO proj.TBL_PO_REVISION_LOG (PoId, RevisionNo, Reason, RevisedBy, RevisedDate)
    VALUES (@PoId, @NewRevision, @Reason, @RevisedBy, GETDATE());

    SELECT @PoId AS PoId;
END
GO

-- ── sp_AmendPOLine — same bug, same fix (bare RAISERROR → THROW) ────────────
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

    UPDATE proj.TBL_PURCHASE_ORDER_LINE
    SET    OrderedQty=@NewQty, UnitPrice=@NewPrice,
           ModifiedBy=@ModifiedBy, ModifiedDate=GETDATE()
    WHERE  PoLineId=@PoLineId;

    UPDATE proj.TBL_GRN_DETAIL
    SET    OrderedQty=@NewQty, ModifiedBy=@ModifiedBy, ModifiedDate=GETDATE()
    WHERE  PoLineId=@PoLineId AND IsActive=1;

    EXEC proj.sp_RecalcPoLineStatus @PoLineId, @ModifiedBy;

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

    INSERT INTO proj.TBL_PO_AMENDMENT_LOG
        (PoLineId,PoId,LineNum,ItemCode,ItemDesc,OldQty,NewQty,OldPrice,NewPrice,Reason,AmendedBy,AmendedDate)
    VALUES
        (@PoLineId,@PoIdVal,@LineNumVal,@ItemCode,@ItemDesc,@CurrentOrdered,@NewQty,@CurrentPrice,@NewPrice,@Reason,@ModifiedBy,GETDATE());

    SELECT @PoLineId AS PoLineId;
END
