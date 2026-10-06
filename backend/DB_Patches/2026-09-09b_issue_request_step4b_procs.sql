-- 2026-09-09: Issue Request — BUILD STEP 4b of 5: the reservation procedures
--
-- Apply to: ERPDB
-- Requires: 2026-09-09 (step 4a schema)
-- Design:   backend/Docs/DESIGN-issue-request.md §7, §9 answers 1, 4 and 6
--
-- Three NEW procedures:
--   sp_ExpireStockReservations   release expired holds, then top up under-reserved
--                                approved requests from whatever is now free
--   sp_PostIssueRequestApproval  takes the hold when a request is approved
--   sp_CloseIssueRequest         manual close of the remaining balance, releases
--
-- And one row changed: TBL_APPROVAL_MODULE.PostApprovalSP for ISR, which has
-- deliberately been NULL since step 1 precisely because this proc did not exist.
--
-- ── The engine's contract ───────────────────────────────────────────────────
-- sp_ProcessApproval calls   EXEC <PostApprovalSP> @DocId, @By
-- on FINAL approval only, INSIDE its own transaction. So this proc takes two
-- positional parameters in that order, and anything it THROWs rolls the whole
-- approval back — which is what we want: a request must never end up Approved
-- with no hold taken.
--
-- ── Reservations are capped, never negative ─────────────────────────────────
-- A request for 100 with 20 available reserves 20, not 100. The remaining 80 is
-- a visible shortfall, not a promise nobody can keep.
--
-- ── Store stock only (§9 answer 1) ──────────────────────────────────────────
-- QtyAvailable = QtyOnHand - QtyJobStock - QtyReserved. Job stock is committed
-- to its job by definition, so it is not part of what a request can hold.
--
-- ⚠ KNOWN ODDITY, worth a decision later: because §9 answer 3 forces EVERY issue
-- through a request, an EXC_COSTING request also takes a STORE-stock hold, even
-- though its issue note will consume JOB stock instead. The hold is released
-- correctly (the release is driven off RequestLineId, never off the branch that
-- moved the stock), so nothing leaks — but such a request does hold store stock
-- it will never consume. Skipping the hold for EXC_COSTING types would be more
-- accurate; it is not done here because the design says store-stock-only without
-- carving out that case, and changing it is a business call, not a technical one.
--
-- Idempotent — CREATE OR ALTER throughout, safe to re-run.

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
GO

/* ═══ 1. Expire, then reconcile ════════════════════════════════════════════
   Two jobs in one proc because they are two halves of the same idea: keep the
   held quantities honest. Run it from a scheduler, and it is also called at the
   top of sp_PostIssueRequestApproval so an expiry can never be missed just
   because the scheduled run did not happen.

   @RequestId limits both halves to one request (used by the approval hook so a
   single approval does not walk the whole table). NULL = everything.        */
