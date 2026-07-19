/* ============================================================================
   Free Issue GRN — documentation-only receipt of customer-supplied material
   held in our yard for a specific job. No PO / supplier / cost / stock impact.

   Objects:
     TBL_FREE_ISSUE_GRN_HEADER   (linked to TBL_JOB)
     TBL_FREE_ISSUE_GRN_DETAIL   (optional free-text material lines)
     Doc series  'FIG'  -> FIG-YY-NNNN
     Menu row '/free-issue-grn' under Procurement (+ actions + role grants)
     Procs: sp_SetFreeIssueGrn, sp_GetFreeIssueGrn, sp_SearchFreeIssueGrns,
            sp_DeleteFreeIssueGrn, sp_ChangeFreeIssueGrnStatus,
            sp_CancelFreeIssueGrn, sp_GetFreeIssueGrnLines,
            sp_SetFreeIssueGrnLine, sp_DeleteFreeIssueGrnLine
   Applied to ERPDB (proj schema). Run batches separated by GO.
   ============================================================================ */

IF OBJECT_ID('PROJ.TBL_FREE_ISSUE_GRN_DETAIL','U') IS NOT NULL DROP TABLE PROJ.TBL_FREE_ISSUE_GRN_DETAIL;
IF OBJECT_ID('PROJ.TBL_FREE_ISSUE_GRN_HEADER','U') IS NOT NULL DROP TABLE PROJ.TBL_FREE_ISSUE_GRN_HEADER;
GO

CREATE TABLE [PROJ].[TBL_FREE_ISSUE_GRN_HEADER](
    [FreeIssueGrnId]       [int] IDENTITY(1,1) NOT NULL,
    [FreeIssueGrnNumber]   [nvarchar](30)  NOT NULL,
    [JobId]                [nvarchar](50)  NOT NULL,   -- Job Ref -> TBL_JOB.JobId
    [ReceiptDate]          [date]          NOT NULL,   -- Date of Receipt
    [ReceivedBy]           [nvarchar](100) NOT NULL,
    [BriefDescription]     [nvarchar](200) NOT NULL,
    [DetailedDescription]  [nvarchar](max) NOT NULL,
    [DeliveredBy]          [nvarchar](200) NOT NULL,
    [Remarks]              [nvarchar](500) NULL,
    [BoeNo]                [nvarchar](100) NULL,        -- Bill of Entry No
    [BoeDate]              [date]          NULL,        -- Bill of Entry Date
    [DeliveryNoteFilePath] [nvarchar](400) NULL,        -- Delivery Note Copy (PDF)
    [Status]               [nvarchar](30)  NOT NULL CONSTRAINT [DF_FIGRN_Status] DEFAULT (N'Draft'),
    [IsActive]             [bit]           NOT NULL CONSTRAINT [DF_FIGRN_IsActive] DEFAULT ((1)),
    [CreatedBy]            [nvarchar](100) NOT NULL,
    [CreatedDate]          [datetime]      NOT NULL CONSTRAINT [DF_FIGRN_CreatedDate] DEFAULT (getdate()),
    [ModifiedBy]           [nvarchar](100) NULL,
    [ModifiedDate]         [datetime]      NULL,
    [CancelledBy]          [nvarchar](100) NULL,
    [CancelledDate]        [datetime]      NULL,
    [CancelReason]         [nvarchar](500) NULL,
 CONSTRAINT [PK_TBL_FREE_ISSUE_GRN_HEADER] PRIMARY KEY CLUSTERED ([FreeIssueGrnId] ASC)
);
GO

