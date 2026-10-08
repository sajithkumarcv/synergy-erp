-- 2026-10-08c: PO budget checks use the latest APPROVED budget revision
--
-- Apply to: SYNERP
--
-- sp_ReviseJobBudget makes a new revision IsCurrent = 1 immediately, while it is still unapproved, and the PO
-- checks read IsCurrent only. So a job whose budget (or revision) was awaiting approval was treated as having a
-- valid budget: PO-26-0014 on IH26-500026 was approved while Rev 2 was still pending.
-- Now the budget a PO is checked against is the latest revision with IsApproved = 1. A job with no approved
-- budget is refused at submit, at approve and when adding a PO line, and @OverrideBudget does not bypass that
-- refusal (it only bypasses "over budget").
-- Changes: sp_SubmitForApproval, sp_ProcessApproval, sp_GetPOBudgetCheck (budget panel), sp_SetPOLine.
-- Reports (Job Overview / Analysis / Variance) still show the current revision.
--
-- Restore script: _REVERT_2026-10-08c_po_budget_approved_revision.sql (kept with the pre-change backups).
-- Idempotent.

SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- â”€â”€ 3. PROJ.sp_GetPOBudgetCheck â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Small enough to replace whole. New optional @PoId: the PO currently open on screen
-- still counts its own draft lines, every OTHER draft does not.
CREATE OR ALTER PROCEDURE proj.sp_GetPOBudgetCheck
    @JobId           NVARCHAR(50),
    @CostCategoryId  INT = NULL,   -- NULL = whole job (sum across all categories), was mandatory before
    @ExcludePoLineId INT = 0,
    @PoId            INT = 0       -- the PO being viewed/edited; its own Draft lines still count
AS
BEGIN
    SET NOCOUNT ON;

    -- All figures in BASE currency. Budget line carries its own currency/rate.
    DECLARE @JobRate      DECIMAL(18,6) = ISNULL((SELECT JobExcRate FROM proj.TBL_JOB WHERE JobId = @JobId), 1);
    DECLARE @Budgeted     DECIMAL(18,2) = 0;
    DECLARE @CategoryName NVARCHAR(200) = '';

    -- SUM (not a plain scalar assignment) since @CostCategoryId = NULL now
    -- matches every category's budget line for this job, not just one row.
    SELECT @Budgeted = ISNULL(SUM(ISNULL(AmountInBaseCurrency, proj.fn_ToBase(ISNULL(BudgetedAmount,0), ISNULL(ExchangeRate, @JobRate)))), 0)
    FROM proj.TBL_JOB_BUDGET
    WHERE JobId = @JobId
      AND (@CostCategoryId IS NULL OR CostCategoryId = @CostCategoryId)
      AND IsApproved = 1 AND RvNo = (SELECT MAX(b2.RvNo) FROM proj.TBL_JOB_BUDGET b2 WHERE b2.JobId = @JobId AND b2.IsApproved = 1);   -- 2026-10-08: latest APPROVED revision

    SELECT @CategoryName = ISNULL(CategoryName, '')
    FROM proj.TBL_JOB_EXPENSE_CATEGORY
    WHERE ExpenseCategoryId = @CostCategoryId;
    -- @CategoryName stays '' when @CostCategoryId IS NULL (whole-job check) -
    -- callers doing a whole-job check don't use this field.

    DECLARE @Committed DECIMAL(18,2) = 0;
    SELECT @Committed = ISNULL(SUM(proj.fn_ToBase(pol.OrderedQty * pol.UnitPrice, po.ExchangeRate)), 0)
    FROM proj.TBL_PURCHASE_ORDER      po
    JOIN proj.TBL_PURCHASE_ORDER_LINE pol
        ON pol.PoId = po.PoId AND pol.IsActive = 1
    WHERE po.JobId             = @JobId
      AND (@CostCategoryId IS NULL OR po.ExpenseCategoryId = @CostCategoryId)
      -- A Draft PO is not a commitment and must not reserve budget (2026-09-27).
      -- The one exception is the PO on screen, so its own lines still show up in
      -- "Remaining" while it is being built.
      AND (po.Status NOT IN ('Draft','Cancelled') OR po.PoId = @PoId)
      AND po.IsActive          = 1
      AND pol.PoLineId        != ISNULL(NULLIF(@ExcludePoLineId, 0), -1);

    SELECT
        @CategoryName          AS CategoryName,
        @Budgeted              AS Budgeted,
        @Committed             AS Committed,
        @Budgeted - @Committed AS Remaining;
END
GO

