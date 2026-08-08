/* ============================================================================
   Patch: Job list default sort — group by Job Type's configured display
   order (TBL_JOBTYPE.SortOrder), newest-created first within each type.

   Session: 2026-08-07, WebErp-Synergy / SYNERP.
   Applied to: SYNERP (dev) directly via the synerp MCP connector; verified
   against real data (EC=1, BT=2, OT=7, IH=10 -> jobs grouped in that order,
   newest-first within each group).

   Requires code deploy alongside this script:
     - frontend/src/jobs/Job.js
         (default sortCol='JobTypeName', sortDir='ASC' — was JobDate DESC;
          also default pageSize 20 -> 100, see companion note in memory —
          Pr.js and Po.js get the same pageSize change but need no DB step)
   No backend rebuild needed for this one — pure SQL + frontend.
   ============================================================================ */

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

-- ── 1. VW_JOB — expose the job type's own SortOrder ─────────────────────
ALTER VIEW [PROJ].[VW_JOB] AS
SELECT
    j.JobNumId, j.JobId, j.ApprovalStatus, j.ParentJobId, j.JobTypeId,
    jt.JobTypeName, jt.PreFix AS JobTypePrefix, jt.RequiresParentJob,
    jt.IsBudgetHeaderLinked, jt.IsCostingRequired, jt.SortOrder AS JobTypeSortOrder,
    j.JobStageId, js.JobStageName,
    j.CustomerId, c.CustomerName, c.CustomerCode,
    j.JobCurrencyId, cur.ShortName AS CurrencyName, cur.Symbol AS CurrencySymbol,
    j.JobExcRate, j.JobDescription, j.JobDate, j.ProjectName, j.LpoDate, j.ContractRef, j.LpoRef,
    j.JobStatusId, jst.StatusName AS JobStatusName, jst.IsClosed AS IsClosedStatus,
    j.ExternalRef, j.EndUserId,
    j.BudgetCategoryId, ec.CategoryName AS BudgetCategoryName, ec.CategoryCode AS BudgetCategoryCode,
    j.JobCreatedBy, j.JobCreatedDate, j.JobLastModifiedBy, j.JobLastUpdatedDate,
    j.BomId, j.PlannedQty, j.PlannedUomId,
    CASE WHEN bh.JobId IS NOT NULL THEN 1 ELSE 0 END AS HasBom,
    ISNULL(bh.BomVersion, 0)  AS BomVersion,
    ISNULL(bh.BomStatus,  0)  AS BomHeaderStatus,
    ISNULL(bh.TotalBomValue, 0) AS TotalBomValue,
    (SELECT COUNT(*) FROM proj.TBL_BOM_DETAILS bd WHERE bd.JobId = j.JobId AND bd.IsActive = 1) AS BomLineCount,
    ISNULL(f.OrderValue, 0) AS OrderValue,
    ISNULL((SELECT SUM(ActualAmount) FROM proj.VW_JOB_COST_ACTUAL vca WHERE vca.JobId = j.JobId), 0) AS TotalActual,
    ISNULL(f.TotalExpenses, 0) AS TotalExpenses,
    ISNULL(f.TotalInvoicing, 0) AS TotalInvoicing,
    ISNULL(f.TotalPayments, 0) AS TotalPayments,
    ISNULL(f.TotalCredit, 0) AS TotalCredit,
    ISNULL(f.JobAdvanceAmount, 0) AS JobAdvanceAmount,
    ISNULL(f.BalanceAmount, 0) AS BalanceAmount,
    ISNULL(f.IsLDApplicable, 0) AS IsLDApplicable,
    ISNULL(f.LDAmount, 0) AS LDAmount,
    f.LDPercent,
    d.JobPlannedStartDate, d.JobExpectedCompleteDate, d.JobActualCompleteDate,
    d.JobExpectedDeliveryDate, d.JobActualDeliveryDate
FROM proj.TBL_JOB j
LEFT JOIN proj.TBL_JOBTYPE      jt  ON j.JobTypeId     = jt.JobTypeId
LEFT JOIN proj.TBL_JOB_STAGE    js  ON j.JobStageId    = js.JobStageId
LEFT JOIN proj.TBL_JOB_STATUS   jst ON j.JobStatusId   = jst.JobStatusId
LEFT JOIN proj.TBL_CUSTOMER     c   ON j.CustomerId    = c.CustomerId
LEFT JOIN proj.TBL_CURRENCY     cur ON j.JobCurrencyId = cur.CurrencyId
LEFT JOIN proj.TBL_JOB_EXPENSE_CATEGORY ec ON j.BudgetCategoryId = ec.ExpenseCategoryId
OUTER APPLY (
    SELECT TOP 1 b.JobId, b.BomVersion, b.BomStatus, b.TotalBomValue
    FROM proj.TBL_BOM_HEADER b
    WHERE b.JobId = j.JobId AND b.IsActive = 1
    ORDER BY b.BomVersion DESC, b.BomHeaderId DESC
) bh
LEFT JOIN proj.TBL_JOB_FINANCE  f   ON j.JobId = f.JobId
LEFT JOIN proj.TBL_JOB_DATES    d   ON j.JobId = d.JobId
LEFT JOIN proj.TBL_JOB_META     m   ON j.JobId = m.JobId;
GO

