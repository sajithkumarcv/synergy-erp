-- =====================================================================
-- 2026-09-14  Price Variance report - Item Type / Category filters
--
-- APPLY TO: SYNERP (dev) first. Production after sign-off.
-- Requires: 2026-09-10_price_variance_report.sql already applied.
--
-- BUG: on Item Price Analysis -> "All items - price movement", changing the
-- Type / Category / Sub-category dropdowns did not change the list. The
-- screen never sent them and this proc had no parameter to receive them.
--
-- Adds @ItemTypeId and @CategoryId. @CategoryId uses the same rule as
-- sp_SearchItems (the item picker on the same screen): the category itself
-- OR any direct sub-category of it, so picking a top-level category includes
-- its sub-categories and picking a sub-category narrows to that one.
--
-- Also adds @SearchText: the item search box on that screen now filters the
-- list by item code / name / barcode (same columns sp_SearchItems matches).
--
-- Filters are applied in the src CTE, before the latest/baseline split and
-- before TOP, so a filtered list is complete rather than a subset of the
-- unfiltered top 200.
--
-- Both parameters default to NULL, so existing callers are unaffected.
-- Full-body CREATE OR ALTER of one read-only procedure. No table changes.
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
    @TopN              INT  = 200,
    @ItemTypeId        INT  = NULL,
    @CategoryId        INT  = NULL,   -- item category, includes its sub-categories
    @SearchText        NVARCHAR(100) = NULL   -- item code / name / barcode, contains
AS
BEGIN
    SET NOCOUNT ON;

    IF @DateTo   IS NULL SET @DateTo   = CAST(GETDATE() AS DATE);
    IF @DateFrom IS NULL SET @DateFrom = DATEADD(YEAR, -1, @DateTo);
    IF @TopN IS NULL OR @TopN < 1 SET @TopN = 200;
    IF @TopN > 2000 SET @TopN = 2000;
    SET @SearchText = NULLIF(LTRIM(RTRIM(@SearchText)), '');

    ;WITH src AS (
        SELECT  pol.ItemId, pol.UomId, po.PoDate, po.SupplierId,
                pol.OrderedQty AS Qty,
                CAST(pol.UnitPrice * ISNULL(po.ExchangeRate, 1) AS DECIMAL(18,4)) AS PBase
        FROM       proj.TBL_PURCHASE_ORDER_LINE pol
        INNER JOIN proj.TBL_PURCHASE_ORDER      po ON po.PoId = pol.PoId
        INNER JOIN proj.TBL_ITEM                it ON it.ItemId = pol.ItemId
        WHERE  pol.IsActive = 1 AND po.IsActive = 1
          AND  pol.OrderedQty > 0 AND pol.UnitPrice > 0
          AND  po.Status NOT IN ('Draft', 'Cancelled')
          AND  po.PoDate >= @DateFrom AND po.PoDate <= @DateTo
          AND (@SupplierId IS NULL OR po.SupplierId = @SupplierId)
          AND (@ItemTypeId IS NULL OR it.ItemTypeId = @ItemTypeId)
          AND (@CategoryId IS NULL
               OR it.CategoryId = @CategoryId
               OR EXISTS (SELECT 1 FROM proj.TBL_ITEM_CATEGORY sub
                          WHERE sub.CategoryId = it.CategoryId
                            AND sub.ParentCategoryId = @CategoryId))
          AND (@SearchText IS NULL
               OR it.ItemCode LIKE '%' + @SearchText + '%'
               OR it.ItemName LIKE '%' + @SearchText + '%'
               OR it.Barcode  LIKE '%' + @SearchText + '%')
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
SELECT Item   = 'sp_ReportPriceVariance @ItemTypeId/@CategoryId/@SearchText',
       Status = CASE WHEN EXISTS (SELECT 1 FROM sys.parameters
                                  WHERE object_id = OBJECT_ID('proj.sp_ReportPriceVariance')
                                    AND name IN ('@ItemTypeId', '@CategoryId', '@SearchText')
                                  HAVING COUNT(*) = 3)
                     THEN 'OK' ELSE 'MISSING' END;
GO
