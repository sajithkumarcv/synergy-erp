/* ============================================================================
   BOM list: filter and sort parity with the Jobs list

   The BOM list could only filter by Search / one BOM Status / date range, while
   the Jobs list filters by Customer, Job Type (multi), Status (multi) and dates.
   It also could not sort at all: Bom.js sends sortColumn/sortDirection, but the
   controller never accepted them and passed a hardcoded 'BomDate DESC' down, so
   clicking a column header re-fetched the same order.

   THIS PATCH (sp_SearchBoms only):
     + @JobTypeIds  NVARCHAR(500)  CSV, same STRING_SPLIT idiom as sp_SearchJobs
     + @CustomerId  INT
     ~ @BomStatus   widened 20 -> 200 chars and now accepts a CSV of statuses
                    (a single value still behaves exactly as before)
     ~ @SortColumn  whitelisted and extended: JobId, CustomerName, BomDate,
                    JobTypeName, BomVersion, LineCount, TotalBomValue, BomStatus
                    (was: JobId / BomDate ASC / BomStatus only)
     + CustomerId added to the projection + GROUP BY so the grid can filter on it

   Back-compatible: every existing caller passing a single @BomStatus and no new
   parameter gets identical results.

   Idempotent - it is a full ALTER, safe to re-run.
   ============================================================================ */

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
GO

ALTER PROCEDURE proj.sp_SearchBoms
    @SearchText          NVARCHAR(100) = NULL,
    @JobId               NVARCHAR(50)  = NULL,
    @BomStatus           NVARCHAR(200) = NULL,   -- CSV of statuses, or one status
    @JobTypeIds          NVARCHAR(500) = NULL,   -- CSV of JobTypeId
    @CustomerId          INT           = NULL,
    @DateFrom            DATE          = NULL,
    @DateTo              DATE          = NULL,
    @ExcludeClosedStatus BIT           = 0,
    @PageNumber          INT           = 1,
    @PageSize            INT           = 20,
    @SortColumn          NVARCHAR(50)  = 'BomDate',
    @SortDirection       NVARCHAR(4)   = 'DESC'
