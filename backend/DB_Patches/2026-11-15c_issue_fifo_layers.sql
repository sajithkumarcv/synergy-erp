-- 2026-11-15c: FIFO layers for an issue note line (split a line across receipt batches).
--
-- sp_GetFifoCost returns ONE price: the batch the store stock is currently "in". A line that is bigger than what is
-- left of that batch was priced entirely at that batch's price (15 pieces with 10 left at 200 and the next batch at 250
-- were all priced 200). This procedure returns the same FIFO walk as a list of layers so the Issue Note screen can
-- save one line per batch (10 x 200 + 5 x 250).
--
-- Same pool and same walk as sp_GetFifoCost: store stock (IsJobStock = 0) receipts oldest first (TransDate, LedgerId),
-- the quantity already issued out of the pool is skipped, and each batch's cost includes the 2026-11-14g revaluation
-- delta. Quantity is in the item's BASE unit. Layers with the same unit cost are merged. If the quantity is larger than
-- all receipts left, the surplus is added to the last layer; with no receipt left at all it is priced like sp_GetFifoCost
-- (last receipt's cost, else the average cost).
-- Read only. No existing procedure is changed. Idempotent (CREATE OR ALTER). Needs 2026-11-14g (fn_GrnRevalDeltaPerUnit).
-- Apply to: SYNERP, then each company DB. Run with sqlcmd -I.

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
SET NOCOUNT ON;
GO

CREATE OR ALTER PROCEDURE proj.sp_GetFifoLayers
    @ItemId  INT,
    @QtyBase DECIMAL(18,4)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TotalOut DECIMAL(18,4) = ISNULL(
        (SELECT SUM(QtyOut) FROM proj.TBL_STOCK_LEDGER
         WHERE ItemId = @ItemId AND QtyOut > 0 AND IsJobStock = 0), 0);

    DECLARE @L TABLE (Seq INT IDENTITY(1,1) PRIMARY KEY, Avail DECIMAL(18,4), UnitCost DECIMAL(18,4), Alloc DECIMAL(18,4) NULL);

    ;WITH b AS (
        SELECT l.LedgerId, l.QtyIn,
               l.UnitCost + proj.fn_GrnRevalDeltaPerUnit(l.TransType, l.RefId, l.ItemId) AS Cost,
               SUM(l.QtyIn) OVER (ORDER BY l.TransDate, l.LedgerId ROWS UNBOUNDED PRECEDING) AS CumIn
        FROM proj.TBL_STOCK_LEDGER l
        WHERE l.ItemId = @ItemId AND l.QtyIn > 0 AND l.IsJobStock = 0
    )
    INSERT INTO @L (Avail, UnitCost)
    SELECT b.CumIn - CASE WHEN b.CumIn - b.QtyIn > @TotalOut THEN b.CumIn - b.QtyIn ELSE @TotalOut END, b.Cost
    FROM b
    WHERE b.CumIn > @TotalOut
    ORDER BY b.CumIn;

    -- nothing left in any batch: same answer as sp_GetFifoCost = the last receipt's cost, else the average cost
    IF NOT EXISTS (SELECT 1 FROM @L)
        INSERT INTO @L (Avail, UnitCost)
        SELECT ISNULL(@QtyBase, 0),
               ISNULL((SELECT TOP 1 l.UnitCost + proj.fn_GrnRevalDeltaPerUnit(l.TransType, l.RefId, l.ItemId)
                       FROM proj.TBL_STOCK_LEDGER l
                       WHERE l.ItemId = @ItemId AND l.QtyIn > 0 AND l.IsJobStock = 0
                       ORDER BY l.TransDate DESC, l.LedgerId DESC),
                      ISNULL((SELECT AvgUnitCost FROM proj.TBL_STOCK_BALANCE WHERE ItemId = @ItemId), 0));

    -- hand the quantity out oldest layer first
    DECLARE @Left DECIMAL(18,4) = ISNULL(@QtyBase, 0), @Seq INT, @Avail DECIMAL(18,4), @Take DECIMAL(18,4), @Last INT;
    SELECT @Last = MAX(Seq) FROM @L;
    DECLARE c CURSOR LOCAL FAST_FORWARD FOR SELECT Seq, Avail FROM @L ORDER BY Seq;
    OPEN c; FETCH NEXT FROM c INTO @Seq, @Avail;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        SET @Take = CASE WHEN @Seq = @Last THEN @Left                       -- surplus goes to the last layer
                         WHEN @Avail < @Left THEN @Avail ELSE @Left END;
        IF @Take < 0 SET @Take = 0;
        UPDATE @L SET Alloc = @Take WHERE Seq = @Seq;
        SET @Left = @Left - @Take;
        FETCH NEXT FROM c INTO @Seq, @Avail;
    END
    CLOSE c; DEALLOCATE c;

    -- one row per distinct unit cost, oldest first
    SELECT ROW_NUMBER() OVER (ORDER BY MIN(Seq)) AS SeqNo,
           SUM(Alloc) AS Qty,
           UnitCost
    FROM @L
    WHERE Alloc > 0
    GROUP BY UnitCost
    ORDER BY MIN(Seq);
END
GO
