-- ═══════════════════════════════════════════════════════════════════════
-- sp_SearchJobs: Job Type multiselect filter + lookup-by-JobNumId
-- 2026-08-13
--
-- Two additive changes:
-- 1. @JobTypeIds (comma-separated NVARCHAR list) — powers the new Job Type
--    multiselect filter on the Jobs list page (/jobs), mirroring the
--    existing @JobStatusIds pattern exactly. @JobTypeId (singular) is left
--    in place unchanged for any other caller that still uses it.
-- 2. @JobNumId (INT) — lets a caller look a job up by its numeric surrogate
--    key instead of the JobId string. Needed because approval transactions
--    (TBL_APPROVAL_TRANSACTION.DocumentId for ModuleCode='JOB') reference
--    jobs by JobNumId, not JobId — the My Approvals preview drawer was
--    calling the string-keyed GET job/{jobId} with a JobNumId value, always
--    404ing and leaving every field blank. New GET job/by-num/{jobNumId}
--    endpoint uses this filter.
--
-- Needs: backend rebuild (JobController.cs gained jobTypeIds query param +
-- new GetJobByNumId action) + frontend redeploy (Job.js filter def changed
-- select -> multiselect; DocPreviewDrawer.js JOB module now calls
-- job/by-num/{id} instead of job/{id}, and reads orderValue instead of the
-- non-existent jobOrderValue field).
-- No data migration, safe to re-run (ALTERs an existing proc).
-- ═══════════════════════════════════════════════════════════════════════

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

ALTER PROCEDURE PROJ.sp_SearchJobs
    @SearchText          NVARCHAR(200) = NULL,
    @JobTypeId           NVARCHAR(50)  = NULL,
    @JobTypeIds          NVARCHAR(500) = NULL,
    @JobStageId          NVARCHAR(10)  = NULL,
    @CustomerId          INT           = NULL,
    @JobStatusId         INT           = NULL,
    @JobStatusIds        NVARCHAR(200) = NULL,
    @JobNumId            INT           = NULL,
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
    IF @JobTypeIds IS NOT NULL AND @JobTypeIds <> ''
        SET @SQL += N' AND JobTypeId IN (SELECT value FROM STRING_SPLIT(@JobTypeIds, '',''))';
    IF @JobStageId       IS NOT NULL SET @SQL += N' AND JobStageId = @JobStageId';
    IF @CustomerId       IS NOT NULL SET @SQL += N' AND CustomerId = @CustomerId';
    IF @JobStatusId      IS NOT NULL SET @SQL += N' AND JobStatusId = @JobStatusId';
    IF @JobStatusIds IS NOT NULL AND @JobStatusIds <> ''
        SET @SQL += N' AND JobStatusId IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@JobStatusIds, '',''))';
    IF @JobNumId         IS NOT NULL SET @SQL += N' AND JobNumId = @JobNumId';
    IF @DateFrom         IS NOT NULL SET @SQL += N' AND CAST(JobDate AS DATE) >= @DateFrom';
    IF @DateTo           IS NOT NULL SET @SQL += N' AND CAST(JobDate AS DATE) <= @DateTo';
    IF @ExcludeClosedStatus = 1      SET @SQL += N' AND (IsClosedStatus = 0 OR IsClosedStatus IS NULL)';
    IF @ApprovalStatus   IS NOT NULL SET @SQL += N' AND ApprovalStatus = @ApprovalStatus';

    SET @SQL += N')
    SELECT * FROM CTE
    ORDER BY ' + @OrderByClause + N'
    OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;';

    EXEC sp_executesql @SQL,
        N'@SearchText NVARCHAR(200), @JobTypeId NVARCHAR(50), @JobTypeIds NVARCHAR(500), @JobStageId NVARCHAR(10),
          @CustomerId INT, @JobStatusId INT, @JobStatusIds NVARCHAR(200), @JobNumId INT,
          @DateFrom DATE, @DateTo DATE,
          @ExcludeClosedStatus BIT, @ApprovalStatus NVARCHAR(20), @Offset INT, @PageSize INT',
        @SearchText, @JobTypeId, @JobTypeIds, @JobStageId, @CustomerId, @JobStatusId, @JobStatusIds, @JobNumId,
        @DateFrom, @DateTo, @ExcludeClosedStatus, @ApprovalStatus, @Offset, @PageSize;
END
GO
