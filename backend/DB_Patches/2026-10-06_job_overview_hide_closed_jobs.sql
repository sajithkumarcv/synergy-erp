-- Job Overview job list: with "All statuses" (no status picked) Completed (4) and Cancelled (5) jobs are no longer offered.
-- Picking Completed or Cancelled in the Status filter still lists them.
SET QUOTED_IDENTIFIER ON;
GO
CREATE OR ALTER PROCEDURE proj.sp_GetJobsForOverview
    @JobTypeId  NVARCHAR(50)  = NULL,
    @JobTypeIds NVARCHAR(500) = NULL,
    @StatusId   INT           = NULL,
    @CustomerId INT           = NULL,
    @SearchText NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        j.JobId,
        j.JobDescription,
        j.ProjectName,
        c.CustomerName,
        js.StatusName,
        jt.JobTypeName
    FROM proj.TBL_JOB        j
    JOIN proj.TBL_JOBTYPE    jt ON jt.JobTypeId   = j.JobTypeId
    JOIN proj.TBL_JOB_STATUS js ON js.JobStatusId = j.JobStatusId
    LEFT JOIN proj.TBL_CUSTOMER c ON c.CustomerId = j.CustomerId
    WHERE j.JobId IS NOT NULL
      AND (@JobTypeId  IS NULL OR j.JobTypeId   = @JobTypeId)
      AND (@JobTypeIds IS NULL OR @JobTypeIds = '' OR j.JobTypeId IN (SELECT value FROM STRING_SPLIT(@JobTypeIds, ',')))
      AND (@StatusId   IS NULL OR j.JobStatusId = @StatusId)
      AND (@StatusId   IS NOT NULL OR j.JobStatusId NOT IN (4, 5))
      AND (@CustomerId IS NULL OR j.CustomerId  = @CustomerId)
      AND (@SearchText IS NULL OR
           j.JobId          LIKE '%' + @SearchText + '%' OR
           j.JobDescription LIKE '%' + @SearchText + '%' OR
           c.CustomerName   LIKE '%' + @SearchText + '%')
    ORDER BY j.JobId DESC;
END;
GO