AS
BEGIN
    SET NOCOUNT ON;

    -- Whitelist: anything unrecognised falls back to BomDate, so the grid can
    -- never push an arbitrary column name in here.
    SET @SortColumn = CASE @SortColumn
        WHEN 'JobId'         THEN 'JobId'
        WHEN 'CustomerName'  THEN 'CustomerName'
        WHEN 'BomDate'       THEN 'BomDate'
        WHEN 'JobTypeName'   THEN 'JobTypeName'
        WHEN 'BomVersion'    THEN 'BomVersion'
        WHEN 'LineCount'     THEN 'LineCount'
        WHEN 'TotalBomValue' THEN 'TotalBomValue'
        WHEN 'BomStatus'     THEN 'BomStatus'
        ELSE 'BomDate'
    END;
    SET @SortDirection = CASE WHEN UPPER(@SortDirection) = 'ASC' THEN 'ASC' ELSE 'DESC' END;

    DECLARE @Offset INT = (@PageNumber - 1) * @PageSize;

    WITH cte AS (
        SELECT
            h.BomHeaderId, h.JobId, h.JobTypeId,
            h.BomDate, h.BomDescription, h.BomVersion,
            h.BomStatus, h.TotalBomValue,
            h.BomApprovedBy, h.BomApprovedDate,
            h.CreatedBy, h.CreatedDate, h.ModifiedBy, h.ModifiedDate,
            j.JobDescription,
            j.CustomerId,
            c.CustomerName,
            jt.JobTypeName,
            COUNT(d.BomId)       AS LineCount,
            COUNT(*) OVER ()     AS TotalRows
        FROM proj.TBL_BOM_HEADER h
        LEFT JOIN proj.TBL_JOB          j   ON j.JobId       = h.JobId
        LEFT JOIN proj.TBL_CUSTOMER     c   ON c.CustomerId  = j.CustomerId
        LEFT JOIN proj.TBL_JOBTYPE      jt  ON jt.JobTypeId  = j.JobTypeId
        LEFT JOIN proj.TBL_JOB_STATUS   jst ON jst.JobStatusId = j.JobStatusId
        LEFT JOIN proj.TBL_BOM_DETAILS  d   ON d.BomHeaderId = h.BomHeaderId AND d.IsActive = 1
        WHERE h.IsActive = 1
          AND (@JobId     IS NULL OR h.JobId = @JobId)
          AND (@BomStatus IS NULL OR @BomStatus = N''
               OR h.BomStatus IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@BomStatus, ',')))
          AND (@JobTypeIds IS NULL OR @JobTypeIds = N''
               OR ISNULL(j.JobTypeId, h.JobTypeId) IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@JobTypeIds, ',')))
          AND (@CustomerId IS NULL OR j.CustomerId = @CustomerId)
          AND (@DateFrom  IS NULL OR h.BomDate >= @DateFrom)
          AND (@DateTo    IS NULL OR h.BomDate <= @DateTo)
          AND (@SearchText IS NULL
               OR h.JobId LIKE N'%'+@SearchText+N'%'
               OR j.JobDescription LIKE N'%'+@SearchText+N'%'
               OR c.CustomerName   LIKE N'%'+@SearchText+N'%')
          AND (@ExcludeClosedStatus = 0 OR ISNULL(jst.IsClosed, 0) = 0)
        GROUP BY h.BomHeaderId, h.JobId, h.JobTypeId, h.BomDate, h.BomDescription,
                 h.BomVersion, h.BomStatus, h.TotalBomValue, h.BomApprovedBy,
                 h.BomApprovedDate, h.CreatedBy, h.CreatedDate, h.ModifiedBy, h.ModifiedDate,
                 j.JobDescription, j.CustomerId, c.CustomerName, jt.JobTypeName
    )
    SELECT * FROM cte
    ORDER BY
        CASE WHEN @SortColumn='JobId'         AND @SortDirection='ASC'  THEN JobId         END ASC,
        CASE WHEN @SortColumn='JobId'         AND @SortDirection='DESC' THEN JobId         END DESC,
        CASE WHEN @SortColumn='CustomerName'  AND @SortDirection='ASC'  THEN CustomerName  END ASC,
        CASE WHEN @SortColumn='CustomerName'  AND @SortDirection='DESC' THEN CustomerName  END DESC,
        CASE WHEN @SortColumn='JobTypeName'   AND @SortDirection='ASC'  THEN JobTypeName   END ASC,
        CASE WHEN @SortColumn='JobTypeName'   AND @SortDirection='DESC' THEN JobTypeName   END DESC,
        CASE WHEN @SortColumn='BomStatus'     AND @SortDirection='ASC'  THEN BomStatus     END ASC,
        CASE WHEN @SortColumn='BomStatus'     AND @SortDirection='DESC' THEN BomStatus     END DESC,
        CASE WHEN @SortColumn='BomDate'       AND @SortDirection='ASC'  THEN BomDate       END ASC,
        CASE WHEN @SortColumn='BomDate'       AND @SortDirection='DESC' THEN BomDate       END DESC,
        CASE WHEN @SortColumn='BomVersion'    AND @SortDirection='ASC'  THEN BomVersion    END ASC,
        CASE WHEN @SortColumn='BomVersion'    AND @SortDirection='DESC' THEN BomVersion    END DESC,
        CASE WHEN @SortColumn='LineCount'     AND @SortDirection='ASC'  THEN LineCount     END ASC,
        CASE WHEN @SortColumn='LineCount'     AND @SortDirection='DESC' THEN LineCount     END DESC,
        CASE WHEN @SortColumn='TotalBomValue' AND @SortDirection='ASC'  THEN TotalBomValue END ASC,
        CASE WHEN @SortColumn='TotalBomValue' AND @SortDirection='DESC' THEN TotalBomValue END DESC,
        BomDate DESC
    OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END
GO

/* Verify */
SELECT CASE WHEN CHARINDEX('@JobTypeIds', OBJECT_DEFINITION(OBJECT_ID('proj.sp_SearchBoms'))) > 0
            THEN 'OK - patched' ELSE 'NOT PATCHED' END AS Result;
GO