CREATE TABLE [PROJ].[TBL_FREE_ISSUE_GRN_DETAIL](
    [FreeIssueGrnDetailId] [int] IDENTITY(1,1) NOT NULL,
    [FreeIssueGrnId]       [int]            NOT NULL,
    [LineNum]              [int]            NOT NULL CONSTRAINT [DF_FIGRND_LineNum] DEFAULT ((1)),
    [Description]          [nvarchar](300)  NOT NULL,
    [Qty]                  [decimal](18, 4) NULL,
    [UomName]              [nvarchar](50)   NULL,
    [Remarks]              [nvarchar](300)  NULL,
    [IsActive]             [bit]            NOT NULL CONSTRAINT [DF_FIGRND_IsActive] DEFAULT ((1)),
    [CreatedBy]            [nvarchar](100)  NOT NULL,
    [CreatedDate]          [datetime]       NOT NULL CONSTRAINT [DF_FIGRND_CreatedDate] DEFAULT (getdate()),
    [ModifiedBy]           [nvarchar](100)  NULL,
    [ModifiedDate]         [datetime]       NULL,
 CONSTRAINT [PK_TBL_FREE_ISSUE_GRN_DETAIL] PRIMARY KEY CLUSTERED ([FreeIssueGrnDetailId] ASC),
 CONSTRAINT [FK_FIGRND_HEADER] FOREIGN KEY ([FreeIssueGrnId]) REFERENCES [PROJ].[TBL_FREE_ISSUE_GRN_HEADER]([FreeIssueGrnId])
);
GO

/* ── Revision history (each Revise = Confirmed -> Draft, logged with reason) ── */
IF OBJECT_ID('PROJ.TBL_FREE_ISSUE_GRN_REVISION','U') IS NULL
CREATE TABLE [PROJ].[TBL_FREE_ISSUE_GRN_REVISION](
    [RevisionId]     [int] IDENTITY(1,1) NOT NULL,
    [FreeIssueGrnId] [int]           NOT NULL,
    [RevisionNo]     [int]           NOT NULL,
    [Reason]         [nvarchar](500) NOT NULL,
    [RevisedBy]      [nvarchar](100) NOT NULL,
    [RevisedDate]    [datetime]      NOT NULL CONSTRAINT [DF_FIGREV_RevisedDate] DEFAULT (getdate()),
 CONSTRAINT [PK_TBL_FREE_ISSUE_GRN_REVISION] PRIMARY KEY CLUSTERED ([RevisionId] ASC),
 CONSTRAINT [FK_FIGREV_HEADER] FOREIGN KEY ([FreeIssueGrnId]) REFERENCES [PROJ].[TBL_FREE_ISSUE_GRN_HEADER]([FreeIssueGrnId])
);
GO

/* ── Document series ─────────────────────────────────────────────────────── */
IF NOT EXISTS (SELECT 1 FROM PROJ.TBL_DOCUMENT_SERIES WHERE DocTypeId='FIG')
INSERT INTO PROJ.TBL_DOCUMENT_SERIES
    (DocTypeId, DocTypeName, Prefix, Suffix, Separator, IncludeYear, YearDigits, ResetYearly,
     PadLength, StartingSeries, CurrentSeries, CurrentYear, SortOrder, IsActive, CreatedBy, CreatedDate,
     SourceTable, SourceNumberColumn)
VALUES
    ('FIG', 'Free Issue GRN', 'FIG', NULL, '-', 1, 2, 1,
     4, 1, 0, NULL, 25, 1, 'system', GETDATE(),
     'TBL_FREE_ISSUE_GRN_HEADER', 'FreeIssueGrnNumber');
GO

/* ── Menu + actions + role grants (under Procurement, mirrors GRN menu 13) ── */
DECLARE @MenuId INT;
SELECT @MenuId = MenuId FROM PROJ.TBL_MENU WHERE MenuUrl='/free-issue-grn';
IF @MenuId IS NULL
BEGIN
    INSERT INTO PROJ.TBL_MENU (ParentMenuId, MenuName, MenuUrl, MenuIcon, MenuOrder, IsActive)
    VALUES (10, 'Free Issue GRN', '/free-issue-grn', NULL, 5, 1);
    SET @MenuId = SCOPE_IDENTITY();
