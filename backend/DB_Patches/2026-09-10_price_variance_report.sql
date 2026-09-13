-- =====================================================================
-- 2026-09-10  Price Variance report - across items, ranked by money
--
-- APPLY TO: SYNERP (dev) first. Production after sign-off.
--
-- Answers "where has our buying price moved, and what did it cost us",
-- without opening items one at a time. SAP purchasing-information-system /
-- Oracle PPV pattern: an exception list ranked by VALUE IMPACT, with the
-- per-item Item Price Analysis screen as the drill-down.
--
-- WHY VALUE AND NOT PERCENTAGE
-- A 200% rise on a 10-rupee washer is noise; a 4% rise on the biggest steel
-- line is real money. Ranking by % sends people chasing trivia while the
-- expensive drift goes unnoticed. ExtraSpend is the sort key.
--
--   ExtraSpend = (PriceNow - PriceBefore) * QtyNow
--
-- HOW THE BASELINE IS CHOSEN - and why it is NOT "before the date range"
-- An earlier version compared purchases INSIDE the window against purchases
-- BEFORE it. That fails on this data: both SYNERP and production hold only
-- about two months of purchase history, so a 12-month window swallowed
-- everything and left no baseline - the report came back empty. Worse, the
-- most interesting items (bought several times recently, rising each time)
-- were exactly the ones excluded.
--
-- So: for each item+uom, PriceNow is its MOST RECENT purchase date, and
-- PriceBefore is the weighted average of everything bought EARLIER. The date
-- range now only bounds which purchases are considered at all. Any item with
-- two or more purchase dates appears; one purchase means nothing to compare
-- and is correctly absent.
--
-- GROUPED BY UomId, NEVER UomName. The document tables store 'EA' on some
-- rows and 'Each' on others for the same unit, so grouping on the text would
-- split one item in two and compare a per-piece price with a per-box one.
-- UomId is populated on 100% of PO lines and is the reliable key.
--
-- Prices are converted to base currency (UnitPrice * ExchangeRate) before any
-- comparison, so an FX move never reads as a price rise. Draft and Cancelled
-- orders are excluded - a baseline is built from committed purchases.
--
-- Negative rows are genuine savings and are deliberately kept.
--
-- Read-only. Creates one procedure. Changes no existing object.
-- =====================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

CREATE OR ALTER PROCEDURE proj.sp_ReportPriceVariance
    @DateFrom          DATE = NULL,   -- default: 12 months before @DateTo
    @DateTo            DATE = NULL,   -- default: today
    @BudgetCategoryId  INT  = NULL,
    @SupplierId        INT  = NULL,
    @MinExtraSpend     DECIMAL(18,2) = NULL,   -- hide small money
    @TopN              INT  = 200
AS
BEGIN
    SET NOCOUNT ON;

    IF @DateTo   IS NULL SET @DateTo   = CAST(GETDATE() AS DATE);
    IF @DateFrom IS NULL SET @DateFrom = DATEADD(YEAR, -1, @DateTo);
    IF @TopN IS NULL OR @TopN < 1 SET @TopN = 200;
    IF @TopN > 2000 SET @TopN = 2000;

    ;WITH src AS (
        SELECT  pol.ItemId, pol.UomId, po.PoDate, po.SupplierId,
                pol.OrderedQty AS Qty,
                CAST(pol.UnitPrice * ISNULL(po.ExchangeRate, 1) AS DECIMAL(18,4)) AS PBase
        FROM       proj.TBL_PURCHASE_ORDER_LINE pol
        INNER JOIN proj.TBL_PURCHASE_ORDER      po ON po.PoId = pol.PoId
        WHERE  pol.IsActive = 1 AND po.IsActive = 1
          AND  pol.ItemId IS NOT NULL AND pol.OrderedQty > 0 AND pol.UnitPrice > 0
          AND  po.Status NOT IN ('Draft', 'Cancelled')
          AND  po.PoDate >= @DateFrom AND po.PoDate <= @DateTo
          AND (@SupplierId IS NULL OR po.SupplierId = @SupplierId)
    ),
    ranked AS (      -- each line tagged with its item's most recent purchase date
        SELECT *, MAX(PoDate) OVER (PARTITION BY ItemId, UomId) AS LatestDate
        FROM   src
    ),
    cur AS (         -- the most recent purchase date = "now"
        SELECT ItemId, UomId, SUM(Qty) AS QtyNow,
               SUM(Qty * PBase) / SUM(Qty) AS PriceNow,
               COUNT(*) AS LinesNow, COUNT(DISTINCT SupplierId) AS SuppliersNow,
               MAX(PoDate) AS LastPoDate
        FROM ranked WHERE PoDate = LatestDate
        GROUP BY ItemId, UomId
    ),
    prv AS (         -- everything earlier = the baseline
        SELECT ItemId, UomId, SUM(Qty * PBase) / SUM(Qty) AS PriceBefore,
               COUNT(*) AS LinesBefore, MAX(PoDate) AS PrevPoDate
        FROM ranked WHERE PoDate < LatestDate
        GROUP BY ItemId, UomId
    )
    SELECT TOP (@TopN)
           c.ItemId, i.ItemCode, i.ItemName, u.UomCode, c.UomId,
           bc.CategoryName AS BudgetCategory,
           c.QtyNow,
           CAST(c.PriceNow    AS DECIMAL(18,4)) AS PriceNow,
           CAST(p.PriceBefore AS DECIMAL(18,4)) AS PriceBefore,
           CAST(((c.PriceNow - p.PriceBefore) / p.PriceBefore) * 100 AS DECIMAL(18,2)) AS ChangePct,
           CAST((c.PriceNow - p.PriceBefore) * c.QtyNow AS DECIMAL(18,2)) AS ExtraSpend,
           CAST(c.PriceNow * c.QtyNow AS DECIMAL(18,2)) AS SpendNow,
           c.LinesNow, c.SuppliersNow, p.LinesBefore, c.LastPoDate, p.PrevPoDate
    FROM       cur c
    INNER JOIN prv p ON p.ItemId = c.ItemId AND p.UomId = c.UomId   -- needs a baseline
    LEFT  JOIN proj.TBL_ITEM i ON i.ItemId = c.ItemId
    LEFT  JOIN proj.TBL_ITEM_UOM u ON u.UomId = c.UomId
    LEFT  JOIN proj.TBL_JOB_EXPENSE_CATEGORY bc ON bc.ExpenseCategoryId = i.BudgetCategoryId
    WHERE  p.PriceBefore > 0
      AND (@BudgetCategoryId IS NULL OR i.BudgetCategoryId = @BudgetCategoryId)
      AND (@MinExtraSpend IS NULL OR ABS((c.PriceNow - p.PriceBefore) * c.QtyNow) >= @MinExtraSpend)
    ORDER BY ExtraSpend DESC;   -- money first, not percentage
END
GO

-- ── verification ─────────────────────────────────────────────────────
SELECT Item   = 'sp_ReportPriceVariance',
       Status = CASE WHEN OBJECT_ID('proj.sp_ReportPriceVariance', 'P') IS NULL
                     THEN 'MISSING' ELSE 'OK' END;
GO
