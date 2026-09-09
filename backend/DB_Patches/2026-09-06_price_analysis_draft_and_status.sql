-- =====================================================================
-- 2026-09-06  Item PO price analysis - include Draft on request, and
--             return the PO status
--
-- APPLY TO: SYNERP (dev) first. Production after sign-off.
--
-- Driven by the "last purchase price" popup on the PR-import grid
-- (PO Lines tab), which must show Draft-and-above orders and display
-- the status of each one.
--
-- TWO CHANGES, both deliberately conservative:
--
--   1. New parameter @IncludeDraft BIT = 0.
--      DEFAULT 0 REPRODUCES THE EXISTING BEHAVIOUR EXACTLY - Draft and
--      Cancelled excluded - so the Item Price Analysis screen, which does
--      not pass the parameter, keeps the same KPIs, trend and averages it
--      shows today. Only a caller passing 1 sees Draft orders.
--      Cancelled stays excluded either way: a cancelled order is not a
--      purchase at any status level.
--
--   2. RS3 (the detail rows) now also returns Status. Purely additive -
--      the analysis page ignores the extra column.
--
-- NOTE: this procedure previously existed only in the database; there was
-- no script for it anywhere in the repository. This file is now its
-- source of record. It was reconstructed from OBJECT_DEFINITION on
-- 2026-09-06; everything outside the two changes above is verbatim.
--
-- Changes one procedure. No table or data change.
-- =====================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

CREATE OR ALTER PROCEDURE PROJ.sp_GetItemPoPriceAnalysis
    @ItemId       INT,
    @DateFrom     DATE = NULL,
    @DateTo       DATE = NULL,
    @SupplierId   INT  = NULL,
    @IncludeDraft BIT  = 0
AS
BEGIN
    SET NOCOUNT ON;

    -- ── Base set: one row per PO line for this item (base-currency price) ──
    SELECT
        pol.PoLineId,
        po.PoId,
        po.PoNumber,
        po.PoDate,
        po.Status,
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
      AND po.Status <> 'Cancelled'
      AND (@IncludeDraft = 1 OR po.Status <> 'Draft')
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
    -- Status added 2026-09-06 for the last-purchase popup.
    SELECT
        PoId, PoNumber, PoDate, Status, SupplierName, UomName,
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

-- ── verification ─────────────────────────────────────────────────────
SELECT Item   = 'sp_GetItemPoPriceAnalysis - @IncludeDraft',
       Status = CASE WHEN EXISTS (SELECT 1 FROM sys.parameters
                                  WHERE object_id = OBJECT_ID('proj.sp_GetItemPoPriceAnalysis')
                                    AND name = '@IncludeDraft')
                     THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'sp_GetItemPoPriceAnalysis - Status in detail',
       CASE WHEN CHARINDEX('PoId, PoNumber, PoDate, Status',
                ISNULL(OBJECT_DEFINITION(OBJECT_ID('proj.sp_GetItemPoPriceAnalysis')), '')) > 0
            THEN 'OK' ELSE 'MISSING' END;
GO