END
INSERT INTO PROJ.TBL_MENU_ACTIONS (MenuId, ActionName, ActionCode, IsActive)
SELECT @MenuId, v.ActionName, v.ActionCode, 1
FROM (VALUES ('Add','ADD'),('Edit','EDIT'),('Delete','DELETE'),('View','VIEW')) v(ActionName, ActionCode)
WHERE NOT EXISTS (SELECT 1 FROM PROJ.TBL_MENU_ACTIONS ma WHERE ma.MenuId=@MenuId AND ma.ActionCode=v.ActionCode);
INSERT INTO PROJ.TBL_ROLE_MENU (RoleId, MenuId, CanView)
SELECT rm.RoleId, @MenuId, 1 FROM PROJ.TBL_ROLE_MENU rm
WHERE rm.MenuId=13 AND NOT EXISTS (SELECT 1 FROM PROJ.TBL_ROLE_MENU x WHERE x.RoleId=rm.RoleId AND x.MenuId=@MenuId);
INSERT INTO PROJ.TBL_ROLE_MENU_ACTION (RoleId, MenuId, ActionId, IsAllowed)
SELECT rm.RoleId, @MenuId, ma.ActionId, 1
FROM PROJ.TBL_ROLE_MENU rm CROSS JOIN PROJ.TBL_MENU_ACTIONS ma
WHERE rm.MenuId=@MenuId AND ma.MenuId=@MenuId
  AND NOT EXISTS (SELECT 1 FROM PROJ.TBL_ROLE_MENU_ACTION x WHERE x.RoleId=rm.RoleId AND x.MenuId=@MenuId AND x.ActionId=ma.ActionId);
GO

/* ── Document types for the Documents tab (all optional) ──────────────────── */
INSERT INTO PROJ.TBL_DOCUMENT_TYPES (DocumentType, ModuleName, IsMandatory)
SELECT v.DocumentType, 'FREEISSUEGRN', v.IsMandatory
FROM (VALUES
    ('Delivery Note', CAST(0 AS BIT)),
    ('Bill of Entry (BOE)', CAST(0 AS BIT)),
    ('Goods Receipt Photo', CAST(0 AS BIT)),
    ('Gate Pass', CAST(0 AS BIT)),
    ('Other', CAST(0 AS BIT))
) v(DocumentType, IsMandatory)
WHERE NOT EXISTS (SELECT 1 FROM PROJ.TBL_DOCUMENT_TYPES t WHERE t.ModuleName='FREEISSUEGRN' AND t.DocumentType=v.DocumentType);
GO