CREATE OR ALTER PROCEDURE proj.sp_ExpireStockReservations
    @RequestId  INT           = NULL,
    @ModifiedBy NVARCHAR(100) = N'system',
    -- @Silent: emit no result set. The approval hook runs INSIDE
    -- sp_ProcessApproval, whose caller reads the FIRST result set to learn the
    -- approval outcome — a stray "LinesReleased/LinesToppedUp" row from here
    -- would be read as the approval result. Scheduled runs leave it 0.
    @Silent     BIT           = 0,
    -- @TopUp: run the reconcile half. The approval hook passes 0 so approving a
    -- request cannot hand its stock to a different, older request mid-approval;
    -- fair-share redistribution belongs to the scheduled run.
    @TopUp      BIT           = 1
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Today DATE = CAST(GETDATE() AS DATE);
    DECLARE @Released INT = 0, @ToppedUp INT = 0;

    BEGIN TRY
        BEGIN TRANSACTION;

        /* ── A. Release everything past its expiry date ─────────────────────
           Expiry releases the HOLD ONLY. The request stays Approved and can
           still be issued against if stock is there — it just stops keeping
           other jobs out. (§9 answer 4, confirmed by the user.)             */
        DECLARE @expired TABLE (RequestLineId INT, ItemId INT, Qty DECIMAL(18,4));

        INSERT INTO @expired (RequestLineId, ItemId, Qty)
        SELECT l.RequestLineId, l.ItemId, l.ReservedQty
        FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE l
        JOIN proj.TBL_STOCK_ISSUE_REQUEST      r ON r.RequestId = l.RequestId
        WHERE l.IsActive = 1 AND r.IsActive = 1
          AND l.ReservedQty > 0
          AND r.ReservationExpiryDate IS NOT NULL
          AND r.ReservationExpiryDate < @Today
          AND (@RequestId IS NULL OR r.RequestId = @RequestId);

        IF EXISTS (SELECT 1 FROM @expired)
        BEGIN
            UPDATE b
            SET b.QtyReserved = CASE WHEN b.QtyReserved - x.Qty < 0 THEN 0 ELSE b.QtyReserved - x.Qty END,
                b.UpdatedDate = GETDATE()
            FROM proj.TBL_STOCK_BALANCE b
            JOIN (SELECT ItemId, SUM(Qty) AS Qty FROM @expired GROUP BY ItemId) x ON x.ItemId = b.ItemId;

            UPDATE l
            SET l.ReservedQty  = 0,
                l.ModifiedBy   = @ModifiedBy,
                l.ModifiedDate = SYSDATETIME()
            FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE l
            JOIN @expired x ON x.RequestLineId = l.RequestLineId;

            SELECT @Released = COUNT(*) FROM @expired;
        END

        /* ── B. Top up whatever is now short ────────────────────────────────
           §9 answer 6: no GRN hook. Deciding allocation order inside a receipt
           posting would mean editing one of the most load-bearing procs in the
           system; instead this reconcile grants newly-free stock to requests
           that are under-reserved, OLDEST FIRST so a long-waiting request is
           not starved by one raised this morning.

           Ordering proxy: ReservationExpiryDate is stamped at approval, so with
           a constant ReservationDays it sorts by approval date. RequestId is
           the tiebreak.                                                     */
        DECLARE @lineId INT, @itemId INT, @short DECIMAL(18,4), @free DECIMAL(18,4), @grant DECIMAL(18,4);

        IF @TopUp = 1
        BEGIN
        DECLARE topup CURSOR LOCAL FAST_FORWARD FOR
            SELECT l.RequestLineId, l.ItemId,
                   (l.RequestedQty - l.IssuedQty - l.ReservedQty) AS Shortfall
            FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE l
            JOIN proj.TBL_STOCK_ISSUE_REQUEST      r ON r.RequestId = l.RequestId
            WHERE l.IsActive = 1 AND r.IsActive = 1
              AND r.Status IN ('Approved','PartiallyIssued')
              -- not expired: an aged-out request does not get topped up again
              AND (r.ReservationExpiryDate IS NULL OR r.ReservationExpiryDate >= @Today)
              AND (l.RequestedQty - l.IssuedQty - l.ReservedQty) > 0
              AND (@RequestId IS NULL OR r.RequestId = @RequestId)
            ORDER BY ISNULL(r.ReservationExpiryDate, '9999-12-31'), r.RequestId, l.LineNum;

        OPEN topup;
        FETCH NEXT FROM topup INTO @lineId, @itemId, @short;
        WHILE @@FETCH_STATUS = 0
        BEGIN
            SELECT @free = ISNULL(QtyAvailable, 0) FROM proj.TBL_STOCK_BALANCE WHERE ItemId = @itemId;

            SET @grant = CASE WHEN ISNULL(@free,0) <= 0 THEN 0
                              WHEN @free < @short     THEN @free
                              ELSE @short END;

            IF @grant > 0
            BEGIN
                UPDATE proj.TBL_STOCK_BALANCE
                SET QtyReserved = QtyReserved + @grant, UpdatedDate = GETDATE()
                WHERE ItemId = @itemId;

                UPDATE proj.TBL_STOCK_ISSUE_REQUEST_LINE
                SET ReservedQty  = ReservedQty + @grant,
                    ModifiedBy   = @ModifiedBy,
                    ModifiedDate = SYSDATETIME()
                WHERE RequestLineId = @lineId;

                SET @ToppedUp = @ToppedUp + 1;
            END

            FETCH NEXT FROM topup INTO @lineId, @itemId, @short;
        END
        CLOSE topup; DEALLOCATE topup;
        END   -- @TopUp = 1

        COMMIT;
        IF @Silent = 0
            SELECT @Released AS LinesReleased, @ToppedUp AS LinesToppedUp;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        IF CURSOR_STATUS('local','topup') >= 0 BEGIN CLOSE topup; DEALLOCATE topup; END;
        THROW;
    END CATCH
