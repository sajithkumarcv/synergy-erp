-- 2026-11-15e: carry the FIFO batch cost into the screens that still read the moving average.
--   Needs 2026-11-15c (sp_GetFifoLayers) and 2026-11-15d (VW_STOCK_BATCH, VW_STOCK_FIFO_ITEM). Read only. Idempotent.
--
--   proj.sp_GetFifoLayers      new optional @JobId: layers from THAT JOB's own stock batches (job pool, 2026-11-15d), so a
--                              "Not Include in Costing" line can be split across the job's batches the same way an
--                              "Include in Costing" line is split across store batches. Without @JobId: unchanged.
--   proj.sp_GetJobStockItems   the job's items (Stock by Job detail, and the item list of a "Not Include in Costing" note):
--                              AvgUnitCost = value / qty of the job's own batches; LastCost (the price filled in on the note)
--                              = the cost of the OLDEST batch still left (FIFO), StockValue = value of those batches.
--                              Items with no job-stock batch keep the old values. Quantities are unchanged.
--   proj.sp_GetTransferableJobStock  AvgUnitCost = value / qty of the job's own batches (cost the transfer carries).
--   proj.vw_AlertLowStock / vw_AlertNegativeStock  AvgUnitCost = FIFO unit cost (negative stock stays at the average).
-- Not changed: Stock by Job totals (already from the ledger cost of each movement), TBL_STOCK_BALANCE.AvgUnitCost.
-- Apply to: SYNERP, then each company DB. Run with sqlcmd -I.

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
SET NOCOUNT ON;
GO

CREATE OR ALTER PROCEDURE proj.sp_GetFifoLayers
    @ItemId  INT,
    @QtyBase DECIMAL(18,4),
    @JobId   NVARCHAR(50) = NULL        -- 2026-11-15e: NULL = store stock; a job id = that job's own stock
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @L TABLE (Seq INT IDENTITY(1,1) PRIMARY KEY, Avail DECIMAL(18,4), UnitCost DECIMAL(18,4), Alloc DECIMAL(18,4) NULL);

    IF @JobId IS NOT NULL
    BEGIN
        -- the job's own batches, oldest first (what is left of each, from VW_STOCK_BATCH)
        INSERT INTO @L (Avail, UnitCost)
        SELECT QtyRemaining, UnitCost
        FROM proj.VW_STOCK_BATCH
        WHERE ItemId = @ItemId AND IsJobStock = 1 AND JobId = @JobId AND QtyRemaining > 0
        ORDER BY ReceiptDate, LedgerId;

        IF NOT EXISTS (SELECT 1 FROM @L)
            INSERT INTO @L (Avail, UnitCost)
            SELECT ISNULL(@QtyBase, 0), ISNULL((SELECT AvgUnitCost FROM proj.TBL_STOCK_BALANCE WHERE ItemId = @ItemId), 0);
    END
    ELSE
    BEGIN
        DECLARE @TotalOut DECIMAL(18,4) = ISNULL(
            (SELECT SUM(QtyOut) FROM proj.TBL_STOCK_LEDGER
             WHERE ItemId = @ItemId AND QtyOut > 0 AND IsJobStock = 0), 0);

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
    END

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

CREATE OR ALTER PROCEDURE proj.sp_GetJobStockItems
    @JobId      NVARCHAR(50),
    @SearchText NVARCHAR(200) = NULL,
    @PageSize   INT           = 20
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        i.ItemId,
        i.ItemCode,
        i.ItemName,
        i.BaseUomId,
        c.CategoryName,
        u.UomCode   AS BaseUom,
        ISNULL(SUM(sl.QtyIn - sl.QtyOut), 0)                AS QtyBalance,
        ISNULL(SUM(CASE WHEN sl.QtyIn > sl.QtyOut THEN sl.QtyIn - sl.QtyOut ELSE 0 END), 0) AS AvailableQty,
        -- 2026-11-15e: cost from the job's own FIFO batches (average of what is left); fallback = item average
        CASE WHEN MAX(fb.BatchQty) > 0 THEN MAX(fb.BatchValue) / MAX(fb.BatchQty) ELSE ISNULL(sb.AvgUnitCost, 0) END AS AvgUnitCost,
        -- the price a "Not Include in Costing" line is filled in with = the oldest batch still left (FIFO)
        CASE WHEN MAX(fb.BatchQty) > 0 THEN MAX(fb.FirstCost)                         ELSE ISNULL(sb.AvgUnitCost, 0) END AS LastCost,
        CASE WHEN MAX(fb.BatchQty) > 0 THEN MAX(fb.BatchValue)
             ELSE ISNULL(SUM(sl.QtyIn - sl.QtyOut), 0) * ISNULL(sb.AvgUnitCost, 0) END                                  AS StockValue,
        MAX(sl.TransDate)                                    AS LastMovementDate
    FROM proj.TBL_STOCK_LEDGER sl
    JOIN  proj.TBL_ITEM           i  ON i.ItemId  = sl.ItemId
    LEFT JOIN proj.TBL_ITEM_CATEGORY c ON c.CategoryId = i.CategoryId
    LEFT JOIN proj.TBL_ITEM_UOM   u  ON u.UomId   = i.BaseUomId
    LEFT JOIN proj.TBL_STOCK_BALANCE sb ON sb.ItemId = sl.ItemId
    OUTER APPLY (
        SELECT SUM(x.QtyRemaining) AS BatchQty, SUM(x.RemainingValue) AS BatchValue,
               (SELECT TOP 1 y.UnitCost FROM proj.VW_STOCK_BATCH y
                WHERE y.ItemId = i.ItemId AND y.IsJobStock = 1 AND y.JobId = @JobId AND y.QtyRemaining > 0
                ORDER BY y.ReceiptDate, y.LedgerId) AS FirstCost
        FROM proj.VW_STOCK_BATCH x
        WHERE x.ItemId = i.ItemId AND x.IsJobStock = 1 AND x.JobId = @JobId AND x.QtyRemaining > 0
    ) fb
    WHERE sl.JobId = @JobId
      AND (@SearchText IS NULL
           OR i.ItemName LIKE '%' + @SearchText + '%'
           OR i.ItemCode LIKE '%' + @SearchText + '%')
    GROUP BY i.ItemId, i.ItemCode, i.ItemName, i.BaseUomId, c.CategoryName, u.UomCode, sb.AvgUnitCost
    ORDER BY i.ItemCode, i.ItemName;
