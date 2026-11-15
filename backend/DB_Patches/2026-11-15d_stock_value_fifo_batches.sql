-- 2026-11-15d: stock value by FIFO batches (stock value = what is left of each receipt batch at that batch's price).
--
-- Before: Stock Balance / dashboard / over-stock alert valued stock as quantity x ONE moving-average cost per item,
-- while issue notes are priced by FIFO. Receipts = issued + stock-left therefore did not hold (10 @200 + 10 @250, issue
-- 10 @200: stock left is 10 @250 = 2,500 but the screen showed 10 x 225 = 2,250).
--
-- Now:
--   proj.VW_STOCK_BATCH      one row per receipt batch (ledger row with QtyIn > 0) with what is still left of it.
--       Pools (the oldest batch is used up first inside a pool): store stock = one pool per item (IsJobStock = 0, same
--       pool as sp_GetFifoCost); job stock = one pool per item AND job (a job only issues its own stock).
--       A cancelled GRN (TransType GRN-REV) takes its own quantity off its own receipt; every other QtyOut uses the
--       oldest batches first. Cost = receipt cost + the 2026-11-14g revaluation delta (fn_GrnRevalDeltaPerUnit).
--   proj.VW_STOCK_FIFO_ITEM  per item: quantity and value left in the batches, StockValue (= batch value; any quantity
--       the batches do not explain is valued at the moving average, negative stock stays qty x average) and
--       FifoUnitCost = StockValue / QtyOnHand.
--   proj.sp_GetStockBatches(@ItemId)  the batches still in stock for one item (screen drill-down).
--   proj.sp_GetStockBalance   StockValue now from the batches; AvgUnitCost column now returns FifoUnitCost (the screens'
--       "Avg Cost" column; the old moving average is still returned as MovingAvgCost). Quantities are unchanged.
--   proj.sp_GetDashboard      StockValue from the batches.
--   proj.vw_AlertOverStock    AvgUnitCost / ExcessValue use FifoUnitCost.
-- TBL_STOCK_BALANCE.AvgUnitCost itself is still maintained exactly as before (other procedures use it).
-- Read only: no stock, ledger or balance row is changed. Needs 2026-11-14g. Idempotent. Run with sqlcmd -I.
-- Apply to: SYNERP, then each company DB.

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
SET NOCOUNT ON;
GO

CREATE OR ALTER VIEW proj.VW_STOCK_BATCH
AS
WITH rev AS (                                   -- quantity undone by a cancelled GRN, per receipt document
    SELECT ItemId, IsJobStock, ISNULL(JobId, N'') AS PoolJob, RefId, SUM(QtyOut) AS RevQty
    FROM proj.TBL_STOCK_LEDGER
    WHERE TransType = N'GRN-REV' AND QtyOut > 0
    GROUP BY ItemId, IsJobStock, ISNULL(JobId, N''), RefId
),
rcpt AS (                                       -- receipts with the cancelled part taken off
    SELECT l.LedgerId, l.ItemId, l.TransDate, l.TransType, l.RefId, l.RefNo, l.JobId, l.IsJobStock,
           CASE WHEN l.IsJobStock = 1 THEN ISNULL(l.JobId, N'') ELSE N'' END AS PoolJob,
           l.UnitCost + proj.fn_GrnRevalDeltaPerUnit(l.TransType, l.RefId, l.ItemId) AS Cost,
           l.QtyIn - CASE WHEN l.TransType = N'GRN' AND rv.RevQty IS NOT NULL
                          THEN CASE WHEN rv.RevQty - ISNULL(SUM(l.QtyIn) OVER (
                                          PARTITION BY l.ItemId, l.IsJobStock, ISNULL(l.JobId, N''), l.RefId
                                          ORDER BY l.LedgerId ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) <= 0 THEN 0
                                    WHEN rv.RevQty - ISNULL(SUM(l.QtyIn) OVER (
                                          PARTITION BY l.ItemId, l.IsJobStock, ISNULL(l.JobId, N''), l.RefId
                                          ORDER BY l.LedgerId ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) >= l.QtyIn THEN l.QtyIn
                                    ELSE rv.RevQty - ISNULL(SUM(l.QtyIn) OVER (
                                          PARTITION BY l.ItemId, l.IsJobStock, ISNULL(l.JobId, N''), l.RefId
                                          ORDER BY l.LedgerId ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) END
                          ELSE 0 END AS EffIn
    FROM proj.TBL_STOCK_LEDGER l
    LEFT JOIN rev rv ON rv.ItemId = l.ItemId AND rv.IsJobStock = l.IsJobStock
                    AND rv.PoolJob = ISNULL(l.JobId, N'') AND rv.RefId = l.RefId AND l.TransType = N'GRN'
    WHERE l.QtyIn > 0
),
cons AS (                                       -- everything issued out of a pool (cancels excluded: they hit their own receipt)
    SELECT ItemId, IsJobStock, CASE WHEN IsJobStock = 1 THEN ISNULL(JobId, N'') ELSE N'' END AS PoolJob, SUM(QtyOut) AS OutQty
    FROM proj.TBL_STOCK_LEDGER
    WHERE QtyOut > 0 AND TransType <> N'GRN-REV'
    GROUP BY ItemId, IsJobStock, CASE WHEN IsJobStock = 1 THEN ISNULL(JobId, N'') ELSE N'' END
),
walk AS (
    SELECT r.*, SUM(r.EffIn) OVER (PARTITION BY r.ItemId, r.IsJobStock, r.PoolJob
                                   ORDER BY r.TransDate, r.LedgerId ROWS UNBOUNDED PRECEDING) AS CumIn
    FROM rcpt r
    WHERE r.EffIn > 0
)
SELECT w.LedgerId, w.ItemId, w.IsJobStock,
       CASE WHEN w.IsJobStock = 1 THEN w.JobId ELSE NULL END AS JobId,
       w.TransDate AS ReceiptDate, w.TransType, w.RefId, w.RefNo,
       w.EffIn AS QtyReceived,
       CAST(CASE WHEN w.CumIn <= ISNULL(c.OutQty, 0) THEN 0
                 WHEN w.CumIn - w.EffIn >= ISNULL(c.OutQty, 0) THEN w.EffIn
                 ELSE w.CumIn - ISNULL(c.OutQty, 0) END AS DECIMAL(18,4)) AS QtyRemaining,
       CAST(w.Cost AS DECIMAL(18,4)) AS UnitCost,
       CAST((CASE WHEN w.CumIn <= ISNULL(c.OutQty, 0) THEN 0
                  WHEN w.CumIn - w.EffIn >= ISNULL(c.OutQty, 0) THEN w.EffIn
                  ELSE w.CumIn - ISNULL(c.OutQty, 0) END) * w.Cost AS DECIMAL(18,4)) AS RemainingValue
FROM walk w
LEFT JOIN cons c ON c.ItemId = w.ItemId AND c.IsJobStock = w.IsJobStock AND c.PoolJob = w.PoolJob;
GO

CREATE OR ALTER VIEW proj.VW_STOCK_FIFO_ITEM
AS
SELECT b.ItemId,
       b.QtyOnHand,
       ISNULL(q.LayerQty, 0)   AS LayerQty,
       ISNULL(q.LayerValue, 0) AS LayerValue,
       CAST(CASE WHEN ISNULL(b.QtyOnHand, 0) <= 0 THEN ISNULL(b.QtyOnHand, 0) * ISNULL(b.AvgUnitCost, 0)
                 ELSE ISNULL(q.LayerValue, 0)
                      + CASE WHEN b.QtyOnHand > ISNULL(q.LayerQty, 0)
                             THEN (b.QtyOnHand - ISNULL(q.LayerQty, 0)) * ISNULL(b.AvgUnitCost, 0) ELSE 0 END
            END AS DECIMAL(18,4)) AS StockValue,
       CAST(CASE WHEN ISNULL(b.QtyOnHand, 0) = 0 THEN ISNULL(b.AvgUnitCost, 0)
                 WHEN b.QtyOnHand < 0 THEN ISNULL(b.AvgUnitCost, 0)
                 ELSE (ISNULL(q.LayerValue, 0)
                       + CASE WHEN b.QtyOnHand > ISNULL(q.LayerQty, 0)
                              THEN (b.QtyOnHand - ISNULL(q.LayerQty, 0)) * ISNULL(b.AvgUnitCost, 0) ELSE 0 END) / b.QtyOnHand
            END AS DECIMAL(18,4)) AS FifoUnitCost
FROM proj.TBL_STOCK_BALANCE b
OUTER APPLY (SELECT SUM(x.QtyRemaining) AS LayerQty, SUM(x.RemainingValue) AS LayerValue
             FROM proj.VW_STOCK_BATCH x WHERE x.ItemId = b.ItemId) q;
GO

CREATE OR ALTER PROCEDURE proj.sp_GetStockBatches
    @ItemId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT x.LedgerId, x.ItemId,
           CASE WHEN x.IsJobStock = 1 THEN N'Job stock' ELSE N'Store stock' END AS Pool,
           x.JobId,
           x.ReceiptDate, x.TransType, x.RefNo,
           x.QtyReceived, x.QtyRemaining, x.UnitCost, x.RemainingValue
    FROM proj.VW_STOCK_BATCH x
    WHERE x.ItemId = @ItemId AND x.QtyRemaining > 0
    ORDER BY x.IsJobStock, x.JobId, x.ReceiptDate, x.LedgerId;
END
GO

-- Stock Balance screen / report: value from the batches
CREATE OR ALTER PROCEDURE proj.sp_GetStockBalance
    @SearchText      NVARCHAR(100) = NULL,
    @CategoryId      INT           = NULL,
    @SubCategoryId   INT           = NULL,
    @ItemTypeId      INT           = NULL,
    @StockType       NVARCHAR(10)  = NULL,
    @DateFrom        DATE          = NULL,
    @DateTo          DATE          = NULL,
    @ZeroStock       BIT           = 0,
    @ItemId          INT           = NULL,
    @BudgetCategoryId INT          = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        b.BalanceId,
        i.ItemId,
        i.ItemCode, i.ItemName,
        c.CategoryName,
        t.TypeName  AS ItemTypeName,
        u.UomName   AS BaseUom,
        ISNULL(b.QtyOnHand,    0) AS QtyOnHand,
        ISNULL(b.QtyJobStock,  0) AS QtyJobStock,
        ISNULL(b.QtyStoreStock,0) AS QtyStoreStock,
        ISNULL(b.QtyReserved,  0) AS QtyReserved,
        ISNULL(b.QtyAvailable, 0) AS QtyAvailable,
        -- 2026-11-15d: unit cost = stock value / quantity on hand, the value taken from the FIFO batches left
        ISNULL(f.FifoUnitCost, ISNULL(b.AvgUnitCost, 0)) AS AvgUnitCost,
        CAST(ISNULL(f.StockValue, 0) AS DECIMAL(18,4))   AS StockValue,
        ISNULL(b.AvgUnitCost,  0) AS MovingAvgCost,
        b.LastReceiptDate, b.LastIssueDate, b.UpdatedDate
    FROM proj.TBL_ITEM i
    LEFT  JOIN proj.TBL_STOCK_BALANCE  b  ON b.ItemId     = i.ItemId
    LEFT  JOIN proj.VW_STOCK_FIFO_ITEM f  ON f.ItemId     = i.ItemId
    LEFT  JOIN proj.TBL_ITEM_CATEGORY  c  ON c.CategoryId = i.CategoryId
    LEFT  JOIN proj.TBL_ITEM_TYPE      t  ON t.ItemTypeId = i.ItemTypeId
    LEFT  JOIN proj.TBL_ITEM_UOM       u  ON u.UomId      = i.BaseUomId
    WHERE i.IsActive = 1
      AND (@ZeroStock = 1 OR ISNULL(b.QtyOnHand, 0) > 0)
      AND (@StockType IS NULL
           OR (@StockType = 'JOB'   AND ISNULL(b.QtyJobStock,  0) > 0)
           OR (@StockType = 'STORE' AND ISNULL(b.QtyStoreStock, 0) > 0))
      AND (@ItemId IS NULL OR i.ItemId = @ItemId)
      AND (
              (@CategoryId IS NULL AND @SubCategoryId IS NULL)
           OR (@SubCategoryId IS NOT NULL AND i.CategoryId = @SubCategoryId)
           OR (@SubCategoryId IS NULL AND @CategoryId IS NOT NULL AND (
                  i.CategoryId = @CategoryId
                  OR i.CategoryId IN (SELECT CategoryId FROM proj.TBL_ITEM_CATEGORY WHERE ParentCategoryId = @CategoryId)
               ))
          )
      AND (@ItemTypeId IS NULL OR i.ItemTypeId = @ItemTypeId)
      AND (@DateFrom IS NULL OR CAST(b.LastReceiptDate AS DATE) >= @DateFrom)
      AND (@DateTo   IS NULL OR CAST(b.LastReceiptDate AS DATE) <= @DateTo)
      AND (@SearchText IS NULL OR i.ItemCode LIKE N'%'+@SearchText+N'%'
                               OR i.ItemName LIKE N'%'+@SearchText+N'%')
      AND (@BudgetCategoryId IS NULL OR EXISTS (
              SELECT 1
              FROM proj.TBL_STOCK_LEDGER sl
              JOIN proj.TBL_JOB j ON j.JobId = sl.JobId
              WHERE sl.ItemId = i.ItemId
                AND j.BudgetCategoryId = @BudgetCategoryId
          ))
    ORDER BY i.ItemCode;
END
GO

-- Dashboard stock value from the batches (marker-based: only that expression changes)
DECLARE @def NVARCHAR(MAX) = OBJECT_DEFINITION(OBJECT_ID(N'proj.sp_GetDashboard'));
DECLARE @old NVARCHAR(200) = N'ISNULL(SUM(QtyOnHand * AvgUnitCost), 0)';
DECLARE @new NVARCHAR(200) = N'ISNULL((SELECT SUM(StockValue) FROM proj.VW_STOCK_FIFO_ITEM), 0) /* 2026-11-15d */';
IF @def IS NULL THROW 50010, 'sp_GetDashboard not found.', 1;
IF CHARINDEX(N'VW_STOCK_FIFO_ITEM', @def) = 0
BEGIN
    IF CHARINDEX(@old, @def) = 0 THROW 50011, 'sp_GetDashboard: stock value expression not found - patch not applied.', 1;
    SET @def = REPLACE(@def, @old, @new);
    DECLARE @pos INT = PATINDEX(N'%CREATE[ ]%PROCEDURE%' COLLATE Latin1_General_CS_AS, @def);
    IF @pos = 0 THROW 50012, 'sp_GetDashboard: CREATE PROCEDURE not found.', 1;
    SET @def = STUFF(@def, @pos, 6, N'ALTER');
    EXEC (@def);
END
GO

-- Over-stock alert value from the batches
CREATE OR ALTER VIEW proj.vw_AlertOverStock AS
SELECT i.ItemId, i.ItemCode, i.ItemName,
       u.UomCode AS UOM,
       id.MinStockLevel, id.ReorderLevel, id.MaxStockLevel,
       ISNULL(sb.QtyOnHand,0) AS QtyOnHand,
       ISNULL(sb.QtyOnHand,0) - id.MaxStockLevel AS ExcessQty,
       ISNULL(f.FifoUnitCost, ISNULL(sb.AvgUnitCost,0)) AS AvgUnitCost,
       ROUND((ISNULL(sb.QtyOnHand,0) - id.MaxStockLevel) * ISNULL(f.FifoUnitCost, ISNULL(sb.AvgUnitCost,0)), 2) AS ExcessValue
FROM proj.TBL_ITEM i
JOIN proj.TBL_ITEM_DETAIL id ON id.ItemId = i.ItemId AND id.IsDefault = 1 AND id.IsActive = 1
LEFT JOIN proj.TBL_ITEM_UOM u ON u.UomId = i.BaseUomId
JOIN proj.TBL_STOCK_BALANCE sb ON sb.ItemId = i.ItemId
LEFT JOIN proj.VW_STOCK_FIFO_ITEM f ON f.ItemId = i.ItemId
WHERE i.IsActive = 1 AND i.IsStockable = 1
  AND id.MaxStockLevel > 0
  AND ISNULL(sb.QtyOnHand,0) > id.MaxStockLevel;
GO
