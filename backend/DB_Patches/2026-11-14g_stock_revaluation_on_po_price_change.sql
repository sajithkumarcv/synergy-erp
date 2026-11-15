-- 2026-11-14g: stock revaluation and job cost charge when a received PO line's price changes.
--   Problem: Amend PO line / Revise received PO changed only the PO. GRN, stock value, average cost and the cost of
--   units already issued stayed at the old price (India: GRN-26-0005, 0006, 0014, 0079, 0080).
--   Rule (user, 2026-11-14, "go with your recommendations"):
--     * The GRN is never edited. A revaluation is posted per received GRN line of the PO line:
--       difference = received qty (base unit) x (new cost - cost it is valued at now), base currency at the PO rate.
--     * Units still in stock: the item's average cost moves (stock ledger row TransType 'REVAL' with ValueChange).
--     * Units already issued: oldest issues from the same stock pool after the GRN first, up to the received qty.
--       An issue "include in costing" (not EXC_COSTING) to a costing job is charged / credited to that job in the
--       PO's expense category (TBL_JOB_COST_ADJUSTMENT, read by VW_JOB_COST_ACTUAL). A closed job is still charged,
--       with a note. Other issued units are recorded as "not charged": EXC_COSTING issues, non-costing jobs, and
--       every issue of a costing job's PO (VW_JOB_COST_ACTUAL already carries that PO at its new price).
--     * A price decrease credits the same way. Runs automatically on Amend PO line and on re-approval of a revised
--       PO that has receipts; a cancelled GRN takes its revaluation back out of stock first.
--   Also: FIFO issue cost includes the revaluation of its GRN layer; sp_GetStockByJob, sp_ReportInHouseStock and
--   sp_GetStockLedger show the revaluation value.
-- Idempotent. Marker-based edits must find their marker exactly once or the whole edit batch stops unchanged.
-- Run per database, one at a time. Run with sqlcmd -I (or SSMS, SQLCMD Mode on).

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;
GO

/* ---------- 1. schema ---------------------------------------------------------------------- */
IF COL_LENGTH('proj.TBL_STOCK_LEDGER', 'ValueChange') IS NULL
    ALTER TABLE proj.TBL_STOCK_LEDGER ADD ValueChange DECIMAL(18,4) NULL;
GO

IF OBJECT_ID('proj.TBL_STOCK_REVALUATION') IS NULL
CREATE TABLE proj.TBL_STOCK_REVALUATION (
    RevalId               INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TBL_STOCK_REVALUATION PRIMARY KEY,
    RevalDate             DATETIME       NOT NULL CONSTRAINT DF_TBL_STOCK_REVALUATION_Date DEFAULT GETDATE(),
    Source                NVARCHAR(20)   NOT NULL,          -- AMEND / APPROVAL / GRN_CANCEL
    PoId                  INT            NULL,
    PoNumber              NVARCHAR(50)   NULL,
    PoLineId              INT            NULL,
    GrnId                 INT            NULL,              -- set for GRN_CANCEL
    ItemId                INT            NOT NULL,
    ReceivedQty           DECIMAL(18,4)  NOT NULL DEFAULT 0, -- base unit, GRN lines revalued
    ValueChange           DECIMAL(18,4)  NOT NULL DEFAULT 0, -- total difference
    StockQty              DECIMAL(18,4)  NOT NULL DEFAULT 0,
    StockValueChange      DECIMAL(18,4)  NOT NULL DEFAULT 0,
    IssuedQty             DECIMAL(18,4)  NOT NULL DEFAULT 0,
    JobValueChange        DECIMAL(18,4)  NOT NULL DEFAULT 0, -- charged to jobs
    NotChargedValueChange DECIMAL(18,4)  NOT NULL DEFAULT 0, -- issued but not job-costed, or no stock left
    AvgCostBefore         DECIMAL(18,4)  NULL,
    AvgCostAfter          DECIMAL(18,4)  NULL,
    Note                  NVARCHAR(500)  NULL,
    CreatedBy             NVARCHAR(100)  NULL,
    CreatedDate           DATETIME       NOT NULL CONSTRAINT DF_TBL_STOCK_REVALUATION_Created DEFAULT GETDATE()
);
GO