/* ── Header upsert ───────────────────────────────────────────────────────── */
CREATE OR ALTER PROCEDURE proj.sp_SetFreeIssueGrn
    @FreeIssueGrnId       INT            = 0,
    @JobId                NVARCHAR(50)   = NULL,
    @ReceiptDate          DATE           = NULL,
    @ReceivedBy           NVARCHAR(100)  = NULL,
    @BriefDescription     NVARCHAR(200)  = NULL,
    @DetailedDescription  NVARCHAR(MAX)  = NULL,
    @DeliveredBy          NVARCHAR(200)  = NULL,
    @Remarks              NVARCHAR(500)  = NULL,
    @BoeNo                NVARCHAR(100)  = NULL,
    @BoeDate              DATE           = NULL,
    @DeliveryNoteFilePath NVARCHAR(400)  = NULL,
    @CreatedBy            NVARCHAR(100)  = NULL,
    @ModifiedBy           NVARCHAR(100)  = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF NULLIF(@JobId, '')                IS NULL RAISERROR('Job is required.',                 16, 1);
    IF NULLIF(@ReceivedBy, '')           IS NULL RAISERROR('Received By is required.',          16, 1);
    IF NULLIF(@BriefDescription, '')     IS NULL RAISERROR('Brief Description is required.',     16, 1);
    IF NULLIF(@DetailedDescription, '')  IS NULL RAISERROR('Detailed Description is required.',  16, 1);
    IF NULLIF(@DeliveredBy, '')          IS NULL RAISERROR('Delivered By is required.',          16, 1);
    IF @@ERROR <> 0 RETURN;

    DECLARE @IsClosed BIT = 0, @StatusName NVARCHAR(50) = '';
    SELECT @IsClosed = js.IsClosed, @StatusName = js.StatusName
    FROM   proj.TBL_JOB j
    JOIN   proj.TBL_JOB_STATUS js ON js.JobStatusId = j.JobStatusId
    WHERE  j.JobId = @JobId;
    IF @@ROWCOUNT = 0 RAISERROR('Job not found.', 16, 1);
    IF @IsClosed = 1
    BEGIN
        DECLARE @ErrMsg NVARCHAR(200) = 'Job ' + @JobId + ' is ' + @StatusName + '. Revise the job to create new transactions.';
        RAISERROR('%s', 16, 1, @ErrMsg); RETURN;
    END

    IF @FreeIssueGrnId = 0 OR @FreeIssueGrnId IS NULL
    BEGIN
        IF NULLIF(@CreatedBy, '') IS NULL RAISERROR('CreatedBy is required.', 16, 1);
        IF @@ERROR <> 0 RETURN;

        DECLARE @NumResult TABLE (DocNumber NVARCHAR(50), NewSeries INT);
        INSERT INTO @NumResult EXEC proj.sp_GetNextDocNumber 'FIG';
        DECLARE @GrnNumber NVARCHAR(50);
        SELECT @GrnNumber = DocNumber FROM @NumResult;

        INSERT INTO proj.TBL_FREE_ISSUE_GRN_HEADER (
            FreeIssueGrnNumber, JobId, ReceiptDate, ReceivedBy,
            BriefDescription, DetailedDescription, DeliveredBy, Remarks,
            BoeNo, BoeDate, DeliveryNoteFilePath, Status, CreatedBy, CreatedDate
        ) VALUES (
            @GrnNumber, @JobId, ISNULL(@ReceiptDate, CAST(GETDATE() AS DATE)), @ReceivedBy,
            @BriefDescription, @DetailedDescription, @DeliveredBy, @Remarks,
            @BoeNo, @BoeDate, @DeliveryNoteFilePath, N'Draft', @CreatedBy, GETDATE()
        );
        SELECT CAST(SCOPE_IDENTITY() AS NVARCHAR(20));
    END
    ELSE
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM proj.TBL_FREE_ISSUE_GRN_HEADER WHERE FreeIssueGrnId=@FreeIssueGrnId AND IsActive=1)
            RAISERROR('Free Issue GRN not found.', 16, 1);
        IF EXISTS (SELECT 1 FROM proj.TBL_FREE_ISSUE_GRN_HEADER WHERE FreeIssueGrnId=@FreeIssueGrnId AND Status<>N'Draft')
            RAISERROR('Only Draft records can be edited.', 16, 1);
        IF @@ERROR <> 0 RETURN;

        UPDATE proj.TBL_FREE_ISSUE_GRN_HEADER SET
            JobId=@JobId, ReceiptDate=ISNULL(@ReceiptDate,ReceiptDate), ReceivedBy=@ReceivedBy,
            BriefDescription=@BriefDescription, DetailedDescription=@DetailedDescription,
            DeliveredBy=@DeliveredBy, Remarks=@Remarks, BoeNo=@BoeNo, BoeDate=@BoeDate,
            DeliveryNoteFilePath=ISNULL(@DeliveryNoteFilePath,DeliveryNoteFilePath),
            ModifiedBy=@ModifiedBy, ModifiedDate=GETDATE()
        WHERE FreeIssueGrnId=@FreeIssueGrnId AND IsActive=1;
        SELECT CAST(@FreeIssueGrnId AS NVARCHAR(20));
    END
END;
GO