END;
GO

/* ═══ 2. Take the hold on approval ═════════════════════════════════════════
   Called by sp_ProcessApproval as: EXEC proj.sp_PostIssueRequestApproval @DocId, @By
   inside the engine's transaction, on final approval only.                  */
CREATE OR ALTER PROCEDURE proj.sp_PostIssueRequestApproval
    @RequestId  INT,
    @ApprovedBy NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM proj.TBL_STOCK_ISSUE_REQUEST WHERE RequestId = @RequestId AND IsActive = 1)
    BEGIN RAISERROR('Issue Request not found.', 16, 1); RETURN; END

    -- Clear anything already aged out before measuring what is free, so a stale
    -- hold on another request cannot make this one look short.
    --   @Silent = 1  this runs inside sp_ProcessApproval's transaction, and its
    --                caller reads the FIRST result set as the approval outcome.
    --   @TopUp  = 0  release only. Redistributing to other requests mid-approval
    --                would let approving THIS request hand the stock to a
    --                different one; that belongs to the scheduled reconcile.
    EXEC proj.sp_ExpireStockReservations
         @RequestId = NULL, @ModifiedBy = @ApprovedBy, @Silent = 1, @TopUp = 0;

    -- The clock starts when the stock is actually held. 0 disables expiry.
    DECLARE @Days INT = TRY_CAST((SELECT SettingValue FROM proj.TBL_APP_SETTINGS
                                  WHERE SettingKey = 'Inventory.IssueRequest.ReservationDays') AS INT);
    SET @Days = ISNULL(@Days, 14);

    UPDATE proj.TBL_STOCK_ISSUE_REQUEST
    SET ReservationExpiryDate = CASE WHEN @Days > 0 THEN DATEADD(DAY, @Days, CAST(GETDATE() AS DATE)) END,
        ModifiedBy            = ISNULL(@ApprovedBy, ModifiedBy),
        ModifiedDate          = SYSDATETIME()
    WHERE RequestId = @RequestId;

    -- Reserve up to the open balance of each line, capped at what is free.
    DECLARE @lineId INT, @itemId INT, @want DECIMAL(18,4), @free DECIMAL(18,4), @grant DECIMAL(18,4);

    DECLARE res CURSOR LOCAL FAST_FORWARD FOR
        SELECT l.RequestLineId, l.ItemId, (l.RequestedQty - l.IssuedQty - l.ReservedQty)
        FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE l
        WHERE l.RequestId = @RequestId AND l.IsActive = 1
          AND (l.RequestedQty - l.IssuedQty - l.ReservedQty) > 0
        ORDER BY l.LineNum;

    OPEN res;
    FETCH NEXT FROM res INTO @lineId, @itemId, @want;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        SELECT @free = ISNULL(QtyAvailable, 0) FROM proj.TBL_STOCK_BALANCE WHERE ItemId = @itemId;

        SET @grant = CASE WHEN ISNULL(@free,0) <= 0 THEN 0
                          WHEN @free < @want      THEN @free
                          ELSE @want END;

        IF @grant > 0
        BEGIN
            UPDATE proj.TBL_STOCK_BALANCE
            SET QtyReserved = QtyReserved + @grant, UpdatedDate = GETDATE()
            WHERE ItemId = @itemId;

            UPDATE proj.TBL_STOCK_ISSUE_REQUEST_LINE
            SET ReservedQty  = ReservedQty + @grant,
                ModifiedBy   = @ApprovedBy,
                ModifiedDate = SYSDATETIME()
            WHERE RequestLineId = @lineId;
        END

        FETCH NEXT FROM res INTO @lineId, @itemId, @want;
    END
    CLOSE res; DEALLOCATE res;