IF OBJECT_ID('proj.TBL_STOCK_REVALUATION_GRN') IS NULL
CREATE TABLE proj.TBL_STOCK_REVALUATION_GRN (
    RevalGrnId       INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TBL_STOCK_REVALUATION_GRN PRIMARY KEY,
    RevalId          INT            NOT NULL,
    GrnId            INT            NOT NULL,
    GrnDetailId      INT            NOT NULL,
    ItemId           INT            NOT NULL,
    QtyBase          DECIMAL(18,4)  NOT NULL,
    UnitCostBefore   DECIMAL(18,4)  NOT NULL,   -- base currency, per base unit
    UnitCostAfter    DECIMAL(18,4)  NOT NULL,
    StockQty         DECIMAL(18,4)  NOT NULL DEFAULT 0,
    StockValueChange DECIMAL(18,4)  NOT NULL DEFAULT 0,
    IssuedQty        DECIMAL(18,4)  NOT NULL DEFAULT 0,
    JobValueChange   DECIMAL(18,4)  NOT NULL DEFAULT 0,
    NotChargedValue  DECIMAL(18,4)  NOT NULL DEFAULT 0
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TBL_STOCK_REVALUATION_GRN_Detail')
    CREATE INDEX IX_TBL_STOCK_REVALUATION_GRN_Detail ON proj.TBL_STOCK_REVALUATION_GRN (GrnDetailId, RevalGrnId);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TBL_STOCK_REVALUATION_GRN_Grn')
    CREATE INDEX IX_TBL_STOCK_REVALUATION_GRN_Grn ON proj.TBL_STOCK_REVALUATION_GRN (GrnId, ItemId);
GO

IF OBJECT_ID('proj.TBL_JOB_COST_ADJUSTMENT') IS NULL
CREATE TABLE proj.TBL_JOB_COST_ADJUSTMENT (
    AdjId          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TBL_JOB_COST_ADJUSTMENT PRIMARY KEY,
    JobId          NVARCHAR(50)   NOT NULL,
    CostCategoryId INT            NULL,
    Amount         DECIMAL(18,4)  NOT NULL,       -- base currency; negative = credit
    SourceType     NVARCHAR(20)   NOT NULL DEFAULT N'REVAL',
    RevalId        INT            NULL,
    IssueId        INT            NULL,
    IssueNo        NVARCHAR(50)   NULL,
    ItemId         INT            NULL,
    Qty            DECIMAL(18,4)  NULL,
    Note           NVARCHAR(500)  NULL,
    CreatedBy      NVARCHAR(100)  NULL,
    CreatedDate    DATETIME       NOT NULL CONSTRAINT DF_TBL_JOB_COST_ADJUSTMENT_Created DEFAULT GETDATE()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TBL_JOB_COST_ADJUSTMENT_Job')
    CREATE INDEX IX_TBL_JOB_COST_ADJUSTMENT_Job ON proj.TBL_JOB_COST_ADJUSTMENT (JobId, CostCategoryId);
GO

/* ---------- 2. FIFO layer delta ------------------------------------------------------------ */
CREATE OR ALTER FUNCTION proj.fn_GrnRevalDeltaPerUnit (@TransType NVARCHAR(30), @RefId INT, @ItemId INT)
RETURNS DECIMAL(18,4)
AS
BEGIN
    -- 2026-11-14g: revaluation per unit of a GRN layer (all revaluations of that GRN for that item, spread over
    -- the GRN's ledger quantity for the item). 0 for anything that is not a GRN receipt.
    IF @TransType <> N'GRN' RETURN 0;
    DECLARE @v DECIMAL(18,4), @q DECIMAL(18,4);
    SELECT @v = SUM(QtyBase * (UnitCostAfter - UnitCostBefore)) FROM proj.TBL_STOCK_REVALUATION_GRN WHERE GrnId = @RefId AND ItemId = @ItemId;
    IF @v IS NULL RETURN 0;
    SELECT @q = SUM(QtyIn) FROM proj.TBL_STOCK_LEDGER WHERE TransType = N'GRN' AND RefId = @RefId AND ItemId = @ItemId AND QtyIn > 0;
    RETURN CASE WHEN ISNULL(@q, 0) > 0 THEN ROUND(@v / @q, 4) ELSE 0 END;
END;
GO

/* ---------- 3. revalue one PO line ----------------------------------------------------------- */
CREATE OR ALTER PROCEDURE proj.sp_RevaluePoLine
    @PoLineId INT,
    @Source   NVARCHAR(20),
    @By       NVARCHAR(100) = NULL
AS
BEGIN
    -- 2026-11-14g. Brings every received GRN line of this PO line to the PO line's current price.
    -- Idempotent: a line already valued at the current price is skipped. Runs inside the caller's transaction.
    SET NOCOUNT ON;
    SET @By = ISNULL(NULLIF(@By, N''), N'SYSTEM');

    DECLARE @PoId INT, @PoNumber NVARCHAR(50), @ItemId INT, @Price DECIMAL(18,4), @Rate DECIMAL(18,6), @CatId INT, @PoJobCosting BIT;
    SELECT @PoId = po.PoId, @PoNumber = po.PoNumber, @ItemId = pol.ItemId, @Price = pol.UnitPrice,
           @Rate = ISNULL(NULLIF(po.ExchangeRate, 0), 1), @CatId = po.ExpenseCategoryId,
           -- a costing job's PO is already job cost at its current price (VW_JOB_COST_ACTUAL), so its issued
           -- units are never charged again
           @PoJobCosting = CASE WHEN po.JobId IS NOT NULL AND ISNULL(jt.IsCostingRequired, 1) = 1 THEN 1 ELSE 0 END
    FROM   proj.TBL_PURCHASE_ORDER_LINE pol
    JOIN   proj.TBL_PURCHASE_ORDER      po ON po.PoId = pol.PoId
    LEFT JOIN proj.TBL_JOB              pj ON pj.JobId = po.JobId
    LEFT JOIN proj.TBL_JOBTYPE          jt ON jt.JobTypeId = pj.JobTypeId
    WHERE  pol.PoLineId = @PoLineId AND pol.IsActive = 1;
    IF @PoId IS NULL OR @ItemId IS NULL RETURN;

    DECLARE @g TABLE (GrnDetailId INT PRIMARY KEY, GrnId INT, GrnNumber NVARCHAR(50), QtyBase DECIMAL(18,4),
                      CurCost DECIMAL(18,4), NewCost DECIMAL(18,4), PoolJob BIT, PoolJobId NVARCHAR(50), GrnDate DATETIME);
    INSERT @g (GrnDetailId, GrnId, GrnNumber, QtyBase, CurCost, NewCost, PoolJob, PoolJobId, GrnDate)
    SELECT d.GrnDetailId, h.GrnId, h.GrnNumber,
           (d.ReceivedQty - ISNULL(d.RejectedQty, 0)) * ISNULL(c.ConversionFactor, 1),
           ISNULL((SELECT TOP 1 r.UnitCostAfter FROM proj.TBL_STOCK_REVALUATION_GRN r
                   WHERE r.GrnDetailId = d.GrnDetailId ORDER BY r.RevalGrnId DESC),
                  CAST(ROUND(d.UnitPrice * @Rate, 4) / ISNULL(c.ConversionFactor, 1) AS DECIMAL(18,4))),
           CAST(ROUND(@Price * @Rate, 4) / ISNULL(c.ConversionFactor, 1) AS DECIMAL(18,4)),
           lg.IsJobStock, lg.JobId, lg.TransDate
    FROM   proj.TBL_GRN_DETAIL d
    JOIN   proj.TBL_GRN_HEADER h ON h.GrnId = d.GrnId AND h.IsActive = 1 AND h.Status NOT IN (N'Draft', N'Cancelled')
    JOIN   proj.TBL_ITEM i ON i.ItemId = d.ItemId
    LEFT JOIN proj.TBL_ITEM_UOM_CONVERSION c
           ON c.ItemId = d.ItemId AND c.FromUomId = d.UomId AND c.ToUomId = i.BaseUomId AND c.IsActive = 1 AND d.UomId <> i.BaseUomId
    OUTER APPLY (SELECT TOP 1 l.IsJobStock, l.JobId, l.TransDate FROM proj.TBL_STOCK_LEDGER l
                 WHERE l.TransType = N'GRN' AND l.RefId = h.GrnId AND l.ItemId = d.ItemId ORDER BY l.LedgerId) lg
    WHERE  d.PoLineId = @PoLineId AND d.IsActive = 1 AND (d.ReceivedQty - ISNULL(d.RejectedQty, 0)) > 0
      AND  lg.TransDate IS NOT NULL;

    IF NOT EXISTS (SELECT 1 FROM @g WHERE ABS(QtyBase * (NewCost - CurCost)) >= 0.005) RETURN;

    DECLARE @RevalId INT, @AvgBefore DECIMAL(18,4);
    SELECT @AvgBefore = AvgUnitCost FROM proj.TBL_STOCK_BALANCE WHERE ItemId = @ItemId;

    INSERT proj.TBL_STOCK_REVALUATION (Source, PoId, PoNumber, PoLineId, ItemId, AvgCostBefore, CreatedBy, Note)
    VALUES (@Source, @PoId, @PoNumber, @PoLineId, @ItemId, @AvgBefore, @By,
            N'PO line price ' + CAST(@Price AS NVARCHAR(30)) + N' at rate ' + CAST(@Rate AS NVARCHAR(30)));
    SET @RevalId = SCOPE_IDENTITY();

    DECLARE @GrnDetailId INT, @GrnId INT, @GrnNumber NVARCHAR(50), @Q DECIMAL(18,4), @Cur DECIMAL(18,4), @New DECIMAL(18,4),
            @PoolJob BIT, @PoolJobId NVARCHAR(50), @GrnDate DATETIME, @dU DECIMAL(18,4),
            @Left DECIMAL(18,4), @Consumed DECIMAL(18,4), @S DECIMAL(18,4), @OnHand DECIMAL(18,4), @AvgNow DECIMAL(18,4),
            @dStock DECIMAL(18,4), @dJob DECIMAL(18,4), @dNot DECIMAL(18,4),
            @IssLedgerQty DECIMAL(18,4), @IssId INT, @Take DECIMAL(18,4), @IssJob NVARCHAR(50), @IssNo NVARCHAR(50),
            @IssCosting NVARCHAR(20), @JobCosting BIT, @JobClosed BIT, @JobStatus NVARCHAR(100);

    DECLARE gc CURSOR LOCAL FAST_FORWARD FOR
        SELECT GrnDetailId, GrnId, GrnNumber, QtyBase, CurCost, NewCost, PoolJob, PoolJobId, GrnDate
        FROM @g WHERE ABS(QtyBase * (NewCost - CurCost)) >= 0.005 ORDER BY GrnDate, GrnDetailId;
    OPEN gc;
    FETCH NEXT FROM gc INTO @GrnDetailId, @GrnId, @GrnNumber, @Q, @Cur, @New, @PoolJob, @PoolJobId, @GrnDate;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        SELECT @dU = @New - @Cur, @Left = @Q, @Consumed = 0, @dJob = 0, @dNot = 0;

        -- issued part: oldest issues out of the same pool after the GRN, up to the received quantity
        DECLARE ic CURSOR LOCAL FAST_FORWARD FOR
            SELECT l.RefId, l.QtyOut
            FROM   proj.TBL_STOCK_LEDGER l
            WHERE  l.TransType = N'ISSUE' AND l.ItemId = @ItemId AND l.QtyOut > 0 AND l.TransDate >= @GrnDate
              AND  l.IsJobStock = @PoolJob AND (@PoolJob = 0 OR l.JobId = @PoolJobId)
            ORDER BY l.TransDate, l.LedgerId;
        OPEN ic;
        FETCH NEXT FROM ic INTO @IssId, @IssLedgerQty;
        WHILE @@FETCH_STATUS = 0 AND @Left > 0
        BEGIN
            SET @Take = CASE WHEN @IssLedgerQty < @Left THEN @IssLedgerQty ELSE @Left END;
            SELECT @IssJob = NULL, @IssNo = NULL, @IssCosting = NULL, @JobCosting = 1, @JobClosed = 0, @JobStatus = NULL;
            SELECT @IssJob = si.JobId, @IssNo = si.IssueNo, @IssCosting = si.CostingType,
                   @JobCosting = ISNULL(jt.IsCostingRequired, 1), @JobClosed = ISNULL(js.IsClosed, 0), @JobStatus = js.StatusName
            FROM   proj.TBL_STOCK_ISSUE si
            LEFT JOIN proj.TBL_JOB j ON j.JobId = si.JobId
            LEFT JOIN proj.TBL_JOBTYPE jt ON jt.JobTypeId = j.JobTypeId
            LEFT JOIN proj.TBL_JOB_STATUS js ON js.JobStatusId = j.JobStatusId
            WHERE  si.IssueId = @IssId;

            IF @PoJobCosting = 0 AND ISNULL(@IssCosting, N'') <> N'EXC_COSTING' AND @IssJob IS NOT NULL AND @JobCosting = 1
            BEGIN
                INSERT proj.TBL_JOB_COST_ADJUSTMENT (JobId, CostCategoryId, Amount, SourceType, RevalId, IssueId, IssueNo, ItemId, Qty, Note, CreatedBy)
                VALUES (@IssJob, @CatId, ROUND(@Take * @dU, 4), N'REVAL', @RevalId, @IssId, @IssNo, @ItemId, @Take,
                        N'Price change on ' + @PoNumber + N' / ' + @GrnNumber
                        + CASE WHEN @JobClosed = 1 THEN N'. Job was ' + ISNULL(@JobStatus, N'closed') + N' when this was posted.' ELSE N'' END,
                        @By);
                SET @dJob += ROUND(@Take * @dU, 4);
            END
            ELSE
                SET @dNot += ROUND(@Take * @dU, 4);

            SELECT @Left -= @Take, @Consumed += @Take;
            FETCH NEXT FROM ic INTO @IssId, @IssLedgerQty;
        END
        CLOSE ic; DEALLOCATE ic;

        -- part still in stock: capped at what the item has on hand
        SELECT @OnHand = ISNULL(QtyOnHand, 0), @AvgNow = ISNULL(AvgUnitCost, 0) FROM proj.TBL_STOCK_BALANCE WHERE ItemId = @ItemId;
        SET @S = @Q - @Consumed;
        IF @S > ISNULL(@OnHand, 0) SET @S = CASE WHEN ISNULL(@OnHand, 0) > 0 THEN @OnHand ELSE 0 END;
        SET @dNot += ROUND((@Q - @Consumed - @S) * @dU, 4);
        SET @dStock = ROUND(@S * @dU, 4);

        IF @dStock <> 0
        BEGIN
            IF @OnHand > 0 AND (@OnHand * @AvgNow + @dStock) >= 0
            BEGIN
                UPDATE proj.TBL_STOCK_BALANCE
                SET    AvgUnitCost = ROUND((@OnHand * @AvgNow + @dStock) / @OnHand, 4), UpdatedDate = GETDATE()
                WHERE  ItemId = @ItemId;

                INSERT proj.TBL_STOCK_LEDGER (ItemId, TransDate, TransType, RefId, RefNo, QtyIn, QtyOut, UnitCost, IsJobStock, JobId, CreatedBy, ValueChange)
                VALUES (@ItemId, GETDATE(), N'REVAL', @RevalId, LEFT(@PoNumber + N' / ' + @GrnNumber, 50), 0, 0, @dU, @PoolJob, @PoolJobId, @By, @dStock);
            END
            ELSE
                SELECT @dNot += @dStock, @dStock = 0, @S = 0;
        END

        INSERT proj.TBL_STOCK_REVALUATION_GRN (RevalId, GrnId, GrnDetailId, ItemId, QtyBase, UnitCostBefore, UnitCostAfter,
                                               StockQty, StockValueChange, IssuedQty, JobValueChange, NotChargedValue)
        VALUES (@RevalId, @GrnId, @GrnDetailId, @ItemId, @Q, @Cur, @New, @S, @dStock, @Consumed, @dJob, @dNot);

        FETCH NEXT FROM gc INTO @GrnDetailId, @GrnId, @GrnNumber, @Q, @Cur, @New, @PoolJob, @PoolJobId, @GrnDate;
    END
    CLOSE gc; DEALLOCATE gc;

    UPDATE r
    SET    r.ReceivedQty = x.Q, r.ValueChange = x.V, r.StockQty = x.SQ, r.StockValueChange = x.SV,
           r.IssuedQty = x.IQ, r.JobValueChange = x.JV, r.NotChargedValueChange = x.NV,
           r.AvgCostAfter = (SELECT AvgUnitCost FROM proj.TBL_STOCK_BALANCE WHERE ItemId = @ItemId)
    FROM   proj.TBL_STOCK_REVALUATION r
    CROSS APPLY (SELECT SUM(QtyBase) Q, SUM(ROUND(QtyBase * (UnitCostAfter - UnitCostBefore), 4)) V, SUM(StockQty) SQ,
                        SUM(StockValueChange) SV, SUM(IssuedQty) IQ, SUM(JobValueChange) JV, SUM(NotChargedValue) NV
                 FROM proj.TBL_STOCK_REVALUATION_GRN WHERE RevalId = @RevalId) x
    WHERE  r.RevalId = @RevalId;
END;
GO

/* ---------- 4. take a GRN's revaluation back out when the GRN is cancelled -------------------- */
CREATE OR ALTER PROCEDURE proj.sp_ReverseGrnRevaluation
    @GrnId INT,
    @By    NVARCHAR(100) = NULL
AS
BEGIN
    -- 2026-11-14g. Called by the GRN cancel paths BEFORE they take the received quantity out at its original cost.
    -- Removes from stock value what revaluations added for this GRN; job charges already posted stay.
    SET NOCOUNT ON;
    SET @By = ISNULL(NULLIF(@By, N''), N'SYSTEM');
    IF NOT EXISTS (SELECT 1 FROM proj.TBL_STOCK_REVALUATION_GRN WHERE GrnId = @GrnId) RETURN;

    DECLARE @GrnNumber NVARCHAR(50) = (SELECT GrnNumber FROM proj.TBL_GRN_HEADER WHERE GrnId = @GrnId);
    DECLARE @ItemId INT, @v DECIMAL(18,4), @OnHand DECIMAL(18,4), @Avg DECIMAL(18,4), @RevalId INT, @PoolJob BIT, @PoolJobId NVARCHAR(50);

    DECLARE rc CURSOR LOCAL FAST_FORWARD FOR
        SELECT ItemId, SUM(StockValueChange) FROM proj.TBL_STOCK_REVALUATION_GRN WHERE GrnId = @GrnId GROUP BY ItemId HAVING SUM(StockValueChange) <> 0;
    OPEN rc;
    FETCH NEXT FROM rc INTO @ItemId, @v;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        SELECT @OnHand = ISNULL(QtyOnHand, 0), @Avg = ISNULL(AvgUnitCost, 0) FROM proj.TBL_STOCK_BALANCE WHERE ItemId = @ItemId;
        SELECT TOP 1 @PoolJob = IsJobStock, @PoolJobId = JobId FROM proj.TBL_STOCK_LEDGER WHERE TransType = N'GRN' AND RefId = @GrnId AND ItemId = @ItemId ORDER BY LedgerId;

        INSERT proj.TBL_STOCK_REVALUATION (Source, GrnId, ItemId, ValueChange, StockValueChange, AvgCostBefore, Note, CreatedBy)
        VALUES (N'GRN_CANCEL', @GrnId, @ItemId, -@v, -@v, @Avg, N'GRN ' + ISNULL(@GrnNumber, N'') + N' cancelled: its revaluation taken back out of stock.', @By);
        SET @RevalId = SCOPE_IDENTITY();

        IF @OnHand > 0 AND (@OnHand * @Avg - @v) >= 0
            UPDATE proj.TBL_STOCK_BALANCE SET AvgUnitCost = ROUND((@OnHand * @Avg - @v) / @OnHand, 4), UpdatedDate = GETDATE() WHERE ItemId = @ItemId;

        INSERT proj.TBL_STOCK_LEDGER (ItemId, TransDate, TransType, RefId, RefNo, QtyIn, QtyOut, UnitCost, IsJobStock, JobId, CreatedBy, ValueChange)
        VALUES (@ItemId, GETDATE(), N'REVAL', @RevalId, LEFT(ISNULL(@GrnNumber, N'') + N' cancelled', 50), 0, 0, 0, ISNULL(@PoolJob, 0), @PoolJobId, @By, -@v);

        UPDATE proj.TBL_STOCK_REVALUATION SET AvgCostAfter = (SELECT AvgUnitCost FROM proj.TBL_STOCK_BALANCE WHERE ItemId = @ItemId) WHERE RevalId = @RevalId;

        FETCH NEXT FROM rc INTO @ItemId, @v;
    END
    CLOSE rc; DEALLOCATE rc;
END;
GO

/* ---------- 5. hooks and readers (marker-based, all or nothing) ------------------------------ */
SET XACT_ABORT ON;
GO
BEGIN TRY
    BEGIN TRAN;

    DECLARE @msg NVARCHAR(400), @def NVARCHAR(MAX), @cpos INT, @n INT, @m NVARCHAR(400), @block NVARCHAR(MAX),
            @name NVARCHAR(200), @kind NVARCHAR(20), @mode NVARCHAR(10), @i INT = 1;

    WHILE @i <= 9
    BEGIN
        SELECT @name = NULL, @block = NULL;

        IF @i = 1  -- Amend PO line: revalue received stock at the new price
            SELECT @name = N'proj.sp_AmendPOLine', @kind = N'PROCEDURE', @mode = N'before',
                   @m = N'-- 4. Write amendment log',
                   @block = N'-- 2026-11-14g revalue received stock at the new price
    IF @NewPrice <> @CurrentPrice AND @CurrentReceived > 0
        EXEC proj.sp_RevaluePoLine @PoLineId, N''AMEND'', @ModifiedBy;

    ';
        IF @i = 2  -- re-approval of a revised PO that has receipts
            SELECT @name = N'proj.sp_PostPOApproval', @kind = N'PROCEDURE', @mode = N'before',
                   @m = N'DECLARE @AnyLine INT',
                   @block = N'-- 2026-11-14g revalue received stock if the revised PO changed a price
        DECLARE @RvLine INT;
        DECLARE rvl CURSOR LOCAL FAST_FORWARD FOR
            SELECT PoLineId FROM proj.TBL_PURCHASE_ORDER_LINE WHERE PoId = @DocId AND IsActive = 1 AND ISNULL(ReceivedQty, 0) > 0;
        OPEN rvl;
        FETCH NEXT FROM rvl INTO @RvLine;
        WHILE @@FETCH_STATUS = 0
        BEGIN
            EXEC proj.sp_RevaluePoLine @RvLine, N''APPROVAL'', @By;
            FETCH NEXT FROM rvl INTO @RvLine;
        END
        CLOSE rvl; DEALLOCATE rvl;

        ';
        IF @i = 3  -- GRN cancel through status change (also sp_UnregisterGRN)
            SELECT @name = N'proj.sp_ChangeGRNStatus', @kind = N'PROCEDURE', @mode = N'before',
                   @m = N'DECLARE @RItemId INT',
                   @block = N'-- 2026-11-14g take this GRN''s revaluation out of stock first
            EXEC proj.sp_ReverseGrnRevaluation @GrnId, @ChangedBy;

            ';
        IF @i = 4  -- Cancel GRN screen
            SELECT @name = N'proj.sp_CancelGRN', @kind = N'PROCEDURE', @mode = N'before',
                   @m = N'DECLARE @RItemId INT',
                   @block = N'-- 2026-11-14g take this GRN''s revaluation out of stock first
            EXEC proj.sp_ReverseGrnRevaluation @GrnId, @CancelledBy;

            ';
        IF @i = 5  -- FIFO issue cost includes the layer's revaluation
            SELECT @name = N'proj.sp_GetFifoCost', @kind = N'PROCEDURE', @mode = N'replace',
                   @m = N'SELECT QtyIn, UnitCost',
                   @block = N'SELECT QtyIn, UnitCost + proj.fn_GrnRevalDeltaPerUnit(TransType, RefId, ItemId) /* 2026-11-14g */';
        IF @i = 6  -- job cost view
            SELECT @name = N'proj.VW_JOB_COST_ACTUAL', @kind = N'VIEW', @mode = N'before',
                   @m = N'-- Approved job expenses',
                   @block = N'-- 2026-11-14g job cost adjustments (price change on stock already issued)
    SELECT a.JobId, a.CostCategoryId, a.Amount
    FROM proj.TBL_JOB_COST_ADJUSTMENT a
    WHERE a.JobId IS NOT NULL

    UNION ALL

    ';
        IF @i = 7
            SELECT @name = N'proj.sp_GetStockByJob', @kind = N'PROCEDURE', @mode = N'replace',
                   @m = N'SUM(l.QtyIn * l.UnitCost - l.QtyOut * l.UnitCost)',
                   @block = N'SUM(l.QtyIn * l.UnitCost - l.QtyOut * l.UnitCost + ISNULL(l.ValueChange, 0)) /* 2026-11-14g */';
        IF @i = 8
            SELECT @name = N'proj.sp_ReportInHouseStock', @kind = N'PROCEDURE', @mode = N'replace',
                   @m = N'SUM(l.QtyIn * l.UnitCost - l.QtyOut * l.UnitCost)',
                   @block = N'SUM(l.QtyIn * l.UnitCost - l.QtyOut * l.UnitCost + ISNULL(l.ValueChange, 0)) /* 2026-11-14g */';
        IF @i = 9
            SELECT @name = N'proj.sp_GetStockLedger', @kind = N'PROCEDURE', @mode = N'replace',
                   @m = N'CAST(CASE WHEN l.QtyIn > 0 THEN',
                   @block = N'CAST(CASE WHEN l.TransType = ''REVAL'' THEN ISNULL(l.ValueChange, 0) /* 2026-11-14g */ WHEN l.QtyIn > 0 THEN';

        SET @def = OBJECT_DEFINITION(OBJECT_ID(@name));
        IF @def IS NULL BEGIN SET @msg = @name + N' not found.'; THROW 50001, @msg, 1; END

        IF CHARINDEX(N'2026-11-14g', @def) > 0
            PRINT @name + N': already applied.';
        ELSE
        BEGIN
            SET @n = (LEN(@def) - LEN(REPLACE(@def, @m, N''))) / LEN(@m);
            IF @n <> 1
            BEGIN SET @msg = CONCAT(@name, N': marker found ', @n, N' times, expected once - live definition differs from the one this patch was written from.'); THROW 50002, @msg, 1; END

            SET @def = REPLACE(@def, @m, CASE WHEN @mode = N'before' THEN @block + @m ELSE @block END);
            SET @cpos = PATINDEX(N'%CREATE[ ]%' + @kind + N'%' COLLATE Latin1_General_CS_AS, @def);
            IF @cpos = 0 BEGIN SET @msg = @name + N': CREATE ' + @kind + N' not found.'; THROW 50003, @msg, 1; END
            SET @def = STUFF(@def, @cpos, 6, N'ALTER');
            EXEC (@def);
            PRINT @name + N': altered.';
        END
        SET @i += 1;
    END

    COMMIT;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    THROW;
END CATCH
GO