/* ── Get by id ───────────────────────────────────────────────────────────── */
CREATE OR ALTER PROCEDURE proj.sp_GetFreeIssueGrn
    @FreeIssueGrnId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        h.FreeIssueGrnId, h.FreeIssueGrnNumber, h.JobId, j.ProjectName AS JobTitle,
        j.CustomerId, cu.CustomerName,
        h.ReceiptDate, h.ReceivedBy, h.BriefDescription, h.DetailedDescription,
        h.DeliveredBy, h.Remarks, h.BoeNo, h.BoeDate, h.DeliveryNoteFilePath,
        h.Status, h.IsActive, h.CreatedBy, h.CreatedDate, h.ModifiedBy, h.ModifiedDate,
        h.CancelledBy, h.CancelledDate, h.CancelReason,
        (SELECT COUNT(*) FROM proj.TBL_FREE_ISSUE_GRN_DETAIL d
         WHERE d.FreeIssueGrnId = h.FreeIssueGrnId AND d.IsActive = 1) AS LineCount,
        (SELECT COUNT(*) FROM proj.TBL_DOCUMENTS dc
         WHERE dc.ReferenceTable = 'FREEISSUEGRN' AND dc.ReferenceKey = CAST(h.FreeIssueGrnId AS NVARCHAR(20)) AND dc.IsActive = 1) AS DocumentCount,
        (SELECT COUNT(*) FROM proj.TBL_FREE_ISSUE_GRN_REVISION rv
         WHERE rv.FreeIssueGrnId = h.FreeIssueGrnId) AS RevisionCount
    FROM proj.TBL_FREE_ISSUE_GRN_HEADER h
    LEFT JOIN proj.TBL_JOB j ON j.JobId = h.JobId
    LEFT JOIN proj.TBL_CUSTOMER cu ON cu.CustomerId = j.CustomerId
    WHERE h.FreeIssueGrnId = @FreeIssueGrnId AND h.IsActive = 1;
END;
GO

