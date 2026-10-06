-- 2026-09-07: Issue Request — BUILD STEP 2a of 5: stored procedures (CRUD + list + get)
--
-- Apply to: ERPDB
-- Requires: 2026-09-07b_issue_request_step1.sql (tables, series, module, menu)
-- Design:   backend/Docs/DESIGN-issue-request.md §7
--
-- Six procedures, all new — nothing existing is altered:
--   sp_SetIssueRequest        header create/update, Draft-only edit, ISR number
--   sp_SetIssueRequestLine    line create/update, Draft-only
--   sp_DeleteIssueRequestLine hard delete of a line, Draft-only
--   sp_DeleteIssueRequest     soft delete (IsActive = 0) of a Draft header
--   sp_SearchIssueRequests    paged list with a sort whitelist
--   sp_GetIssueRequest        header + lines, BalanceQty computed
--
-- Modelled on the Issue Return set (sp_SetIssueReturn etc.), which is the closest
-- existing document: header + lines + approval module. Same idioms deliberately —
-- INSERT ... EXEC sp_GetNextDocNumber for the number, RAISERROR immediately
-- followed by RETURN, Draft-only editing, and a CTE + TotalRows list.
--
-- NOT here (later steps): issuing against a request, reservations, the BOM import,
-- and any change to sp_ConfirmStockIssue.
--
-- Idempotent — CREATE OR ALTER throughout, safe to re-run.

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
GO

/* ═══ 1. Header create / update ═══════════════════════════════════════════ */
CREATE OR ALTER PROCEDURE proj.sp_SetIssueRequest
    @RequestId    INT,
    @JobId        NVARCHAR(50),
    @IssueTypeId  INT,
    @RequestDate  DATE,
    @RequiredDate DATE           = NULL,
    @RequestedBy  NVARCHAR(100),
    @Department   NVARCHAR(100)  = NULL,
    @RequestedFor NVARCHAR(100)  = NULL,
    @Priority     NVARCHAR(20)   = NULL,
    @Notes        NVARCHAR(500)  = NULL,
    @CreatedBy    NVARCHAR(100),
    @ModifiedBy   NVARCHAR(100)  = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM proj.TBL_JOB WHERE JobId = @JobId)
    BEGIN RAISERROR('Job not found.', 16, 1); RETURN; END

    -- A closed job must not attract new material requests.
    IF EXISTS (
        SELECT 1 FROM proj.TBL_JOB j
        JOIN proj.TBL_JOB_STATUS js ON js.JobStatusId = j.JobStatusId
        WHERE j.JobId = @JobId AND ISNULL(js.IsClosed, 0) = 1)
    BEGIN RAISERROR('This job is closed. Material cannot be requested against it.', 16, 1); RETURN; END

    IF NOT EXISTS (SELECT 1 FROM proj.TBL_ISSUE_TYPE WHERE IssueTypeId = @IssueTypeId AND IsActive = 1)
    BEGIN RAISERROR('Issue type not found or inactive.', 16, 1); RETURN; END

    IF @RequestedBy IS NULL OR LTRIM(RTRIM(@RequestedBy)) = N''
    BEGIN RAISERROR('Requested By is required.', 16, 1); RETURN; END

    IF @RequestId = 0
    BEGIN
        -- House pattern: the number comes from the series, never formatted here.
        DECLARE @NumResult TABLE (DocNumber NVARCHAR(50), NewSeries INT);
        INSERT INTO @NumResult EXEC proj.sp_GetNextDocNumber 'ISR';

        DECLARE @RequestNo NVARCHAR(50);
        SELECT @RequestNo = DocNumber FROM @NumResult;

        IF @RequestNo IS NULL
        BEGIN RAISERROR('Failed to generate ISR document number. Check the ISR document series.', 16, 1); RETURN; END

        INSERT INTO proj.TBL_STOCK_ISSUE_REQUEST
            (RequestNo, RequestDate, JobId, IssueTypeId, RequiredDate, RequestedBy,
             Department, RequestedFor, Status, Priority, Notes, CreatedBy)
        VALUES
            (@RequestNo, @RequestDate, @JobId, @IssueTypeId, @RequiredDate, @RequestedBy,
             @Department, @RequestedFor, 'Draft', @Priority, @Notes, @CreatedBy);

        SELECT SCOPE_IDENTITY() AS RequestId, @RequestNo AS RequestNo;
    END
    ELSE
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM proj.TBL_STOCK_ISSUE_REQUEST
            WHERE RequestId = @RequestId AND Status = 'Draft' AND IsActive = 1)
        BEGIN RAISERROR('Only Draft requests can be edited.', 16, 1); RETURN; END

        UPDATE proj.TBL_STOCK_ISSUE_REQUEST
        SET JobId        = @JobId,
            IssueTypeId  = @IssueTypeId,
            RequestDate  = @RequestDate,
            RequiredDate = @RequiredDate,
            RequestedBy  = @RequestedBy,
            Department   = @Department,
            RequestedFor = @RequestedFor,
            Priority     = @Priority,
            Notes        = @Notes,
            ModifiedBy   = @ModifiedBy,
            ModifiedDate = SYSDATETIME()
        WHERE RequestId = @RequestId;

        SELECT @RequestId AS RequestId, RequestNo
        FROM proj.TBL_STOCK_ISSUE_REQUEST WHERE RequestId = @RequestId;
    END
