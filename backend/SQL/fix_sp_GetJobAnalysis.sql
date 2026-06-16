-- Fix: replace CTE (scope = one statement) with a #temp table
-- so both result sets can reference the same filtered base data.

CREATE OR ALTER PROCEDURE proj.sp_GetJobAnalysis
    @GroupBy    NVARCHAR(20)  = 'Job',
    @JobTypeId  NVARCHAR(20)  = NULL,
    @CustomerId INT           = NULL,
    @StatusId   INT           = NULL,
    @DateFrom   DATE          = NULL,
    @DateTo     DATE          = NULL,
    @SearchText NVARCHAR(200) = NULL,
    @Page       INT           = 1,
    @PageSize   INT           = 30
AS
BEGIN
    SET NOCOUNT ON;

    -- ── Materialise base data (survives across multiple result sets) ──────────
    SELECT
        j.JobId,
        j.ProjectName,
        j.JobTypeId,
        jt.JobTypeName,
        j.CustomerId,
        j.CustomerName,
        j.JobStatusId,
        j.JobStatusName,
        j.JobStageName,
        j.JobDate,
        j.JobExpectedCompleteDate,
        j.JobActualCompleteDate,
        ISNULL(j.OrderValue,     0)                                         AS OrderValue,
        ISNULL(j.TotalInvoicing, 0)                                         AS Invoiced,
        ISNULL(j.TotalPayments,  0)                                         AS Received,
        GREATEST(0, ISNULL(j.TotalInvoicing,0)
                  - ISNULL(j.TotalPayments,0)
                  - ISNULL(j.TotalCredit,0))                                AS Receivable,
        ISNULL(j.TotalActual,   0) + ISNULL(j.TotalExpenses, 0)            AS ActualCost,
        ISNULL(j.TotalActual,   0)                                          AS MaterialCost,
        ISNULL(j.TotalExpenses, 0)                                          AS ExpenseCost,
        ISNULL((SELECT SUM(b.AmountInBaseCurrency)
                FROM   proj.TBL_JOB_BUDGET b
                WHERE  b.JobId = j.JobId AND b.IsCurrent = 1 AND b.IsApproved = 1), 0) AS TotalBudget,
        j.IsClosedStatus
    INTO #JobBase
    FROM proj.VW_JOB j
    LEFT JOIN proj.TBL_JOBTYPE jt ON j.JobTypeId = jt.JobTypeId
    WHERE 1 = 1
      AND (@JobTypeId  IS NULL OR j.JobTypeId   = @JobTypeId)
      AND (@CustomerId IS NULL OR j.CustomerId  = @CustomerId)
      AND (@StatusId   IS NULL OR j.JobStatusId = @StatusId)
      AND (@DateFrom   IS NULL OR j.JobDate    >= @DateFrom)
      AND (@DateTo     IS NULL OR j.JobDate    <= @DateTo)
      AND (@SearchText IS NULL
           OR j.ProjectName  LIKE N'%' + @SearchText + N'%'
           OR j.JobId        LIKE N'%' + @SearchText + N'%'
           OR j.CustomerName LIKE N'%' + @SearchText + N'%');

    -- ── Result set 1: Summary totals ─────────────────────────────────────────
    SELECT
        COUNT(*)                                                        AS TotalJobs,
        SUM(OrderValue)                                                 AS TotalOrderValue,
        SUM(Invoiced)                                                   AS TotalInvoiced,
        SUM(Received)                                                   AS TotalReceived,
        SUM(Receivable)                                                 AS TotalReceivable,
        SUM(ActualCost)                                                 AS TotalActualCost,
        SUM(TotalBudget)                                                AS TotalBudget,
        SUM(OrderValue - ActualCost)                                    AS TotalGrossProfit,
        SUM(TotalBudget - ActualCost)                                   AS TotalBudgetVariance,
        CASE WHEN SUM(OrderValue) > 0
             THEN (SUM(OrderValue - ActualCost) / SUM(OrderValue)) * 100
             ELSE 0 END                                                 AS AvgMarginPct
    FROM #JobBase;

    -- ── Result set 2: Detail / grouped rows (paginated) ───────────────────────
    IF @GroupBy = 'JobType'
    BEGIN
        SELECT
            JobTypeId, JobTypeName,
            COUNT(*)                                        AS JobCount,
            SUM(OrderValue)                                 AS OrderValue,
            SUM(Invoiced)                                   AS Invoiced,
            SUM(Received)                                   AS Received,
            SUM(Receivable)                                 AS Receivable,
            SUM(ActualCost)                                 AS ActualCost,
            SUM(TotalBudget)                                AS TotalBudget,
            SUM(OrderValue - ActualCost)                    AS GrossProfit,
            SUM(TotalBudget - ActualCost)                   AS BudgetVariance,
            CASE WHEN SUM(OrderValue) > 0
                 THEN (SUM(OrderValue - ActualCost) / SUM(OrderValue)) * 100
                 ELSE 0 END                                 AS MarginPct,
            COUNT(*) OVER ()                                AS TotalRows
        FROM  #JobBase
        GROUP BY JobTypeId, JobTypeName
        ORDER BY GrossProfit DESC
        OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
    END
    ELSE IF @GroupBy = 'Customer'
    BEGIN
        SELECT
            CustomerId, CustomerName,
            COUNT(*)                                        AS JobCount,
            SUM(OrderValue)                                 AS OrderValue,
            SUM(Invoiced)                                   AS Invoiced,
            SUM(Received)                                   AS Received,
            SUM(Receivable)                                 AS Receivable,
            SUM(ActualCost)                                 AS ActualCost,
            SUM(TotalBudget)                                AS TotalBudget,
            SUM(OrderValue - ActualCost)                    AS GrossProfit,
            SUM(TotalBudget - ActualCost)                   AS BudgetVariance,
            CASE WHEN SUM(OrderValue) > 0
                 THEN (SUM(OrderValue - ActualCost) / SUM(OrderValue)) * 100
                 ELSE 0 END                                 AS MarginPct,
            COUNT(*) OVER ()                                AS TotalRows
        FROM  #JobBase
        GROUP BY CustomerId, CustomerName
        ORDER BY GrossProfit DESC
        OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
    END
    ELSE IF @GroupBy = 'Status'
    BEGIN
        SELECT
            JobStatusId, JobStatusName,
            COUNT(*)                                        AS JobCount,
            SUM(OrderValue)                                 AS OrderValue,
            SUM(Invoiced)                                   AS Invoiced,
            SUM(Received)                                   AS Received,
            SUM(Receivable)                                 AS Receivable,
            SUM(ActualCost)                                 AS ActualCost,
            SUM(TotalBudget)                                AS TotalBudget,
            SUM(OrderValue - ActualCost)                    AS GrossProfit,
            SUM(TotalBudget - ActualCost)                   AS BudgetVariance,
            CASE WHEN SUM(OrderValue) > 0
                 THEN (SUM(OrderValue - ActualCost) / SUM(OrderValue)) * 100
                 ELSE 0 END                                 AS MarginPct,
            COUNT(*) OVER ()                                AS TotalRows
        FROM  #JobBase
        GROUP BY JobStatusId, JobStatusName
        ORDER BY GrossProfit DESC
        OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
    END
    ELSE -- Per Job (default)
    BEGIN
        SELECT
            JobId, ProjectName, JobTypeName, CustomerName,
            JobStatusName, JobStageName, JobDate,
            JobExpectedCompleteDate, JobActualCompleteDate,
            OrderValue, Invoiced, Received, Receivable,
            ActualCost, MaterialCost, ExpenseCost, TotalBudget,
            OrderValue - ActualCost                                     AS GrossProfit,
            TotalBudget - ActualCost                                    AS BudgetVariance,
            CASE WHEN OrderValue > 0
                 THEN ((OrderValue - ActualCost) / OrderValue) * 100
                 ELSE 0 END                                             AS MarginPct,
            CASE WHEN OrderValue > 0
                 THEN (Invoiced / OrderValue) * 100
                 ELSE 0 END                                             AS InvoicingPct,
            IsClosedStatus,
            COUNT(*) OVER ()                                            AS TotalRows
        FROM  #JobBase
        ORDER BY GrossProfit ASC   -- worst performers first
        OFFSET (@Page - 1) * @PageSize ROWS FETCH NEXT @PageSize ROWS ONLY;
    END

    DROP TABLE IF EXISTS #JobBase;
END;
GO

PRINT 'sp_GetJobAnalysis fixed.';
GO