-- ── 2. sp_SearchJobs — JobTypeName sort key now composite:
--       JobTypeSortOrder <dir>, JobCreatedDate DESC ──────────────────────
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
ALTER PROCEDURE PROJ.sp_SearchJobs
    @SearchText          NVARCHAR(200) = NULL,
    @JobTypeId           NVARCHAR(50)  = NULL,
    @JobStageId          NVARCHAR(10)  = NULL,
    @CustomerId          INT           = NULL,
    @JobStatusId         INT           = NULL,
    @JobStatusIds        NVARCHAR(200) = NULL,
    @DateFrom            DATE          = NULL,
    @DateTo              DATE          = NULL,
    @ExcludeClosedStatus BIT           = 0,
    @ApprovalStatus      NVARCHAR(20)  = NULL,
    @PageNumber          INT           = 1,
    @PageSize            INT           = 20,
    @SortColumn          NVARCHAR(50)  = 'JobCreatedDate',
    @SortDirection       NVARCHAR(4)   = 'DESC'
AS
BEGIN
    SET NOCOUNT ON;

    SET @SortColumn = CASE @SortColumn
        WHEN 'JobId'          THEN 'JobId'
        WHEN 'JobDate'        THEN 'JobDate'
        WHEN 'JobCreatedDate' THEN 'JobCreatedDate'
        WHEN 'CustomerName'   THEN 'CustomerName'
        WHEN 'JobTypeName'    THEN 'JobTypeName'
        WHEN 'JobStageName'   THEN 'JobStageName'
        WHEN 'ProjectName'    THEN 'ProjectName'
        WHEN 'OrderValue'     THEN 'OrderValue'
        WHEN 'CurrencySymbol' THEN 'CurrencySymbol'
        ELSE 'JobCreatedDate'
    END;
    SET @SortDirection = CASE WHEN UPPER(@SortDirection) = 'ASC' THEN 'ASC' ELSE 'DESC' END;

    -- Sorting by Job Type is a grouping sort — groups follow the job type's
    -- own configured display order (TBL_JOBTYPE.SortOrder, exposed on VW_JOB
    -- as JobTypeSortOrder), not alphabetical name, and within each group
    -- rows come out newest-created first via a fixed secondary key. Every
    -- other sortable column keeps its plain single-key ORDER BY as before.
    DECLARE @OrderByClause NVARCHAR(200) = CASE
        WHEN @SortColumn = 'JobTypeName' THEN N'JobTypeSortOrder ' + @SortDirection + N', JobCreatedDate DESC'
        ELSE @SortColumn + N' ' + @SortDirection
    END;

    DECLARE @Offset INT = (@PageNumber - 1) * @PageSize;

    DECLARE @SQL NVARCHAR(MAX) = N'
    WITH CTE AS (
        SELECT *, COUNT(*) OVER() AS TotalRows
        FROM PROJ.VW_JOB
        WHERE 1=1
    ';

    IF @SearchText IS NOT NULL AND @SearchText <> ''
        SET @SQL += N' AND (JobId LIKE ''%'' + @SearchText + ''%''
                        OR CustomerName LIKE ''%'' + @SearchText + ''%''
                        OR ProjectName  LIKE ''%'' + @SearchText + ''%''
                        OR ContractRef  LIKE ''%'' + @SearchText + ''%''
                        OR LpoRef       LIKE ''%'' + @SearchText + ''%'')';

    IF @JobTypeId        IS NOT NULL SET @SQL += N' AND JobTypeId  = @JobTypeId';
    IF @JobStageId       IS NOT NULL SET @SQL += N' AND JobStageId = @JobStageId';
    IF @CustomerId       IS NOT NULL SET @SQL += N' AND CustomerId = @CustomerId';
    IF @JobStatusId      IS NOT NULL SET @SQL += N' AND JobStatusId = @JobStatusId';
    IF @JobStatusIds IS NOT NULL AND @JobStatusIds <> ''
        SET @SQL += N' AND JobStatusId IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@JobStatusIds, '',''))';
    IF @DateFrom         IS NOT NULL SET @SQL += N' AND CAST(JobDate AS DATE) >= @DateFrom';
    IF @DateTo           IS NOT NULL SET @SQL += N' AND CAST(JobDate AS DATE) <= @DateTo';
    IF @ExcludeClosedStatus = 1      SET @SQL += N' AND (IsClosedStatus = 0 OR IsClosedStatus IS NULL)';
    IF @ApprovalStatus   IS NOT NULL SET @SQL += N' AND ApprovalStatus = @ApprovalStatus';

    SET @SQL += N')
    SELECT * FROM CTE
    ORDER BY ' + @OrderByClause + N'
    OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;';

    EXEC sp_executesql @SQL,
        N'@SearchText NVARCHAR(200), @JobTypeId NVARCHAR(50), @JobStageId NVARCHAR(10),
          @CustomerId INT, @JobStatusId INT, @JobStatusIds NVARCHAR(200),
          @DateFrom DATE, @DateTo DATE,
          @ExcludeClosedStatus BIT, @ApprovalStatus NVARCHAR(20), @Offset INT, @PageSize INT',
        @SearchText, @JobTypeId, @JobStageId, @CustomerId, @JobStatusId, @JobStatusIds,
        @DateFrom, @DateTo, @ExcludeClosedStatus, @ApprovalStatus, @Offset, @PageSize;
END
GO

-- ── Post-check ───────────────────────────────────────────────────────────
SELECT o.name, m.uses_quoted_identifier, m.uses_ansi_nulls
FROM sys.sql_modules m JOIN sys.objects o ON o.object_id = m.object_id
WHERE o.name IN ('sp_SearchJobs');
GO
SELECT name FROM sys.columns WHERE object_id = OBJECT_ID('PROJ.VW_JOB') AND name = 'JobTypeSortOrder';
GO