END;
GO

/* ═══ 2. Line create / update ═════════════════════════════════════════════
   LineStatus is derived from BOTH quantities, so it is recomputed here on every
   write rather than left to a trigger watching only the fulfilled side. That is
   the exact blind spot TR_BOM_RecalcStatus has on TBL_BOM_DETAILS — see the
   design doc §6. */
CREATE OR ALTER PROCEDURE proj.sp_SetIssueRequestLine
    @RequestLineId INT,
    @RequestId     INT,
    @ItemId        INT,
    @RequestedQty  DECIMAL(18,4),
    @UomId         INT           = NULL,
    @BomId         INT           = NULL,
    @RequiredDate  DATE          = NULL,
    @Notes         NVARCHAR(200) = NULL,
    @CreatedBy     NVARCHAR(100),
    @ModifiedBy    NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (
        SELECT 1 FROM proj.TBL_STOCK_ISSUE_REQUEST
        WHERE RequestId = @RequestId AND Status = 'Draft' AND IsActive = 1)
    BEGIN RAISERROR('Request is not in Draft status.', 16, 1); RETURN; END

    IF NOT EXISTS (SELECT 1 FROM proj.TBL_ITEM WHERE ItemId = @ItemId)
    BEGIN RAISERROR('Item not found.', 16, 1); RETURN; END

    IF @RequestedQty IS NULL OR @RequestedQty <= 0
    BEGIN RAISERROR('Requested quantity must be greater than zero.', 16, 1); RETURN; END

    DECLARE @IssuedQty DECIMAL(18,4) = 0;

    IF @RequestLineId = 0
    BEGIN
        -- One line per item keeps the issue-side write-back unambiguous.
        IF EXISTS (SELECT 1 FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE
                   WHERE RequestId = @RequestId AND ItemId = @ItemId AND IsActive = 1)
        BEGIN RAISERROR('This item is already on the request. Edit that line instead.', 16, 1); RETURN; END

        DECLARE @NextLineNum INT;
        SELECT @NextLineNum = ISNULL(MAX(LineNum), 0) + 1
        FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE WHERE RequestId = @RequestId;

        INSERT INTO proj.TBL_STOCK_ISSUE_REQUEST_LINE
            (RequestId, LineNum, ItemId, BomId, RequestedQty, IssuedQty, ReservedQty,
             UomId, RequiredDate, LineStatus, Notes, CreatedBy)
        VALUES
            (@RequestId, @NextLineNum, @ItemId, @BomId, @RequestedQty, 0, 0,
             @UomId, @RequiredDate, 'Pending', @Notes, @CreatedBy);

        SELECT SCOPE_IDENTITY() AS RequestLineId;
    END
    ELSE
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE
                       WHERE RequestLineId = @RequestLineId AND RequestId = @RequestId AND IsActive = 1)
        BEGIN RAISERROR('Request line not found.', 16, 1); RETURN; END

        IF EXISTS (SELECT 1 FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE
                   WHERE RequestId = @RequestId AND ItemId = @ItemId AND IsActive = 1
                     AND RequestLineId <> @RequestLineId)
        BEGIN RAISERROR('This item is already on another line of the request.', 16, 1); RETURN; END

        SELECT @IssuedQty = IssuedQty
        FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE WHERE RequestLineId = @RequestLineId;

        -- Cannot cut the request below what the store has already handed over.
        IF @RequestedQty < @IssuedQty
        BEGIN
            DECLARE @Msg NVARCHAR(300) =
                'Requested qty cannot be less than the qty already issued (' +
                CAST(@IssuedQty AS NVARCHAR(30)) + ').';
            RAISERROR(@Msg, 16, 1); RETURN;
        END

        UPDATE proj.TBL_STOCK_ISSUE_REQUEST_LINE
        SET ItemId       = @ItemId,
            BomId        = @BomId,
            RequestedQty = @RequestedQty,
            UomId        = @UomId,
            RequiredDate = @RequiredDate,
            Notes        = @Notes,
            LineStatus   = CASE
                               WHEN @IssuedQty >= @RequestedQty THEN 'FullyIssued'
                               WHEN @IssuedQty >  0             THEN 'PartiallyIssued'
                               ELSE 'Pending' END,
            ModifiedBy   = @ModifiedBy,
            ModifiedDate = SYSDATETIME()
        WHERE RequestLineId = @RequestLineId;

        SELECT @RequestLineId AS RequestLineId;
    END