END
GO

CREATE OR ALTER PROCEDURE proj.sp_GetTransferableJobStock
    @JobId NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        i.ItemId,
        i.ItemCode,
        i.ItemName,
        i.BaseUomId                              AS UomId,
        u.UomName,
        u.UomCode,
        ISNULL(SUM(sl.QtyIn - sl.QtyOut), 0)   AS AvailableQty,
        -- 2026-11-15e: the cost the transfer carries = value / qty of the job's own batches (fallback: item average)
        CASE WHEN MAX(fb.BatchQty) > 0 THEN MAX(fb.BatchValue) / MAX(fb.BatchQty) ELSE ISNULL(sb.AvgUnitCost, 0) END AS AvgUnitCost
    FROM proj.TBL_STOCK_LEDGER sl
    JOIN  proj.TBL_ITEM        i  ON i.ItemId  = sl.ItemId
    LEFT JOIN proj.TBL_ITEM_UOM u  ON u.UomId   = i.BaseUomId
    LEFT JOIN proj.TBL_STOCK_BALANCE sb ON sb.ItemId = sl.ItemId
    OUTER APPLY (
        SELECT SUM(x.QtyRemaining) AS BatchQty, SUM(x.RemainingValue) AS BatchValue
        FROM proj.VW_STOCK_BATCH x
        WHERE x.ItemId = i.ItemId AND x.IsJobStock = 1 AND x.JobId = @JobId AND x.QtyRemaining > 0
    ) fb
    WHERE sl.JobId = @JobId
    GROUP BY i.ItemId, i.ItemCode, i.ItemName, i.BaseUomId, u.UomName, u.UomCode, sb.AvgUnitCost
    HAVING ISNULL(SUM(sl.QtyIn - sl.QtyOut), 0) > 0
    ORDER BY i.ItemCode, i.ItemName;
END
GO

CREATE OR ALTER VIEW proj.vw_AlertLowStock AS
SELECT i.ItemId,i.ItemCode,i.ItemName,u.UomCode AS UOM,id.MinStockLevel,id.ReorderLevel,ISNULL(sb.QtyOnHand,0) AS QtyOnHand,
       ISNULL(f.FifoUnitCost, ISNULL(sb.AvgUnitCost,0)) AS AvgUnitCost,CAST(sb.LastReceiptDate AS DATE) AS LastReceiptDate
FROM proj.TBL_ITEM i
JOIN proj.TBL_ITEM_DETAIL id ON id.ItemId=i.ItemId AND id.IsDefault=1 AND id.IsActive=1
LEFT JOIN proj.TBL_ITEM_UOM u ON u.UomId=i.BaseUomId
JOIN proj.TBL_STOCK_BALANCE sb ON sb.ItemId=i.ItemId
LEFT JOIN proj.VW_STOCK_FIFO_ITEM f ON f.ItemId=i.ItemId
WHERE i.IsActive=1 AND i.IsStockable=1 AND id.ReorderLevel>0 AND ISNULL(sb.QtyOnHand,0)>0 AND ISNULL(sb.QtyOnHand,0)<=id.ReorderLevel;
GO

CREATE OR ALTER VIEW proj.vw_AlertNegativeStock AS
SELECT i.ItemId,i.ItemCode,i.ItemName,u.UomCode AS UOM,ISNULL(sb.QtyOnHand,0) AS QtyOnHand,
       ISNULL(f.FifoUnitCost, ISNULL(sb.AvgUnitCost,0)) AS AvgUnitCost,CAST(sb.LastIssueDate AS DATE) AS LastIssueDate
FROM proj.TBL_ITEM i
LEFT JOIN proj.TBL_ITEM_UOM u ON u.UomId=i.BaseUomId
JOIN proj.TBL_STOCK_BALANCE sb ON sb.ItemId=i.ItemId
LEFT JOIN proj.VW_STOCK_FIFO_ITEM f ON f.ItemId=i.ItemId
WHERE i.IsActive=1 AND i.IsStockable=1 AND sb.QtyOnHand<0;
GO
