/* =====================================================================================================
   2026-11-14h: "Stock Revaluations" screen (Inventory menu). Needs 2026-11-14g.
   1. proj.sp_GetStockRevaluations   - one row per revaluation (PO line price change, or GRN cancel), newest first
        @DateFrom / @DateTo optional (revaluation date), @SearchText optional (item code/name, PO, GRN, job)
   2. proj.sp_GetStockRevaluationDetail @RevalId - two calls from the API (no QueryMultiple):
        @Part = 'GRN'  the GRN lines revalued; @Part = 'JOB'  the job cost charges / credits
   3. Menu 1126 "Stock Revaluations" under INVENTORY (menu 14), /inventory-revaluations, view rights for every
      role that can view Stock Balance (menu 19). Idempotent.
   ===================================================================================================== */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

CREATE OR ALTER PROCEDURE proj.sp_GetStockRevaluations
    @DateFrom   DATE          = NULL,
    @DateTo     DATE          = NULL,
    @SearchText NVARCHAR(200) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET @SearchText = NULLIF(LTRIM(RTRIM(@SearchText)), N'');

    SELECT r.RevalId, r.RevalDate, r.Source, r.PoId, r.PoNumber, r.PoLineId, r.GrnId,
           g.GrnNumber AS CancelledGrnNumber,
           r.ItemId, i.ItemCode, i.ItemName, u.UomCode AS BaseUom,
           r.ReceivedQty, r.ValueChange, r.StockQty, r.StockValueChange, r.IssuedQty, r.JobValueChange,
           r.NotChargedValueChange, r.AvgCostBefore, r.AvgCostAfter, r.Note, r.CreatedBy,
           grns.GrnNumbers, jobs.JobIds
    FROM   proj.TBL_STOCK_REVALUATION r
    JOIN   proj.TBL_ITEM i ON i.ItemId = r.ItemId
    LEFT JOIN proj.TBL_ITEM_UOM u ON u.UomId = i.BaseUomId
    LEFT JOIN proj.TBL_GRN_HEADER g ON g.GrnId = r.GrnId
    OUTER APPLY (SELECT STRING_AGG(h.GrnNumber, N', ') AS GrnNumbers
                 FROM (SELECT DISTINCT rg.GrnId FROM proj.TBL_STOCK_REVALUATION_GRN rg WHERE rg.RevalId = r.RevalId) x
                 JOIN proj.TBL_GRN_HEADER h ON h.GrnId = x.GrnId) grns
    OUTER APPLY (SELECT STRING_AGG(x.JobId, N', ') AS JobIds
                 FROM (SELECT DISTINCT a.JobId FROM proj.TBL_JOB_COST_ADJUSTMENT a WHERE a.RevalId = r.RevalId) x) jobs
    WHERE  (@DateFrom IS NULL OR CAST(r.RevalDate AS DATE) >= @DateFrom)
      AND  (@DateTo   IS NULL OR CAST(r.RevalDate AS DATE) <= @DateTo)
      AND  (@SearchText IS NULL
            OR i.ItemCode LIKE N'%' + @SearchText + N'%'
            OR i.ItemName LIKE N'%' + @SearchText + N'%'
            OR r.PoNumber LIKE N'%' + @SearchText + N'%'
            OR g.GrnNumber LIKE N'%' + @SearchText + N'%'
            OR grns.GrnNumbers LIKE N'%' + @SearchText + N'%'
            OR jobs.JobIds LIKE N'%' + @SearchText + N'%')
    ORDER BY r.RevalId DESC;
END
GO

CREATE OR ALTER PROCEDURE proj.sp_GetStockRevaluationDetail
    @RevalId INT,
    @Part    NVARCHAR(10) = N'GRN'
AS
BEGIN
    SET NOCOUNT ON;
    IF @Part = N'JOB'
        SELECT a.AdjId, a.JobId, j.ProjectName, a.CostCategoryId, c.CategoryName AS CostCategoryName,
               a.Amount, a.IssueId, a.IssueNo, a.Qty, a.Note, a.CreatedBy, a.CreatedDate
        FROM   proj.TBL_JOB_COST_ADJUSTMENT a
        LEFT JOIN proj.TBL_JOB j ON j.JobId = a.JobId
        LEFT JOIN proj.TBL_JOB_EXPENSE_CATEGORY c ON c.ExpenseCategoryId = a.CostCategoryId
        WHERE  a.RevalId = @RevalId
        ORDER BY a.AdjId;
    ELSE
        SELECT rg.RevalGrnId, rg.GrnId, h.GrnNumber, h.ReceivedDate, rg.GrnDetailId, d.LineNum,
               rg.QtyBase, rg.UnitCostBefore, rg.UnitCostAfter, rg.StockQty, rg.StockValueChange,
               rg.IssuedQty, rg.JobValueChange, rg.NotChargedValue
        FROM   proj.TBL_STOCK_REVALUATION_GRN rg
        LEFT JOIN proj.TBL_GRN_HEADER h ON h.GrnId = rg.GrnId
        LEFT JOIN proj.TBL_GRN_DETAIL d ON d.GrnDetailId = rg.GrnDetailId
        WHERE  rg.RevalId = @RevalId
        ORDER BY rg.RevalGrnId;
END
GO

-- ── Menu ───────────────────────────────────────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM proj.TBL_MENU WHERE MenuId = 14)
    THROW 50000, 'Parent menu 14 (INVENTORY) not found. Aborting.', 1;
GO
IF EXISTS (SELECT 1 FROM proj.TBL_MENU WHERE MenuId = 1126 AND MenuUrl <> '/inventory-revaluations')
    THROW 50000, 'MenuId 1126 already exists with a DIFFERENT MenuUrl. Choose another MenuId. Aborting.', 1;
GO
IF NOT EXISTS (SELECT 1 FROM proj.TBL_MENU WHERE MenuId = 1126)
BEGIN
    SET IDENTITY_INSERT proj.TBL_MENU ON;
    INSERT INTO proj.TBL_MENU (MenuId, ParentMenuId, MenuName, MenuUrl, MenuIcon, MenuOrder, IsActive)
    VALUES (1126, 14, 'Stock Revaluations', '/inventory-revaluations', 'inventory', 9, 1);
    SET IDENTITY_INSERT proj.TBL_MENU OFF;
END
GO
INSERT INTO proj.TBL_ROLE_MENU (RoleId, MenuId, CanView)
SELECT rm.RoleId, 1126, 1
FROM   proj.TBL_ROLE_MENU rm
WHERE  rm.MenuId = 19 AND rm.CanView = 1
  AND  NOT EXISTS (SELECT 1 FROM proj.TBL_ROLE_MENU x WHERE x.RoleId = rm.RoleId AND x.MenuId = 1126);
GO
SELECT MenuId, ParentMenuId, MenuName, MenuUrl, MenuOrder FROM proj.TBL_MENU WHERE MenuId = 1126;
SELECT RoleId, MenuId, CanView FROM proj.TBL_ROLE_MENU WHERE MenuId = 1126;
GO