CREATE OR ALTER PROCEDURE PROJ.sp_SetPOLine
    @PoLineId    INT           = 0,
    @PoId        INT,
    @PrLineId    INT           = NULL,
    @ItemId      INT           = NULL,
    @ItemCode    NVARCHAR(50)  = NULL,
    @ItemDesc    NVARCHAR(300) = NULL,
    @OrderedQty  DECIMAL(18,4) = 1,
    @UomId       INT           = NULL,
    @UomName     NVARCHAR(50)  = NULL,
    @UnitPrice   DECIMAL(18,4) = 0,
    @TaxPct      DECIMAL(5,2)  = 0,
    @Remarks     NVARCHAR(300) = NULL,
    @CreatedBy   NVARCHAR(100) = NULL,
    @ModifiedBy  NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ParentJobId NVARCHAR(50) = (SELECT JobId FROM proj.TBL_PURCHASE_ORDER WHERE PoId = @PoId);
    IF @ParentJobId IS NOT NULL EXEC proj.sp_AssertJobOpen @ParentJobId;
    IF @ParentJobId IS NOT NULL EXEC proj.sp_AssertBudgetApproved @ParentJobId, N'PO';

    IF NULLIF(@PoId, 0) IS NULL
    BEGIN RAISERROR('PoId is required.', 16, 1); RETURN; END
    IF ISNULL(@OrderedQty, 0) <= 0
    BEGIN RAISERROR('Ordered quantity must be greater than zero.', 16, 1); RETURN; END
    IF ISNULL(@UnitPrice, 0) < 0
    BEGIN RAISERROR('Unit price cannot be negative.', 16, 1); RETURN; END

    DECLARE @PoStatus NVARCHAR(30);
    SELECT @PoStatus = Status FROM PROJ.TBL_PURCHASE_ORDER WHERE PoId = @PoId AND IsActive = 1;
    IF @PoStatus IS NULL BEGIN RAISERROR('Purchase Order not found or is inactive.', 16, 1); RETURN; END
    IF @PoStatus <> 'Draft'
    BEGIN
        DECLARE @PsMsg NVARCHAR(200) = 'PO lines can only be added or edited when the PO is in Draft status. Current status: ' + @PoStatus;
        RAISERROR(@PsMsg, 16, 1); RETURN;
    END

    IF @PoLineId IS NULL OR @PoLineId <= 0
    BEGIN
        IF NULLIF(@CreatedBy, '') IS NULL
        BEGIN RAISERROR('CreatedBy is required.', 16, 1); RETURN; END
        IF NULLIF(@ItemCode, '') IS NULL
        BEGIN RAISERROR('Item Code is required.', 16, 1); RETURN; END
        IF NULLIF(@UomId, 0) IS NULL
        BEGIN RAISERROR('Unit of Measure is required.', 16, 1); RETURN; END
    END

    IF @PrLineId IS NOT NULL AND @PrLineId > 0
    BEGIN
        DECLARE @PrRequiredQty  DECIMAL(18,4) = 0;
        DECLARE @PrPoCreatedQty DECIMAL(18,4) = 0;
        DECLARE @OldPoQty       DECIMAL(18,4) = 0;

        SELECT @PrRequiredQty  = ISNULL(RequiredQty,  0),
               @PrPoCreatedQty = ISNULL(PoCreatedQty, 0)
        FROM PROJ.TBL_PURCHASE_REQUEST_LINE WHERE PrLineId = @PrLineId;

        IF @PoLineId IS NOT NULL AND @PoLineId > 0
            SELECT @OldPoQty = ISNULL(OrderedQty, 0)
            FROM PROJ.TBL_PURCHASE_ORDER_LINE
            WHERE PoLineId = @PoLineId AND PrLineId = @PrLineId;

        DECLARE @PrBalance DECIMAL(18,4) = @PrRequiredQty - (@PrPoCreatedQty - @OldPoQty);
        DECLARE @ErrMsg    NVARCHAR(300);
        IF @OrderedQty > @PrBalance
        BEGIN
            SET @ErrMsg = 'PO quantity (' + CAST(@OrderedQty AS NVARCHAR(30))
                        + ') exceeds PR balance (' + CAST(@PrBalance AS NVARCHAR(30)) + ').';
            RAISERROR(@ErrMsg, 16, 1); RETURN;
        END
    END

    DECLARE @LineJobId      NVARCHAR(50);
    DECLARE @LineCategoryId INT;
    SELECT @LineJobId = JobId, @LineCategoryId = ExpenseCategoryId
    FROM PROJ.TBL_PURCHASE_ORDER WHERE PoId = @PoId AND IsActive = 1;

    DECLARE @LineJobCosting BIT = 1, @IsBudgetHeaderLinked BIT = 0;
    IF @LineJobId IS NOT NULL
        SELECT @LineJobCosting      = ISNULL(jt.IsCostingRequired, 1),
               @IsBudgetHeaderLinked = ISNULL(jt.IsBudgetHeaderLinked, 0)
        FROM PROJ.TBL_JOB j JOIN PROJ.TBL_JOBTYPE jt ON jt.JobTypeId = j.JobTypeId
        WHERE j.JobId = @LineJobId;

    IF @LineJobId IS NOT NULL AND @LineCategoryId IS NOT NULL AND @LineJobCosting = 1
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM PROJ.TBL_JOB_BUDGET
            WHERE JobId = @LineJobId AND CostCategoryId = @LineCategoryId AND IsApproved = 1 AND RvNo = (SELECT MAX(b2.RvNo) FROM PROJ.TBL_JOB_BUDGET b2 WHERE b2.JobId = @LineJobId AND b2.IsApproved = 1))
        BEGIN
            DECLARE @NoBudgetMsg NVARCHAR(400) = 'No approved budget line exists for the selected expense category on this job. Please create a budget line before adding PO lines.';
            RAISERROR(@NoBudgetMsg, 16, 1); RETURN;
        END
    END

    IF @PoLineId IS NULL OR @PoLineId <= 0
    BEGIN
        DECLARE @LineNum INT;
        SELECT @LineNum = ISNULL(MAX(LineNum), 0) + 1
        FROM PROJ.TBL_PURCHASE_ORDER_LINE WHERE PoId = @PoId AND IsActive = 1;

        INSERT INTO PROJ.TBL_PURCHASE_ORDER_LINE
            (PoId, LineNum, PrLineId, ItemId, ItemCode, ItemDesc,
             OrderedQty, UomId, UomName, UnitPrice, TaxPct, Remarks, CreatedBy)
        VALUES
            (@PoId, @LineNum, NULLIF(@PrLineId, 0), NULLIF(@ItemId, 0),
             @ItemCode, @ItemDesc, @OrderedQty, @UomId, @UomName,
             ISNULL(@UnitPrice, 0), ISNULL(@TaxPct, 0), @Remarks, @CreatedBy);

        IF @PrLineId IS NOT NULL AND @PrLineId > 0
        BEGIN
            DECLARE @BomDetailId_I INT;
            SELECT @BomDetailId_I = BomDetailId FROM PROJ.TBL_PURCHASE_REQUEST_LINE WHERE PrLineId = @PrLineId;

            UPDATE PROJ.TBL_PURCHASE_REQUEST_LINE
            SET PoCreatedQty = ISNULL(PoCreatedQty, 0) + @OrderedQty
            WHERE PrLineId = @PrLineId;

            EXEC PROJ.sp_RecalcPrPoCreatedQty @PrLineId, @CreatedBy;
            EXEC PROJ.sp_RecalcPrStatus @PrLineId, @CreatedBy;

            -- The PR now has a PO line against it — the procurement team's
            -- "create PO" task for this PR is done, whether or not the PR is
            -- fully consumed yet (a partial PO still counts as acted-on).
            DECLARE @ClosePrId_I INT = (SELECT PrId FROM PROJ.TBL_PURCHASE_REQUEST_LINE WHERE PrLineId = @PrLineId);
            IF @ClosePrId_I IS NOT NULL
                EXEC PROJ.sp_CloseProcurementPOTasks @PrId = @ClosePrId_I, @ClosedBy = @CreatedBy;

            IF @BomDetailId_I IS NOT NULL
                UPDATE PROJ.TBL_BOM_DETAILS
                SET PoCreatedQty = ISNULL(PoCreatedQty, 0) + @OrderedQty,
                    BomStatus    = CASE
                        WHEN BomReceivedQty >= BomRequestedQty                                 THEN 'FullyReceived'
                        WHEN BomReceivedQty  > 0                                               THEN 'PartialReceived'
                        WHEN (ISNULL(PoCreatedQty,0) + @OrderedQty) >= BomRequestedQty        THEN 'PORaised'
                        WHEN (ISNULL(PoCreatedQty,0) + @OrderedQty)  > 0                      THEN 'POPartial'
                        WHEN PrCreatedQty >= BomRequestedQty                                   THEN 'PRRaised'
                        WHEN PrCreatedQty  > 0                                                 THEN 'PRPartial'
                        ELSE 'Pending'
                    END
                WHERE BomId = @BomDetailId_I;
        END

        SELECT CAST(SCOPE_IDENTITY() AS NVARCHAR(20));
    END
    ELSE
    BEGIN
        DECLARE @OldOrderedQty DECIMAL(18,4) = 0;
        DECLARE @OldPrLineId   INT           = NULL;

        -- A PO line can never be ordered for less than has already been received
        -- against it (confirmed or draft GRNs). This matters now that a received PO
        -- can be revised back to Draft for a price correction: without it the
        -- quantity could be cut below what has physically arrived.
        DECLARE @GrnQtyOnLine DECIMAL(18,4) = (
            SELECT ISNULL(SUM(d.ReceivedQty), 0)
            FROM   proj.TBL_GRN_DETAIL d
            JOIN   proj.TBL_GRN_HEADER h ON h.GrnId = d.GrnId AND h.IsActive = 1
            WHERE  d.PoLineId = @PoLineId AND d.IsActive = 1 AND h.Status <> 'Cancelled');
        IF @OrderedQty < @GrnQtyOnLine
        BEGIN
            DECLARE @GrnQtyMsg NVARCHAR(300) = 'Ordered quantity (' + CAST(@OrderedQty AS NVARCHAR(30))
                + ') cannot be less than the quantity already received on this line (' + CAST(@GrnQtyOnLine AS NVARCHAR(30)) + ').';
            THROW 50762, @GrnQtyMsg, 1;
        END

        SELECT @OldOrderedQty = OrderedQty, @OldPrLineId = PrLineId
        FROM PROJ.TBL_PURCHASE_ORDER_LINE WHERE PoLineId = @PoLineId;

        UPDATE PROJ.TBL_PURCHASE_ORDER_LINE
        SET OrderedQty   = @OrderedQty,
            UomId        = NULLIF(@UomId, 0),
            UomName      = @UomName,
            UnitPrice    = ISNULL(@UnitPrice, 0),
            TaxPct       = ISNULL(@TaxPct, 0),
            Remarks      = @Remarks,
            ModifiedBy   = @ModifiedBy,
            ModifiedDate = GETDATE()
        WHERE PoLineId = @PoLineId;

        IF @OldPrLineId IS NOT NULL AND @OldPrLineId > 0
        BEGIN
            DECLARE @BomDetailId_U INT;
            SELECT @BomDetailId_U = BomDetailId FROM PROJ.TBL_PURCHASE_REQUEST_LINE WHERE PrLineId = @OldPrLineId;

            UPDATE PROJ.TBL_PURCHASE_REQUEST_LINE
            SET PoCreatedQty = ISNULL(PoCreatedQty, 0) - @OldOrderedQty + @OrderedQty
            WHERE PrLineId = @OldPrLineId;

            EXEC PROJ.sp_RecalcPrPoCreatedQty @OldPrLineId, @ModifiedBy;
            EXEC PROJ.sp_RecalcPrStatus @OldPrLineId, @ModifiedBy;

            DECLARE @ClosePrId_U INT = (SELECT PrId FROM PROJ.TBL_PURCHASE_REQUEST_LINE WHERE PrLineId = @OldPrLineId);
            IF @ClosePrId_U IS NOT NULL
                EXEC PROJ.sp_CloseProcurementPOTasks @PrId = @ClosePrId_U, @ClosedBy = @ModifiedBy;

            IF @BomDetailId_U IS NOT NULL
                UPDATE PROJ.TBL_BOM_DETAILS
                SET PoCreatedQty = ISNULL(PoCreatedQty, 0) - @OldOrderedQty + @OrderedQty,
                    BomStatus    = CASE
                        WHEN BomReceivedQty >= BomRequestedQty                                                   THEN 'FullyReceived'
                        WHEN BomReceivedQty  > 0                                                                 THEN 'PartialReceived'
                        WHEN (ISNULL(PoCreatedQty,0) - @OldOrderedQty + @OrderedQty) >= BomRequestedQty         THEN 'PORaised'
                        WHEN (ISNULL(PoCreatedQty,0) - @OldOrderedQty + @OrderedQty)  > 0                       THEN 'POPartial'
                        WHEN PrCreatedQty >= BomRequestedQty                                                     THEN 'PRRaised'
                        WHEN PrCreatedQty  > 0                                                                   THEN 'PRPartial'
                        ELSE 'Pending'
                    END
                WHERE BomId = @BomDetailId_U;
        END

        SELECT CAST(@PoLineId AS NVARCHAR(20));
    END

    -- Recompute header TotalAmount from the actual lines every time a line
    -- is saved: line subtotal, less header Discount%, plus each line's own
    -- TaxPct-based tax, plus the header's manually-entered TaxAmount. The
    -- header TaxAmount is READ here but never written — it's a value the
    -- user types directly on the PO Overview tab and must never be
    -- silently overwritten (a previous version of this recompute wrongly
    -- replaced it with the line-based tax total on every save).
    DECLARE @LinesSubtotal DECIMAL(18,4) = (
        SELECT ISNULL(SUM(OrderedQty * UnitPrice), 0)
        FROM PROJ.TBL_PURCHASE_ORDER_LINE WHERE PoId = @PoId AND IsActive = 1
    );
    DECLARE @LinesTax DECIMAL(18,4) = (
        SELECT ISNULL(SUM(OrderedQty * UnitPrice * TaxPct / 100.0), 0)
        FROM PROJ.TBL_PURCHASE_ORDER_LINE WHERE PoId = @PoId AND IsActive = 1
    );
    DECLARE @HeaderDiscountPct DECIMAL(18,4) = (
        SELECT ISNULL(Discount, 0) FROM PROJ.TBL_PURCHASE_ORDER WHERE PoId = @PoId
    );
    DECLARE @HeaderTaxAmount DECIMAL(18,4) = (
        SELECT ISNULL(TaxAmount, 0) FROM PROJ.TBL_PURCHASE_ORDER WHERE PoId = @PoId
    );

    UPDATE PROJ.TBL_PURCHASE_ORDER
    SET TotalAmount = @LinesSubtotal - (@LinesSubtotal * @HeaderDiscountPct / 100.0) + @LinesTax + @HeaderTaxAmount
    WHERE PoId = @PoId;
