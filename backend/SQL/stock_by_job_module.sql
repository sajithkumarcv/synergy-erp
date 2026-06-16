-- ═══════════════════════════════════════════════════════════════════
-- Stock by Job (Inventory) Module
-- Run once against ERPDB. All objects under PROJ schema.
--
-- Purpose: show current JOB-DIRECT stock on hand, grouped by job — and
-- by job type / customer / status on the client. Store (general) stock
-- is not job-tagged, so this view covers job stock only (IsJobStock = 1).
--
-- Source of truth = proj.TBL_STOCK_LEDGER (per item, per job):
--   QtyBalance = SUM(QtyIn - QtyOut)
--   Value      = SUM(QtyIn*UnitCost - QtyOut*UnitCost)   (net cost movement)
-- mirrors the existing sp_GetJobStockBreakdown (per item, all jobs).
-- ═══════════════════════════════════════════════════════════════════

-- ====================================================================
-- sp_GetStockByJob
--   One row per job holding stock, with its type/customer/status and
--   the item count, total qty and total value of job stock on hand.
-- ====================================================================
CREATE OR ALTER PROCEDURE PROJ.sp_GetStockByJob
    @SearchText NVARCHAR(200) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH JobItem AS (
        SELECT
            l.JobId,
            l.ItemId,
            SUM(l.QtyIn - l.QtyOut)                          AS QtyBalance,
            SUM(l.QtyIn * l.UnitCost - l.QtyOut * l.UnitCost) AS ValueBalance
        FROM proj.TBL_STOCK_LEDGER l
        WHERE l.IsJobStock = 1
          AND l.JobId IS NOT NULL
        GROUP BY l.JobId, l.ItemId
        HAVING SUM(l.QtyIn - l.QtyOut) > 0
    ),
    JobAgg AS (
        SELECT
            ji.JobId,
            COUNT(*)              AS ItemCount,
            SUM(ji.QtyBalance)    AS TotalQty,
            SUM(ji.ValueBalance)  AS TotalValue
        FROM JobItem ji
        GROUP BY ji.JobId
    )
    SELECT
        a.JobId,
        j.ProjectName,
        j.JobDescription,
        j.JobTypeId,
        jt.JobTypeName,
        j.CustomerId,
        c.CustomerName,
        j.JobStatusId,
        js.StatusName               AS JobStatusName,
        a.ItemCount,
        a.TotalQty,
        a.TotalValue
    FROM JobAgg a
    INNER JOIN proj.TBL_JOB          j  ON j.JobId       = a.JobId
    LEFT  JOIN proj.TBL_JOBTYPE      jt ON jt.JobTypeId  = j.JobTypeId
    LEFT  JOIN proj.TBL_CUSTOMER     c  ON c.CustomerId  = j.CustomerId
    LEFT  JOIN proj.TBL_JOB_STATUS   js ON js.JobStatusId = j.JobStatusId
    WHERE (@SearchText IS NULL
           OR a.JobId          LIKE '%' + @SearchText + '%'
           OR j.ProjectName    LIKE '%' + @SearchText + '%'
           OR c.CustomerName   LIKE '%' + @SearchText + '%'
           OR jt.JobTypeName   LIKE '%' + @SearchText + '%')
    ORDER BY a.TotalValue DESC, a.JobId;
END;
GO

-- ====================================================================
-- sp_GetJobStockItems
--   Item-level job stock on hand for one job (drill-down).
-- ====================================================================
CREATE OR ALTER PROCEDURE PROJ.sp_GetJobStockItems
    @JobId NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        i.ItemId,
        i.ItemCode,
        i.ItemName,
        cat.CategoryName,
        u.UomName                                            AS BaseUom,
        SUM(l.QtyIn - l.QtyOut)                              AS QtyBalance,
        CASE WHEN SUM(l.QtyIn - l.QtyOut) > 0
             THEN SUM(l.QtyIn * l.UnitCost - l.QtyOut * l.UnitCost) / SUM(l.QtyIn - l.QtyOut)
             ELSE 0 END                                      AS AvgUnitCost,
        SUM(l.QtyIn * l.UnitCost - l.QtyOut * l.UnitCost)    AS StockValue,
        MAX(l.TransDate)                                     AS LastMovementDate
    FROM proj.TBL_STOCK_LEDGER l
    INNER JOIN proj.TBL_ITEM          i   ON i.ItemId     = l.ItemId
    LEFT  JOIN proj.TBL_ITEM_CATEGORY cat ON cat.CategoryId = i.CategoryId
    LEFT  JOIN proj.TBL_ITEM_UOM      u   ON u.UomId      = i.BaseUomId
    WHERE l.IsJobStock = 1
      AND l.JobId = @JobId
    GROUP BY i.ItemId, i.ItemCode, i.ItemName, cat.CategoryName, u.UomName
    HAVING SUM(l.QtyIn - l.QtyOut) > 0
    ORDER BY i.ItemCode;
END;
GO

-- ───────────────────────────────────────────────────────────────────
-- MENU — add "Stock by Job" under Inventory (parent 14), after Stock Balance
-- ───────────────────────────────────────────────────────────────────
INSERT INTO proj.TBL_MENU (ParentMenuId, MenuName, MenuUrl, MenuIcon, MenuOrder, IsActive)
SELECT
    bal.ParentMenuId,
    N'Stock by Job',
    N'/inventory-stock-by-job',
    bal.MenuIcon,
    bal.MenuOrder + 1,
    1
FROM proj.TBL_MENU bal
WHERE bal.MenuUrl = N'/inventory-balance'
  AND NOT EXISTS (SELECT 1 FROM proj.TBL_MENU WHERE MenuUrl = N'/inventory-stock-by-job');

UPDATE proj.TBL_MENU
SET    MenuOrder = MenuOrder + 1
WHERE  ParentMenuId = (SELECT ParentMenuId FROM proj.TBL_MENU WHERE MenuUrl = N'/inventory-balance')
  AND  MenuUrl NOT IN (N'/inventory-stock-by-job', N'/inventory-balance')
  AND  MenuOrder >= (SELECT MenuOrder FROM proj.TBL_MENU WHERE MenuUrl = N'/inventory-balance') + 1;
GO