/* ── Search (paged) ──────────────────────────────────────────────────────── */
CREATE OR ALTER PROCEDURE proj.sp_SearchFreeIssueGrns
    @SearchText    NVARCHAR(100) = NULL,
    @Status        NVARCHAR(200) = NULL,
    @JobId         NVARCHAR(50)  = NULL,
    @CreatedBy     NVARCHAR(100) = NULL,
    @DateFrom      DATE          = NULL,
    @DateTo        DATE          = NULL,
    @PageNumber    INT           = 1,
    @PageSize      INT           = 20,
    @SortColumn    NVARCHAR(50)  = N'ReceiptDate',
    @SortDirection NVARCHAR(4)   = N'DESC'
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Offset INT = (@PageNumber - 1) * @PageSize;
    DECLARE @Total  INT;

    SELECT @Total = COUNT(*)
    FROM proj.TBL_FREE_ISSUE_GRN_HEADER h
    WHERE h.IsActive = 1
      AND (@SearchText IS NULL OR h.FreeIssueGrnNumber LIKE N'%'+@SearchText+N'%'
                               OR h.BriefDescription   LIKE N'%'+@SearchText+N'%'
                               OR h.DeliveredBy        LIKE N'%'+@SearchText+N'%'
                               OR h.ReceivedBy         LIKE N'%'+@SearchText+N'%'
                               OR h.BoeNo              LIKE N'%'+@SearchText+N'%'
                               OR h.JobId              LIKE N'%'+@SearchText+N'%')
      AND (@Status    IS NULL OR h.Status IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@Status, ',')))
      AND (@JobId     IS NULL OR h.JobId      = @JobId)
      AND (@CreatedBy IS NULL OR h.CreatedBy LIKE N'%'+@CreatedBy+N'%')
      AND (@DateFrom  IS NULL OR h.ReceiptDate >= @DateFrom)
      AND (@DateTo    IS NULL OR h.ReceiptDate <= @DateTo);

    SELECT
        h.FreeIssueGrnId, h.FreeIssueGrnNumber, h.ReceiptDate, h.Status,
        h.JobId, j.ProjectName AS JobTitle, j.CustomerId, cu.CustomerName,
        h.BriefDescription, h.ReceivedBy, h.DeliveredBy,
        h.BoeNo, h.CreatedBy, h.CreatedDate,
        (SELECT COUNT(*) FROM proj.TBL_FREE_ISSUE_GRN_DETAIL d WHERE d.FreeIssueGrnId = h.FreeIssueGrnId AND d.IsActive = 1) AS LineCount,
        @Total AS TotalRows
    FROM proj.TBL_FREE_ISSUE_GRN_HEADER h
    LEFT JOIN proj.TBL_JOB j ON j.JobId = h.JobId
    LEFT JOIN proj.TBL_CUSTOMER cu ON cu.CustomerId = j.CustomerId
    WHERE h.IsActive = 1
      AND (@SearchText IS NULL OR h.FreeIssueGrnNumber LIKE N'%'+@SearchText+N'%'
                               OR h.BriefDescription   LIKE N'%'+@SearchText+N'%'
                               OR h.DeliveredBy        LIKE N'%'+@SearchText+N'%'
                               OR h.ReceivedBy         LIKE N'%'+@SearchText+N'%'
                               OR h.BoeNo              LIKE N'%'+@SearchText+N'%'
                               OR h.JobId              LIKE N'%'+@SearchText+N'%')
      AND (@Status    IS NULL OR h.Status IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@Status, ',')))
      AND (@JobId     IS NULL OR h.JobId      = @JobId)
      AND (@CreatedBy IS NULL OR h.CreatedBy LIKE N'%'+@CreatedBy+N'%')
      AND (@DateFrom  IS NULL OR h.ReceiptDate >= @DateFrom)
      AND (@DateTo    IS NULL OR h.ReceiptDate <= @DateTo)
    ORDER BY
        CASE WHEN @SortColumn=N'FreeIssueGrnNumber' AND @SortDirection=N'ASC'  THEN h.FreeIssueGrnNumber END ASC,
        CASE WHEN @SortColumn=N'FreeIssueGrnNumber' AND @SortDirection=N'DESC' THEN h.FreeIssueGrnNumber END DESC,
        CASE WHEN @SortColumn=N'CustomerName'       AND @SortDirection=N'ASC'  THEN cu.CustomerName      END ASC,
        CASE WHEN @SortColumn=N'CustomerName'       AND @SortDirection=N'DESC' THEN cu.CustomerName      END DESC,
        CASE WHEN @SortColumn=N'JobId'              AND @SortDirection=N'ASC'  THEN h.JobId              END ASC,
        CASE WHEN @SortColumn=N'JobId'              AND @SortDirection=N'DESC' THEN h.JobId              END DESC,
        CASE WHEN @SortColumn=N'Status'             AND @SortDirection=N'ASC'  THEN h.Status             END ASC,
        CASE WHEN @SortColumn=N'Status'             AND @SortDirection=N'DESC' THEN h.Status             END DESC,
        CASE WHEN @SortColumn=N'ReceiptDate'        AND @SortDirection=N'ASC'  THEN h.ReceiptDate        END ASC,
        CASE WHEN @SortColumn=N'ReceiptDate'        AND @SortDirection=N'DESC' THEN h.ReceiptDate        END DESC,
        h.FreeIssueGrnId DESC
    OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY;
END;
GO

/* ── Delete (Draft only, soft) ───────────────────────────────────────────── */
CREATE OR ALTER PROCEDURE proj.sp_DeleteFreeIssueGrn
    @FreeIssueGrnId INT
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM proj.TBL_FREE_ISSUE_GRN_HEADER WHERE FreeIssueGrnId=@FreeIssueGrnId AND IsActive=1)
    BEGIN SELECT 'NotExists'; RETURN; END
    IF EXISTS (SELECT 1 FROM proj.TBL_FREE_ISSUE_GRN_HEADER WHERE FreeIssueGrnId=@FreeIssueGrnId AND Status<>N'Draft')
    BEGIN SELECT 'CannotDelete'; RETURN; END
    UPDATE proj.TBL_FREE_ISSUE_GRN_DETAIL SET IsActive=0 WHERE FreeIssueGrnId=@FreeIssueGrnId;
    UPDATE proj.TBL_FREE_ISSUE_GRN_HEADER SET IsActive=0 WHERE FreeIssueGrnId=@FreeIssueGrnId;
    SELECT 'Deleted';
END;
GO