END
GO

-- â”€â”€ BUG 2 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE OR ALTER PROCEDURE PROJ.sp_SubmitForApproval
    @ModuleCode      NVARCHAR(20),
    @DocumentId      INT,
    @DocumentNo      NVARCHAR(50),
    @DocumentAmount  DECIMAL(18,4) = NULL,
    @CurrencyId      INT           = NULL,
    @SubmittedBy     NVARCHAR(50),
    @OverrideBudget  BIT           = 0,
    @OverrideReason  NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        BEGIN TRANSACTION;
        DECLARE @ModuleId INT, @IsAmountBased BIT, @DocumentTable NVARCHAR(100),
                @DocumentIdCol NVARCHAR(50), @StatusColumn NVARCHAR(50),
                @ModifiedByCol NVARCHAR(50), @ModifiedDateCol NVARCHAR(50),
                @ApprovedStatus NVARCHAR(30), @PostApprovalSP NVARCHAR(200);
        DECLARE @OvTag NVARCHAR(560) =
            CASE WHEN @OverrideBudget = 1
                 THEN ' [BUDGET OVERRIDE' + ISNULL(': ' + NULLIF(LTRIM(RTRIM(@OverrideReason)), ''), '') + ']'
                 ELSE '' END;
        SELECT @ModuleId = ModuleId, @IsAmountBased = IsAmountBased,
               @DocumentTable = DocumentTable, @DocumentIdCol = DocumentIdColumn,
               @StatusColumn    = ISNULL(StatusColumn,        'Status'),
               @ModifiedByCol   = ISNULL(ModifiedByColumn,    'ModifiedBy'),
               @ModifiedDateCol = ISNULL(ModifiedDateColumn,  'ModifiedDate'),
               @ApprovedStatus  = ISNULL(ApprovedStatus,      'Approved'),
               @PostApprovalSP  = PostApprovalSP
        FROM PROJ.TBL_APPROVAL_MODULE WHERE ModuleCode = @ModuleCode AND IsActive = 1;
        IF @ModuleId IS NULL
        BEGIN
            SELECT -1 AS TransactionId, NULL AS PolicyId, 0 AS TotalLevels, NULL AS NewStatus, 'Approval module not configured.' AS Message;
            ROLLBACK; RETURN;
        END
        IF EXISTS (SELECT 1 FROM PROJ.TBL_APPROVAL_TRANSACTION
            WHERE ModuleId = @ModuleId AND DocumentId = @DocumentId
              AND CurrentStatus NOT IN ('Approved','Rejected','Cancelled','SentBack'))
        BEGIN
            SELECT -1 AS TransactionId, NULL AS PolicyId, 0 AS TotalLevels, NULL AS NewStatus,
                   'An active approval transaction already exists for this document.' AS Message;
            ROLLBACK; RETURN;
        END
        -- PO Budget guard â€” BASE currency (mirrors sp_GetPOBudgetCheck)
        IF @ModuleCode = 'PO'
        BEGIN
            DECLARE @PoJobId NVARCHAR(50), @PoCategoryId INT, @PoExchangeRate DECIMAL(18,6), @PoTotalBase DECIMAL(18,2);
            SELECT @PoJobId = JobId, @PoCategoryId = ExpenseCategoryId, @PoExchangeRate = ISNULL(ExchangeRate, 1)
            FROM PROJ.TBL_PURCHASE_ORDER WHERE PoId = @DocumentId AND IsActive = 1;
            -- Pre-tax base value of THIS PO's own lines (excludes GST/tax) â€” mirrors sp_GetPOBudgetCheck / @SubCommitted below.
            -- (Previously used TotalAmount, which is tax-inclusive, causing GST to be wrongly counted against budget.)
            SELECT @PoTotalBase = ISNULL(SUM(PROJ.fn_ToBase(pol.OrderedQty * pol.UnitPrice, @PoExchangeRate)), 0)
            FROM PROJ.TBL_PURCHASE_ORDER_LINE pol WHERE pol.PoId = @DocumentId AND pol.IsActive = 1;
            IF @PoJobId IS NOT NULL AND @PoCategoryId IS NOT NULL
            BEGIN
                DECLARE @JobRate DECIMAL(18,6) = ISNULL((SELECT JobExcRate FROM PROJ.TBL_JOB WHERE JobId = @PoJobId), 1);
                DECLARE @SubBudgeted DECIMAL(18,2) = 0, @SubBudgetExists BIT = 0;
                -- 2026-09-27: the budget is the JOB total, not one category (matches the print check).
                -- 2026-10-08: and it is the latest APPROVED revision - a revision still awaiting approval is not a budget.
                SELECT @SubBudgetExists = CASE WHEN EXISTS (SELECT 1 FROM PROJ.TBL_JOB_BUDGET
                        WHERE JobId = @PoJobId AND IsApproved = 1 AND RvNo = (SELECT MAX(b2.RvNo) FROM PROJ.TBL_JOB_BUDGET b2 WHERE b2.JobId = @PoJobId AND b2.IsApproved = 1)) THEN 1 ELSE 0 END;
                SELECT
                       @SubBudgeted = ISNULL(SUM(ISNULL(AmountInBaseCurrency, PROJ.fn_ToBase(ISNULL(BudgetedAmount, 0), ISNULL(ExchangeRate, @JobRate)))), 0)
                FROM PROJ.TBL_JOB_BUDGET WHERE JobId = @PoJobId AND IsApproved = 1 AND RvNo = (SELECT MAX(b2.RvNo) FROM PROJ.TBL_JOB_BUDGET b2 WHERE b2.JobId = @PoJobId AND b2.IsApproved = 1);
                IF @SubBudgetExists = 0
                BEGIN
                    SELECT -1 AS TransactionId, NULL AS PolicyId, 0 AS TotalLevels, NULL AS NewStatus,
                           'Cannot submit: no approved budget line exists for the selected expense category on this job. Create a budget line first.' AS Message;
                    ROLLBACK; RETURN;
                END
                DECLARE @SubCommitted DECIMAL(18,2) = 0;
                SELECT @SubCommitted = ISNULL(SUM(PROJ.fn_ToBase(pol.OrderedQty * pol.UnitPrice, po.ExchangeRate)), 0)
                FROM PROJ.TBL_PURCHASE_ORDER po
                JOIN PROJ.TBL_PURCHASE_ORDER_LINE pol ON pol.PoId = po.PoId AND pol.IsActive = 1
                WHERE po.JobId = @PoJobId
                  AND po.Status NOT IN ('Draft','Cancelled') AND po.IsActive = 1 AND po.PoId != @DocumentId;
                DECLARE @SubTolPct DECIMAL(18,4) = ISNULL(TRY_CAST((SELECT SettingValue FROM PROJ.TBL_APP_SETTINGS
                    WHERE SettingKey = N'Biz.PoBudget.TolerancePct') AS DECIMAL(18,4)), 0);
                DECLARE @SubAllowed DECIMAL(18,2) = @SubBudgeted * (1 + @SubTolPct / 100.0);
                IF (@SubCommitted + @PoTotalBase) > @SubAllowed AND @OverrideBudget = 0
                BEGIN
                    DECLARE @SubBudMsg NVARCHAR(600) = 'Cannot submit: PO would exceed the TOTAL budget for this job (base currency, excluding GST). '
                        + 'Budgeted: ' + FORMAT(@SubBudgeted,'N2') + ' | Already committed: ' + FORMAT(@SubCommitted,'N2')
                        + ' | This PO: ' + FORMAT(@PoTotalBase,'N2') + ' | Over by: ' + FORMAT(@SubCommitted+@PoTotalBase-@SubAllowed,'N2') + CASE WHEN @SubTolPct > 0 THEN ' | Tolerance: ' + FORMAT(@SubTolPct,'N2') + '%' ELSE '' END;
                    SELECT -1 AS TransactionId, NULL AS PolicyId, 0 AS TotalLevels, NULL AS NewStatus, @SubBudMsg AS Message;
                    ROLLBACK; RETURN;
                END
            END
        END
        IF @DocumentAmount IS NULL AND @IsAmountBased = 1
        BEGIN
            DECLARE @AmountSql NVARCHAR(500) = N'SELECT @Amt = TotalAmount FROM PROJ.' + QUOTENAME(@DocumentTable) + N' WHERE ' + QUOTENAME(@DocumentIdCol) + N' = @DocId';
            EXEC sp_executesql @AmountSql, N'@Amt DECIMAL(18,4) OUTPUT, @DocId INT', @DocumentAmount OUTPUT, @DocumentId;
        END
        -- @EffectiveAmt is the DOCUMENT's own currency amount â€” unchanged, this is what
        -- gets stored on the transaction and shown on every approval screen (My
        -- Approvals, Approvals Admin, Dashboard, the notification bell), none of which
        -- label a currency, so none of those must change.
        DECLARE @PolicyId INT, @TotalLevels INT, @EffectiveAmt DECIMAL(18,4) = ISNULL(@DocumentAmount, 0);

        -- Policy AmountFrom/AmountTo are configured in BASE currency (policy names say
        -- so directly: "PO Above 0-Base"; "Invoice Below/Above 25,000" are round INR
        -- figures). Match against a base-currency amount instead, using the document's
        -- OWN locked-in ExchangeRate when its table has one (INV, PO do; JOB â€” the third
        -- amount-based module â€” has no ExchangeRate/CurrencyId column at all and is
        -- single-currency by design, so it is correctly untouched by this).
        DECLARE @PolicyMatchAmt DECIMAL(18,4) = @EffectiveAmt;
        IF @IsAmountBased = 1 AND COL_LENGTH('PROJ.' + @DocumentTable, 'ExchangeRate') IS NOT NULL
        BEGIN
            DECLARE @DocExRate DECIMAL(18,6) = 1;
            DECLARE @ExRateSql NVARCHAR(500) = N'SELECT @Rate = ISNULL(ExchangeRate,1) FROM PROJ.' + QUOTENAME(@DocumentTable) + N' WHERE ' + QUOTENAME(@DocumentIdCol) + N' = @DocId';
            EXEC sp_executesql @ExRateSql, N'@Rate DECIMAL(18,6) OUTPUT, @DocId INT', @DocExRate OUTPUT, @DocumentId;
            SET @PolicyMatchAmt = PROJ.fn_ToBase(@EffectiveAmt, @DocExRate);
        END

        -- 2026-10-08: a policy may be scoped to one job type (TBL_APPROVAL_POLICY.JobTypeId). For a PO the
        -- job's type is looked up; a scoped policy that matches wins over the generic (JobTypeId NULL) one.
        DECLARE @PolicyJobType NVARCHAR(100) = NULL;
        IF @ModuleCode = 'PO'
            SELECT @PolicyJobType = j.JobTypeId
            FROM PROJ.TBL_PURCHASE_ORDER po JOIN PROJ.TBL_JOB j ON j.JobId = po.JobId
            WHERE po.PoId = @DocumentId;

        IF @IsAmountBased = 1
            SELECT TOP 1 @PolicyId = PolicyId,
                   @TotalLevels = (SELECT COUNT(DISTINCT al.LevelNo) FROM PROJ.TBL_APPROVAL_LEVEL al WHERE al.PolicyId = PROJ.TBL_APPROVAL_POLICY.PolicyId AND al.IsActive = 1)
            FROM PROJ.TBL_APPROVAL_POLICY WHERE ModuleId = @ModuleId AND IsActive = 1
              AND (AmountFrom IS NULL OR @PolicyMatchAmt >= AmountFrom) AND (AmountTo IS NULL OR @PolicyMatchAmt <= AmountTo)
              AND (JobTypeId IS NULL OR JobTypeId = @PolicyJobType)
            ORDER BY CASE WHEN JobTypeId IS NULL THEN 1 ELSE 0 END, SortOrder, AmountFrom;
        ELSE
            SELECT TOP 1 @PolicyId = PolicyId,
                   @TotalLevels = (SELECT COUNT(DISTINCT al.LevelNo) FROM PROJ.TBL_APPROVAL_LEVEL al WHERE al.PolicyId = PROJ.TBL_APPROVAL_POLICY.PolicyId AND al.IsActive = 1)
            FROM PROJ.TBL_APPROVAL_POLICY WHERE ModuleId = @ModuleId AND IsActive = 1
              AND (JobTypeId IS NULL OR JobTypeId = @PolicyJobType)
            ORDER BY CASE WHEN JobTypeId IS NULL THEN 1 ELSE 0 END, SortOrder;
        IF @PolicyId IS NULL
        BEGIN
            SELECT -1 AS TransactionId, NULL AS PolicyId, 0 AS TotalLevels, NULL AS NewStatus,
                   CASE WHEN @IsAmountBased = 1 THEN 'No approval policy covers amount ' + CAST(ISNULL(@PolicyMatchAmt,0) AS NVARCHAR) + ' (base currency). Please configure a matching policy.'
                        ELSE 'No active approval policy found for this module.' END AS Message;
            ROLLBACK; RETURN;
        END
        IF NOT EXISTS (SELECT 1 FROM PROJ.TBL_APPROVAL_LEVEL WHERE PolicyId = @PolicyId AND IsActive = 1)
        BEGIN
            SELECT -1 AS TransactionId, NULL AS PolicyId, 0 AS TotalLevels, NULL AS NewStatus, 'Approval policy has no active levels configured.' AS Message;
            ROLLBACK; RETURN;
        END
        DECLARE @SubmittedByUserId INT;
        SELECT @SubmittedByUserId = UserId FROM PROJ.TBL_USERS WHERE UserName = @SubmittedBy;
        DECLARE @Level1Id INT, @Level1PendingStatus NVARCHAR(50);
        SELECT TOP 1 @Level1Id = LevelId, @Level1PendingStatus = ISNULL(PendingStatus, 'PendingApproval')
        FROM PROJ.TBL_APPROVAL_LEVEL WHERE PolicyId = @PolicyId AND LevelNo = 1 AND IsActive = 1 ORDER BY LevelId;
        DECLARE @TransactionId INT, @Now DATETIME = GETDATE();
        SELECT @TransactionId = TransactionId FROM PROJ.TBL_APPROVAL_TRANSACTION WHERE ModuleId = @ModuleId AND DocumentId = @DocumentId;
        IF @TransactionId IS NOT NULL
            UPDATE PROJ.TBL_APPROVAL_TRANSACTION
            SET PolicyId = @PolicyId, DocumentAmount = @EffectiveAmt, CurrencyId = @CurrencyId,
                CurrentStatus = 'Pending', CurrentLevelNo = 1, TotalLevels = @TotalLevels,
                SubmittedBy = @SubmittedBy, SubmittedDate = @Now,
                CompletedDate = NULL, FinalAction = NULL, FinalActionBy = NULL, FinalRemarks = NULL,
                ModifiedBy = @SubmittedBy, ModifiedDate = @Now
            WHERE TransactionId = @TransactionId;
        ELSE
        BEGIN
            INSERT INTO PROJ.TBL_APPROVAL_TRANSACTION
                (ModuleId, DocumentNo, DocumentId, DocumentAmount, CurrencyId, PolicyId, CurrentStatus, CurrentLevelNo, TotalLevels, SubmittedBy, SubmittedDate, CreatedBy, CreatedDate)
            VALUES (@ModuleId, @DocumentNo, @DocumentId, @EffectiveAmt, @CurrencyId, @PolicyId, 'Pending', 1, @TotalLevels, @SubmittedBy, @Now, @SubmittedBy, @Now);
            SET @TransactionId = SCOPE_IDENTITY();
        END
        INSERT INTO PROJ.TBL_APPROVAL_LOG (TransactionId, LevelId, LevelNo, Action, ActionBy, ActionByName, ActionDate, Remarks, IsDelegated, IsTimedOut)
        VALUES (@TransactionId, ISNULL(@Level1Id, 0), 0, 'Submitted', ISNULL(@SubmittedByUserId, 0), @SubmittedBy, @Now, NULL, 0, 0);
        DECLARE @SubmitterMaxLevel INT = NULL;
        SELECT @SubmitterMaxLevel = MAX(al.LevelNo) FROM PROJ.TBL_APPROVAL_LEVEL al
        WHERE al.PolicyId = @PolicyId AND al.IsActive = 1
           AND (al.ApproverType = 'ANY'
             OR (al.ApproverType = 'Role' AND EXISTS (SELECT 1 FROM PROJ.TBL_USER_ROLES ur WHERE ur.UserId = @SubmittedByUserId AND ur.RoleId = al.ApproverId))
             OR (al.ApproverType = 'User' AND al.ApproverId = @SubmittedByUserId));
        DECLARE @CurrentLevelNo INT = 1, @IsComplete BIT = 0, @FinalStatus NVARCHAR(50) = @Level1PendingStatus;
        WHILE @CurrentLevelNo <= @TotalLevels AND @IsComplete = 0
        BEGIN
            DECLARE @LvlId INT, @LvlAllowSelf BIT, @LvlPendingStatus NVARCHAR(50);
            SELECT @LvlAllowSelf = CASE WHEN (SELECT MAX(CAST(al2.AllowSelfApproval AS INT))
                            FROM PROJ.TBL_APPROVAL_LEVEL al2
                            WHERE al2.PolicyId = @PolicyId
                              AND al2.LevelNo  = @CurrentLevelNo
                              AND al2.IsActive = 1
                              AND (al2.ApproverType = 'ANY'
                                OR (al2.ApproverType = 'Role' AND EXISTS (
                                        SELECT 1 FROM PROJ.TBL_USER_ROLES ur2
                                        WHERE ur2.UserId = @SubmittedByUserId
                                          AND ur2.RoleId = al2.ApproverId))
                                OR (al2.ApproverType = 'User'
                                        AND al2.ApproverId = @SubmittedByUserId))) = 1 THEN 1 ELSE 0 END,
                   @LvlPendingStatus = ISNULL(MAX(PendingStatus), 'PendingApproval')
            FROM PROJ.TBL_APPROVAL_LEVEL WHERE PolicyId = @PolicyId AND LevelNo = @CurrentLevelNo AND IsActive = 1;
            DECLARE @SubmitterIsApprover BIT = CASE WHEN EXISTS (
                    SELECT 1 FROM PROJ.TBL_APPROVAL_LEVEL al WHERE al.PolicyId = @PolicyId AND al.LevelNo = @CurrentLevelNo AND al.IsActive = 1
                      AND (al.ApproverType = 'ANY'
                         OR (al.ApproverType = 'Role' AND EXISTS (SELECT 1 FROM PROJ.TBL_USER_ROLES ur WHERE ur.UserId = @SubmittedByUserId AND ur.RoleId = al.ApproverId))
                         OR (al.ApproverType = 'User' AND al.ApproverId = @SubmittedByUserId))) THEN 1 ELSE 0 END;
            SELECT TOP 1 @LvlId = LevelId FROM PROJ.TBL_APPROVAL_LEVEL WHERE PolicyId = @PolicyId AND LevelNo = @CurrentLevelNo AND IsActive = 1 ORDER BY LevelId;
            IF @SubmitterIsApprover = 1 AND @LvlAllowSelf = 1
                INSERT INTO PROJ.TBL_APPROVAL_LOG (TransactionId, LevelId, LevelNo, Action, ActionBy, ActionByName, ActionDate, Remarks, IsDelegated, IsTimedOut)
                VALUES (@TransactionId, @LvlId, @CurrentLevelNo, 'Approved', ISNULL(@SubmittedByUserId, 0), @SubmittedBy, @Now, 'Auto-approved (submitter is approver)' + @OvTag, 0, 0);
            ELSE IF @SubmitterMaxLevel IS NOT NULL AND @CurrentLevelNo < @SubmitterMaxLevel
                 AND NOT EXISTS (SELECT 1 FROM PROJ.TBL_APPROVAL_LEVEL nb WHERE nb.PolicyId = @PolicyId AND nb.LevelNo = @CurrentLevelNo AND nb.IsActive = 1 AND nb.NoSkip = 1)   -- 2026-10-08: NoSkip level is never auto-skipped
                INSERT INTO PROJ.TBL_APPROVAL_LOG (TransactionId, LevelId, LevelNo, Action, ActionBy, ActionByName, ActionDate, Remarks, IsDelegated, IsTimedOut)
                VALUES (@TransactionId, @LvlId, @CurrentLevelNo, 'Approved', ISNULL(@SubmittedByUserId, 0), @SubmittedBy, @Now, 'Auto-approved by senior approver (submitter)' + @OvTag, 0, 0);
            ELSE
            BEGIN SET @FinalStatus = @LvlPendingStatus; BREAK; END
            IF @CurrentLevelNo >= @TotalLevels
            BEGIN
                SET @IsComplete = 1; SET @FinalStatus = @ApprovedStatus;
                UPDATE PROJ.TBL_APPROVAL_TRANSACTION
                SET CurrentStatus = 'Approved', CurrentLevelNo = @CurrentLevelNo, FinalAction = 'Approved', FinalActionBy = @SubmittedBy,
                    FinalRemarks = 'Auto-approved (submitter cleared all levels)' + @OvTag, CompletedDate = @Now, ModifiedBy = @SubmittedBy, ModifiedDate = @Now
                WHERE TransactionId = @TransactionId;
            END
            ELSE
            BEGIN
                SET @CurrentLevelNo = @CurrentLevelNo + 1;
                SELECT TOP 1 @FinalStatus = ISNULL(PendingStatus, 'PendingApproval') FROM PROJ.TBL_APPROVAL_LEVEL WHERE PolicyId = @PolicyId AND LevelNo = @CurrentLevelNo AND IsActive = 1 ORDER BY LevelId;
                IF @FinalStatus IS NULL SET @FinalStatus = 'PendingApproval';
                UPDATE PROJ.TBL_APPROVAL_TRANSACTION SET CurrentLevelNo = @CurrentLevelNo, ModifiedBy = @SubmittedBy, ModifiedDate = @Now WHERE TransactionId = @TransactionId;
            END
        END
        DECLARE @Sql NVARCHAR(1000) = N'UPDATE PROJ.' + QUOTENAME(@DocumentTable) + N' SET ' + QUOTENAME(@StatusColumn) + N' = @NewSt' + N', ' + QUOTENAME(@ModifiedByCol) + N' = @Who' + N', ' + QUOTENAME(@ModifiedDateCol) + N' = @When' + N' WHERE ' + QUOTENAME(@DocumentIdCol) + N' = @DocId';
        EXEC sp_executesql @Sql, N'@NewSt NVARCHAR(50), @Who NVARCHAR(100), @When DATETIME, @DocId INT', @FinalStatus, @SubmittedBy, @Now, @DocumentId;
        IF @IsComplete = 1 AND @PostApprovalSP IS NOT NULL
        BEGIN
            DECLARE @HookSql NVARCHAR(500);
            IF @OverrideBudget = 1 AND @ModuleCode = 'MH' SET @HookSql = N'EXEC ' + @PostApprovalSP + N' @DocId, @By, @OverrideBudget = 1';
            ELSE SET @HookSql = N'EXEC ' + @PostApprovalSP + N' @DocId, @By';
            EXEC sp_executesql @HookSql, N'@DocId INT, @By NVARCHAR(100)', @DocumentId, @SubmittedBy;
        END
        COMMIT TRANSACTION;
        SELECT @TransactionId AS TransactionId, @PolicyId AS PolicyId, @TotalLevels AS TotalLevels, @FinalStatus AS NewStatus,
               CASE WHEN @IsComplete = 1 THEN 'Auto-approved â€” submitter cleared all levels.' ELSE 'Submitted successfully.' END AS Message;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        SELECT -1 AS TransactionId, NULL AS PolicyId, 0 AS TotalLevels, NULL AS NewStatus, ERROR_MESSAGE() AS Message;
    END CATCH
