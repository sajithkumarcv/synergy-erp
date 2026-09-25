-- Job Overview > Budget vs Actual: PO / Issue / Return per cost category.
--   PO     = committed PO value (same rules as VW_JOB_COST_ACTUAL: not Draft/Cancelled, costed job types only)
--   Issue  = confirmed stock issue notes, INCLUDE-in-costing only (EXC_COSTING stock is already costed via its PO),
--            qty * UnitCost, category taken from the item's BudgetCategoryId
--   Return = confirmed/approved returns against those same INC_COSTING issue notes, ReturnQty * UnitCost
-- Items with no BudgetCategoryId come back with CostCategoryId = NULL (shown as "Unallocated").
-- VW_JOB_COST_ACTUAL is deliberately NOT changed: sp_GetJobOverview already adds issues and subtracts
-- returns at job level, so putting them in the view would double count there.
CREATE OR ALTER PROCEDURE PROJ.sp_GetJobBudgetBreakdown
    @JobId NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;

    WITH Parts AS (
        SELECT po.ExpenseCategoryId AS CostCategoryId,
               proj.fn_ToBase(pol.OrderedQty * pol.UnitPrice, po.ExchangeRate) AS PoAmount,
               CAST(0 AS DECIMAL(18,2)) AS IssueAmount,
               CAST(0 AS DECIMAL(18,2)) AS ReturnAmount
        FROM PROJ.TBL_PURCHASE_ORDER po
        JOIN PROJ.TBL_PURCHASE_ORDER_LINE pol ON pol.PoId = po.PoId AND pol.IsActive = 1
        JOIN PROJ.TBL_JOB j ON j.JobId = po.JobId
        JOIN PROJ.TBL_JOBTYPE jt ON jt.JobTypeId = j.JobTypeId
        WHERE po.JobId = @JobId AND po.IsActive = 1
          AND po.Status NOT IN ('Draft','Cancelled') AND po.ExpenseCategoryId IS NOT NULL
          AND ISNULL(jt.IsCostingRequired, 1) = 1

        UNION ALL
        SELECT itm.BudgetCategoryId, 0, il.Qty * il.UnitCost, 0
        FROM PROJ.TBL_STOCK_ISSUE i
        JOIN PROJ.TBL_STOCK_ISSUE_LINE il ON il.IssueId = i.IssueId AND il.IsActive = 1
        LEFT JOIN PROJ.TBL_ITEM itm ON itm.ItemId = il.ItemId
        WHERE i.JobId = @JobId AND i.IsActive = 1
          AND i.Status = 'Confirmed' AND i.CostingType = 'INC_COSTING'

        UNION ALL
        SELECT itm.BudgetCategoryId, 0, 0, rl.ReturnQty * rl.UnitCost
        FROM PROJ.TBL_STOCK_ISSUE_RETURN r
        JOIN PROJ.TBL_STOCK_ISSUE_RETURN_LINE rl ON rl.ReturnId = r.ReturnId
        JOIN PROJ.TBL_STOCK_ISSUE ri ON ri.IssueId = r.IssueId
        LEFT JOIN PROJ.TBL_ITEM itm ON itm.ItemId = rl.ItemId
        WHERE ri.JobId = @JobId AND r.IsActive = 1
          AND r.Status IN ('Confirmed','Approved') AND ri.CostingType = 'INC_COSTING'
    )
    SELECT CostCategoryId,
           SUM(PoAmount)     AS PoAmount,
           SUM(IssueAmount)  AS IssueAmount,
           SUM(ReturnAmount) AS ReturnAmount
    FROM Parts
    GROUP BY CostCategoryId;
END