/* ── Change status ───────────────────────────────────────────────────────── */
CREATE OR ALTER PROCEDURE proj.sp_ChangeFreeIssueGrnStatus
    @FreeIssueGrnId INT, @NewStatus NVARCHAR(30), @ChangedBy NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM proj.TBL_FREE_ISSUE_GRN_HEADER WHERE FreeIssueGrnId=@FreeIssueGrnId AND IsActive=1)
        RAISERROR('Free Issue GRN not found.', 16, 1);
    IF @NewStatus NOT IN (N'Draft', N'Confirmed', N'Cancelled')
        RAISERROR('Invalid status.', 16, 1);
    IF @@ERROR <> 0 RETURN;
    UPDATE proj.TBL_FREE_ISSUE_GRN_HEADER
    SET Status=@NewStatus, ModifiedBy=@ChangedBy, ModifiedDate=GETDATE()
    WHERE FreeIssueGrnId=@FreeIssueGrnId AND IsActive=1;
    SELECT 'OK';
END;
GO

/* ── Cancel ──────────────────────────────────────────────────────────────── */
CREATE OR ALTER PROCEDURE proj.sp_CancelFreeIssueGrn
    @FreeIssueGrnId INT, @CancelledBy NVARCHAR(100), @Reason NVARCHAR(500)
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM proj.TBL_FREE_ISSUE_GRN_HEADER WHERE FreeIssueGrnId=@FreeIssueGrnId AND IsActive=1)
        RAISERROR('Free Issue GRN not found.', 16, 1);
    IF @@ERROR <> 0 RETURN;
    UPDATE proj.TBL_FREE_ISSUE_GRN_HEADER
    SET Status=N'Cancelled', CancelledBy=@CancelledBy, CancelledDate=GETDATE(),
        CancelReason=@Reason, ModifiedBy=@CancelledBy, ModifiedDate=GETDATE()
    WHERE FreeIssueGrnId=@FreeIssueGrnId AND IsActive=1;
    SELECT 'OK';
END;
GO

/* ── Lines: get / set / delete ───────────────────────────────────────────── */
CREATE OR ALTER PROCEDURE proj.sp_GetFreeIssueGrnLines
    @FreeIssueGrnId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT FreeIssueGrnDetailId, FreeIssueGrnId, LineNum, Description, Qty, UomName, Remarks,
           CreatedBy, CreatedDate, ModifiedBy, ModifiedDate
    FROM proj.TBL_FREE_ISSUE_GRN_DETAIL
    WHERE FreeIssueGrnId = @FreeIssueGrnId AND IsActive = 1
    ORDER BY LineNum, FreeIssueGrnDetailId;
END;
GO

CREATE OR ALTER PROCEDURE proj.sp_SetFreeIssueGrnLine
    @FreeIssueGrnDetailId INT            = 0,
    @FreeIssueGrnId       INT            = NULL,
    @LineNum              INT            = NULL,
    @Description          NVARCHAR(300)  = NULL,
    @Qty                  DECIMAL(18,4)  = NULL,
    @UomName              NVARCHAR(50)   = NULL,
    @Remarks              NVARCHAR(300)  = NULL,
    @CreatedBy            NVARCHAR(100)  = NULL,
    @ModifiedBy           NVARCHAR(100)  = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF NULLIF(@Description,'') IS NULL RAISERROR('Line description is required.', 16, 1);
    IF @@ERROR <> 0 RETURN;
    IF @FreeIssueGrnDetailId = 0 OR @FreeIssueGrnDetailId IS NULL
    BEGIN
        IF NULLIF(@FreeIssueGrnId,0) IS NULL RAISERROR('FreeIssueGrnId is required.', 16, 1);
        IF @@ERROR <> 0 RETURN;
        IF @LineNum IS NULL
            SELECT @LineNum = ISNULL(MAX(LineNum),0)+1 FROM proj.TBL_FREE_ISSUE_GRN_DETAIL
            WHERE FreeIssueGrnId=@FreeIssueGrnId AND IsActive=1;
        INSERT INTO proj.TBL_FREE_ISSUE_GRN_DETAIL
            (FreeIssueGrnId, LineNum, Description, Qty, UomName, Remarks, CreatedBy, CreatedDate)
        VALUES
            (@FreeIssueGrnId, @LineNum, @Description, @Qty, @UomName, @Remarks, @CreatedBy, GETDATE());
        SELECT CAST(SCOPE_IDENTITY() AS NVARCHAR(20));
    END
    ELSE
    BEGIN
        UPDATE proj.TBL_FREE_ISSUE_GRN_DETAIL SET
            Description=@Description, Qty=@Qty, UomName=@UomName, Remarks=@Remarks,
            LineNum=ISNULL(@LineNum,LineNum), ModifiedBy=@ModifiedBy, ModifiedDate=GETDATE()
        WHERE FreeIssueGrnDetailId=@FreeIssueGrnDetailId AND IsActive=1;
        SELECT CAST(@FreeIssueGrnDetailId AS NVARCHAR(20));
    END