END;
GO

/* ═══ 3. Delete a line ════════════════════════════════════════════════════ */
CREATE OR ALTER PROCEDURE proj.sp_DeleteIssueRequestLine
    @RequestLineId INT,
    @ModifiedBy    NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (
        SELECT 1 FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE l
        JOIN proj.TBL_STOCK_ISSUE_REQUEST r ON r.RequestId = l.RequestId
        WHERE l.RequestLineId = @RequestLineId AND r.Status = 'Draft' AND r.IsActive = 1)
    BEGIN RAISERROR('Line not found or request is not in Draft status.', 16, 1); RETURN; END

    IF EXISTS (SELECT 1 FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE
               WHERE RequestLineId = @RequestLineId AND IssuedQty > 0)
    BEGIN RAISERROR('This line has already been issued against and cannot be deleted.', 16, 1); RETURN; END

    DELETE FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE WHERE RequestLineId = @RequestLineId;
    SELECT @@ROWCOUNT AS RowsDeleted;
END;
GO

/* ═══ 4. Delete a header (soft) ═══════════════════════════════════════════ */
CREATE OR ALTER PROCEDURE proj.sp_DeleteIssueRequest
    @RequestId  INT,
    @ModifiedBy NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (
        SELECT 1 FROM proj.TBL_STOCK_ISSUE_REQUEST
        WHERE RequestId = @RequestId AND Status = 'Draft' AND IsActive = 1)
    BEGIN RAISERROR('Only Draft requests can be deleted.', 16, 1); RETURN; END

    UPDATE proj.TBL_STOCK_ISSUE_REQUEST
    SET IsActive     = 0,
        ModifiedBy   = @ModifiedBy,
        ModifiedDate = SYSDATETIME()
    WHERE RequestId = @RequestId;

    SELECT @@ROWCOUNT AS RowsDeleted;
END;
GO

/* ═══ 5. List ═════════════════════════════════════════════════════════════
   Sort column whitelisted, so the grid can never push an arbitrary name in. */
CREATE OR ALTER PROCEDURE proj.sp_SearchIssueRequests
    @SearchText    NVARCHAR(200) = NULL,
    @JobId         NVARCHAR(50)  = NULL,
    @Status        NVARCHAR(200) = NULL,   -- CSV of statuses, or one status
    @IssueTypeId   INT           = NULL,
    @CustomerId    INT           = NULL,
    @DateFrom      DATE          = NULL,
    @DateTo        DATE          = NULL,
    @PageNumber    INT           = 1,
    @PageSize      INT           = 20,
    @SortColumn    NVARCHAR(50)  = 'RequestDate',
    @SortDirection NVARCHAR(4)   = 'DESC'