END;
GO

/* ═══ 3. Close a request and let the rest go ═══════════════════════════════
   "3 of 10 issued and the rest is never coming" — end it without leaving it
   open forever, and give the held stock back. (§6.)                          */
CREATE OR ALTER PROCEDURE proj.sp_CloseIssueRequest
    @RequestId  INT,
    @ModifiedBy NVARCHAR(100),
    @Reason     NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Status NVARCHAR(20);
    SELECT @Status = Status FROM proj.TBL_STOCK_ISSUE_REQUEST
    WHERE RequestId = @RequestId AND IsActive = 1;

    IF @Status IS NULL
    BEGIN RAISERROR('Issue Request not found.', 16, 1); RETURN; END

    IF @Status NOT IN ('Approved','PartiallyIssued')
    BEGIN
        DECLARE @Msg NVARCHAR(300) = 'Only an approved request can be closed. This one is ' + @Status + '.';
        RAISERROR(@Msg, 16, 1); RETURN;
    END

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Give back every hold this request is carrying.
        UPDATE b
        SET b.QtyReserved = CASE WHEN b.QtyReserved - x.Qty < 0 THEN 0 ELSE b.QtyReserved - x.Qty END,
            b.UpdatedDate = GETDATE()
        FROM proj.TBL_STOCK_BALANCE b
        JOIN (SELECT l.ItemId, SUM(l.ReservedQty) AS Qty
              FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE l
              WHERE l.RequestId = @RequestId AND l.IsActive = 1 AND l.ReservedQty > 0
              GROUP BY l.ItemId) x ON x.ItemId = b.ItemId;

        UPDATE proj.TBL_STOCK_ISSUE_REQUEST_LINE
        SET ReservedQty  = 0,
            LineStatus   = CASE WHEN IssuedQty >= RequestedQty THEN 'FullyIssued' ELSE 'Closed' END,
            ModifiedBy   = @ModifiedBy,
            ModifiedDate = SYSDATETIME()
        WHERE RequestId = @RequestId AND IsActive = 1;

        UPDATE proj.TBL_STOCK_ISSUE_REQUEST
        SET Status                = 'Closed',
            ReservationExpiryDate = NULL,
            Notes                 = CASE WHEN @Reason IS NULL THEN Notes
                                         ELSE LEFT(ISNULL(Notes + ' | ', '') + 'Closed: ' + @Reason, 500) END,
            ModifiedBy            = @ModifiedBy,
            ModifiedDate          = SYSDATETIME()
        WHERE RequestId = @RequestId;

        COMMIT;
        SELECT @RequestId AS RequestId, 'Closed' AS Status;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END;
GO

/* ═══ 4. Wire the approval hook ════════════════════════════════════════════
   NULL since step 1 on purpose — naming a proc that does not exist is a trap
   that fails at the worst possible moment. It exists now.                    */
UPDATE proj.TBL_APPROVAL_MODULE
SET PostApprovalSP = 'proj.sp_PostIssueRequestApproval',
    ModifiedBy     = 'system',
    ModifiedDate   = GETDATE()
WHERE ModuleCode = 'ISR' AND ISNULL(PostApprovalSP, '') <> 'proj.sp_PostIssueRequestApproval';
GO

/* ─── Verify ────────────────────────────────────────────────────────────── */
SELECT name AS Proc_, CONVERT(NVARCHAR(19), modify_date, 120) AS Modified
FROM sys.procedures
WHERE name IN ('sp_ExpireStockReservations','sp_PostIssueRequestApproval','sp_CloseIssueRequest')
ORDER BY name;
GO
SELECT ModuleCode, PostApprovalSP FROM proj.TBL_APPROVAL_MODULE WHERE ModuleCode = 'ISR';
GO
