-- 2026-09-09: Issue Request — BUILD STEP 4c of 5: sp_ConfirmStockIssue releases the hold
--
-- Apply to: ERPDB
-- Requires: 2026-09-09 + 2026-09-09b (step 4 schema and reservation procs)
-- Design:   backend/Docs/DESIGN-issue-request.md §7, §9 answers 2, 3 and 4
--
-- SUPERSEDES 2026-09-07h. This is that patch plus block (d): issuing against a
-- request now gives the held stock back and restarts the inactivity clock.
-- Everything else is unchanged, so applying this alone is sufficient.
--
-- ── (d), the new part ───────────────────────────────────────────────────────
-- Release is driven off RequestLineId, NEVER off the branch that moved the
-- stock. That matters: an EXC_COSTING note consumes JOB stock while its request
-- holds STORE stock, so a release keyed on the stock movement would never fire
-- and those holds would leak forever (design §4).
--
-- Released per line = min(qty issued, qty actually held) — the hold can be
-- smaller than the issue when only part of the request could be reserved.
--
-- The expiry date is re-stamped on every partial issue, so the window measures
-- INACTIVITY rather than age (§9 answer 4): a request being worked stays held
-- indefinitely, and only an abandoned one ages out.
--
-- ⚠ THIS IS THE PATCH THAT CHANGES BEHAVIOUR FOR EXISTING USERS.
--   Everything up to here was additive. Once this is applied, an Issue Note whose
--   issue type has RequiresRequest = 1 CANNOT BE CONFIRMED without an approved
--   Issue Request — and both types are set to 1 (decision 3). The ISR approval
--   policy and its approvers must already be configured, or the store halts.
--   To relax it for a type:
--     UPDATE proj.TBL_ISSUE_TYPE SET RequiresRequest = 0 WHERE IssueTypeCode = 'EXC_COSTING';
--
-- sp_ConfirmStockIssue is the point of no return, so it is where the rules are
-- actually enforced. Three additions, all marked NEW below; everything else is
-- the original proc verbatim, including its three stock-consumption branches
-- (in-house source job / EXC_COSTING job stock / plain store stock).
--
--   a) the request gate      RequiresRequest = 1 and no approved request -> refuse
--   b) the over-issue block  decision 2, checked for every linked line BEFORE any
--                            stock moves, so one bad line cannot half-post a note
--   c) the write-back        +IssuedQty on the request line, then recompute the
--                            line and header status from BOTH quantities
--
--   d) the release        -ReservedQty on the line, -QtyReserved on the balance,
--                         and ReservationExpiryDate re-stamped (NEW in 4c)
--
-- sp_CancelStockIssue needs NO change, contrary to §7 of the design: it cancels
-- Draft notes only, and IssuedQty is written at confirm, so a cancelled note has
-- never touched the request. A confirmed note is reversed with an Issue Return.
--
-- Idempotent — CREATE OR ALTER, safe to re-run.

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE proj.sp_ConfirmStockIssue
    @IssueId    INT,
    @ModifiedBy NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;
    BEGIN TRY
        IF NOT EXISTS (
            SELECT 1 FROM proj.TBL_STOCK_ISSUE
            WHERE IssueId = @IssueId AND Status = 'Draft' AND IsActive = 1)
            THROW 50300, 'Issue Note not found or already confirmed.', 1;

        IF NOT EXISTS (
            SELECT 1 FROM proj.TBL_STOCK_ISSUE_LINE
            WHERE IssueId = @IssueId AND IsActive = 1)
            THROW 50301, 'Cannot confirm an Issue Note with no lines.', 1;

        DECLARE @IssueNo NVARCHAR(30), @JobId NVARCHAR(50), @CostingType NVARCHAR(20);
        SELECT @IssueNo = IssueNo, @JobId = JobId, @CostingType = CostingType
        FROM proj.TBL_STOCK_ISSUE WHERE IssueId = @IssueId;

        -- ═══ NEW (a): the request gate ═══════════════════════════════════
        DECLARE @NoteRequestId INT, @RequiresRequest BIT = 0, @ReqStatus NVARCHAR(20);

        SELECT @NoteRequestId   = si.RequestId,
               @RequiresRequest = ISNULL(it.RequiresRequest, 0)
        FROM proj.TBL_STOCK_ISSUE si
        LEFT JOIN proj.TBL_ISSUE_TYPE it
               ON it.IssueTypeId = si.IssueTypeId
               OR (si.IssueTypeId IS NULL AND it.IssueTypeCode = si.CostingType)
        WHERE si.IssueId = @IssueId;

        IF @RequiresRequest = 1 AND @NoteRequestId IS NULL
            THROW 50320, 'This issue type requires an approved Issue Request. Raise one and get it approved, or pull this note from an existing request.', 1;

        IF @NoteRequestId IS NOT NULL
        BEGIN
            SELECT @ReqStatus = Status FROM proj.TBL_STOCK_ISSUE_REQUEST
            WHERE RequestId = @NoteRequestId AND IsActive = 1;

            IF @ReqStatus IS NULL
                THROW 50321, 'The linked Issue Request no longer exists.', 1;

            IF @ReqStatus NOT IN ('Approved', 'PartiallyIssued')
            BEGIN
                DECLARE @ReqMsg NVARCHAR(300) =
                    'Issue Request is ' + @ReqStatus + '. Only an approved request can be issued against.';
                THROW 50322, @ReqMsg, 1;
            END
        END

        -- ═══ NEW (b): over-issue block, decision 2 ═══════════════════════
        DECLARE @OverMsg NVARCHAR(500);

        SELECT TOP 1 @OverMsg =
            'Item ' + ISNULL(i.ItemCode, CAST(rl.ItemId AS NVARCHAR(20))) +
            ': requested ' + CAST(rl.RequestedQty AS NVARCHAR(30)) +
            ', already issued ' + CAST(rl.IssuedQty AS NVARCHAR(30)) +
            ', cannot issue ' + CAST(x.QtyOnNote AS NVARCHAR(30)) +
            '. Edit the request or raise a new one.'
        FROM (
            SELECT l.RequestLineId, SUM(l.Qty) AS QtyOnNote
            FROM proj.TBL_STOCK_ISSUE_LINE l
            WHERE l.IssueId = @IssueId AND l.IsActive = 1 AND l.RequestLineId IS NOT NULL
            GROUP BY l.RequestLineId
        ) x
        JOIN proj.TBL_STOCK_ISSUE_REQUEST_LINE rl ON rl.RequestLineId = x.RequestLineId
        LEFT JOIN proj.TBL_ITEM i ON i.ItemId = rl.ItemId
        WHERE x.QtyOnNote > (rl.RequestedQty - rl.IssuedQty);

        IF @OverMsg IS NOT NULL
            THROW 50323, @OverMsg, 1;

        DECLARE @ItemId INT, @Qty DECIMAL(18,4), @UnitCost DECIMAL(18,4), @UomId INT,
                @BaseUomId INT, @ConvFactor DECIMAL(18,6),
                @StockQty DECIMAL(18,4), @StockUnitCost DECIMAL(18,4),
                @ConvErrMsg NVARCHAR(400),
                @SourceJobId NVARCHAR(50), @SrcBal DECIMAL(18,4), @ShortMsg NVARCHAR(400);

        DECLARE cur CURSOR FOR
            SELECT ItemId, Qty, UnitCost, UomId
            FROM proj.TBL_STOCK_ISSUE_LINE
            WHERE IssueId = @IssueId AND IsActive = 1;

        OPEN cur;
        FETCH NEXT FROM cur INTO @ItemId, @Qty, @UnitCost, @UomId;
        WHILE @@FETCH_STATUS = 0
        BEGIN
            SELECT @BaseUomId = BaseUomId FROM proj.TBL_ITEM WHERE ItemId = @ItemId;
            SET @ConvFactor = NULL;
            IF @UomId IS NOT NULL AND @BaseUomId IS NOT NULL AND @UomId <> @BaseUomId
            BEGIN
                SELECT @ConvFactor = ConversionFactor
                FROM proj.TBL_ITEM_UOM_CONVERSION
                WHERE ItemId=@ItemId AND FromUomId=@UomId AND ToUomId=@BaseUomId AND IsActive=1;
                IF @ConvFactor IS NULL OR @ConvFactor = 0
                BEGIN
                    SET @ConvErrMsg = 'No UOM conversion defined for item ' +
                        ISNULL((SELECT ItemCode FROM proj.TBL_ITEM WHERE ItemId=@ItemId), CAST(@ItemId AS NVARCHAR(20))) +
                        ' (' + ISNULL((SELECT UomCode FROM proj.TBL_ITEM_UOM WHERE UomId=@UomId), '?') +
                        ' to ' + ISNULL((SELECT UomCode FROM proj.TBL_ITEM_UOM WHERE UomId=@BaseUomId), '?') +
                        '). Configure it in Item master > UOM Conversions.';
                    RAISERROR(@ConvErrMsg, 16, 1);
                END
                SET @StockQty      = @Qty * @ConvFactor;
                SET @StockUnitCost = @UnitCost / @ConvFactor;
            END
            ELSE
            BEGIN
                SET @StockQty      = @Qty;
                SET @StockUnitCost = @UnitCost;
            END

            -- Derive the SOURCE in-house job for this item via its budget header
            SET @SourceJobId = NULL;
            SELECT TOP 1 @SourceJobId = j.JobId
            FROM proj.TBL_ITEM it
            JOIN proj.TBL_JOB        j  ON j.BudgetCategoryId = it.BudgetCategoryId
            JOIN proj.TBL_JOBTYPE    jt ON jt.JobTypeId = j.JobTypeId AND ISNULL(jt.IsBudgetHeaderLinked,0) = 1
            JOIN proj.TBL_JOB_STATUS js ON js.JobStatusId = j.JobStatusId AND ISNULL(js.IsClosed,0) = 0
            WHERE it.ItemId = @ItemId AND it.BudgetCategoryId IS NOT NULL
            ORDER BY j.JobCreatedDate DESC;

            IF @SourceJobId IS NOT NULL
            BEGIN
                -- In-house GRN receipts are stored with IsJobStock=0 (store stock).
                -- Balance check uses JobId only (no IsJobStock filter) to handle
                -- both new receipts and any legacy IsJobStock=1 entries.
                SELECT @SrcBal = ISNULL(SUM(QtyIn - QtyOut), 0)
                FROM proj.TBL_STOCK_LEDGER
                WHERE ItemId = @ItemId AND JobId = @SourceJobId;

                IF @SrcBal < @StockQty
                BEGIN
                    SET @ShortMsg = 'Insufficient in-house stock for item ' +
                        ISNULL((SELECT ItemCode FROM proj.TBL_ITEM WHERE ItemId=@ItemId), CAST(@ItemId AS NVARCHAR(20))) +
                        ' in job ' + @SourceJobId + ' (have ' + CAST(@SrcBal AS NVARCHAR(30)) +
                        ', need ' + CAST(@StockQty AS NVARCHAR(30)) + ').';
                    THROW 50304, @ShortMsg, 1;
                END

                -- Only QtyOnHand decreases; QtyStoreStock (computed = QtyOnHand - QtyJobStock)
                -- auto-decreases. QtyJobStock is NOT touched for in-house stock.
                UPDATE proj.TBL_STOCK_BALANCE
                SET QtyOnHand     = QtyOnHand - @StockQty,
                    LastIssueDate = GETDATE(),
                    UpdatedDate   = GETDATE()
                WHERE ItemId = @ItemId;

                INSERT INTO proj.TBL_STOCK_LEDGER
                    (ItemId, TransType, RefId, RefNo, QtyIn, QtyOut, UnitCost, IsJobStock, JobId, CreatedBy)
                VALUES
                    (@ItemId, 'ISSUE', @IssueId, @IssueNo, 0, @StockQty, @StockUnitCost,
                     0, @SourceJobId, @ModifiedBy);
            END
            ELSE IF @CostingType = 'EXC_COSTING'
            BEGIN
                UPDATE proj.TBL_STOCK_BALANCE
                SET QtyJobStock   = QtyJobStock - @StockQty,
                    QtyOnHand     = CASE WHEN QtyOnHand - @StockQty < 0 THEN 0 ELSE QtyOnHand - @StockQty END,
                    LastIssueDate = GETDATE(), UpdatedDate = GETDATE()
                WHERE ItemId = @ItemId AND ISNULL(QtyJobStock,0) >= @StockQty;

                IF @@ROWCOUNT = 0
                    THROW 50302, 'Insufficient job stock for one or more items.', 1;

                INSERT INTO proj.TBL_STOCK_LEDGER
                    (ItemId, TransType, RefId, RefNo, QtyIn, QtyOut, UnitCost, IsJobStock, JobId, CreatedBy)
                VALUES
                    (@ItemId, 'ISSUE', @IssueId, @IssueNo, 0, @StockQty, @StockUnitCost, 1, @JobId, @ModifiedBy);
            END
            ELSE
            BEGIN
                UPDATE proj.TBL_STOCK_BALANCE
                SET QtyOnHand     = QtyOnHand - @StockQty,
                    LastIssueDate = GETDATE(), UpdatedDate = GETDATE()
                WHERE ItemId = @ItemId AND ISNULL(QtyOnHand,0) >= @StockQty;

                IF @@ROWCOUNT = 0
                    THROW 50303, 'Insufficient stock for one or more items.', 1;

                INSERT INTO proj.TBL_STOCK_LEDGER
                    (ItemId, TransType, RefId, RefNo, QtyIn, QtyOut, UnitCost, IsJobStock, JobId, CreatedBy)
                VALUES
                    (@ItemId, 'ISSUE', @IssueId, @IssueNo, 0, @StockQty, @StockUnitCost, 0, @JobId, @ModifiedBy);
            END

            FETCH NEXT FROM cur INTO @ItemId, @Qty, @UnitCost, @UomId;
        END
        CLOSE cur; DEALLOCATE cur;

        -- ═══ NEW (c): write the issued quantity back onto the request ════
        -- Held in the request line's own unit, which is why sp_SetStockIssueLine
        -- refuses a line whose UOM differs from the request line's.
        IF @NoteRequestId IS NOT NULL
        BEGIN
            /* ═══ NEW (d): give the hold back ═══════════════════════════════
               Done BEFORE IssuedQty moves, so the amounts read cleanly. Keyed
               on RequestLineId, never on which stock branch ran: an
               EXC_COSTING note takes job stock while its request holds store
               stock, and a release keyed on the movement would never fire. */
            DECLARE @rel TABLE (RequestLineId INT, ItemId INT, Qty DECIMAL(18,4));

            INSERT INTO @rel (RequestLineId, ItemId, Qty)
            SELECT rl.RequestLineId, rl.ItemId,
                   -- the hold can be smaller than the issue when only part of
                   -- the request could be reserved
                   CASE WHEN x.QtyOnNote < rl.ReservedQty THEN x.QtyOnNote ELSE rl.ReservedQty END
            FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE rl
            JOIN (
                SELECT l.RequestLineId, SUM(l.Qty) AS QtyOnNote
                FROM proj.TBL_STOCK_ISSUE_LINE l
                WHERE l.IssueId = @IssueId AND l.IsActive = 1 AND l.RequestLineId IS NOT NULL
                GROUP BY l.RequestLineId
            ) x ON x.RequestLineId = rl.RequestLineId
            WHERE rl.ReservedQty > 0;

            IF EXISTS (SELECT 1 FROM @rel WHERE Qty > 0)
            BEGIN
                UPDATE b
                SET b.QtyReserved = CASE WHEN b.QtyReserved - y.Qty < 0 THEN 0 ELSE b.QtyReserved - y.Qty END,
                    b.UpdatedDate = GETDATE()
                FROM proj.TBL_STOCK_BALANCE b
                JOIN (SELECT ItemId, SUM(Qty) AS Qty FROM @rel GROUP BY ItemId) y ON y.ItemId = b.ItemId;

                UPDATE rl
                SET rl.ReservedQty = CASE WHEN rl.ReservedQty - r.Qty < 0 THEN 0 ELSE rl.ReservedQty - r.Qty END
                FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE rl
                JOIN @rel r ON r.RequestLineId = rl.RequestLineId;
            END

            UPDATE rl
            SET rl.IssuedQty    = rl.IssuedQty + x.QtyOnNote,
                rl.ModifiedBy   = @ModifiedBy,
                rl.ModifiedDate = SYSDATETIME()
            FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE rl
            JOIN (
                SELECT l.RequestLineId, SUM(l.Qty) AS QtyOnNote
                FROM proj.TBL_STOCK_ISSUE_LINE l
                WHERE l.IssueId = @IssueId AND l.IsActive = 1 AND l.RequestLineId IS NOT NULL
                GROUP BY l.RequestLineId
            ) x ON x.RequestLineId = rl.RequestLineId;

            -- Line status, derived from BOTH quantities. Recomputed here rather
            -- than by a trigger watching only the fulfilled side — that is the
            -- blind spot TR_BOM_RecalcStatus has on the BOM line.
            UPDATE rl
            SET rl.LineStatus = CASE
                    WHEN rl.IssuedQty >= rl.RequestedQty THEN 'FullyIssued'
                    WHEN rl.IssuedQty >  0               THEN 'PartiallyIssued'
                    ELSE 'Pending' END
            FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE rl
            WHERE rl.RequestId = @NoteRequestId AND rl.IsActive = 1;

            -- Header follows its lines. Guarded to Approved/PartiallyIssued so a
            -- Closed or Cancelled request is never silently reopened.
            UPDATE r
            SET r.Status = CASE
                    WHEN NOT EXISTS (SELECT 1 FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE l
                                     WHERE l.RequestId = r.RequestId AND l.IsActive = 1
                                       AND l.IssuedQty < l.RequestedQty)          THEN 'FullyIssued'
                    WHEN EXISTS     (SELECT 1 FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE l
                                     WHERE l.RequestId = r.RequestId AND l.IsActive = 1
                                       AND l.IssuedQty > 0)                       THEN 'PartiallyIssued'
                    ELSE r.Status END,
                -- NEW (d): the inactivity clock restarts on every partial issue.
                -- A fixed window from approval would expire exactly the healthy
                -- requests that are part-issued and waiting on a purchase order.
                r.ReservationExpiryDate = CASE
                    WHEN r.ReservationExpiryDate IS NULL THEN NULL   -- expiry disabled
                    ELSE DATEADD(DAY,
                         ISNULL(TRY_CAST((SELECT SettingValue FROM proj.TBL_APP_SETTINGS
                                          WHERE SettingKey = 'Inventory.IssueRequest.ReservationDays') AS INT), 14),
                         CAST(GETDATE() AS DATE)) END,
                r.ModifiedBy   = @ModifiedBy,
                r.ModifiedDate = SYSDATETIME()
            FROM proj.TBL_STOCK_ISSUE_REQUEST r
            WHERE r.RequestId = @NoteRequestId
              AND r.Status IN ('Approved', 'PartiallyIssued');
        END

        UPDATE proj.TBL_STOCK_ISSUE
        SET Status = N'Confirmed', ModifiedBy = @ModifiedBy, ModifiedDate = GETDATE()
        WHERE IssueId = @IssueId;

        -- Auto-advance job stage: first confirmed issue note -> STAGE3
        IF NOT EXISTS (
            SELECT 1 FROM proj.TBL_STOCK_ISSUE
            WHERE JobId = @JobId AND Status = 'Confirmed' AND IssueId <> @IssueId AND IsActive = 1
        )
        BEGIN
            UPDATE proj.TBL_JOB
            SET JobStageId = 'STAGE3'
            WHERE JobId = @JobId AND JobStageId IN ('STAGE1', 'STAGE2');
        END

        COMMIT;
        SELECT @IssueNo AS IssueNo, N'Confirmed' AS Status;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        IF CURSOR_STATUS('global','cur') >= 0 BEGIN CLOSE cur; DEALLOCATE cur; END;
        THROW;
    END CATCH
END
GO

/* Verify */
SELECT CASE WHEN CHARINDEX('NEW (c)', OBJECT_DEFINITION(OBJECT_ID('proj.sp_ConfirmStockIssue'))) > 0
             AND CHARINDEX('NEW (d)', OBJECT_DEFINITION(OBJECT_ID('proj.sp_ConfirmStockIssue'))) > 0
            THEN 'OK - patched (write-back + release)' ELSE 'NOT PATCHED' END AS Result;
GO
