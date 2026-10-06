-- 2026-09-07: Issue Request — BUILD STEP 3d of 5: expose the request link on the note
--
-- Apply to: ERPDB
-- Requires: 2026-09-07f/g/h
--
-- sp_GetStockIssue feeds the Issue Note detail page. It selects an explicit column
-- list, so the columns added in 3a were invisible to the application: the header
-- had no RequestId and the lines no RequestLineId. Without them the "Pull from
-- Request" button never renders, and editing a pulled line silently unlinks it.
--
-- Purely additive — four new columns on the two result sets, nothing removed or
-- renamed, so existing consumers are unaffected.
--
-- Idempotent — CREATE OR ALTER, safe to re-run.

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE proj.sp_GetStockIssue
    @IssueId INT           = NULL,
    @IssueNo NVARCHAR(30)  = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Id INT = @IssueId;
    IF @Id IS NULL OR @Id = 0
        SELECT @Id = IssueId FROM proj.TBL_STOCK_ISSUE WHERE IssueNo = @IssueNo AND IsActive = 1;

    -- Header (with job customer/project info + actual ledger posting datetime)
    SELECT i.IssueId, i.IssueNo, i.IssueDate, i.JobId, i.CostingType,
           i.IssuedTo, i.Notes, i.Status,
           i.CreatedBy, i.CreatedDate, i.ModifiedBy, i.ModifiedDate,
           j.CustomerName, j.ProjectName,
           -- NEW: the Issue Request this note satisfies
           i.RequestId, i.IssueTypeId,
           r.RequestNo, r.Status AS RequestStatus,
           (SELECT TOP 1 sl.TransDate
            FROM proj.TBL_STOCK_LEDGER sl
            WHERE sl.TransType = 'ISSUE' AND sl.RefId = i.IssueId
            ORDER BY sl.LedgerId DESC)  AS PostedDate
    FROM   proj.TBL_STOCK_ISSUE i
    LEFT   JOIN proj.VW_JOB j ON j.JobId = i.JobId
    LEFT   JOIN proj.TBL_STOCK_ISSUE_REQUEST r ON r.RequestId = i.RequestId
    WHERE  i.IssueId = @Id AND i.IsActive = 1;

    -- Lines
    SELECT l.IssueLineId, l.IssueId, l.LineNum,
           l.ItemId, it.ItemCode, it.ItemName, l.ItemDesc,
           l.Qty, l.UomId, u.UomName, l.UnitCost,
           CAST(l.Qty * l.UnitCost AS DECIMAL(18,4)) AS TotalCost,
           l.Notes, l.CreatedBy, l.CreatedDate, l.ModifiedBy, l.ModifiedDate,
           -- NEW: the request line this satisfies, so an edit keeps the link
           l.RequestLineId
    FROM   proj.TBL_STOCK_ISSUE_LINE l
    INNER  JOIN proj.TBL_ITEM     it ON it.ItemId = l.ItemId
    LEFT   JOIN proj.TBL_ITEM_UOM u  ON u.UomId   = l.UomId
    WHERE  l.IssueId = @Id AND l.IsActive = 1
    ORDER  BY l.LineNum;
END;
GO

/* Verify */
SELECT CASE WHEN OBJECT_DEFINITION(OBJECT_ID('proj.sp_GetStockIssue')) LIKE '%RequestLineId%'
             AND OBJECT_DEFINITION(OBJECT_ID('proj.sp_GetStockIssue')) LIKE '%RequestStatus%'
            THEN 'OK - patched' ELSE 'NOT PATCHED' END AS Result;
GO
