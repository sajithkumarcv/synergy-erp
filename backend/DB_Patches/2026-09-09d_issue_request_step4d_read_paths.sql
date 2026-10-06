-- 2026-09-09: Issue Request — BUILD STEP 4d of 5: make the read paths reservation-aware
--
-- Apply to: ERPDB
-- Requires: 2026-09-09 / b / c
-- Design:   backend/Docs/DESIGN-issue-request.md §4 ("Available quantity")
--
-- A reservation that only some screens respect is worse than none, so the two
-- procs that OFFER stock for selection have to net it off. The four procs that
-- POST stock (sp_ConfirmGRN, sp_ConfirmStockIssue, sp_PostAdjustment,
-- sp_PostSubcontractReceipt) are moving stock rather than offering it and keep
-- using the raw quantities — they are deliberately not touched.
--
-- ⚠ THE TRAP THIS PATCH EXISTS TO AVOID ─────────────────────────────────────
-- Netting reservations off availability naively BREAKS ISSUING. An approved
-- request holding 5 units drops available to 0; the storekeeper then tries to
-- issue those very 5 units against that very request and is told there is no
-- stock. The note would be blocked by its own reservation.
--
-- So sp_GetStockAvailability takes @RequestId: the caller says which request it
-- is issuing against, and that request's OWN hold is added back. Free stock plus
-- what you already hold is exactly what you may draw on. Callers that pass no
-- @RequestId (stock enquiry screens) see the conservative number, which is right
-- for them.
--
-- sp_GetStockBalance only reports, so it just gains the two columns.
--
-- Idempotent — CREATE OR ALTER, safe to re-run.

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
GO

/* ═══ 1. sp_GetStockAvailability — what may this document draw on? ═════════
   Original body preserved; the only changes are @RequestId, the own-hold
   add-back, and Reserved/Available on the projection.                       */
CREATE OR ALTER PROCEDURE proj.sp_GetStockAvailability
    @ItemId      INT,
    @JobId       NVARCHAR(50)  = NULL,
    @CostingType NVARCHAR(20)  = 'INC_COSTING',
    @RequestId   INT           = NULL   -- NEW: issuing against this request
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @AvailableQty DECIMAL(18,4) = 0,
            @JobStock     DECIMAL(18,4) = 0,
            @StoreStock   DECIMAL(18,4) = 0,
            @Reserved     DECIMAL(18,4) = 0,
            @OwnHold      DECIMAL(18,4) = 0;

    SELECT @JobStock   = ISNULL(QtyJobStock,   0),
           @StoreStock = ISNULL(QtyStoreStock, 0),
           @Reserved   = ISNULL(QtyReserved,   0)
    FROM   proj.TBL_STOCK_BALANCE
    WHERE  ItemId = @ItemId;

    -- What THIS request already holds for this item — it is not competition,
    -- it is the whole point of having reserved.
    IF @RequestId IS NOT NULL
        SELECT @OwnHold = ISNULL(SUM(l.ReservedQty), 0)
        FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE l
        WHERE l.RequestId = @RequestId AND l.ItemId = @ItemId AND l.IsActive = 1;

    DECLARE @SourceJobId NVARCHAR(50) = NULL;
    SELECT TOP 1 @SourceJobId = j.JobId
    FROM proj.TBL_ITEM it
    JOIN proj.TBL_JOB        j  ON j.BudgetCategoryId = it.BudgetCategoryId
    JOIN proj.TBL_JOBTYPE    jt ON jt.JobTypeId = j.JobTypeId AND ISNULL(jt.IsBudgetHeaderLinked,0) = 1
    JOIN proj.TBL_JOB_STATUS js ON js.JobStatusId = j.JobStatusId AND ISNULL(js.IsClosed,0) = 0
    WHERE it.ItemId = @ItemId AND it.BudgetCategoryId IS NOT NULL
    ORDER BY j.JobCreatedDate DESC;

    IF @SourceJobId IS NOT NULL
    BEGIN
        -- In-house stock is IsJobStock=0; filter by JobId only
        SELECT @AvailableQty = ISNULL(SUM(QtyIn - QtyOut), 0)
        FROM  proj.TBL_STOCK_LEDGER
        WHERE ItemId = @ItemId AND JobId = @SourceJobId;
    END
    ELSE IF @CostingType = 'EXC_COSTING' AND @JobId IS NOT NULL
    BEGIN
        SELECT @AvailableQty =
            ISNULL(SUM(CASE WHEN QtyIn  > 0 AND IsJobStock = 1 AND JobId = @JobId THEN QtyIn  ELSE 0 END), 0)
          - ISNULL(SUM(CASE WHEN QtyOut > 0                    AND JobId = @JobId THEN QtyOut ELSE 0 END), 0)
        FROM  proj.TBL_STOCK_LEDGER
        WHERE ItemId = @ItemId;
    END
    ELSE
    BEGIN
        -- Store stock, net of everyone else's holds, plus this request's own.
        SET @AvailableQty = @StoreStock - @Reserved + @OwnHold;
        IF @AvailableQty < 0 SET @AvailableQty = 0;
    END

    SELECT
        @ItemId       AS ItemId,
        @JobId        AS JobId,
        @CostingType  AS CostingType,
        ISNULL(@AvailableQty, 0) AS AvailableQty,
        @JobStock     AS JobStock,
        @StoreStock   AS StoreStock,
        @Reserved     AS ReservedQty,        -- NEW: held for other requests too
        @OwnHold      AS OwnReservedQty,     -- NEW: of which, held by @RequestId
        @SourceJobId  AS SourceInHouseJobId;
END;
GO

/* ═══ 2. sp_GetStockBalance — show the hold on the stock screens ═══════════
   Reporting only, so no behaviour change: two extra columns. Without them a
   storekeeper sees 10 on hand, cannot see that 6 are spoken for, and promises
   them twice.                                                                */
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
        ISNULL(b.QtyReserved,  0) AS QtyReserved,     -- NEW
        ISNULL(b.QtyAvailable, 0) AS QtyAvailable,    -- NEW
        ISNULL(b.AvgUnitCost,  0) AS AvgUnitCost,
        CAST(ISNULL(b.QtyOnHand,0) * ISNULL(b.AvgUnitCost,0) AS DECIMAL(18,4)) AS StockValue,
        b.LastReceiptDate, b.LastIssueDate, b.UpdatedDate
    FROM proj.TBL_ITEM i
    LEFT  JOIN proj.TBL_STOCK_BALANCE  b  ON b.ItemId     = i.ItemId
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

/* ─── Verify ────────────────────────────────────────────────────────────── */
SELECT 'sp_GetStockAvailability @RequestId' AS Item,
       CASE WHEN OBJECT_DEFINITION(OBJECT_ID('proj.sp_GetStockAvailability')) LIKE '%@RequestId%'
            THEN 'OK' ELSE 'MISSING' END AS Result
UNION ALL
SELECT 'sp_GetStockBalance QtyAvailable',
       CASE WHEN OBJECT_DEFINITION(OBJECT_ID('proj.sp_GetStockBalance')) LIKE '%QtyAvailable%'
            THEN 'OK' ELSE 'MISSING' END;
GO
