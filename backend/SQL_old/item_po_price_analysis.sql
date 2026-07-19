-- ═══════════════════════════════════════════════════════════════════
-- Item PO Price Analysis  (Procurement / Inventory)
-- Run once against ERPDB. All objects under PROJ schema.
--
-- Purpose: analyse the PURCHASE-ORDER unit price paid for one item over a
-- date interval — trend over time, weighted average, min/max, and a
-- per-vendor comparison. Mirrors SAP ME1P (PO price history) / Odoo
-- Purchase Analysis. Prices are normalised to BASE currency
-- (UnitPrice * PO ExchangeRate). Draft/Cancelled POs are excluded.
--
-- Source tables: proj.TBL_PURCHASE_ORDER (header: PoDate, SupplierId,
--   VendorName, CurrencyId, ExchangeRate, Status) and
--   proj.TBL_PURCHASE_ORDER_LINE (ItemId, OrderedQty, UnitPrice).
-- ═══════════════════════════════════════════════════════════════════

CREATE OR ALTER PROCEDURE PROJ.sp_GetItemPoPriceAnalysis
    @ItemId     INT,
    @DateFrom   DATE = NULL,
    @DateTo     DATE = NULL,
    @SupplierId INT  = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- ── Base set: one row per PO line for this item (base-currency price) ──
    SELECT
        pol.PoLineId,
        po.PoId,
        po.PoNumber,
        po.PoDate,
        po.SupplierId,
        COALESCE(s.SupplierName, po.VendorName)         AS SupplierName,
        cur.ShortName                                   AS CurrencyShort,
        po.ExchangeRate,
        pol.OrderedQty,
        pol.UnitPrice,                                  -- original currency
        CAST(pol.UnitPrice * po.ExchangeRate AS DECIMAL(18,4)) AS UnitPriceBase,
        pol.UomName
    INTO #Pts
    FROM proj.TBL_PURCHASE_ORDER_LINE pol
    INNER JOIN proj.TBL_PURCHASE_ORDER po  ON po.PoId       = pol.PoId
    LEFT  JOIN proj.TBL_SUPPLIER       s   ON s.SupplierId  = po.SupplierId
    LEFT  JOIN proj.TBL_CURRENCY       cur ON cur.CurrencyId = po.CurrencyId
    WHERE pol.IsActive = 1
      AND po.IsActive  = 1
      AND po.Status NOT IN ('Draft','Cancelled')
      AND pol.ItemId   = @ItemId
      AND pol.OrderedQty > 0
      AND (@SupplierId IS NULL OR po.SupplierId = @SupplierId)
      AND (@DateFrom   IS NULL OR po.PoDate >= @DateFrom)
      AND (@DateTo     IS NULL OR po.PoDate <= @DateTo);

    -- ── RS1: KPI summary (base currency) ──────────────────────────────────
    SELECT
        (SELECT TOP 1 UnitPriceBase FROM #Pts ORDER BY PoDate DESC, PoLineId DESC) AS LastPrice,
        (SELECT TOP 1 PoDate        FROM #Pts ORDER BY PoDate DESC, PoLineId DESC) AS LastPriceDate,
        (SELECT TOP 1 SupplierName  FROM #Pts ORDER BY PoDate DESC, PoLineId DESC) AS LastSupplier,
        CASE WHEN SUM(OrderedQty) > 0
             THEN CAST(SUM(UnitPriceBase * OrderedQty) / SUM(OrderedQty) AS DECIMAL(18,4))
             ELSE 0 END                                                            AS WeightedAvg,
        CAST(AVG(UnitPriceBase) AS DECIMAL(18,4))                                  AS SimpleAvg,
        MIN(UnitPriceBase)                                                         AS MinPrice,
        (SELECT TOP 1 SupplierName FROM #Pts ORDER BY UnitPriceBase ASC,  PoDate DESC) AS MinSupplier,
        MAX(UnitPriceBase)                                                         AS MaxPrice,
        (SELECT TOP 1 SupplierName FROM #Pts ORDER BY UnitPriceBase DESC, PoDate DESC) AS MaxSupplier,
        COUNT(*)                                                                   AS OrderLines,
        SUM(OrderedQty)                                                            AS TotalQty,
        -- % change: first price → last price across the interval
        CASE
            WHEN (SELECT TOP 1 UnitPriceBase FROM #Pts ORDER BY PoDate ASC, PoLineId ASC) > 0
            THEN CAST(
                ((SELECT TOP 1 UnitPriceBase FROM #Pts ORDER BY PoDate DESC, PoLineId DESC)
               - (SELECT TOP 1 UnitPriceBase FROM #Pts ORDER BY PoDate ASC,  PoLineId ASC))
               / (SELECT TOP 1 UnitPriceBase FROM #Pts ORDER BY PoDate ASC,  PoLineId ASC) * 100.0
               AS DECIMAL(18,2))
            ELSE 0 END                                                             AS ChangePct
    FROM #Pts;

    -- ── RS2: monthly trend (for the chart) ────────────────────────────────
    SELECT
        FORMAT(DATEFROMPARTS(YEAR(PoDate), MONTH(PoDate), 1), 'MMM yy')           AS MonthLabel,
        DATEFROMPARTS(YEAR(PoDate), MONTH(PoDate), 1)                              AS MonthStart,
        CAST(AVG(UnitPriceBase) AS DECIMAL(18,4))                                  AS AvgPrice,
        CASE WHEN SUM(OrderedQty) > 0
             THEN CAST(SUM(UnitPriceBase * OrderedQty) / SUM(OrderedQty) AS DECIMAL(18,4))
             ELSE 0 END                                                            AS WeightedAvg,
        MIN(UnitPriceBase)                                                         AS MinPrice,
        MAX(UnitPriceBase)                                                         AS MaxPrice,
        SUM(OrderedQty)                                                            AS OrderQty,
        COUNT(*)                                                                   AS OrderLines
    FROM #Pts
    GROUP BY DATEFROMPARTS(YEAR(PoDate), MONTH(PoDate), 1),
             FORMAT(DATEFROMPARTS(YEAR(PoDate), MONTH(PoDate), 1), 'MMM yy')
    ORDER BY MonthStart;

    -- ── RS3: detail rows (each PO line) ───────────────────────────────────
    SELECT
        PoId, PoNumber, PoDate, SupplierName, UomName,
        OrderedQty, UnitPrice, CurrencyShort, ExchangeRate, UnitPriceBase
    FROM #Pts
    ORDER BY PoDate DESC, PoLineId DESC;

    -- ── RS4: per-vendor comparison ────────────────────────────────────────
    SELECT
        SupplierId,
        SupplierName,
        COUNT(*)                                                                   AS OrderLines,
        SUM(OrderedQty)                                                            AS TotalQty,
        CASE WHEN SUM(OrderedQty) > 0
             THEN CAST(SUM(UnitPriceBase * OrderedQty) / SUM(OrderedQty) AS DECIMAL(18,4))
             ELSE 0 END                                                            AS WeightedAvg,
        MIN(UnitPriceBase)                                                         AS MinPrice,
        MAX(UnitPriceBase)                                                         AS MaxPrice,
        CAST(MAX(PoDate) AS DATE)                                                  AS LastOrderDate
    FROM #Pts
    GROUP BY SupplierId, SupplierName
    ORDER BY WeightedAvg;

    DROP TABLE #Pts;
END;
GO

-- ───────────────────────────────────────────────────────────────────
-- MENU — add "Item Price Analysis" under Inventory (parent 14), after Stock by Job
-- ───────────────────────────────────────────────────────────────────
INSERT INTO proj.TBL_MENU (ParentMenuId, MenuName, MenuUrl, MenuIcon, MenuOrder, IsActive)
SELECT
    sbj.ParentMenuId,
    N'Item Price Analysis',
    N'/item-price-analysis',
    sbj.MenuIcon,
    sbj.MenuOrder + 1,
    1
FROM proj.TBL_MENU sbj
WHERE sbj.MenuUrl = N'/inventory-stock-by-job'
  AND NOT EXISTS (SELECT 1 FROM proj.TBL_MENU WHERE MenuUrl = N'/item-price-analysis');

UPDATE proj.TBL_MENU
SET    MenuOrder = MenuOrder + 1
WHERE  ParentMenuId = (SELECT ParentMenuId FROM proj.TBL_MENU WHERE MenuUrl = N'/inventory-stock-by-job')
  AND  MenuUrl NOT IN (N'/item-price-analysis', N'/inventory-stock-by-job')
  AND  MenuOrder >= (SELECT MenuOrder FROM proj.TBL_MENU WHERE MenuUrl = N'/inventory-stock-by-job') + 1;
GO