END;
GO

CREATE OR ALTER PROCEDURE proj.sp_DeleteFreeIssueGrnLine
    @FreeIssueGrnDetailId INT
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM proj.TBL_FREE_ISSUE_GRN_DETAIL WHERE FreeIssueGrnDetailId=@FreeIssueGrnDetailId AND IsActive=1)
    BEGIN SELECT 'NotExists'; RETURN; END
    UPDATE proj.TBL_FREE_ISSUE_GRN_DETAIL SET IsActive=0 WHERE FreeIssueGrnDetailId=@FreeIssueGrnDetailId;
    SELECT 'Deleted';
END;
GO

/* ── Revise (Confirmed -> Draft, logs a revision row) ─────────────────────── */
CREATE OR ALTER PROCEDURE proj.sp_ReviseFreeIssueGrn
    @FreeIssueGrnId INT,
    @RevisedBy      NVARCHAR(100),
    @Reason         NVARCHAR(500)
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM proj.TBL_FREE_ISSUE_GRN_HEADER WHERE FreeIssueGrnId=@FreeIssueGrnId AND IsActive=1)
        RAISERROR('Free Issue GRN not found.', 16, 1);
    IF NOT EXISTS (SELECT 1 FROM proj.TBL_FREE_ISSUE_GRN_HEADER WHERE FreeIssueGrnId=@FreeIssueGrnId AND Status=N'Confirmed')
        RAISERROR('Only Confirmed records can be revised.', 16, 1);
    IF NULLIF(LTRIM(RTRIM(@Reason)),'') IS NULL
        RAISERROR('A revision reason is required.', 16, 1);
    IF @@ERROR <> 0 RETURN;

    DECLARE @NextNo INT;
    SELECT @NextNo = ISNULL(MAX(RevisionNo),0)+1 FROM proj.TBL_FREE_ISSUE_GRN_REVISION WHERE FreeIssueGrnId=@FreeIssueGrnId;

    INSERT INTO proj.TBL_FREE_ISSUE_GRN_REVISION (FreeIssueGrnId, RevisionNo, Reason, RevisedBy, RevisedDate)
    VALUES (@FreeIssueGrnId, @NextNo, LTRIM(RTRIM(@Reason)), @RevisedBy, GETDATE());

    UPDATE proj.TBL_FREE_ISSUE_GRN_HEADER
    SET Status=N'Draft', ModifiedBy=@RevisedBy, ModifiedDate=GETDATE()
    WHERE FreeIssueGrnId=@FreeIssueGrnId AND IsActive=1;

    SELECT @NextNo AS RevisionNo;
END;
GO

/* ── Revision history list ───────────────────────────────────────────────── */
CREATE OR ALTER PROCEDURE proj.sp_GetFreeIssueGrnRevisions
    @FreeIssueGrnId INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT RevisionId, FreeIssueGrnId, RevisionNo, Reason, RevisedBy, RevisedDate
    FROM proj.TBL_FREE_ISSUE_GRN_REVISION
    WHERE FreeIssueGrnId = @FreeIssueGrnId
    ORDER BY RevisionNo DESC;
END;
GO