END;
GO

CREATE OR ALTER PROCEDURE PROJ.sp_ProcessApproval
    @TransactionId INT,
    @Action        NVARCHAR(20),
    @ActionBy      INT,
    @ActionByName  NVARCHAR(100),
    @Remarks       NVARCHAR(500) = NULL,
    @OverrideBudget BIT          = 0
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        BEGIN TRANSACTION;
        IF @Action NOT IN ('Approve','Reject','SendBack','Cancel')
        BEGIN
            SELECT @TransactionId AS TransactionId, NULL AS NewStatus, 0 AS IsComplete, 'Invalid action.' AS Message, NULL AS ModuleCode, NULL AS DocumentId;
            ROLLBACK; RETURN;
        END
        DECLARE @LogAction NVARCHAR(20) = CASE @Action WHEN 'Approve' THEN 'Approved' WHEN 'Reject' THEN 'Rejected' WHEN 'SendBack' THEN 'Returned' WHEN 'Cancel' THEN 'Cancelled' END;
        DECLARE @ModuleId INT, @ModuleCode NVARCHAR(20), @DocumentId INT, @PostApprovalSP NVARCHAR(200), @PolicyId INT,
                @CurrentStatus NVARCHAR(20), @CurrentLevelNo INT, @TotalLevels INT, @SubmittedBy NVARCHAR(100), @DocumentTable NVARCHAR(100),
                @DocumentIdCol NVARCHAR(50), @StatusColumn NVARCHAR(50), @ModifiedByCol NVARCHAR(50), @ModifiedDateCol NVARCHAR(50),
                @ApprovedStatus NVARCHAR(30), @RejectedStatus NVARCHAR(30), @CancelledStatus NVARCHAR(30);
        SELECT @ModuleId = t.ModuleId, @ModuleCode = m.ModuleCode, @DocumentId = t.DocumentId, @PostApprovalSP = m.PostApprovalSP,
               @PolicyId = t.PolicyId, @CurrentStatus = t.CurrentStatus, @CurrentLevelNo = t.CurrentLevelNo, @TotalLevels = t.TotalLevels,
               @SubmittedBy = t.SubmittedBy, @DocumentTable = m.DocumentTable, @DocumentIdCol = m.DocumentIdColumn,
               @StatusColumn = ISNULL(m.StatusColumn,'Status'), @ModifiedByCol = ISNULL(m.ModifiedByColumn,'ModifiedBy'),
               @ModifiedDateCol = ISNULL(m.ModifiedDateColumn,'ModifiedDate'), @ApprovedStatus = ISNULL(m.ApprovedStatus,'Approved'),
               @RejectedStatus = ISNULL(m.RejectedStatus,'Rejected'), @CancelledStatus = ISNULL(m.CancelledStatus,'Draft')
        FROM PROJ.TBL_APPROVAL_TRANSACTION t JOIN PROJ.TBL_APPROVAL_MODULE m ON m.ModuleId = t.ModuleId WHERE t.TransactionId = @TransactionId;
        IF @ModuleId IS NULL
        BEGIN
            SELECT @TransactionId AS TransactionId, NULL AS NewStatus, 0 AS IsComplete, 'Transaction not found.' AS Message, NULL AS ModuleCode, NULL AS DocumentId;
            ROLLBACK; RETURN;
        END
        IF @CurrentStatus IN ('Approved','Rejected','Cancelled','SentBack')
        BEGIN
            SELECT @TransactionId AS TransactionId, @CurrentStatus AS NewStatus, 1 AS IsComplete, 'Transaction is already complete.' AS Message, @ModuleCode AS ModuleCode, @DocumentId AS DocumentId;
            ROLLBACK; RETURN;
        END
        DECLARE @CurrentLevelId INT = NULL, @AllowSelfApproval BIT = 0;
        SELECT TOP 1 @CurrentLevelId = al.LevelId, @AllowSelfApproval = al.AllowSelfApproval
        FROM PROJ.TBL_APPROVAL_LEVEL al WHERE al.PolicyId = @PolicyId AND al.LevelNo = @CurrentLevelNo AND al.IsActive = 1
          AND (al.ApproverType = 'ANY' OR (al.ApproverType = 'Role' AND EXISTS (SELECT 1 FROM PROJ.TBL_USER_ROLES ur WHERE ur.UserId = @ActionBy AND ur.RoleId = al.ApproverId)) OR (al.ApproverType = 'User' AND al.ApproverId = @ActionBy))
        ORDER BY al.LevelId;
        IF @CurrentLevelId IS NULL
            SELECT TOP 1 @CurrentLevelId = al.LevelId, @AllowSelfApproval = al.AllowSelfApproval
            FROM PROJ.TBL_APPROVAL_LEVEL al WHERE al.PolicyId = @PolicyId AND al.LevelNo = @CurrentLevelNo AND al.IsActive = 1 ORDER BY al.LevelId;
        DECLARE @UserCanAct BIT = 0;
        IF @Action = 'Cancel' AND @ActionByName = @SubmittedBy SET @UserCanAct = 1;
        IF @UserCanAct = 0 AND EXISTS (SELECT 1 FROM PROJ.TBL_APPROVAL_LEVEL al WHERE al.PolicyId = @PolicyId AND al.LevelNo = @CurrentLevelNo AND al.IsActive = 1
              AND (al.ApproverType = 'ANY' OR (al.ApproverType = 'Role' AND EXISTS (SELECT 1 FROM PROJ.TBL_USER_ROLES ur WHERE ur.UserId = @ActionBy AND ur.RoleId = al.ApproverId)) OR (al.ApproverType = 'User' AND al.ApproverId = @ActionBy)))
            SET @UserCanAct = 1;
        IF @UserCanAct = 0 AND @Action <> 'Cancel'
            IF EXISTS (SELECT 1 FROM PROJ.TBL_APPROVAL_DELEGATE ad JOIN PROJ.TBL_APPROVAL_LEVEL al ON al.LevelId = ad.LevelId
                WHERE al.PolicyId = @PolicyId AND al.LevelNo = @CurrentLevelNo AND al.IsActive = 1 AND ad.DelegateUserId = @ActionBy AND ad.IsActive = 1 AND CAST(GETDATE() AS date) BETWEEN ad.FromDate AND ad.ToDate)
                SET @UserCanAct = 1;
        DECLARE @UserMaxLevel INT = NULL;
        IF @Action = 'Approve'
        BEGIN
            SELECT @UserMaxLevel = MAX(al.LevelNo) FROM PROJ.TBL_APPROVAL_LEVEL al WHERE al.PolicyId = @PolicyId AND al.IsActive = 1 AND al.LevelNo >= @CurrentLevelNo
               AND ((al.ApproverType = 'Role' AND EXISTS (SELECT 1 FROM PROJ.TBL_USER_ROLES ur WHERE ur.UserId = @ActionBy AND ur.RoleId = al.ApproverId)) OR (al.ApproverType = 'User' AND al.ApproverId = @ActionBy) OR al.ApproverType = 'ANY');
            -- 2026-10-08: a NoSkip level between here and the user's own level cannot be jumped over by a senior
            -- approver unless the user is an approver of that level too. No jump -> the user can only act where
            -- they hold the role for the CURRENT level (otherwise they are refused below).
            IF @UserMaxLevel IS NOT NULL AND @UserMaxLevel > @CurrentLevelNo
               AND EXISTS (SELECT 1 FROM PROJ.TBL_APPROVAL_LEVEL nb
                           WHERE nb.PolicyId = @PolicyId AND nb.IsActive = 1 AND nb.NoSkip = 1
                             AND nb.LevelNo >= @CurrentLevelNo AND nb.LevelNo < @UserMaxLevel
                             AND NOT EXISTS (SELECT 1 FROM PROJ.TBL_APPROVAL_LEVEL nm
                                             WHERE nm.PolicyId = @PolicyId AND nm.LevelNo = nb.LevelNo AND nm.IsActive = 1
                                               AND (nm.ApproverType = 'ANY'
                                                 OR (nm.ApproverType = 'Role' AND EXISTS (SELECT 1 FROM PROJ.TBL_USER_ROLES ur WHERE ur.UserId = @ActionBy AND ur.RoleId = nm.ApproverId))
                                                 OR (nm.ApproverType = 'User' AND nm.ApproverId = @ActionBy))))
                SET @UserMaxLevel = NULL;
            IF @UserMaxLevel IS NOT NULL AND @UserMaxLevel > @CurrentLevelNo SET @UserCanAct = 1;
        END
        IF @UserCanAct = 1 AND @AllowSelfApproval = 0 AND @ActionByName = @SubmittedBy AND @Action IN ('Approve','Reject')
        BEGIN
            SELECT @TransactionId AS TransactionId, NULL AS NewStatus, 0 AS IsComplete, 'Self-approval is not permitted for this level.' AS Message, NULL AS ModuleCode, NULL AS DocumentId;
            ROLLBACK; RETURN;
        END
        IF @UserCanAct = 0
        BEGIN
            SELECT @TransactionId AS TransactionId, NULL AS NewStatus, 0 AS IsComplete, 'You do not have the required role to perform this action at level ' + CAST(@CurrentLevelNo AS NVARCHAR) + '.' AS Message, NULL AS ModuleCode, NULL AS DocumentId;
            ROLLBACK; RETURN;
        END
        -- PO budget guard — BASE currency (mirrors sp_GetPOBudgetCheck); bypassable via @OverrideBudget
        IF @Action = 'Approve' AND @ModuleCode = 'PO'
        BEGIN
            DECLARE @ApJobId NVARCHAR(50), @ApCategoryId INT, @ApPoTotalBase DECIMAL(18,2), @ApExchangeRate DECIMAL(18,6);
            SELECT @ApJobId = JobId, @ApCategoryId = ExpenseCategoryId, @ApExchangeRate = ISNULL(ExchangeRate, 1)
            FROM PROJ.TBL_PURCHASE_ORDER WHERE PoId = @DocumentId AND IsActive = 1;
            -- Pre-tax base value of THIS PO's own lines (excludes GST/tax) — mirrors
            -- sp_GetPOBudgetCheck / @ApCommitted below. Previously used TotalAmount,
            -- which is tax-inclusive, wrongly counting GST against the budget.
            SELECT @ApPoTotalBase = ISNULL(SUM(PROJ.fn_ToBase(pol.OrderedQty * pol.UnitPrice, @ApExchangeRate)), 0)
            FROM PROJ.TBL_PURCHASE_ORDER_LINE pol WHERE pol.PoId = @DocumentId AND pol.IsActive = 1;
            IF @ApJobId IS NOT NULL AND @ApCategoryId IS NOT NULL
            BEGIN
                DECLARE @ApJobRate DECIMAL(18,6) = ISNULL((SELECT JobExcRate FROM PROJ.TBL_JOB WHERE JobId = @ApJobId), 1);
                DECLARE @ApBudgeted DECIMAL(18,2) = 0, @ApBudgetExists BIT = 0;
                -- 2026-09-27: the budget is the JOB total, not one category (matches the print check).
                -- 2026-10-08: and it is the latest APPROVED revision - a revision still awaiting approval is not a budget.
                -- 'no approved budget' below is never bypassed by @OverrideBudget.
                SELECT @ApBudgetExists = CASE WHEN EXISTS (SELECT 1 FROM PROJ.TBL_JOB_BUDGET
                        WHERE JobId = @ApJobId AND IsApproved = 1 AND RvNo = (SELECT MAX(b2.RvNo) FROM PROJ.TBL_JOB_BUDGET b2 WHERE b2.JobId = @ApJobId AND b2.IsApproved = 1)) THEN 1 ELSE 0 END;
                SELECT @ApBudgeted = ISNULL(SUM(ISNULL(AmountInBaseCurrency, PROJ.fn_ToBase(ISNULL(BudgetedAmount, 0), ISNULL(ExchangeRate, @ApJobRate)))), 0)
                FROM PROJ.TBL_JOB_BUDGET WHERE JobId = @ApJobId AND IsApproved = 1 AND RvNo = (SELECT MAX(b2.RvNo) FROM PROJ.TBL_JOB_BUDGET b2 WHERE b2.JobId = @ApJobId AND b2.IsApproved = 1);
                IF @ApBudgetExists = 0
                BEGIN
                    SELECT @TransactionId AS TransactionId, NULL AS NewStatus, 0 AS IsComplete,
                           'Cannot approve: this job has no approved budget. Add a budget line first.' AS Message, @ModuleCode AS ModuleCode, @DocumentId AS DocumentId;
                    ROLLBACK; RETURN;
                END
                DECLARE @ApCommitted DECIMAL(18,2) = 0;
                SELECT @ApCommitted = ISNULL(SUM(PROJ.fn_ToBase(pol.OrderedQty * pol.UnitPrice, po.ExchangeRate)), 0)
                FROM PROJ.TBL_PURCHASE_ORDER po JOIN PROJ.TBL_PURCHASE_ORDER_LINE pol ON pol.PoId = po.PoId AND pol.IsActive = 1
                WHERE po.JobId = @ApJobId AND po.Status NOT IN ('Draft','Cancelled') AND po.IsActive = 1 AND po.PoId != @DocumentId;
                DECLARE @ApTolPct DECIMAL(18,4) = ISNULL(TRY_CAST((SELECT SettingValue FROM PROJ.TBL_APP_SETTINGS
                    WHERE SettingKey = N'Biz.PoBudget.TolerancePct') AS DECIMAL(18,4)), 0);
                DECLARE @ApAllowed DECIMAL(18,2) = @ApBudgeted * (1 + @ApTolPct / 100.0);
                IF (@ApCommitted + @ApPoTotalBase) > @ApAllowed AND @OverrideBudget = 0
                BEGIN
                    DECLARE @ApBudMsg NVARCHAR(600) = 'Cannot approve: PO would exceed the TOTAL budget for this job (base currency, excluding GST). '
                        + 'Budgeted: ' + FORMAT(@ApBudgeted,'N2') + ' | Already committed: ' + FORMAT(@ApCommitted,'N2')
                        + ' | This PO: ' + FORMAT(@ApPoTotalBase,'N2') + ' | Over by: ' + FORMAT(@ApCommitted+@ApPoTotalBase-@ApAllowed,'N2') + CASE WHEN @ApTolPct > 0 THEN ' | Tolerance: ' + FORMAT(@ApTolPct,'N2') + '%' ELSE '' END;
                    SELECT @TransactionId AS TransactionId, NULL AS NewStatus, 0 AS IsComplete, @ApBudMsg AS Message, @ModuleCode AS ModuleCode, @DocumentId AS DocumentId;
                    ROLLBACK; RETURN;
                END
            END
        END
        DECLARE @Now DATETIME = GETDATE();
        DECLARE @NewStatus NVARCHAR(50);
        DECLARE @NewLevelNo INT = @CurrentLevelNo;
        DECLARE @IsComplete BIT = 0;
        DECLARE @FinalAction NVARCHAR(20) = NULL;
        DECLARE @CompletedDate DATETIME = NULL;
        IF @Action = 'Approve' AND @UserMaxLevel IS NOT NULL AND @UserMaxLevel > @CurrentLevelNo
        BEGIN
            DECLARE @LoopLvl INT = @CurrentLevelNo;
            WHILE @LoopLvl < @UserMaxLevel
            BEGIN
                DECLARE @LoopLvlId INT;
                SELECT TOP 1 @LoopLvlId = LevelId FROM PROJ.TBL_APPROVAL_LEVEL WHERE PolicyId = @PolicyId AND LevelNo = @LoopLvl AND IsActive = 1 ORDER BY LevelId;
                INSERT INTO PROJ.TBL_APPROVAL_LOG (TransactionId, LevelId, LevelNo, Action, ActionBy, ActionByName, ActionDate, Remarks, IsDelegated, DelegatedFromUserId, DelegatedFromName, IsTimedOut)
                VALUES (@TransactionId, @LoopLvlId, @LoopLvl, 'Approved', @ActionBy, @ActionByName, @Now, ISNULL(NULLIF(LTRIM(RTRIM(@Remarks)), ''), '(no remarks)') + ' [auto-approved by senior approver]', 0, NULL, NULL, 0);
                SET @LoopLvl += 1;
            END
            SET @CurrentLevelNo = @UserMaxLevel;
            SELECT TOP 1 @CurrentLevelId = al.LevelId FROM PROJ.TBL_APPROVAL_LEVEL al WHERE al.PolicyId = @PolicyId AND al.LevelNo = @UserMaxLevel AND al.IsActive = 1
              AND ((al.ApproverType = 'Role' AND EXISTS (SELECT 1 FROM PROJ.TBL_USER_ROLES ur WHERE ur.UserId = @ActionBy AND ur.RoleId = al.ApproverId)) OR (al.ApproverType = 'User' AND al.ApproverId = @ActionBy) OR al.ApproverType = 'ANY') ORDER BY al.LevelId;
            SET @NewLevelNo = @UserMaxLevel;
        END
        IF @Action = 'Approve'
        BEGIN
            IF @CurrentLevelNo >= @TotalLevels
            BEGIN SET @NewStatus = @ApprovedStatus; SET @IsComplete = 1; SET @FinalAction = 'Approved'; SET @CompletedDate = @Now; END
            ELSE
            BEGIN
                SET @NewLevelNo = @CurrentLevelNo + 1;
                SELECT TOP 1 @NewStatus = ISNULL(PendingStatus, 'PendingApproval') FROM PROJ.TBL_APPROVAL_LEVEL WHERE PolicyId = @PolicyId AND LevelNo = @NewLevelNo AND IsActive = 1 ORDER BY LevelId;
                IF @NewStatus IS NULL SET @NewStatus = 'PendingApproval';
            END
        END
        ELSE IF @Action = 'Reject'
        BEGIN SET @NewStatus = @RejectedStatus; SET @IsComplete = 1; SET @FinalAction = 'Rejected'; SET @CompletedDate = @Now; END
        ELSE IF @Action = 'SendBack'
        BEGIN
            IF @CurrentLevelNo <= 1
            BEGIN SET @NewStatus = @CancelledStatus; SET @IsComplete = 1; SET @FinalAction = 'SentBack'; SET @CompletedDate = @Now; SET @NewLevelNo = 1; END
            ELSE
            BEGIN
                SET @NewLevelNo = @CurrentLevelNo - 1;
                SELECT TOP 1 @NewStatus = ISNULL(PendingStatus, 'PendingApproval') FROM PROJ.TBL_APPROVAL_LEVEL WHERE PolicyId = @PolicyId AND LevelNo = @NewLevelNo AND IsActive = 1 ORDER BY LevelId;
                IF @NewStatus IS NULL SET @NewStatus = 'PendingApproval';
            END
        END
        ELSE IF @Action = 'Cancel'
        BEGIN SET @NewStatus = @CancelledStatus; SET @IsComplete = 1; SET @FinalAction = 'Cancelled'; SET @CompletedDate = @Now; END
        DECLARE @IsDelegated BIT = 0, @DelegatedFromUserId INT = NULL, @DelegatedFromName NVARCHAR(100) = NULL;
        SELECT TOP 1 @IsDelegated = 1, @DelegatedFromUserId = ad.OriginalUserId, @DelegatedFromName = ou.FullName
        FROM PROJ.TBL_APPROVAL_DELEGATE ad JOIN PROJ.TBL_USERS ou ON ou.UserId = ad.OriginalUserId
        WHERE ad.LevelId = @CurrentLevelId AND ad.DelegateUserId = @ActionBy AND ad.IsActive = 1 AND CAST(GETDATE() AS date) BETWEEN ad.FromDate AND ad.ToDate;
        INSERT INTO PROJ.TBL_APPROVAL_LOG (TransactionId, LevelId, LevelNo, Action, ActionBy, ActionByName, ActionDate, Remarks, IsDelegated, DelegatedFromUserId, DelegatedFromName, IsTimedOut)
        VALUES (@TransactionId, @CurrentLevelId, @CurrentLevelNo, @LogAction, @ActionBy, @ActionByName, @Now,
             CASE WHEN @OverrideBudget = 1 AND @Action = 'Approve' THEN ISNULL(NULLIF(LTRIM(RTRIM(@Remarks)),''),'(no remarks)') + ' [BUDGET OVERRIDE]' ELSE @Remarks END,
             @IsDelegated, @DelegatedFromUserId, @DelegatedFromName, 0);
        UPDATE PROJ.TBL_APPROVAL_TRANSACTION
        SET CurrentStatus = CASE WHEN @IsComplete = 1 THEN @FinalAction ELSE 'Pending' END, CurrentLevelNo = @NewLevelNo, FinalAction = @FinalAction,
            FinalActionBy = CASE WHEN @IsComplete = 1 THEN @ActionByName ELSE NULL END, FinalRemarks = CASE WHEN @IsComplete = 1 THEN @Remarks ELSE NULL END,
            CompletedDate = @CompletedDate, ModifiedBy = @ActionByName, ModifiedDate = @Now WHERE TransactionId = @TransactionId;
        DECLARE @Sql NVARCHAR(1000) = N'UPDATE PROJ.' + QUOTENAME(@DocumentTable) + N' SET ' + QUOTENAME(@StatusColumn) + N' = @NewSt' + N', ' + QUOTENAME(@ModifiedByCol) + N' = @Who' + N', ' + QUOTENAME(@ModifiedDateCol) + N' = @When' + N' WHERE ' + QUOTENAME(@DocumentIdCol) + N' = @DocId';
        EXEC sp_executesql @Sql, N'@NewSt NVARCHAR(50), @Who NVARCHAR(100), @When DATETIME, @DocId INT', @NewStatus, @ActionByName, @Now, @DocumentId;
        
        -- Stamp ApprovedBy / ApprovedDate on the document when fully approved (if columns exist)
        IF @IsComplete = 1 AND @FinalAction = 'Approved'
           AND COL_LENGTH('PROJ.' + @DocumentTable, 'ApprovedBy') IS NOT NULL
        BEGIN
            DECLARE @ApStampSql NVARCHAR(600) = N'UPDATE PROJ.' + QUOTENAME(@DocumentTable)
                + N' SET ApprovedBy = @Who'
                + CASE WHEN COL_LENGTH('PROJ.' + @DocumentTable, 'ApprovedDate') IS NOT NULL
                       THEN N', ApprovedDate = @When' ELSE N'' END
                + N' WHERE ' + QUOTENAME(@DocumentIdCol) + N' = @DocId';
            EXEC sp_executesql @ApStampSql, N'@Who NVARCHAR(100), @When DATETIME, @DocId INT', @ActionByName, @Now, @DocumentId;
        END
        IF @IsComplete = 1 AND @FinalAction = 'Approved' AND @PostApprovalSP IS NOT NULL
        BEGIN
            DECLARE @HookSql NVARCHAR(500);
            IF @OverrideBudget = 1 AND @ModuleCode = 'MH' SET @HookSql = N'EXEC ' + @PostApprovalSP + N' @DocId, @By, @OverrideBudget = 1';
            ELSE SET @HookSql = N'EXEC ' + @PostApprovalSP + N' @DocId, @By';
            EXEC sp_executesql @HookSql, N'@DocId INT, @By NVARCHAR(100)', @DocumentId, @ActionByName;
        END
        COMMIT TRANSACTION;
        SELECT @TransactionId AS TransactionId, @NewStatus AS NewStatus, @IsComplete AS IsComplete, 'Action processed successfully.' AS Message, @ModuleCode AS ModuleCode, @DocumentId AS DocumentId;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        SELECT @TransactionId AS TransactionId, NULL AS NewStatus, 0 AS IsComplete, ERROR_MESSAGE() AS Message, NULL AS ModuleCode, NULL AS DocumentId;
    END CATCH
END;
GO
