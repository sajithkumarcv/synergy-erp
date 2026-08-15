-- ═══════════════════════════════════════════════════════════════════════
-- sp_GetJobsForOverview: Job Type multiselect on the Job Overview page
-- 2026-08-13
--
-- Adds @JobTypeIds (comma-separated NVARCHAR list), same pattern as the
-- @JobTypeIds/@JobStatusIds additions to sp_SearchJobs earlier the same
-- day. @JobTypeId (singular) left in place unchanged for any other caller.
--
-- Needs: backend rebuild (JobOverviewController.cs gained a jobTypeIds
-- query param) + frontend redeploy (JobOverview.js's Job Type filter is
-- now a searchable multiselect dropdown, defaulting on load to every type
-- except In House Jobs / isCostingRequired=false).
-- No data migration, safe to re-run (ALTERs an existing proc).
-- ═══════════════════════════════════════════════════════════════════════

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

ALTER PROCEDURE proj.sp_GetJobsForOverview
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
      AND (@CustomerId IS NULL OR j.CustomerId  = @CustomerId)
      AND (@SearchText IS NULL OR
           j.JobId          LIKE '%' + @SearchText + '%' OR
           j.JobDescription LIKE '%' + @SearchText + '%' OR
           c.CustomerName   LIKE '%' + @SearchText + '%')
    ORDER BY j.JobId DESC;
END;
GO