AS
BEGIN
    SET NOCOUNT ON;

    SET @SortColumn = CASE @SortColumn
        WHEN 'RequestNo'     THEN 'RequestNo'
        WHEN 'RequestDate'   THEN 'RequestDate'
        WHEN 'JobId'         THEN 'JobId'
        WHEN 'CustomerName'  THEN 'CustomerName'
        WHEN 'RequiredDate'  THEN 'RequiredDate'
        WHEN 'RequestedBy'   THEN 'RequestedBy'
        WHEN 'IssueTypeName' THEN 'IssueTypeName'
        WHEN 'LineCount'     THEN 'LineCount'
        WHEN 'Status'        THEN 'Status'
        ELSE 'RequestDate'
    END;
    SET @SortDirection = CASE WHEN UPPER(@SortDirection) = 'ASC' THEN 'ASC' ELSE 'DESC' END;

    DECLARE @Offset INT = (@PageNumber - 1) * @PageSize;

    WITH cte AS (
        SELECT
            r.RequestId, r.RequestNo, r.RequestDate, r.JobId,
            j.JobDescription, j.CustomerId, c.CustomerName,
            r.IssueTypeId, it.IssueTypeName,
            r.RequiredDate, r.RequestedBy, r.Department, r.RequestedFor,
            r.Status, r.Priority, r.Notes, r.ReservationExpiryDate,
            r.CreatedBy, r.CreatedDate, r.ModifiedBy, r.ModifiedDate,
            COUNT(l.RequestLineId)                  AS LineCount,
            ISNULL(SUM(l.RequestedQty), 0)          AS TotalRequestedQty,
            ISNULL(SUM(l.IssuedQty), 0)             AS TotalIssuedQty,
            COUNT(*) OVER ()                        AS TotalRows
        FROM proj.TBL_STOCK_ISSUE_REQUEST r
        LEFT JOIN proj.TBL_JOB        j  ON j.JobId       = r.JobId
        LEFT JOIN proj.TBL_CUSTOMER   c  ON c.CustomerId  = j.CustomerId
        LEFT JOIN proj.TBL_ISSUE_TYPE it ON it.IssueTypeId = r.IssueTypeId
        LEFT JOIN proj.TBL_STOCK_ISSUE_REQUEST_LINE l
               ON l.RequestId = r.RequestId AND l.IsActive = 1
        WHERE r.IsActive = 1
          AND (@JobId IS NULL OR r.JobId = @JobId)
          AND (@Status IS NULL OR @Status = N''
               OR r.Status IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@Status, ',')))
          AND (@IssueTypeId IS NULL OR r.IssueTypeId = @IssueTypeId)
          AND (@CustomerId  IS NULL OR j.CustomerId  = @CustomerId)
          AND (@DateFrom IS NULL OR r.RequestDate >= @DateFrom)
          AND (@DateTo   IS NULL OR r.RequestDate <= @DateTo)
          AND (@SearchText IS NULL
               OR r.RequestNo   LIKE N'%'+@SearchText+N'%'
               OR r.JobId       LIKE N'%'+@SearchText+N'%'
               OR r.RequestedBy LIKE N'%'+@SearchText+N'%'
               OR j.JobDescription LIKE N'%'+@SearchText+N'%'
               OR c.CustomerName   LIKE N'%'+@SearchText+N'%')
        GROUP BY
            r.RequestId, r.RequestNo, r.RequestDate, r.JobId,
            j.JobDescription, j.CustomerId, c.CustomerName,
            r.IssueTypeId, it.IssueTypeName,
            r.RequiredDate, r.RequestedBy, r.Department, r.RequestedFor,
            r.Status, r.Priority, r.Notes, r.ReservationExpiryDate,
            r.CreatedBy, r.CreatedDate, r.ModifiedBy, r.ModifiedDate
    )
    SELECT * FROM cte
    ORDER BY
        CASE WHEN @SortColumn='RequestNo'     AND @SortDirection='ASC'  THEN RequestNo     END ASC,
        CASE WHEN @SortColumn='RequestNo'     AND @SortDirection='DESC' THEN RequestNo     END DESC,
        CASE WHEN @SortColumn='JobId'         AND @SortDirection='ASC'  THEN JobId         END ASC,
        CASE WHEN @SortColumn='JobId'         AND @SortDirection='DESC' THEN JobId         END DESC,
        CASE WHEN @SortColumn='CustomerName'  AND @SortDirection='ASC'  THEN CustomerName  END ASC,
        CASE WHEN @SortColumn='CustomerName'  AND @SortDirection='DESC' THEN CustomerName  END DESC,
        CASE WHEN @SortColumn='RequestedBy'   AND @SortDirection='ASC'  THEN RequestedBy   END ASC,
        CASE WHEN @SortColumn='RequestedBy'   AND @SortDirection='DESC' THEN RequestedBy   END DESC,
        CASE WHEN @SortColumn='IssueTypeName' AND @SortDirection='ASC'  THEN IssueTypeName END ASC,
        CASE WHEN @SortColumn='IssueTypeName' AND @SortDirection='DESC' THEN IssueTypeName END DESC,
        CASE WHEN @SortColumn='Status'        AND @SortDirection='ASC'  THEN Status        END ASC,
        CASE WHEN @SortColumn='Status'        AND @SortDirection='DESC' THEN Status        END DESC,
        CASE WHEN @SortColumn='RequestDate'   AND @SortDirection='ASC'  THEN RequestDate   END ASC,
        CASE WHEN @SortColumn='RequestDate'   AND @SortDirection='DESC' THEN RequestDate   END DESC,
        CASE WHEN @SortColumn='RequiredDate'  AND @SortDirection='ASC'  THEN RequiredDate  END ASC,
        CASE WHEN @SortColumn='RequiredDate'  AND @SortDirection='DESC' THEN RequiredDate  END DESC,
        CASE WHEN @SortColumn='LineCount'     AND @SortDirection='ASC'  THEN LineCount     END ASC,
        CASE WHEN @SortColumn='LineCount'     AND @SortDirection='DESC' THEN LineCount     END DESC,
        RequestDate DESC
    OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO

/* ═══ 6. Get one (header + lines) ═════════════════════════════════════════
   BalanceQty is computed, never stored — storing it invites the two to disagree. */
CREATE OR ALTER PROCEDURE proj.sp_GetIssueRequest
    @RequestId INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        r.RequestId, r.RequestNo, r.RequestDate,
        r.JobId, j.JobDescription, j.CustomerId, c.CustomerName,
        r.IssueTypeId, it.IssueTypeCode, it.IssueTypeName,
        r.RequiredDate, r.RequestedBy, r.Department, r.RequestedFor,
        r.Status, r.Priority, r.Notes, r.ReservationExpiryDate,
        r.CreatedBy, r.CreatedDate, r.ModifiedBy, r.ModifiedDate
    FROM proj.TBL_STOCK_ISSUE_REQUEST r
    LEFT JOIN proj.TBL_JOB        j  ON j.JobId        = r.JobId
    LEFT JOIN proj.TBL_CUSTOMER   c  ON c.CustomerId   = j.CustomerId
    LEFT JOIN proj.TBL_ISSUE_TYPE it ON it.IssueTypeId = r.IssueTypeId
    WHERE r.RequestId = @RequestId AND r.IsActive = 1;

    SELECT
        l.RequestLineId, l.RequestId, l.LineNum,
        l.ItemId, i.ItemCode, i.ItemName, l.BomId,
        l.RequestedQty, l.IssuedQty, l.ReservedQty,
        (l.RequestedQty - l.IssuedQty) AS BalanceQty,
        l.UomId, u.UomCode AS UomName,
        l.RequiredDate, l.LineStatus, l.Notes,
        l.CreatedBy, l.CreatedDate, l.ModifiedBy, l.ModifiedDate
    FROM proj.TBL_STOCK_ISSUE_REQUEST_LINE l
    JOIN proj.TBL_ITEM i ON i.ItemId = l.ItemId
    LEFT JOIN proj.TBL_ITEM_UOM u ON u.UomId = l.UomId
    WHERE l.RequestId = @RequestId AND l.IsActive = 1
    ORDER BY l.LineNum;
END;
GO

/* ─── Verify ────────────────────────────────────────────────────────────── */
SELECT name AS Proc_, 'OK' AS Result
FROM sys.procedures
WHERE name IN ('sp_SetIssueRequest','sp_SetIssueRequestLine','sp_DeleteIssueRequestLine',
               'sp_DeleteIssueRequest','sp_SearchIssueRequests','sp_GetIssueRequest')
ORDER BY name;
GO
