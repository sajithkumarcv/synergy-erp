-- 2026-11-15g: the item list of an "Include in Costing" Issue Note shows only items that have stock to issue.
--
-- Before: the item search listed every item matching the text; the stock check ("Available: 0") only ran after the item
-- was picked. Now sp_SearchIssueItemsInStock lists only items whose available quantity is above zero, using the same rule as
-- sp_GetStockAvailability for an Including-Costing note:
--   * the item belongs to a budget category that has an open in-house job -> that in-house job's stock balance (ledger);
--   * otherwise -> store stock minus the quantity held for other Issue Requests (plus this request's own hold when
--     @RequestId is given), never below zero.
-- Returns the same columns the item picker uses (ItemId, ItemCode, ItemName, BaseUomId) plus AvailableQty.
-- "Not Include in Costing" is unchanged: it uses the job's own items (sp_GetJobStockItems).
-- Read only. Idempotent (CREATE OR ALTER). Apply to: SYNERP, then each company DB. Run with sqlcmd -I.

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
SET NOCOUNT ON;
GO

CREATE OR ALTER PROCEDURE proj.sp_SearchIssueItemsInStock
    @SearchText NVARCHAR(200) = NULL,
    @RequestId  INT           = NULL,
    @PageSize   INT           = 20
AS
BEGIN
    SET NOCOUNT ON;
    IF @PageSize IS NULL OR @PageSize < 1 OR @PageSize > 200 SET @PageSize = 20;

    SELECT TOP (@PageSize)
           i.ItemId, i.ItemCode, i.ItemName, i.BaseUomId,
           CAST(av.Qty AS DECIMAL(18,4)) AS AvailableQty
    FROM proj.TBL_ITEM i
    LEFT JOIN proj.TBL_STOCK_BALANCE b ON b.ItemId = i.ItemId
    OUTER APPLY (
        SELECT TOP 1 j.JobId
        FROM proj.TBL_JOB j
        JOIN proj.TBL_JOBTYPE    jt ON jt.JobTypeId = j.JobTypeId AND ISNULL(jt.IsBudgetHeaderLinked, 0) = 1
        JOIN proj.TBL_JOB_STATUS js ON js.JobStatusId = j.JobStatusId AND ISNULL(js.IsClosed, 0) = 0
        WHERE i.BudgetCategoryId IS NOT NULL AND j.BudgetCategoryId = i.BudgetCategoryId
        ORDER BY j.JobCreatedDate DESC
    ) src
    CROSS APPLY (
        SELECT CASE
                 WHEN src.JobId IS NOT NULL
                   THEN (SELECT ISNULL(SUM(l.QtyIn - l.QtyOut), 0) FROM proj.TBL_STOCK_LEDGER l
                         WHERE l.ItemId = i.ItemId AND l.JobId = src.JobId)
                 ELSE (SELECT CASE WHEN x.v < 0 THEN 0 ELSE x.v END
                       FROM (SELECT ISNULL(b.QtyStoreStock, 0) - ISNULL(b.QtyReserved, 0)
                                    + ISNULL((SELECT SUM(rl.ReservedQty) FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE rl
                                              WHERE @RequestId IS NOT NULL AND rl.RequestId = @RequestId
                                                AND rl.ItemId = i.ItemId AND rl.IsActive = 1), 0) AS v) x)
               END AS Qty
    ) av
    WHERE i.IsActive = 1
      AND ISNULL(i.IsStockable, 1) = 1
      AND av.Qty > 0
      AND (@SearchText IS NULL
           OR i.ItemCode LIKE N'%' + @SearchText + N'%'
           OR i.ItemName LIKE N'%' + @SearchText + N'%')
    ORDER BY i.ItemCode, i.ItemName;
END
GO
